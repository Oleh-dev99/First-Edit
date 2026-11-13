"""summarize: per model and variant numbers, the report and the gallery, from
synthetic generation.json and stress results (stress summary schemaVersion 3)."""

import json
from pathlib import Path

import pytest

from first_edit.providers import SetupError
from first_edit.summarize import (
    CASE_TIERS,
    CASES,
    build_summary,
    load_candidates,
    render_gallery,
    render_report,
    wilson,
    write_outputs,
)

BRIEFS = ["brief-a", "brief-b", "brief-c"]
NO_ERRORS = {"page-overflow-x": 0, "text-clipped": 0, "content-spill": 0, "text-overlap": 0, "off-screen": 0}
#: Cases measured for content-hidden (D-036).
MEASURED = {"viewport-320", "text-200pct", "dir-rtl", *(case for case in CASES if case.endswith("@320"))}


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
            failed: dict[str, dict] | None = None, hidden: dict[str, list[str]] | None = None,
            truncations: int = 0, screenshots: bool = True, schema: int = 3) -> None:
    """A stress run where every case applies; `failed` maps a case id to
    {"status": ..., "newErrors": {...}, "findings": [...]}, and `hidden` maps a
    measured case id to its content-hidden values."""
    brief = cid.split("/")[1]
    run_dir = root / "runs" / brief / cid.replace("/", "__")
    failed = failed or {}
    hidden = hidden or {}

    def files(case: str) -> dict:
        if screenshots:
            for name in (f"{case}.png", f"{case}.annotated.png"):
                (run_dir / name).parent.mkdir(parents=True, exist_ok=True)
                (run_dir / name).write_bytes(b"png")
        return {"result": f"{case}.json", "screenshot": f"{case}.png" if screenshots else None,
                "annotated": f"{case}.annotated.png" if screenshots else None}

    write_json(run_dir / "baseline.json", {
        "case": "baseline", "status": baseline_status,
        "error": "ReferenceError: tsx is not defined" if baseline_status != "ok" else None,
        "query": f"?brief={brief}", "viewport": {"width": 1280, "height": 800},
        "bornBroken": [{"check": "text-clipped", "severity": "error", "selector": "#fe-root > h2", "text": "Heading"}]
        * baseline_errors,
    })
    cases = []
    for case in CASES:
        spec = failed.get(case)
        status = spec.get("status", "ok") if spec else "ok"
        new_errors = {**NO_ERRORS, **(spec.get("newErrors", {}) if spec else {})} if status == "ok" else None
        values = hidden.get(case, [])
        content_hidden = len(values) if case in MEASURED and status == "ok" else None
        write_json(run_dir / f"{case}.json", {
            "case": case, "status": status, "error": "TypeError: boom" if status == "render-error" else None,
            "query": f"?brief={brief}&mutation={case.split('@')[0]}",
            "viewport": {"width": 320 if case.endswith("@320") or case == "viewport-320" else 1280, "height": 800},
            "newFindings": spec.get("findings", []) if spec else [],
            "contentHidden": content_hidden, "hiddenValues": values if content_hidden is not None else None,
        })
        cases.append({
            "id": case, "tier": CASE_TIERS[case], "applicable": True, "status": status, "survived": spec is None,
            "newErrors": new_errors, "truncations": truncations if status == "ok" else None,
            "contentHidden": content_hidden, "files": files(case),
        })
    survived = sum(1 for c in cases if c["survived"])
    write_json(run_dir / "summary.json", {
        "schemaVersion": schema,
        "baseline": {"status": baseline_status, "errors": baseline_errors,
                     "truncations": truncations if baseline_status == "ok" else None, "files": files("baseline")},
        "cases": cases,
        "totals": {"cases": len(CASES), "applicable": len(CASES), "survived": survived, "failed": len(CASES) - survived,
                   "survivalRate": round(survived / len(CASES), 4),
                   "contentHidden": sum(c["contentHidden"] or 0 for c in cases)},
    })


@pytest.fixture
def corpus(tmp_path: Path) -> Path:
    # model m1, plain: a clean candidate that fails 3 of its 17 core cases, a
    # clean one that fails only an extreme case, one whose baseline crashed,
    # one invalid.
    add_candidate(tmp_path, "m1/brief-a/plain-s1", actual=0.02)
    add_run(tmp_path, "m1/brief-a/plain-s1", truncations=1, hidden={"text-200pct": ["paid by bank transfer"]}, failed={
        "text-long": {"newErrors": {"text-clipped": 2, "content-spill": 1},
                      "findings": [{"check": "text-clipped", "severity": "error", "selector": "#fe-root > p",
                                    "text": "<script>alert(1)</script>"}]},
        "list-0": {"status": "render-error"},
        "viewport-320": {"status": "timeout"},
    })
    add_candidate(tmp_path, "m1/brief-b/plain-s1", actual=None, estimated=0.05)
    add_run(tmp_path, "m1/brief-b/plain-s1", failed={"text-unbroken@320": {"newErrors": {"content-spill": 1}}})
    add_candidate(tmp_path, "m1/brief-b/plain-s2")
    add_run(tmp_path, "m1/brief-b/plain-s2", baseline_status="render-error",
            failed={case: {"status": "render-error"} for case in CASES})
    add_candidate(tmp_path, "m1/brief-c/plain-s1", valid=False, reasons=[
        {"rule": "imports", "message": "x"}, {"rule": "imports", "message": "y"}, {"rule": "truncated", "message": "z"}])
    # model m1, hinted: one born broken, one valid but not stressed, one API error.
    add_candidate(tmp_path, "m1/brief-a/hinted-s1")
    add_run(tmp_path, "m1/brief-a/hinted-s1", baseline_errors=2, failed={"text-long": {"newErrors": {"text-overlap": 1}}})
    add_candidate(tmp_path, "m1/brief-b/hinted-s1")
    add_candidate(tmp_path, "m1/brief-c/hinted-s1", valid=False, status="api-error", reasons=[{"rule": "api-error", "message": "HTTP 400"}],
                  usage={}, estimated=None)
    return tmp_path


def summarize(root: Path, models: tuple[str, ...] = ("m1",)) -> tuple[list, dict]:
    candidates = load_candidates(list(models), BRIEFS, candidates_dir=root / "candidates", runs_dir=root / "runs")
    return candidates, build_summary(candidates, list(models), BRIEFS, {"m1": {"model": "vendor/m"}})


def group(summary: dict, variant: str, model: str = "m1") -> dict:
    return next(g for g in summary["groups"] if g["variant"] == variant and g["model"] == model)


def test_wilson_matches_known_intervals() -> None:
    assert wilson(0, 10) == [0.0, 0.2775]
    assert wilson(5, 10) == [0.2366, 0.7634]
    assert wilson(10, 10) == [0.7225, 1.0]
    assert wilson(0, 0) is None


def test_case_tiers() -> None:
    # 19 cases: text-unbroken is extreme at 1280 and at 320, every other case core (D-039).
    assert len(CASES) == 19 and "text-longword@320" in CASES
    assert [case for case in CASES if CASE_TIERS[case] == "extreme"] == ["text-unbroken", "text-unbroken@320"]


def test_candidate_states(corpus: Path) -> None:
    candidates, _ = summarize(corpus)
    assert {c.candidate: c.state for c in candidates} == {
        "m1/brief-a/plain-s1": "clean", "m1/brief-b/plain-s1": "clean", "m1/brief-b/plain-s2": "baseline-crash",
        "m1/brief-c/plain-s1": "invalid",
        "m1/brief-a/hinted-s1": "born-broken", "m1/brief-b/hinted-s1": "not-stressed", "m1/brief-c/hinted-s1": "api-error",
    }


def test_plain_group_numbers(corpus: Path) -> None:
    plain = group(summarize(corpus)[1], "plain")
    assert (plain["candidates"], plain["valid"], plain["invalid"], plain["apiErrors"]) == (4, 3, 1, 0)
    # A candidate counts once per rule, however many reasons share it.
    assert plain["invalidByRule"] == {"imports": 1, "truncated": 1}
    assert (plain["cleanBaseline"], plain["bornBroken"], plain["baselineCrash"], plain["notStressed"]) == (2, 0, 1, 0)
    # The headline counts core cases: 1 of 2 clean candidates broke. Over all
    # cases, brief-b's extreme failure counts too: 2 of 2 (D-033, D-039).
    assert plain["brokeOnce"] == {"core": {"count": 1, "of": 2, "share": 0.5, "ci95": wilson(1, 2)},
                                  "all": {"count": 2, "of": 2, "share": 1.0, "ci95": wilson(2, 2)}}
    assert plain["failureRate"] == {
        "core": {"failed": 3, "applicable": 34, "rate": 0.0882, "ci95": wilson(3, 34)},
        "extreme": {"failed": 1, "applicable": 4, "rate": 0.25, "ci95": wilson(1, 4)},
        "all": {"failed": 4, "applicable": 38, "rate": 0.1053, "ci95": wilson(4, 38)},
    }
    # Per candidate: brief-a 14/17 core, 2/2 extreme, 16/19 all; brief-b 17/17, 1/2, 18/19.
    assert plain["survival"]["core"] == {"candidates": 2, "mean": pytest.approx(0.9118, abs=1e-4), "min": 0.8235, "max": 1.0}
    assert plain["survival"]["extreme"] == {"candidates": 2, "mean": 0.75, "min": 0.5, "max": 1.0}
    assert plain["survival"]["all"]["mean"] == pytest.approx(0.8947, abs=1e-4)
    assert plain["cases"] == {"applicable": 38, "failed": 4, "renderErrors": 1, "timeouts": 1}
    assert plain["failedByCase"]["text-long"] == {"tier": "core", "failed": 1, "applicable": 2}
    assert plain["failedByCase"]["list-0"] == {"tier": "core", "failed": 1, "applicable": 2}
    assert plain["failedByCase"]["text-longword@320"] == {"tier": "core", "failed": 0, "applicable": 2}
    assert plain["failedByCase"]["text-unbroken@320"] == {"tier": "extreme", "failed": 1, "applicable": 2}
    assert plain["failedByCheck"] == {"page-overflow-x": 0, "text-clipped": 1, "content-spill": 2, "text-overlap": 0,
                                      "off-screen": 0}
    # Rendered cases: 2 baselines + 36 cases with status ok; brief-a has 1 truncation in each of its 18.
    assert plain["truncations"] == {"total": 18, "renderedCases": 38, "perCase": 0.47}
    # Measured: 11 cases per clean candidate, less brief-a's viewport-320, which timed out.
    assert plain["contentHidden"] == {"total": 1, "measuredCases": 21, "casesWithHidden": 1, "perCase": 0.05}
    assert plain["tokens"] == {"input": 4000, "cachedInput": None, "output": 8000, "reasoning": 2000}
    # Reported cost where there is one, else the estimate.
    assert plain["cost"] == {"usd": 0.09, "actualUsd": 0.02, "estimatedUsd": 0.08, "callsWithActualCost": 1}


def test_hinted_group_counts_born_broken_and_api_errors_apart(corpus: Path) -> None:
    hinted = group(summarize(corpus)[1], "hinted")
    assert (hinted["candidates"], hinted["valid"], hinted["apiErrors"]) == (2, 2, 1)
    assert (hinted["cleanBaseline"], hinted["bornBroken"], hinted["baselineCrash"], hinted["notStressed"]) == (0, 1, 0, 1)
    # Born-broken candidates are not scored (D-015).
    assert hinted["survival"]["core"]["mean"] is None
    assert hinted["brokeOnce"]["core"] == {"count": 0, "of": 0, "share": None, "ci95": None}
    assert hinted["cases"]["failed"] == 0


def test_a_pooled_group_per_variant_with_two_models(corpus: Path) -> None:
    add_candidate(corpus, "m2/brief-a/plain-s1")
    add_run(corpus, "m2/brief-a/plain-s1")
    _, summary = summarize(corpus, ("m1", "m2"))
    pooled = group(summary, "plain", "all models")
    assert pooled["pooled"] is True
    assert pooled["brokeOnce"]["core"] == {"count": 1, "of": 3, "share": 0.3333, "ci95": wilson(1, 3)}
    assert pooled["brokeOnce"]["all"]["count"] == 2
    assert pooled["failureRate"]["all"]["applicable"] == 57
    # m2 has no hinted candidates, so hinted is not pooled; totals count each model once.
    assert [g["model"] for g in summary["groups"]] == ["m1", "m1", "m2", "all models"]
    assert summary["totals"]["candidates"] == 7


def test_survival_by_brief_and_models(corpus: Path) -> None:
    _, summary = summarize(corpus)
    assert summary["survivalByBrief"]["plain"] == {
        "brief-a": {"m1": "14/17 core, 2/2 extreme"}, "brief-b": {"m1": "17/17 core, 1/2 extreme; baseline crash"},
        "brief-c": {"m1": "invalid"}}
    assert summary["survivalByBrief"]["hinted"] == {
        "brief-a": {"m1": "born broken"}, "brief-b": {"m1": "not stressed"}, "brief-c": {"m1": "api error"}}
    assert summary["models"] == [{"id": "m1", "model": "vendor/m", "reportedModels": ["vendor/m-1"],
                                  "calls": {"first": "2026-11-13T10:00:00+00:00", "last": "2026-11-13T10:00:00+00:00"}}]
    assert summary["totals"]["costUsd"] == 0.11
    assert summary["cases"] == [{"id": case, "tier": CASE_TIERS[case]} for case in CASES]


def test_missing_briefs_are_listed(corpus: Path) -> None:
    add_candidate(corpus, "m1/brief-a/plain-s2")
    candidates = load_candidates(["m1"], [*BRIEFS, "brief-d"], candidates_dir=corpus / "candidates", runs_dir=corpus / "runs")
    summary = build_summary(candidates, ["m1"], [*BRIEFS, "brief-d"], {})
    assert group(summary, "plain")["missingBriefs"] == ["brief-d"]


def test_a_stress_run_of_another_schema_is_an_error(tmp_path: Path) -> None:
    add_candidate(tmp_path, "m1/brief-a/plain-s1")
    add_run(tmp_path, "m1/brief-a/plain-s1", schema=2)
    with pytest.raises(SetupError, match="stress schema 2"):
        load_candidates(["m1"], ["brief-a"], candidates_dir=tmp_path / "candidates", runs_dir=tmp_path / "runs")


def test_report_has_the_main_tables(corpus: Path) -> None:
    report = render_report(summarize(corpus)[1])
    assert "## Broke at least once (headline)" in report
    headline = next(line for line in report.splitlines() if line.startswith("| m1 | plain | 2 | 1 |"))
    assert headline.startswith("| m1 | plain | 2 | 1 | 50.0% | 9.") and "| 2 | 100.0% | 34.2% to 100.0% |" in headline
    assert "## Failure rate and mean survival per tier" in report
    assert "| m1 | plain | core | 3/34 | 8.8% |" in report
    assert "| m1 | plain | extreme | 1/4 | 25.0% |" in report and "| 75.0% | 50.0% | 100.0% |" in report
    assert "| m1 | plain | all cases | 4/38 | 10.5% |" in report
    assert "| m1 | plain | 4 | 3 | 1 | 0 | 2 | 0 | 1 |" in report
    assert "| imports | 1 | 0 |" in report
    assert "| text-long | core | 1/2 | 0/0 |" in report
    assert "| text-unbroken@320 | extreme | 1/2 | 0/0 |" in report
    assert "| all core |  | 3/34 | 0/0 |" in report and "| all cases |  | 4/38 | 0/0 |" in report
    assert "| off-screen | 0 | 0 |" in report
    assert "| render error | 1 | 0 |" in report
    assert "| m1 | plain | 18 | 38 | 0.47 | 1 | 21 | 1 | 0.05 |" in report
    assert "| brief-a | 14/17 core, 2/2 extreme |" in report
    assert "## Survival by brief, hinted" in report


def test_gallery_cards(corpus: Path) -> None:
    candidates, _ = summarize(corpus)
    out_dir = corpus / "spike"
    page = render_gallery(candidates, out_dir)
    failing, survived = page.split('data-section="survived"')
    # 4 failed cases of the clean candidates plus the born-broken and the
    # crashed baseline; those two candidates' own cases are not shown.
    assert failing.count('<article class="card') == 6
    assert survived.count('<article class="card') == 34
    assert 'class="card born-broken"' in failing and 'class="card baseline-crash"' in failing
    assert "ReferenceError: tsx is not defined" in failing
    assert 'data-checks="content-spill text-clipped"' in failing
    # Each case shows its tier, and the tier is a filter.
    assert 'data-tier="extreme"' in failing and '<span class="tag tier">extreme</span>' in failing
    assert '<span class="tag tier">core</span>' in survived
    # Screenshots are linked relative to the output directory.
    assert 'src="../runs/brief-a/m1__brief-a__plain-s1/text-long.annotated.png"' in failing
    # Content hidden is tagged and listed on the card.
    assert "content hidden 1" in survived and "&ldquo;paid by bank transfer&rdquo;" in survived
    # Finding text is escaped.
    assert "<script>alert(1)</script>" not in page and "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "TypeError: boom" in failing
    for name in ("model", "variant", "brief", "mutation", "tier", "check", "hidden"):
        assert f'<select name="{name}">' in page
    assert '<option value="text-longword@320">' in page


def test_a_case_without_screenshots_says_so(tmp_path: Path) -> None:
    add_candidate(tmp_path, "m1/brief-a/plain-s1")
    add_run(tmp_path, "m1/brief-a/plain-s1", screenshots=False, failed={"text-long": {"newErrors": {"text-clipped": 1}}})
    candidates = load_candidates(["m1"], ["brief-a"], candidates_dir=tmp_path / "candidates", runs_dir=tmp_path / "runs")
    assert "no screenshot" in render_gallery(candidates, tmp_path / "spike")


def test_write_outputs(corpus: Path) -> None:
    candidates, summary = summarize(corpus)
    written = write_outputs(candidates, summary, corpus / "spike")
    assert [path.name for path in written] == ["summary.json", "report.md", "gallery.html"]
    assert json.loads((corpus / "spike" / "summary.json").read_text(encoding="utf-8"))["schemaVersion"] == 3
    assert b"\r\n" not in (corpus / "spike" / "report.md").read_bytes()


def test_report_without_candidates(tmp_path: Path) -> None:
    summary = build_summary([], ["m1"], BRIEFS, {"m1": {"model": "vendor/m"}})
    report = render_report(summary)
    assert report.endswith("No generated candidates for these models.\n")
    assert "| m1 | vendor/m | - | - | - |" in report
