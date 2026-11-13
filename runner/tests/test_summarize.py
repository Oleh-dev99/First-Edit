"""summarize: per model and variant numbers, the report and the gallery, from
synthetic generation.json and stress results (stress summary schemaVersion 3)."""

import json
from pathlib import Path

import pytest

from first_edit.providers import SetupError
from first_edit.summarize import (
    CASE_TIERS,
    CASES,
    CORE_FAMILIES,
    build_summary,
    decision_lines,
    load_candidates,
    mcnemar_exact,
    render_gallery,
    render_report,
    rounded,
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
                  usage=None, actual=None, estimated=0.01, reported_model="vendor/m-1", provider="openai-compatible") -> None:
    write_json(root / "candidates" / cid / "generation.json", {
        "model": {"id": cid.split("/")[0], "provider": provider},
        "status": status, "valid": valid, "reasons": reasons or [], "receivedAt": "2026-11-13T10:00:00+00:00",
        "reportedModel": reported_model,
        "usage": usage or {"inputTokens": 1000, "cachedInputTokens": None, "outputTokens": 2000, "reasoningTokens": 500},
        "actualCostUsd": actual, "estimatedCostUsd": estimated,
    })


def add_run(root: Path, cid: str, *, baseline_errors: int = 0, baseline_status: str = "ok",
            failed: dict[str, dict] | None = None, hidden: dict[str, list[str]] | None = None,
            truncations: int = 0, screenshots: bool = True, schema: int = 3, suite: str | None = None,
            harness: dict | None = None) -> None:
    """A stress run where every case applies; `failed` maps a case id to
    {"status": ..., "newErrors": {...}, "findings": [...]}, and `hidden` maps a
    measured case id to its content-hidden values. `suite` None leaves the
    suite field out, as the step 10 harness did."""
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
        **({"suite": suite} if suite is not None else {}),
        **({"harness": harness} if harness is not None else {}),
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
    assert rounded(wilson(0, 10)) == [0.0, 0.2775]
    assert rounded(wilson(5, 10)) == [0.2366, 0.7634]
    assert rounded(wilson(10, 10)) == [0.7225, 1.0]
    assert wilson(0, 0) is None


def test_rounded_keeps_costs_and_per_case_counts() -> None:
    value = {"share": 30 / 38, "ci95": [1 / 3, 2 / 3], "usd": 0.0000123, "perCase": 0.47, "count": 30}
    assert rounded(value) == {"share": 0.7895, "ci95": [0.3333, 0.6667], "usd": 0.0000123, "perCase": 0.47, "count": 30}


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
    # Exact in memory; rounded to 4 decimals only in summary.json.
    assert plain["failureRate"]["core"]["rate"] == 3 / 34
    assert rounded(plain["failureRate"]) == {
        "core": {"failed": 3, "applicable": 34, "rate": 0.0882, "ci95": rounded(wilson(3, 34))},
        "extreme": {"failed": 1, "applicable": 4, "rate": 0.25, "ci95": rounded(wilson(1, 4))},
        "all": {"failed": 4, "applicable": 38, "rate": 0.1053, "ci95": rounded(wilson(4, 38))},
    }
    # Per candidate: brief-a 14/17 core, 2/2 extreme, 16/19 all; brief-b 17/17, 1/2, 18/19.
    assert rounded(plain["survival"]["core"]) == {"candidates": 2, "mean": 0.9118, "min": 0.8235, "max": 1.0}
    assert plain["survival"]["extreme"] == {"candidates": 2, "mean": 0.75, "min": 0.5, "max": 1.0}
    assert rounded(plain["survival"]["all"]["mean"]) == 0.8947
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
    assert rounded(pooled["brokeOnce"]["core"]) == {"count": 1, "of": 3, "share": 0.3333, "ci95": rounded(wilson(1, 3))}
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
    assert summary["models"] == [{"id": "m1", "provider": None, "model": "vendor/m", "reportedModels": ["vendor/m-1"],
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


def test_suite_version(corpus: Path) -> None:
    # The corpus runs leave the suite field out, as the step 10 harness did.
    assert summarize(corpus)[1]["suite"] == {"version": "v1", "stressSummaries": 4, "recorded": 0,
                                             "versions": {"v1": 4}, "commits": {"not recorded": 4}}
    add_candidate(corpus, "m2/brief-a/plain-s1")
    add_run(corpus, "m2/brief-a/plain-s1", suite="v1", harness={"commit": "abc1234", "dirty": False})
    add_candidate(corpus, "m2/brief-b/plain-s1")
    add_run(corpus, "m2/brief-b/plain-s1", suite="v1.1", harness={"commit": "def5678", "dirty": True})
    _, summary = summarize(corpus, ("m1", "m2"))
    assert summary["suite"] == {"version": "v1", "stressSummaries": 6, "recorded": 2,
                                "versions": {"v1": 5, "v1.1": 1},
                                "commits": {"abc1234": 1, "def5678 (dirty)": 1, "not recorded": 4}}
    report = render_report(summary)
    assert "Suite v1 (D-044): the cases, tiers, checks, tolerances and new-finding rule are frozen" in report
    assert "Stress summaries by suite: v1 5, v1.1 1. By harness commit: abc1234 1, def5678 (dirty) 1, not recorded 4." in report
    assert "4 of 6 stress summaries predate the suite field" in report


def test_a_stress_run_of_another_suite_is_an_error(tmp_path: Path) -> None:
    add_candidate(tmp_path, "m1/brief-a/plain-s1")
    add_run(tmp_path, "m1/brief-a/plain-s1", suite="v2")
    with pytest.raises(SetupError, match="suite v2"):
        load_candidates(["m1"], ["brief-a"], candidates_dir=tmp_path / "candidates", runs_dir=tmp_path / "runs")


def test_percentages_are_rounded_once(tmp_path: Path) -> None:
    # 30 of 38 cases fail: 78.947...%, which rounded to 4 decimals first (0.7895)
    # would print as 79.0%.
    failing = {case: {"newErrors": {"content-spill": 1}} for case in CASES[:15]}
    for brief in ("brief-a", "brief-b"):
        add_candidate(tmp_path, f"m1/{brief}/plain-s1")
        add_run(tmp_path, f"m1/{brief}/plain-s1", suite="v1", failed=failing)
    candidates, summary = summarize(tmp_path)
    report = render_report(summary)
    assert "| m1 | plain | all cases | 30/38 | 78.9% |" in report
    write_outputs(candidates, summary, tmp_path / "spike")
    written = json.loads((tmp_path / "spike" / "summary.json").read_text(encoding="utf-8"))
    assert written["groups"][0]["failureRate"]["all"]["rate"] == 0.7895


def test_sensitivity_removes_one_case_family_at_a_time(tmp_path: Path) -> None:
    # plain, pooled over m1 and m2: one candidate breaks only on text-longword@320,
    # one on text-long and text-longword, one never; hinted: one breaks only on
    # viewport-320 and another only on an extreme case.
    runs = {
        "m1/brief-a/plain-s1": {"text-longword@320": {"newErrors": {"content-spill": 1}}},
        "m1/brief-b/plain-s1": {"text-long": {"newErrors": {"text-clipped": 1}},
                                "text-longword": {"newErrors": {"text-clipped": 1}}},
        "m2/brief-a/plain-s1": {},
        "m1/brief-a/hinted-s1": {"viewport-320": {"newErrors": {"off-screen": 1}}},
        "m2/brief-a/hinted-s1": {"text-unbroken@320": {"newErrors": {"content-spill": 1}}},
    }
    for cid, failed in runs.items():
        add_candidate(tmp_path, cid)
        add_run(tmp_path, cid, suite="v1", failed=failed)
    _, summary = summarize(tmp_path, ("m1", "m2"))
    plain = {row["removed"]: (row["count"], row["of"]) for row in summary["sensitivity"]["plain"]}
    hinted = {row["removed"]: (row["count"], row["of"]) for row in summary["sensitivity"]["hinted"]}
    assert list(plain) == [None, *CORE_FAMILIES] and "text-unbroken" not in plain
    assert plain[None] == (2, 3) and plain["text-longword"] == (1, 3) and plain["text-long"] == (2, 3)
    assert hinted[None] == (1, 2) and hinted["viewport-320"] == (0, 2) and hinted["text-long"] == (1, 2)
    # The first row is the pooled core headline.
    assert plain[None][0] == group(summary, "plain", "all models")["brokeOnce"]["core"]["count"]
    report = render_report(summary)
    assert "## Headline sensitivity" in report
    assert "| removed | plain: broke, core cases | share | 95% interval | change | hinted: broke, core cases |" in report
    assert "| none | 2/3 | 66.7% | 20.8% to 93.9% | - | 1/2 | 50.0% |" in report
    assert "| text-longword | 1/3 | 33.3% | 6.1% to 79.2% | -33.3 | 1/2 | 50.0% | 9.5% to 90.5% | +0.0 |" in report
    assert "| viewport-320 | 2/3 | 66.7% | 20.8% to 93.9% | +0.0 | 0/2 | 0.0% | 0.0% to 65.8% | -50.0 |" in report


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
    assert "| m1 | - | vendor/m | - | - | - |" in report


def test_mcnemar_exact_matches_the_binomial_test() -> None:
    assert mcnemar_exact(0, 0) == 1.0
    assert mcnemar_exact(3, 1) == pytest.approx(0.625)  # 2 * (1 + 4) / 16
    assert mcnemar_exact(5, 0) == pytest.approx(0.0625)  # 2 / 32
    assert mcnemar_exact(0, 6) == pytest.approx(0.03125)
    assert mcnemar_exact(10, 2) == pytest.approx(2 * (1 + 12 + 66) / 4096)
    assert mcnemar_exact(4, 4) == 1.0  # capped at 1


def test_hint_effect_pairs_clean_plain_and_hinted_of_the_same_brief(tmp_path: Path) -> None:
    broke = {"text-long": {"newErrors": {"content-spill": 1}}}
    extreme_only = {"text-unbroken@320": {"newErrors": {"content-spill": 1}}}
    runs = {
        # m1: two briefs where only plain broke, one where neither did.
        "m1/brief-a/plain-s1": broke, "m1/brief-a/hinted-s1": {},
        "m1/brief-b/plain-s1": broke, "m1/brief-b/hinted-s1": extreme_only,
        "m1/brief-c/plain-s1": {}, "m1/brief-c/hinted-s1": {},
        # m2: both broke on brief-a; brief-b has no clean plain, so it is no pair.
        "m2/brief-a/plain-s1": broke, "m2/brief-a/hinted-s1": broke,
        "m2/brief-b/hinted-s1": {},
    }
    for cid, failed in runs.items():
        add_candidate(tmp_path, cid)
        add_run(tmp_path, cid, suite="v1", failed=failed)
    add_candidate(tmp_path, "m2/brief-b/plain-s1")
    add_run(tmp_path, "m2/brief-b/plain-s1", suite="v1", baseline_errors=1)
    _, summary = summarize(tmp_path, ("m1", "m2"))
    effect = summary["hintEffect"]
    assert effect["perModel"]["m1"] == {"pairs": 3, "bothBroke": 0, "plainOnly": 2, "hintedOnly": 0, "neither": 1,
                                        "p": 0.5}
    assert effect["perModel"]["m2"] == {"pairs": 1, "bothBroke": 1, "plainOnly": 0, "hintedOnly": 0, "neither": 0,
                                        "p": 1.0}
    assert effect["pooled"]["pairs"] == 4 and effect["pooled"]["p"] == 0.5
    report = render_report(summary)
    assert "## Hint effect, paired" in report
    assert "| m1 | 3 | 0 | 2 | 0 | 1 | 0.5000 |" in report and "| all models | 4 | 1 | 2 | 0 | 1 | 0.5000 |" in report
    # Without the run plan the decision lines are not evaluated.
    assert summary["decisions"] is None
    assert "## Decision lines (D-049)" in report and "summarize was run without the run plan" in report


def _group(model: str, variant: str, clean: int, broke: int) -> dict:
    from first_edit.summarize import wilson
    return {"model": model, "variant": variant, "pooled": False, "cleanBaseline": clean,
            "brokeOnce": {"core": {"count": broke, "of": clean, "ci95": wilson(broke, clean)}}}


def test_decision_lines_cover_finished_models_only() -> None:
    groups = [_group("m1", "plain", 20, 20), _group("m1", "hinted", 20, 4),
              _group("m2", "plain", 20, 0), _group("m2", "hinted", 14, 0),
              _group("m3", "plain", 3, 0), _group("m3", "hinted", 3, 0)]
    pairs = {"m1": [(True, False)] * 16 + [(True, True)] * 4, "m2": [(False, False)] * 14, "m3": [(True, False)] * 3}
    both = decision_lines(groups, pairs, ["m1", "m2"])
    assert both["models"] == ["m1", "m2"]
    lines = both["lines"]
    # m2 hinted has 14 clean candidates; m3 is not finished, so its 3 do not count.
    assert lines["coverage"] == {"met": False, "detail": "below 15: m2 hinted 14"}
    assert lines["hintEffect"]["met"] is True and "16 discordant" not in lines["hintEffect"]["detail"]
    assert lines["hintEffect"]["detail"].startswith("34 pairs, plain only 16, hinted only 0, p = 0.0000")
    # 20/20 against 0/20: the 95% intervals do not overlap.
    assert lines["modelEffect"] == {"met": True, "detail": "intervals apart: m1 and m2"}

    one = decision_lines(groups, pairs, ["m1"])["lines"]
    assert one["coverage"]["met"] is True
    assert one["modelEffect"]["met"] is False
    assert decision_lines(groups, pairs, []) == {"models": [], "lines": None}


def test_claude_cli_models_are_disclosed(tmp_path: Path) -> None:
    add_candidate(tmp_path, "cc-test/brief-a/plain-s1", provider="claude-cli", actual=None, estimated=None)
    add_run(tmp_path, "cc-test/brief-a/plain-s1", suite="v1")
    candidates = load_candidates(["cc-test"], ["brief-a"], candidates_dir=tmp_path / "candidates", runs_dir=tmp_path / "runs")
    summary = build_summary(candidates, ["cc-test"], ["brief-a"], {"cc-test": {"provider": "claude-cli", "model": "haiku"}},
                            finished=["cc-test"])
    report = render_report(summary)
    assert "| cc-test | claude-cli | haiku |" in report
    assert "cc-test: run through the Claude Code command line" in report and "(D-047)" in report
    assert "Covering the models whose queued jobs are all finished: cc-test." in report
    assert "a. Coverage: every model and variant has at least 15 clean-baseline candidates: **not met**" in report
    gallery = render_gallery(candidates, tmp_path / "out")
    assert "cc-test: run through the Claude Code command line" in gallery
