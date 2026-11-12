"""End to end with the mock model: generate every corpus brief, gate each
candidate with the Node gate, and stress every one with the Node runner."""

import json

import pytest

from first_edit.briefs import list_briefs
from first_edit.cli import main
from first_edit.paths import CANDIDATES_DIR, RUNS_DIR

pytestmark = pytest.mark.e2e


def test_mock_reference_end_to_end(capsys: pytest.CaptureFixture[str]) -> None:
    briefs = list_briefs(corpus_only=True)
    assert len(briefs) == 10

    assert main(["generate", "--model", "mock-reference", "--all"]) == 0
    for brief in briefs:
        record = json.loads((CANDIDATES_DIR / "mock-reference" / brief / "plain-s1" / "generation.json").read_text(encoding="utf-8"))
        assert record["valid"], (brief, record["reasons"])

    assert main(["stress", "--model", "mock-reference", "--all"]) == 0
    for brief in briefs:
        summary_file = RUNS_DIR / brief / f"mock-reference__{brief}__plain-s1" / "summary.json"
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        assert summary["baseline"]["errors"] == 0, brief
        assert summary["totals"]["survived"] == summary["totals"]["applicable"], brief

    output = capsys.readouterr().out
    assert "candidates: 10  valid: 10  stressed: 10  clean baseline: 10" in output
    assert "at 100%: 10" in output
