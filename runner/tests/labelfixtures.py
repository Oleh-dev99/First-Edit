"""Synthetic stress runs for the label-set, label and calibrate tests."""

from __future__ import annotations

import json
from pathlib import Path

from first_edit.summarize import CASE_TIERS, CASES

NO_ERRORS = {"page-overflow-x": 0, "text-clipped": 0, "content-spill": 0, "text-overlap": 0, "off-screen": 0}


def _write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def add_run(runs: Path, cid: str, *, failed: dict[str, list[str]] | None = None, baseline_errors: int = 0,
            baseline_status: str = "ok", missing: tuple[str, ...] = (), commit: str = "abc1234") -> Path:
    """A stress run of candidate `cid` where every case applies; `failed` maps a
    case id to the checks with new errors; `missing` names cases without a
    screenshot. Screenshots are small files whose bytes name the case."""
    failed = failed or {}
    brief = cid.split("/")[1]
    run_dir = runs / brief / cid.replace("/", "__")
    run_dir.mkdir(parents=True, exist_ok=True)

    def shot(case: str) -> str | None:
        if case in missing:
            return None
        (run_dir / f"{case}.png").write_bytes(f"PNG {cid} {case}".encode())
        (run_dir / f"{case}.annotated.png").write_bytes(f"PNG annotated {cid} {case}".encode())
        return f"{case}.png"

    cases = []
    for case in CASES:
        checks = failed.get(case)
        width = 320 if case.endswith("@320") or case == "viewport-320" else 1280
        _write_json(run_dir / f"{case}.json", {
            "case": case, "status": "ok",
            "newFindings": [{"check": check, "severity": "error", "selector": "#fe-root > div", "text": f"{case} text"}
                            for check in checks or []],
        })
        screenshot = shot(case)
        cases.append({
            "id": case, "tier": CASE_TIERS[case], "applicable": True, "status": "ok", "survived": checks is None,
            "viewport": {"width": width, "height": 800},
            "reference": "viewport-320" if case.endswith("@320") else "baseline",
            "newErrors": {**NO_ERRORS, **{check: 1 for check in checks or []}},
            "files": {"result": f"{case}.json", "screenshot": screenshot,
                      "annotated": f"{case}.annotated.png" if screenshot else None},
        })
    _write_json(run_dir / "summary.json", {
        "schemaVersion": 3, "suite": "v1", "harness": {"commit": commit, "dirty": False},
        "brief": brief, "candidate": cid,
        "baseline": {"status": baseline_status, "errors": baseline_errors, "viewport": {"width": 1280, "height": 800},
                     "files": {"result": "baseline.json", "screenshot": shot("baseline"),
                               "annotated": "baseline.annotated.png"}},
        "cases": cases,
    })
    return run_dir


def big_runs(runs: Path) -> dict[str, int]:
    """30 clean candidates (570 cases), one born broken, one crashed and one
    reference; returns the expected stratum sizes."""
    for n in range(30):
        failed: dict[str, list[str]] = {}
        if n < 26:  # 52 failed extreme cases
            failed["text-unbroken"] = ["content-spill"]
            failed["text-unbroken@320"] = ["page-overflow-x", "content-spill"]
        if n < 12:  # 12 failed core cases
            failed["text-longword@320"] = ["text-clipped"]
        if n == 0:
            failed["list-many"] = ["text-overlap"]
        add_run(runs, f"m{n % 2}/brief-{n:02d}/{'plain' if n % 3 else 'hinted'}-s1", failed=failed,
                missing=("dir-rtl",) if n == 29 else ())
    add_run(runs, "m0/brief-born/plain-s1", baseline_errors=2)
    add_run(runs, "m0/brief-crash/plain-s1", baseline_status="render-error")
    add_run(runs, "_reference/brief-ref/v1", failed={"text-long": ["content-spill"]})
    focus = {"text-longword@320", "text-long@320", "number-large@320", "list-many", "viewport-320", "text-200pct"}
    failed_core = 12 + 1
    failed_extreme = 52
    survived_focus = 30 * len(focus) - 12 - 1
    survived_other = 30 * len(CASES) - failed_core - failed_extreme - survived_focus - 1  # dir-rtl of n=29 left out
    return {"failed-core": failed_core, "failed-extreme": failed_extreme, "survived-focus": survived_focus,
            "survived-other": survived_other}
