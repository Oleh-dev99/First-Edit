"""Running the Node harness: the candidate gate and the stress runner."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .paths import HARNESS_DIR
from .providers import SetupError


def npm() -> str:
    """The npm executable; npm.cmd on Windows. Never run through a shell."""
    path = shutil.which("npm")
    if path is None:
        raise SetupError("npm was not found on PATH")
    return path


def run_npm(script: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [npm(), "--silent", "run", script, "--", *args],
        cwd=HARNESS_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def check_candidate(brief_id: str, candidate_id: str) -> dict[str, Any]:
    """{ valid, reasons } from `npm run candidate:check -- ... --json`."""
    result = run_npm("candidate:check", "--brief", brief_id, "--candidate", candidate_id, "--json")
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    if result.returncode != 0 or not lines:
        raise SetupError(f"candidate:check failed for {candidate_id}: {result.stderr.strip() or result.stdout.strip()}")
    return json.loads(lines[-1])


def run_stress(brief_id: str, candidate_id: str, runs_dir: Path) -> subprocess.CompletedProcess[str]:
    return run_npm("stress", "--brief", brief_id, "--candidate", candidate_id, "--runs-dir", str(runs_dir.resolve()))
