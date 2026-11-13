"""The export-site command: everything the results site shows, as static files
(docs/SPEC.md, Results site; D-054).

Reads a run summary (summarize --plan), its stress results, the calibration
summary, the briefs, the reference runs and the candidates, and writes:

- run.json: the tables behind the run's report.md, with which models have
  finished their queued jobs, and a 95% Wilson interval for every rate;
- cases.json: every failed case and every born-broken or crashed baseline
  of the run's models, and a seeded sample of survived cases;
- images/: WebP before, after and annotated screenshots of those cases, at
  most 1280 px wide (and, the format's limit, 16383 px tall);
- source/: the source of each candidate shown, as plain text;
- briefs.json: the prompt, word for word, and each brief with its text,
  props, baseline fixture and the reference's baseline screenshot;
- calibration.json: the calibration summary.

The export is deterministic: the same inputs give the same bytes. It is
checked before it replaces the output: no API key, no email address outside
the reserved example domains (RFC 2606) that the fixtures use, and no
absolute local path. The export is the published record of a run (D-054).
"""

from __future__ import annotations

import io
import json
import os
import random
import re
import shutil
from pathlib import Path
from typing import Any

from .briefs import load_brief
from .labelset import describe_case
from .paths import BRIEFS_DIR, CANDIDATES_DIR, ENV_FILE, PROMPTS_DIR, REPO_ROOT, RUNS_DIR
from .providers import SetupError
from .summarize import (CASES, SUMMARY_SCHEMA_VERSION, Candidate, Case, load_candidates, rounded, wilson)

EXPORT_SCHEMA_VERSION = 1
#: Survived cases shown beside the failures, so the gallery is not only failures.
SURVIVED_SAMPLE = 40
SURVIVED_SEED = 1
MAX_WIDTH = 1280
#: WebP cannot be taller (or wider) than this.
MAX_HEIGHT = 16383
WEBP_QUALITY = 80
WEBP_METHOD = 4
FINDING_KEYS = ("check", "severity", "selector", "text", "rect", "detail")
#: The files of a previous export; only a folder that has one is replaced.
MARKER = "run.json"


# --- privacy ---------------------------------------------------------------------

#: A key has a digit somewhere; the mutations' long words never do.
_HAS_DIGIT = r"(?=[A-Za-z._~+/-]*[0-9])"
KEY_PATTERNS = (
    re.compile(rf"(?<![A-Za-z0-9])sk-{_HAS_DIGIT}[A-Za-z0-9_-]{{16,}}"),
    re.compile(r"AIza[0-9A-Za-z_-]{30,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{30,}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(rf"(?i)\b(api[_-]?key|authorization|secret|token)\b[\"']?\s*[:=]\s*[\"']?{_HAS_DIGIT}[A-Za-z0-9._~+/-]{{20,}}"),
    re.compile(rf"\bBearer\s+{_HAS_DIGIT}[A-Za-z0-9._~+/-]{{20,}}"),
)
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)")
#: The reserved example domains (RFC 2606) the fixtures use; the content
#: mutations grow their values ("...@example.compriya.raman@ex"), so a domain
#: counts when it starts with one of them.
RESERVED_DOMAIN = re.compile(r"^(example\.(com|net|org)|[a-z0-9.-]*\.(example|test|invalid|localhost))", re.I)
LOCAL_PATH = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]:[\\/]|file:/{2,}|/Users/|/home/|\\Users\\|\\\\[A-Za-z0-9.-]+\\")
TEXT_SUFFIXES = (".json", ".txt", ".html", ".js", ".css", ".md", ".svg")
#: The only RIFF chunks a screenshot needs; EXIF, XMP and ICC chunks could carry metadata.
WEBP_CHUNKS = {b"VP8 ", b"VP8L", b"VP8X", b"ALPH"}


def _env_values(env_file: Path) -> list[str]:
    values = []
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            name, sep, value = line.partition("=")
            value = value.strip().strip("\"'")
            if sep and not name.strip().startswith("#") and len(value) >= 8:
                values.append(value)
    return values


def _webp_chunks(data: bytes) -> list[bytes]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return [b"not a WebP file"]
    chunks, offset = [], 12
    while offset + 8 <= len(data):
        name, size = data[offset:offset + 4], int.from_bytes(data[offset + 4:offset + 8], "little")
        chunks.append(name)
        offset += 8 + size + (size & 1)
    return chunks


def privacy_problems(directory: Path, *, env_file: Path = ENV_FILE, extra: tuple[str, ...] = ()) -> list[str]:
    """Every API key, email address outside the reserved example domains,
    absolute local path and image metadata chunk under `directory`. `extra`
    are further strings that must not appear (the repository root and the
    home folder are always among them)."""
    secrets = _env_values(env_file)
    forbidden = {text for text in (str(REPO_ROOT), REPO_ROOT.as_posix(), str(Path.home()), Path.home().as_posix(),
                                   *extra) if len(text) > 3}
    problems = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        name = path.relative_to(directory).as_posix()
        if path.suffix == ".webp":
            unexpected = [chunk for chunk in _webp_chunks(path.read_bytes()) if chunk not in WEBP_CHUNKS]
            if unexpected:
                problems.append(f"{name}: image chunks {', '.join(c.decode('latin-1') for c in unexpected)}")
            continue
        if path.suffix not in TEXT_SUFFIXES:
            problems.append(f"{name}: unexpected file type")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for secret in secrets:
            if secret in text:
                problems.append(f"{name}: the value of a variable in .env")
        for pattern in KEY_PATTERNS:
            for match in pattern.finditer(text):
                problems.append(f"{name}: something like an API key ({match.group(0)[:12]}...)")
        for match in EMAIL.finditer(text):
            if not RESERVED_DOMAIN.match(match.group(1)):
                problems.append(f"{name}: an email address at {match.group(1)}")
        for match in LOCAL_PATH.finditer(text):
            problems.append(f"{name}: an absolute local path ({text[match.start():match.start() + 24]!r})")
        for item in forbidden:
            if item in text:
                problems.append(f"{name}: a local folder name")
    return problems


def scrub(text: str | None) -> str | None:
    """A message with the repository root removed and any other absolute
    path replaced, so errors from a render can be published."""
    if text is None:
        return None
    for root in (REPO_ROOT.as_posix(), str(REPO_ROOT)):
        for prefix in ("file:///", "/@fs/", ""):
            text = text.replace(prefix + root + "/", "").replace(prefix + root + "\\", "").replace(prefix + root, "")
    return re.sub(r"(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|file:/{2,}|/Users/|/home/)[^\s\"'<>)]*", "<local path>", text)


def _scrubbed(value: Any) -> Any:
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {key: _scrubbed(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_scrubbed(item) for item in value]
    return value


# --- files -----------------------------------------------------------------------


def _dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rounded(_scrubbed(value)), ensure_ascii=False, indent=1) + "\n", encoding="utf-8",
                    newline="\n")


def _display(path: Path) -> str:
    resolved = path.resolve()
    return resolved.relative_to(REPO_ROOT).as_posix() if resolved.is_relative_to(REPO_ROOT) else path.name


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SetupError(f"cannot read {path}: {error}") from error


class Images:
    """Screenshots converted once each to WebP under out/images/."""

    def __init__(self, out_dir: Path) -> None:
        self.out_dir = out_dir
        self.done: dict[Path, dict[str, Any]] = {}

    def add(self, source: Path | None, name: str) -> dict[str, Any] | None:
        """The WebP of `source` at images/<name>.webp: {"src", "width", "height"}."""
        if source is None or not source.is_file():
            return None
        if source in self.done:
            return self.done[source]
        from PIL import Image  # only export-site needs Pillow

        with Image.open(source) as opened:
            image = opened.convert("RGB")
        width, height = image.size
        scale = min(1.0, MAX_WIDTH / width, MAX_HEIGHT / height)
        if scale < 1:
            image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
        relative = f"images/{name}.webp"
        target = self.out_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(buffer.getvalue())
        self.done[source] = {"src": relative, "width": image.width, "height": image.height,
                             "scale": round(image.width / width, 4)}
        return self.done[source]


# --- the run ---------------------------------------------------------------------


def _with_intervals(value: Any) -> Any:
    """Every {"failed", "applicable"} pair gains a rate and its 95% Wilson interval."""
    if isinstance(value, dict):
        out = {key: _with_intervals(item) for key, item in value.items()}
        if "failed" in value and "applicable" in value and "ci95" not in value:
            applicable = value["applicable"]
            out["rate"] = value["failed"] / applicable if applicable else None
            out["ci95"] = wilson(value["failed"], applicable)
        return out
    if isinstance(value, list):
        return [_with_intervals(item) for item in value]
    return value


def run_data(summary: dict[str, Any], run_dir: Path, runs_dir: Path) -> dict[str, Any]:
    decisions = summary.get("decisions")
    finished = list(decisions["models"]) if decisions else []
    models = [{**model, "finished": model["id"] in finished} for model in summary["models"]]
    return {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "source": {"run": _display(run_dir), "runs": _display(runs_dir), "summarySchema": summary["schemaVersion"]},
        "status": {"finished": finished, "models": len(models), "preliminary": len(finished) < len(models)},
        "suite": summary["suite"],
        "models": models,
        "cases": [{**case, "description": describe_case(case["id"])} for case in summary["cases"]],
        "checks": summary["checks"],
        "briefs": summary["briefs"],
        "groups": _with_intervals(summary["groups"]),
        "hintEffect": summary["hintEffect"],
        "sensitivity": summary["sensitivity"],
        "decisions": decisions,
        "survivalByBrief": summary["survivalByBrief"],
        "totals": summary["totals"],
    }


def _case_order(case: Case) -> tuple:
    position = CASES.index(case.case) if case.case in CASES else -1
    return (case.model, case.brief, case.variant, case.sample, position)


def _source(candidate: Candidate, candidates_dir: Path, out_dir: Path, written: set[str]) -> str | None:
    component = candidates_dir / candidate.candidate / "Component.tsx"
    if not component.is_file():
        return None
    relative = f"source/{candidate.model}/{candidate.brief}/{candidate.variant}-s{candidate.sample}.txt"
    if relative not in written:
        target = out_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        text = component.read_text(encoding="utf-8").removeprefix("﻿").replace("\r\n", "\n")
        target.write_text(text, encoding="utf-8", newline="\n")
        written.add(relative)
    return relative


def _shown(case: Case, candidate: Candidate, images: Images, source: str | None) -> dict[str, Any]:
    folder = f"{candidate.model}/{candidate.brief}/{candidate.variant}-s{candidate.sample}"
    # "text-long@320.webp" would read as an email address; file names use "text-long-320"
    name = case.case.replace("@", "-")
    if case.case == "baseline":
        before = None
    else:
        reference = "viewport-320" if case.case.endswith("@320") else "baseline"
        before = images.add(candidate.run_dir / f"{reference}.png", f"{folder}/{reference}")
    after = images.add(case.screenshot, f"{folder}/{name}")
    annotated = images.add(case.annotated, f"{folder}/{name}.annotated")
    return {
        "id": f"{candidate.candidate}/{case.case}",
        "model": case.model, "brief": case.brief, "variant": case.variant, "sample": case.sample,
        "candidate": case.candidate, "case": case.case, "tier": case.tier,
        "description": "the baseline" if case.case == "baseline" else describe_case(case.case),
        "outcome": case.outcome, "status": case.status, "checks": case.checks,
        "findings": [{key: finding.get(key) for key in FINDING_KEYS} for finding in case.findings],
        "error": case.error,
        "viewport": case.viewport,
        "truncations": case.truncations,
        "images": {"before": before, "after": after, "annotated": annotated},
        "source": source,
    }


def cases_data(candidates: list[Candidate], candidates_dir: Path, out_dir: Path) -> dict[str, Any]:
    images = Images(out_dir)
    written: set[str] = set()
    by_candidate = {candidate.candidate: candidate for candidate in candidates}
    every = sorted((case for candidate in candidates for case in candidate.cases), key=_case_order)
    shown = [case for case in every if case.outcome != "survived"]
    survived = [case for case in every if case.outcome == "survived"]
    sample = sorted(random.Random(SURVIVED_SEED).sample(survived, min(SURVIVED_SAMPLE, len(survived))),
                    key=_case_order)
    entries = []
    for case in sorted([*shown, *sample], key=_case_order):
        candidate = by_candidate[case.candidate]
        entries.append(_shown(case, candidate, images, _source(candidate, candidates_dir, out_dir, written)))
    return {
        "schemaVersion": EXPORT_SCHEMA_VERSION,
        "survivedSample": {"seed": SURVIVED_SEED, "size": len(sample), "of": len(survived)},
        "counts": {outcome: sum(1 for case in every if case.outcome == outcome)
                   for outcome in ("failed", "survived", "born-broken", "baseline-crash")},
        "cases": entries,
    }


def briefs_data(brief_ids: list[str], references_dir: Path, briefs_dir: Path, out_dir: Path) -> dict[str, Any]:
    images = Images(out_dir)
    briefs = []
    for brief_id in brief_ids:
        brief = load_brief(brief_id, briefs_dir)
        reference = references_dir / brief_id / f"_reference__{brief_id}__v1" / "baseline.png"
        if not reference.is_file():
            raise SetupError(f"{reference} is missing: stress the references (npm run briefs:check) first")
        briefs.append({
            "id": brief.id, "title": brief.title, "category": brief.category,
            "brief": brief.brief_md.replace("\r\n", "\n"), "props": brief.props_ts.replace("\r\n", "\n"),
            "fixture": brief.fixture_json.replace("\r\n", "\n"),
            "reference": images.add(reference, f"briefs/{brief_id}"),
        })

    def prompt(name: str) -> str:
        return (PROMPTS_DIR / name).read_text(encoding="utf-8").strip().replace("\r\n", "\n")

    return {"schemaVersion": EXPORT_SCHEMA_VERSION,
            "prompt": {"system": prompt("system.md"), "user": prompt("user.md"), "hint": prompt("hint.md")},
            "briefs": briefs}


def export_site(run_dir: Path, runs_dir: Path, calibration_dir: Path, out_dir: Path, *,
                references_dir: Path = RUNS_DIR, candidates_dir: Path = CANDIDATES_DIR,
                briefs_dir: Path = BRIEFS_DIR, env_file: Path = ENV_FILE) -> dict[str, int]:
    """Writes the site data to out_dir and returns the number of files per kind."""
    summary = _read_json(run_dir / "summary.json")
    if summary.get("schemaVersion") != SUMMARY_SCHEMA_VERSION:
        raise SetupError(f"{run_dir / 'summary.json'} has schema {summary.get('schemaVersion')}; "
                         f"export-site reads schema {SUMMARY_SCHEMA_VERSION}, so summarize again")
    if summary.get("decisions") is None:
        raise SetupError(f"{run_dir / 'summary.json'} does not say which models have finished their queued jobs; "
                         "write it with run-next or summarize --plan")
    calibration = _read_json(calibration_dir / "summary.json")
    if out_dir.exists() and any(out_dir.iterdir()) and not (out_dir / MARKER).is_file():
        raise SetupError(f"{out_dir} holds files that are not a site export; choose an empty folder")

    staging = out_dir.with_name(out_dir.name + ".export-tmp")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    try:
        model_ids = [model["id"] for model in summary["models"]]
        candidates = load_candidates(model_ids, summary["briefs"], candidates_dir=candidates_dir, runs_dir=runs_dir)
        _dump(staging / "run.json", run_data(summary, run_dir, runs_dir))
        _dump(staging / "cases.json", cases_data(candidates, candidates_dir, staging))
        _dump(staging / "briefs.json", briefs_data(summary["briefs"], references_dir, briefs_dir, staging))
        _dump(staging / "calibration.json", calibration)
        problems = privacy_problems(staging, env_file=env_file)
        if problems:
            shown = "\n  ".join(problems[:20])
            raise SetupError(f"the export would publish {len(problems)} thing(s) it must not; nothing was written:\n"
                             f"  {shown}")
        if out_dir.exists():
            shutil.rmtree(out_dir)
        os.replace(staging, out_dir)
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    files = [path for path in out_dir.rglob("*") if path.is_file()]
    return {"json": sum(1 for p in files if p.suffix == ".json"), "images": sum(1 for p in files if p.suffix == ".webp"),
            "sources": sum(1 for p in files if p.suffix == ".txt"), "bytes": sum(p.stat().st_size for p in files)}
