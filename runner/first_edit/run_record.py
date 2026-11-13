"""The run record (docs/RUNS.md): for every model of the run plan, where it
was called, with which parameters, when, and what came back.

It is written from the generation records (candidates/<model>/<brief>/
<variant>-s<n>/generation.json) of the models that runner/plan.toml queues,
and from their stress summaries in the plan's runs directory, which hold the
suite version, the harness commit and the browser versions. Nothing in it is
typed by hand, and it has no timestamp of its own, so it changes only when the
run does. It is regenerated whenever the run advances (docs/SPEC.md, Daily
routine).
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from .ledger import is_free
from .models import ModelEntry
from .paths import CANDIDATES_DIR, REPO_ROOT
from .prompts import VARIANTS
from .run_queue import Plan, QueueState, active_jobs
from .stress import find_candidates


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _display(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix() if path.is_relative_to(REPO_ROOT) else path.as_posix()


def _commit(summary: dict[str, Any]) -> str:
    harness = summary.get("harness")
    if not isinstance(harness, dict) or not harness.get("commit"):
        return "not recorded"
    return f"{harness['commit']}{' (dirty)' if harness.get('dirty') else ''}"


def _counts(values: list[str]) -> dict[str, int]:
    return dict(sorted(Counter(values).items()))


def _model_record(entry: ModelEntry, brief_ids: list[str], candidates_dir: Path, runs_dir: Path) -> dict[str, Any]:
    records = []
    for brief_id, variant, sample in find_candidates(entry.id, brief_ids, None, candidates_dir):
        cid = f"{entry.id}/{brief_id}/{variant}-s{sample}"
        generation = _read_json(candidates_dir / cid / "generation.json")
        if generation is not None:
            summary = _read_json(runs_dir / brief_id / cid.replace("/", "__") / "summary.json")
            records.append((brief_id, variant, sample, generation, summary))

    # A failed call has no reply, so no receivedAt; it is dated by its record.
    called = sorted(g.get("receivedAt") or g.get("generatedAt") for *_, g, _ in records
                    if g.get("receivedAt") or g.get("generatedAt"))
    variants = []
    for variant in VARIANTS:
        own = [(b, s, g) for b, v, s, g, _ in records if v == variant]
        if not own:
            continue
        failed = [g for *_, g in own if g.get("status") == "api-error"]
        replied = [g for *_, g in own if g.get("status") != "api-error"]
        variants.append({
            "variant": variant,
            "samples": len(own),
            "sampleNumbers": sorted({s for _, s, _ in own}),
            "briefs": len({b for b, _, _ in own}),
            "valid": sum(1 for g in replied if g.get("valid")),
            "invalid": sum(1 for g in replied if not g.get("valid")),
            "failed": len(failed),
        })

    valid = [summary for *_, g, summary in records if g.get("valid")]
    stressed = [summary for summary in valid if summary is not None]
    versions = [summary.get("versions") or {} for summary in stressed]
    return {
        "id": entry.id,
        "provider": entry.provider,
        "baseUrl": entry.base_url,
        "providerModel": entry.model,
        "free": is_free(entry),
        "reportedModels": sorted({g["reportedModel"] for *_, g, _ in records if g.get("reportedModel")}),
        "reportedProviders": sorted({g["reportedProvider"] for *_, g, _ in records if g.get("reportedProvider")}),
        "calls": {"first": called[0] if called else None, "last": called[-1] if called else None},
        "variants": variants,
        "params": sorted({json.dumps((g.get("model") or {}).get("params") or {}, sort_keys=True)
                          for *_, g, _ in records}),
        "stress": {
            "stressed": len(stressed),
            "notStressed": len(valid) - len(stressed),
            # A schema 3 summary without the suite field was written by the step 10 harness, which is suite v1.
            "suites": _counts([str(summary.get("suite", "v1")) for summary in stressed]),
            "commits": _counts([_commit(summary) for summary in stressed]),
            "playwright": _counts([str(v.get("playwright") or "not recorded") for v in versions]),
            "chromium": _counts([str(v.get("chromium") or "not recorded") for v in versions]),
        },
    }


def build_record(plan: Plan, models: dict[str, ModelEntry], brief_ids: list[str], *,
                 plan_file: Path, candidates_dir: Path = CANDIDATES_DIR) -> dict[str, Any]:
    """The record of every model of the plan's active jobs, in plan order, as
    summarize reads them: every generated sample of those models over the
    given briefs, whether or not a job of this plan generated it."""
    state = QueueState(plan.state_file)
    jobs = active_jobs(plan, state)
    model_ids = list(dict.fromkeys(job.model for job in jobs))
    inactive = [job for job in plan.jobs if job not in jobs]
    return {
        "plan": _display(plan_file),
        "runsDir": _display(plan.runs_dir),
        "out": _display(plan.out_dir),
        "models": [_model_record(models[model_id], brief_ids, candidates_dir, plan.runs_dir) for model_id in model_ids],
        "blocked": dict(sorted(state.blocked.items())),
        "inactiveFallbacks": [{"model": job.model, "onlyIfBlocked": list(job.only_if_blocked)} for job in inactive],
    }


def _join(counts: dict[str, int]) -> str:
    return ", ".join(f"{value} ({count})" for value, count in counts.items()) or "-"


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header),
            *("| " + " | ".join(row) + " |" for row in rows)]


def _free_line(models: list[dict[str, Any]]) -> str:
    if not models:
        return "The plan queues no model."
    paid = [m["id"] for m in models if not m["free"]]
    if not paid:
        return ("Every model in this run is a free-tier variant: its provider model id ends in \":free\". No frontier "
                "model was tested (D-057).")
    return "Not free-tier variants: " + ", ".join(paid) + "."


def render_record(record: dict[str, Any]) -> str:
    models = record["models"]
    lines = [
        "# Run record",
        "",
        "Written by `python -m first_edit run-record --out docs/RUNS.md` from the",
        f"generation records of the models queued in {record['plan']} and from their",
        f"stress summaries in {record['runsDir']}; the run's report is {record['out']}.",
        "Do not edit it by hand: run the command again whenever the run advances",
        "(docs/SPEC.md, Daily routine). It covers every generated sample of these",
        "models, the samples of earlier steps that the run reuses included, as the",
        "run report does.",
        "",
        _free_line(models),
        "",
        "## Models",
        "",
        "Times are UTC, as recorded: a reply's receivedAt, or for a failed call the",
        "time its record was written.",
        "",
        *_table(["model id", "provider", "base URL", "provider model id", "reported model", "served by",
                 "first call", "last call"],
                [[m["id"], m["provider"], m["baseUrl"] or "-", m["providerModel"] or "-",
                  ", ".join(m["reportedModels"]) or "-", ", ".join(m["reportedProviders"]) or "-",
                  m["calls"]["first"] or "no calls yet", m["calls"]["last"] or "-"] for m in models]),
        "",
        "## Samples and calls",
        "",
        "Each sample is one call; its retries are part of it. Valid: a reply that",
        "passed the gate. Invalid: a reply that failed it (D-025). Failed: no reply",
        "(an API error).",
        "",
    ]
    rows = []
    for m in models:
        if not m["variants"]:
            rows.append([m["id"], "-", "0", "-", "0", "0", "0", "0"])
        for v in m["variants"]:
            rows.append([m["id"], v["variant"], str(v["samples"]), ", ".join(f"s{n}" for n in v["sampleNumbers"]),
                         str(v["briefs"]), str(v["valid"]), str(v["invalid"]), str(v["failed"])])
    lines += _table(["model id", "variant", "samples", "sample numbers", "briefs", "valid", "invalid", "failed"], rows)
    every = [v for m in models for v in m["variants"]]
    lines += [
        "",
        f"In all: {sum(v['samples'] for v in every)} samples, {sum(v['valid'] for v in every)} valid, "
        f"{sum(v['invalid'] for v in every)} invalid, {sum(v['failed'] for v in every)} failed.",
        "",
        "## Request parameters",
        "",
        "The request body is the provider model id, the two messages and these",
        "parameters, nothing else (D-024), as each generation record names them.",
        "",
        *_table(["model id", "parameters"],
                [[m["id"], "; ".join(f"`{p}`" for p in m["params"]) or "no calls yet"] for m in models]),
        "",
        "## Stress runs",
        "",
        f"From the stress summaries in {record['runsDir']}, one per valid candidate, with",
        "the number of summaries for each value.",
        "",
        *_table(["model id", "stressed", "valid, not stressed", "suite", "harness commit", "Playwright", "Chromium"],
                [[m["id"], str(m["stress"]["stressed"]), str(m["stress"]["notStressed"]), _join(m["stress"]["suites"]),
                  _join(m["stress"]["commits"]), _join(m["stress"]["playwright"]), _join(m["stress"]["chromium"])]
                 for m in models]),
        "",
        "## Queue",
        "",
        "- Blocked models: " + ("; ".join(f"{model} ({why})" for model, why in record["blocked"].items()) or "none")
        + ".",
    ]
    for job in record["inactiveFallbacks"]:
        lines.append(f"- Not active: {job['model']}, a fallback that runs only if one of "
                     f"{', '.join(job['onlyIfBlocked'])} is blocked.")
    return "\n".join(lines) + "\n"


def write_record(record: dict[str, Any], path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_record(record), encoding="utf-8", newline="\n")
    return path
