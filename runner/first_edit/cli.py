"""Command line: python -m first_edit <doctor|generate|stress|summarize> ..."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx

from dotenv import load_dotenv

from .briefs import BriefError, list_briefs, load_brief
from .budget import Budget
from .doctor import run_doctor
from .generate import generate, summarize
from .ledger import FreeRequestLedger, is_free
from .models import ModelsError, get_model, load_models
from .node import check_candidate, run_stress
from .paths import ENV_FILE, RUNS_DIR
from .prompts import VARIANTS
from .providers import SetupError, make_provider
from .stress import format_table, stress
from .summarize import build_summary, load_candidates, write_outputs


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m first_edit", description="First Edit generation runner.")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("doctor", help="check that every configured model is usable (spends no tokens)")

    gen = commands.add_parser("generate", help="prompt a model for candidates and gate them")
    gen.add_argument("--model", required=True, help="a model id from runner/models.toml")
    which = gen.add_mutually_exclusive_group(required=True)
    which.add_argument("--brief", help="one brief id")
    which.add_argument("--all", action="store_true", help="every corpus brief (sample: false)")
    gen.add_argument("--variant", choices=VARIANTS, default="plain")
    gen.add_argument("--samples", type=int, default=1, help="samples per brief (default 1)")
    gen.add_argument("--max-requests", type=int, help="stop before the provider call that would exceed this count")
    gen.add_argument("--max-cost", type=float, help="stop before the call that could exceed this many USD (needs prices)")

    run = commands.add_parser("stress", help="stress every valid candidate of a model")
    run.add_argument("--model", required=True)
    which = run.add_mutually_exclusive_group(required=True)
    which.add_argument("--brief")
    which.add_argument("--all", action="store_true")
    run.add_argument("--variant", choices=VARIANTS, help="default: every variant found")
    run.add_argument("--runs-dir", type=Path, default=RUNS_DIR, help="where the stress results go (default results/runs)")

    report = commands.add_parser("summarize", help="write summary.json, report.md and gallery.html for generated runs")
    report.add_argument("--out", required=True, type=Path, help="output directory, e.g. results/spike")
    report.add_argument("--model", action="append", dest="models",
                        help="a model id; repeat for several (default: every non-mock model in runner/models.toml)")
    report.add_argument("--runs-dir", type=Path, default=RUNS_DIR, help="the stress results to read (default results/runs)")
    return parser


def _summarize(args: argparse.Namespace) -> int:
    entries = load_models()
    model_ids = args.models or [entry.id for entry in entries.values() if entry.provider != "mock"]
    for model_id in model_ids:
        get_model(model_id)  # fails on an unknown id
    brief_ids = list_briefs(corpus_only=True)
    candidates = load_candidates(model_ids, brief_ids, runs_dir=args.runs_dir)
    summary = build_summary(candidates, model_ids, brief_ids, {e.id: e.describe() for e in entries.values()})
    for path in write_outputs(candidates, summary, args.out):
        print(f"wrote {path}")
    print(f"{len(candidates)} sample(s) of {len(model_ids)} model(s); "
          f"{sum(len(c.cases) for c in candidates)} case(s) in the gallery")
    return 0


def _brief_ids(args: argparse.Namespace) -> list[str]:
    if args.all:
        return list_briefs(corpus_only=True)
    load_brief(args.brief)  # fails early on an unknown id
    return [args.brief]


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    load_dotenv(ENV_FILE)
    if args.command == "doctor":
        with httpx.Client(timeout=60) as client:
            return run_doctor(environ=os.environ, client=client)
    try:
        if args.command == "summarize":
            return _summarize(args)
        entry = get_model(args.model)
        brief_ids = _brief_ids(args)
        if args.command == "generate":
            if args.samples < 1:
                raise SetupError("--samples must be at least 1")
            if args.max_cost is not None and entry.price is None:
                print(f'note: model "{entry.id}" has no prices, so --max-cost cannot apply')
            budget = Budget(max_requests=args.max_requests, max_cost=args.max_cost)
            ledger = FreeRequestLedger() if is_free(entry) else None
            print(f"generate {entry.id}, variant {args.variant}, {args.samples} sample(s) per brief, {len(brief_ids)} brief(s)")
            results = generate(entry, brief_ids, args.variant, args.samples, budget,
                               provider_factory=lambda e: make_provider(e, ledger=ledger),
                               gate=check_candidate, ledger=ledger)
            print("\n".join(summarize(results, budget)))
            if ledger is not None:
                print(ledger.status())
            return 0
        rows = stress(entry.id, brief_ids, args.variant, run=run_stress, runs_dir=args.runs_dir)
        print(format_table(rows))
        harness_errors = [row for row in rows if row.status == "harness-error"]
        for row in harness_errors:
            print(f"harness error for {row.candidate}: {row.error}", file=sys.stderr)
        return 1 if harness_errors else 0
    except (ModelsError, BriefError, SetupError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
