"""The stress command: run the Node stress runner on every valid candidate."""

from __future__ import annotations

import json
import re
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .paths import CANDIDATES_DIR, RUNS_DIR

CANDIDATE_DIR = re.compile(r"^(plain|hinted)-s(\d+)$")

#: run(brief_id, candidate_id, runs_dir) runs `npm run stress` for one candidate.
Runner = Callable[[str, str, Path], subprocess.CompletedProcess[str]]


def baseline_state(summary: dict[str, Any]) -> str:
    """The state of a stressed candidate (D-038): "baseline-crash" when the
    baseline threw or timed out, "born-broken" when it has error findings,
    else "clean"."""
    baseline = summary["baseline"]
    if baseline.get("status") != "ok":
        return "baseline-crash"
    if (baseline.get("errors") or 0) > 0:
        return "born-broken"
    return "clean"


@dataclass
class StressRow:
    brief: str
    variant: str
    sample: int
    candidate: str
    valid: bool
    #: "stressed", "invalid" or "harness-error"
    status: str
    #: "clean", "born-broken" or "baseline-crash" once stressed
    state: str | None = None
    baseline_errors: int | None = None
    survived: int | None = None
    applicable: int | None = None
    truncations: int | None = None
    content_hidden: int | None = None
    #: wall-clock time of the stress run, for D-002
    seconds: float | None = None
    error: str | None = None


def find_candidates(model_id: str, brief_ids: list[str], variant: str | None,
                    candidates_dir: Path = CANDIDATES_DIR) -> list[tuple[str, str, int]]:
    """(brief, variant, sample) for every generated candidate directory."""
    found = []
    for brief_id in brief_ids:
        directory = candidates_dir / model_id / brief_id
        if not directory.is_dir():
            continue
        for child in directory.iterdir():
            match = CANDIDATE_DIR.match(child.name)
            if match and child.is_dir() and (variant is None or match.group(1) == variant):
                found.append((brief_id, match.group(1), int(match.group(2))))
    return sorted(found)


def stress(model_id: str, brief_ids: list[str], variant: str | None, *, run: Runner,
           candidates_dir: Path = CANDIDATES_DIR, runs_dir: Path = RUNS_DIR,
           out: Callable[[str], None] = print, clock: Callable[[], float] = time.monotonic) -> list[StressRow]:
    rows = []
    for brief_id, variant_name, sample in find_candidates(model_id, brief_ids, variant, candidates_dir):
        cid = f"{model_id}/{brief_id}/{variant_name}-s{sample}"
        generation_file = candidates_dir / cid / "generation.json"
        generation = json.loads(generation_file.read_text(encoding="utf-8")) if generation_file.is_file() else {}
        if not generation.get("valid"):
            rows.append(StressRow(brief_id, variant_name, sample, cid, False, "invalid"))
            continue
        out(f"  stressing {cid} ...")
        started = clock()
        result = run(brief_id, cid, runs_dir)
        seconds = round(clock() - started, 1)
        summary_file = runs_dir / brief_id / cid.replace("/", "__") / "summary.json"
        if result.returncode != 0 or not summary_file.is_file():
            message = (result.stderr or result.stdout).strip()
            rows.append(StressRow(brief_id, variant_name, sample, cid, True, "harness-error", seconds=seconds, error=message))
            continue
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        cases = summary["cases"]
        truncations = (summary["baseline"].get("truncations") or 0) + sum(entry.get("truncations") or 0 for entry in cases)
        rows.append(StressRow(
            brief_id, variant_name, sample, cid, True, "stressed",
            state=baseline_state(summary),
            baseline_errors=summary["baseline"]["errors"],
            survived=summary["totals"]["survived"],
            applicable=summary["totals"]["applicable"],
            truncations=truncations,
            content_hidden=sum(entry.get("contentHidden") or 0 for entry in cases),
            seconds=seconds,
        ))
    return rows


def format_table(rows: list[StressRow]) -> str:
    header = ["brief", "variant", "sample", "valid", "baseline", "survived", "truncations", "hidden", "seconds"]
    body = []
    for row in rows:
        if row.status == "stressed":
            baseline = {"clean": "clean", "born-broken": f"born broken ({row.baseline_errors})",
                        "baseline-crash": "crash"}[row.state or "clean"]
            survived = f"{row.survived}/{row.applicable}"
        else:
            baseline = "-"
            survived = "harness error" if row.status == "harness-error" else "-"
        body.append([
            row.brief, row.variant, f"s{row.sample}", "yes" if row.valid else "no", baseline, survived,
            "-" if row.truncations is None else str(row.truncations),
            "-" if row.content_hidden is None else str(row.content_hidden),
            "-" if row.seconds is None else f"{row.seconds:.1f}",
        ])
    widths = [max(len(title), *(len(line[i]) for line in body)) if body else len(title) for i, title in enumerate(header)]

    def line(cells: list[str]) -> str:
        return "  ".join(cell.ljust(widths[i]) if i < 5 else cell.rjust(widths[i]) for i, cell in enumerate(cells))

    stressed = [row for row in rows if row.status == "stressed"]
    # Survival and "at 100%" cover clean-baseline candidates only, as in summarize (D-015).
    clean = [row for row in stressed if row.state == "clean"]
    survived = sum(row.survived or 0 for row in clean)
    applicable = sum(row.applicable or 0 for row in clean)
    rate = f"{survived / applicable:.0%}" if applicable else "n/a"
    timed = [row.seconds for row in rows if row.seconds is not None]
    totals = (
        f"candidates: {len(rows)}  valid: {sum(1 for row in rows if row.valid)}  stressed: {len(stressed)}  "
        f"clean baseline: {len(clean)}  born broken: {sum(1 for row in stressed if row.state == 'born-broken')}  "
        f"baseline crash: {sum(1 for row in stressed if row.state == 'baseline-crash')}\n"
        f"clean-baseline cases survived: {survived}/{applicable} ({rate})  "
        f"at 100%: {sum(1 for row in clean if row.survived == row.applicable)}  "
        f"truncations: {sum(row.truncations or 0 for row in stressed)}  "
        f"content hidden: {sum(row.content_hidden or 0 for row in stressed)}"
    )
    if timed:
        totals += f"\nstress time: {sum(timed):.0f} s in all, {sum(timed) / len(timed):.1f} s per candidate " \
                  f"(min {min(timed):.1f}, max {max(timed):.1f})"
    return "\n".join([line(header), *(line(cells) for cells in body), "", totals])
