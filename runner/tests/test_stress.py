"""The stress command: candidate states, the table's clean-baseline count
(which must match summarize) and the time per candidate, with a fake runner."""

import json
import subprocess
from pathlib import Path

from first_edit.stress import baseline_state, format_table, stress


def summary(status: str = "ok", errors: int = 0, survived: int = 19, hidden: int = 0) -> dict:
    return {
        "schemaVersion": 3,
        "baseline": {"status": status, "errors": errors, "truncations": 1 if status == "ok" else None},
        "cases": [{"id": "viewport-320", "applicable": True, "survived": True, "truncations": 2, "contentHidden": hidden}],
        "totals": {"applicable": 19, "survived": survived},
    }


def test_baseline_states() -> None:
    assert baseline_state(summary()) == "clean"
    assert baseline_state(summary(errors=2)) == "born-broken"
    # A baseline that threw or timed out is a crash, not clean, whatever its error count.
    assert baseline_state(summary(status="render-error")) == "baseline-crash"
    assert baseline_state(summary(status="timeout")) == "baseline-crash"


def test_stress_rows_states_and_times(tmp_path: Path) -> None:
    candidates, runs = tmp_path / "candidates", tmp_path / "runs-v2"
    results = {
        "brief-a": summary(survived=15, hidden=1),
        "brief-b": summary(errors=3),
        "brief-c": summary(status="render-error", survived=0),
    }
    for brief in [*results, "brief-d"]:
        record = {"valid": brief != "brief-d"}
        path = candidates / "m" / brief / "plain-s1" / "generation.json"
        path.parent.mkdir(parents=True)
        path.write_text(json.dumps(record), encoding="utf-8")

    calls = []
    ticks = iter([0.0, 12.5, 20.0, 31.0, 40.0, 41.5])

    def run(brief: str, cid: str, runs_dir: Path) -> subprocess.CompletedProcess[str]:
        calls.append((brief, cid, runs_dir))
        out = runs_dir / brief / cid.replace("/", "__") / "summary.json"
        out.parent.mkdir(parents=True)
        out.write_text(json.dumps(results[brief]), encoding="utf-8")
        return subprocess.CompletedProcess([], 0, "", "")

    rows = stress("m", [*results, "brief-d"], None, run=run, candidates_dir=candidates, runs_dir=runs,
                  out=lambda _line: None, clock=lambda: next(ticks))
    assert [call[2] for call in calls] == [runs, runs, runs]
    assert [(row.brief, row.status, row.state, row.seconds) for row in rows] == [
        ("brief-a", "stressed", "clean", 12.5),
        ("brief-b", "stressed", "born-broken", 11.0),
        ("brief-c", "stressed", "baseline-crash", 1.5),
        ("brief-d", "invalid", None, None),
    ]
    assert (rows[0].truncations, rows[0].content_hidden) == (3, 1)

    table = format_table(rows)
    # The crashed baseline is not counted as clean, and survival covers clean candidates only.
    assert "clean baseline: 1  born broken: 1  baseline crash: 1" in table
    assert "clean-baseline cases survived: 15/19 (79%)  at 100%: 0" in table
    assert "stress time: 25 s in all, 8.3 s per candidate (min 1.5, max 12.5)" in table
    assert "crash" in table.splitlines()[3]
