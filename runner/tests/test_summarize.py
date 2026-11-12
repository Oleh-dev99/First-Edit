"""summarize: per model and variant numbers, the report and the gallery, from
synthetic generation.json and stress results."""

import json
from pathlib import Path

import pytest

from first_edit.summarize import MUTATIONS, build_summary, load_candidates, render_gallery, render_report, write_outputs

BRIEFS = ["brief-a", "brief-b", "brief-c"]
NO_ERRORS = {"page-overflow-x": 0, "text-clipped": 0, "content-spill": 0, "text-overlap": 0}


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def add_candidate(root: Path, cid: str, *, valid: bool = True, status: str = "generated", reasons=None,
                  usage=None, actual=None, estimated=0.01, reported_model="vendor/m-1") -> None:
    write_json(root / "candidates" / cid / "generation.json", {
        "status": status, "valid": valid, "reasons": reasons or [], "receivedAt": "2026-11-13T10:00:00+00:00",
        "reportedModel": reported_model,
        "usage": usage or {"inputTokens": 1000, "cachedInputTokens": None, "outputTokens": 2000, "reasoningTokens": 500},
        "actualCostUsd": actual, "estimatedCostUsd": estimated,
    })


def add_run(root: Path, cid: str, *, baseline_errors: int = 0, baseline_status: str = "ok",
            failed: dict[str, dict] | None = None, truncations: int = 0, screenshots: bool = True) -> None:
    """A stress run where every mutation applies; `failed` maps a mutation id
    to {"status": ..., "newErrors": {...}, "findings": [...]}."""
    brief = cid.split("/")[1]
    run_dir = root / "runs" / brief / cid.replace("/", "__")
    failed = failed or {}

    def files(case: str) -> dict:
        if screenshots:
            for name in (f"{case}.png", f"{case}.annotated.png"):
                (run_dir / name).parent.mkdir(parents=True, exist_ok=True)
                (run_dir / name).write_bytes(b"png")
        return {"result": f"{case}.json", "screenshot": f"{case}.png" if screenshots else None,
                "annotated": f"{case}.annotated.png" if screenshots else None}

    write_json(run_dir / "baseline.json", {
        "case": "baseline", "status": baseline_status, "error": None, "query": f"?brief={brief}",
        "viewport": {"width": 1280, "height": 800},
        "bornBroken": [{"check": "text-clipped", "severity": "error", "selector": "#fe-root > h2", "text": "Heading"}]
        * baseline_errors,
    })
    mutations = []
    for mutation in MUTATIONS:
        spec = failed.get(mutation)
        status = spec.get("status", "ok") if spec else "ok"
        new_errors = {**NO_ERRORS, **(spec.get("newErrors", {}) if spec else {})} if status == "ok" else None
        write_json(run_dir / f"{mutation}.json", {
            "case": mutation, "status": status, "error": "TypeError: boom" if status == "render-error" else None,
            "query": f"?brief={brief}&mutation={mutation}", "viewport": {"width": 1280, "height": 800},
            "newFindings": spec.get("findings", []) if spec else [],
        })
        mutations.append({
            "id": mutation, "applicable": True, "status": status, "survived": spec is None,
            "newErrors": new_errors, "truncations": truncations if status == "ok" else None, "files": files(mutation),
        })
    survived = sum(1 for m in mutations if m["survived"])
    write_json(run_dir / "summary.json", {
        "schemaVersion": 1,
        "baseline": {"status": baseline_status, "errors": baseline_errors, "truncations": truncations,
                     "files": files("baseline")},
        "mutations": mutations,
        "totals": {"mutations": 10, "applicable": 10, "survived": survived, "failed": 10 - survived,
                   "survivalRate": round(survived / 10, 4)},
    })


@pytest.fixture
def corpus(tmp_path: Path) -> Path:
    # model m1, plain: one clean candidate at 70%, one at 100%, one invalid.
    add_candidate(tmp_path, "m1/brief-a/plain-s1", actual=0.02)
    add_run(tmp_path, "m1/brief-a/plain-s1", truncations=1, failed={
        "text-long": {"newErrors": {"text-clipped": 2, "content-spill": 1},
                      "findings": [{"check": "text-clipped", "severity": "error", "selector": "#fe-root > p",
                                    "text": "<script>alert(1)</script>"}]},
        "list-0": {"status": "render-error"},
        "viewport-320": {"status": "timeout"},
    })
    add_candidate(tmp_path, "m1/brief-b/plain-s1", actual=None, estimated=0.05)
    add_run(tmp_path, "m1/brief-b/plain-s1")
    add_candidate(tmp_path, "m1/brief-c/plain-s1", valid=False, reasons=[
        {"rule": "imports", "message": "x"}, {"rule": "imports", "message": "y"}, {"rule": "truncated", "message": "z"}])
    # model m1, hinted: one born broken, one valid but not stressed, one API error.
    add_candidate(tmp_path, "m1/brief-a/hinted-s1")
    add_run(tmp_path, "m1/brief-a/hinted-s1", baseline_errors=2, failed={"text-long": {"newErrors": {"text-overlap": 1}}})
    add_candidate(tmp_path, "m1/brief-b/hinted-s1")
    add_candidate(tmp_path, "m1/brief-c/hinted-s1", valid=False, status="api-error", reasons=[{"rule": "api-error", "message": "HTTP 400"}],
                  usage={}, estimated=None)
    return tmp_path


def summarize(root: Path) -> tuple[list, dict]:
    candidates = load_candidates(["m1"], BRIEFS, candidates_dir=root / "candidates", runs_dir=root / "runs")
    return candidates, build_summary(candidates, ["m1"], BRIEFS, {"m1": {"model": "vendor/m"}})


def group(summary: dict, variant: str) -> dict:
    return next(g for g in summary["groups"] if g["variant"] == variant)


def test_candidate_states(corpus: Path) -> None:
    candidates, _ = summarize(corpus)
    assert {c.candidate: c.state for c in candidates} == {
        "m1/brief-a/plain-s1": "clean", "m1/brief-b/plain-s1": "clean", "m1/brief-c/plain-s1": "invalid",
        "m1/brief-a/hinted-s1": "born-broken", "m1/brief-b/hinted-s1": "not-stressed", "m1/brief-c/hinted-s1": "api-error",
    }


def test_plain_group_numbers(corpus: Path) -> None:
    plain = group(summarize(corpus)[1], "plain")
    assert (plain["candidates"], plain["valid"], plain["invalid"], plain["apiErrors"]) == (3, 2, 1, 0)
    # A candidate counts once per rule, however many reasons share it.
    assert plain["invalidByRule"] == {"imports": 1, "truncated": 1}
    assert (plain["cleanBaseline"], plain["bornBroken"], plain["notStressed"]) == (2, 0, 0)
    assert plain["survival"] == {"candidates": 2, "mean": 0.85, "min": 0.7, "max": 1.0}
    assert plain["cases"] == {"applicable": 20, "failed": 3, "renderErrors": 1, "timeouts": 1}
    assert plain["failedByMutation"]["text-long"] == {"failed": 1, "applicable": 2}
    assert plain["failedByMutation"]["list-0"] == {"failed": 1, "applicable": 2}
    assert plain["failedByMutation"]["dir-rtl"] == {"failed": 0, "applicable": 2}
    assert plain["failedByCheck"] == {"page-overflow-x": 0, "text-clipped": 1, "content-spill": 1, "text-overlap": 0}
    # Rendered cases: 2 baselines + 18 mutation cases with status ok; brief-a has 1 truncation in each of its 9.
    assert plain["truncations"] == {"total": 9, "renderedCases": 20, "perCase": 0.45}
    assert plain["tokens"] == {"input": 3000, "cachedInput": None, "output": 6000, "reasoning": 1500}
    # Reported cost where there is one, else the estimate.
    assert plain["cost"] == {"usd": 0.08, "actualUsd": 0.02, "estimatedUsd": 0.07, "callsWithActualCost": 1}


def test_hinted_group_counts_born_broken_and_api_errors_apart(corpus: Path) -> None:
    hinted = group(summarize(corpus)[1], "hinted")
    assert (hinted["candidates"], hinted["valid"], hinted["apiErrors"]) == (2, 2, 1)
    assert (hinted["cleanBaseline"], hinted["bornBroken"], hinted["notStressed"]) == (0, 1, 1)
    # Born-broken candidates are not scored (D-015).
    assert hinted["survival"]["mean"] is None
    assert hinted["cases"]["failed"] == 0


def test_survival_by_brief_and_models(corpus: Path) -> None:
    _, summary = summarize(corpus)
    assert summary["survivalByBrief"]["plain"] == {
        "brief-a": {"m1": "7/10"}, "brief-b": {"m1": "10/10"}, "brief-c": {"m1": "invalid"}}
    assert summary["survivalByBrief"]["hinted"] == {
        "brief-a": {"m1": "born broken"}, "brief-b": {"m1": "not stressed"}, "brief-c": {"m1": "api error"}}
    assert summary["models"] == [{"id": "m1", "model": "vendor/m", "reportedModels": ["vendor/m-1"],
                                  "calls": {"first": "2026-11-13T10:00:00+00:00", "last": "2026-11-13T10:00:00+00:00"}}]
    assert summary["totals"]["costUsd"] == 0.1


def test_missing_briefs_are_listed(corpus: Path) -> None:
    add_candidate(corpus, "m1/brief-a/plain-s2")
    candidates = load_candidates(["m1"], [*BRIEFS, "brief-d"], candidates_dir=corpus / "candidates", runs_dir=corpus / "runs")
    summary = build_summary(candidates, ["m1"], [*BRIEFS, "brief-d"], {})
    assert group(summary, "plain")["missingBriefs"] == ["brief-d"]


def test_report_has_the_main_tables(corpus: Path) -> None:
    report = render_report(summarize(corpus)[1])
    assert "| m1 | plain | 3 | 2 | 1 | 0 | 2 | 0 | 85.0% | 70.0% | 100.0% |" in report
    assert "| imports | 1 | 0 |" in report
    assert "| text-long | 1/2 | 0/0 |" in report
    assert "| render error | 1 | 0 |" in report
    assert "| brief-a | 7/10 |" in report
    assert "## Survival by brief, hinted" in report


def test_gallery_cards(corpus: Path) -> None:
    candidates, _ = summarize(corpus)
    out_dir = corpus / "spike"
    page = render_gallery(candidates, out_dir)
    failing, survived = page.split('data-section="survived"')
    # 3 failed cases of the clean candidates plus 1 born-broken baseline; the
    # born-broken candidate's own mutation cases are not shown.
    assert failing.count('<article class="card') == 4
    assert survived.count('<article class="card') == 17
    assert 'data-mutation="baseline"' in failing and 'class="card born-broken"' in failing
    assert 'data-checks="content-spill text-clipped"' in failing
    # Screenshots are linked relative to the output directory.
    assert 'src="../runs/brief-a/m1__brief-a__plain-s1/text-long.annotated.png"' in failing
    # Finding text is escaped.
    assert "<script>alert(1)</script>" not in page and "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "TypeError: boom" in failing
    for name in ("model", "variant", "brief", "mutation", "check"):
        assert f'<select name="{name}">' in page


def test_a_case_without_screenshots_says_so(tmp_path: Path) -> None:
    add_candidate(tmp_path, "m1/brief-a/plain-s1")
    add_run(tmp_path, "m1/brief-a/plain-s1", screenshots=False, failed={"text-long": {"newErrors": {"text-clipped": 1}}})
    candidates = load_candidates(["m1"], ["brief-a"], candidates_dir=tmp_path / "candidates", runs_dir=tmp_path / "runs")
    assert "no screenshot" in render_gallery(candidates, tmp_path / "spike")


def test_write_outputs(corpus: Path) -> None:
    candidates, summary = summarize(corpus)
    written = write_outputs(candidates, summary, corpus / "spike")
    assert [path.name for path in written] == ["summary.json", "report.md", "gallery.html"]
    assert json.loads((corpus / "spike" / "summary.json").read_text(encoding="utf-8"))["schemaVersion"] == 1
    assert b"\r\n" not in (corpus / "spike" / "report.md").read_bytes()


def test_report_without_candidates(tmp_path: Path) -> None:
    summary = build_summary([], ["m1"], BRIEFS, {"m1": {"model": "vendor/m"}})
    report = render_report(summary)
    assert report.endswith("No generated candidates for these models.\n")
    assert "| m1 | vendor/m | - | - | - |" in report
