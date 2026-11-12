"""The stress command: run the Node stress runner on every valid candidate."""

from __future__ import annotations

import json
import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .paths import CANDIDATES_DIR, RUNS_DIR

CANDIDATE_DIR = re.compile(r"^(plain|hinted)-s(\d+)$")

Runner = Callable[[str, str], subprocess.CompletedProcess[str]]


@dataclass
class StressRow:
    brief: str
    variant: str
    sample: int
    candidate: str
    valid: bool
    #: "stressed", "invalid" or "harness-error"
    status: str
    baseline_errors: int | None = None
    survived: int | None = None
    applicable: int | None = None
    truncations: int | None = None
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
           out: Callable[[str], None] = print) -> list[StressRow]:
    rows = []
    for brief_id, variant_name, sample in find_candidates(model_id, brief_ids, variant, candidates_dir):
        cid = f"{model_id}/{brief_id}/{variant_name}-s{sample}"
        generation_file = candidates_dir / cid / "generation.json"
        generation = json.loads(generation_file.read_text(encoding="utf-8")) if generation_file.is_file() else {}
        if not generation.get("valid"):
            rows.append(StressRow(brief_id, variant_name, sample, cid, False, "invalid"))
            continue
        out(f"  stressing {cid} ...")
        result = run(brief_id, cid)
        summary_file = runs_dir / brief_id / cid.replace("/", "__") / "summary.json"
        if result.returncode != 0 or not summary_file.is_file():
            message = (result.stderr or result.stdout).strip()
            rows.append(StressRow(brief_id, variant_name, sample, cid, True, "harness-error", error=message))
            continue
        summary = json.loads(summary_file.read_text(encoding="utf-8"))
        truncations = (summary["baseline"].get("truncations") or 0) + sum(
            entry.get("truncations") or 0 for entry in summary["mutations"]
        )
        rows.append(StressRow(
            brief_id, variant_name, sample, cid, True, "stressed",
            baseline_errors=summary["baseline"]["errors"],
            survived=summary["totals"]["survived"],
            applicable=summary["totals"]["applicable"],
            truncations=truncations,
        ))
    return rows


def format_table(rows: list[StressRow]) -> str:
    header = ["brief", "variant", "sample", "valid", "baseline errors", "survived", "truncations"]
    body = []
    for row in rows:
        survived = f"{row.survived}/{row.applicable}" if row.status == "stressed" else ("harness error" if row.status == "harness-error" else "-")
        body.append([
            row.brief, row.variant, f"s{row.sample}", "yes" if row.valid else "no",
            "-" if row.baseline_errors is None else str(row.baseline_errors),
            survived,
            "-" if row.truncations is None else str(row.truncations),
        ])
    widths = [max(len(title), *(len(line[i]) for line in body)) if body else len(title) for i, title in enumerate(header)]
    def line(cells: list[str]) -> str:
        return "  ".join(cell.ljust(widths[i]) if i < 4 else cell.rjust(widths[i]) for i, cell in enumerate(cells))
    stressed = [row for row in rows if row.status == "stressed"]
    survived = sum(row.survived or 0 for row in stressed)
    applicable = sum(row.applicable or 0 for row in stressed)
    rate = f"{survived / applicable:.0%}" if applicable else "n/a"
    full = sum(1 for row in stressed if row.survived == row.applicable)
    clean = sum(1 for row in stressed if row.baseline_errors == 0)
    totals = (
        f"candidates: {len(rows)}  valid: {sum(1 for row in rows if row.valid)}  stressed: {len(stressed)}  "
        f"clean baseline: {clean}  survived: {survived}/{applicable} ({rate})  at 100%: {full}  "
        f"truncations: {sum(row.truncations or 0 for row in stressed)}"
    )
    return "\n".join([line(header), *(line(cells) for cells in body), "", totals])
