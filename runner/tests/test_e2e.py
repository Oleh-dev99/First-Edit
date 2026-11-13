"""End to end with the mock model: generate every corpus brief, gate each
candidate with the Node gate, and stress every one with the Node runner."""

import json

import pytest

from first_edit.briefs import list_briefs
from first_edit.cli import main
from first_edit.paths import CANDIDATES_DIR
from first_edit.summarize import CASE_TIERS

pytestmark = pytest.mark.e2e


def test_mock_reference_end_to_end(capsys: pytest.CaptureFixture[str], tmp_path) -> None:
    briefs = list_briefs(corpus_only=True)
    assert len(briefs) == 20

    assert main(["generate", "--model", "mock-reference", "--all"]) == 0
    for brief in briefs:
        record = json.loads((CANDIDATES_DIR / "mock-reference" / brief / "plain-s1" / "generation.json").read_text(encoding="utf-8"))
        assert record["valid"], (brief, record["reasons"])

    # --variant plain: other variants left in candidates/mock-reference by
    # earlier command-line runs must not change the counts below. The runs go
    # to a directory of the test's own, so stress results left in
    # results/runs by an older harness are never read.
    runs = tmp_path / "runs"
    assert main(["stress", "--model", "mock-reference", "--all", "--variant", "plain", "--runs-dir", str(runs)]) == 0
    for brief in briefs:
        summary_file = runs / brief / f"mock-reference__{brief}__plain-s1" / "summary.json"
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        assert summary["baseline"]["errors"] == 0, brief
        assert summary["totals"]["survived"] == summary["totals"]["applicable"], brief
        # The harness and summarize agree on every case and its tier (D-039).
        assert [(entry["id"], entry["tier"]) for entry in summary["cases"]] == list(CASE_TIERS.items()), brief

    output = capsys.readouterr().out
    assert "candidates: 20  valid: 20  stressed: 20  clean baseline: 20  born broken: 0  baseline crash: 0" in output
    assert "at 100%: 20" in output and "content hidden: 0" in output

    assert main(["summarize", "--out", str(tmp_path / "spike"), "--model", "mock-reference", "--runs-dir", str(runs)]) == 0
    report = (tmp_path / "spike" / "report.md").read_text(encoding="utf-8")
    # The references never break, so the headline is 0 of 20 (D-033), over core and all cases.
    headline = next(line for line in report.splitlines() if line.startswith("| mock-reference | plain | 20 | 0 |"))
    assert "| 0 | 0.0% | 0.0% to 16.1% |" in headline and headline.count("0.0% to 16.1%") == 2
    assert "| mock-reference | plain | 20 | 20 | 0 | 0 | 20 | 0 | 0 |" in report
    assert "| mock-reference | plain | core | 0/" in report and "| 100.0% | 100.0% | 100.0% |" in report
    # Every stress summary records suite v1 (D-044); the sensitivity table pools the one model (D-045).
    assert "Suite v1 (D-044)" in report and "predate the suite field" not in report
    assert "| none | 0/20 | 0.0% | 0.0% to 16.1% | - |" in report
    gallery = (tmp_path / "spike" / "gallery.html").read_text(encoding="utf-8")
    assert 'data-section="failing"' in gallery and 'class="card survived"' in gallery
