"""Command line: python -m first_edit <generate|stress> ..."""

from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from .briefs import BriefError, list_briefs, load_brief
from .budget import Budget
from .generate import generate, summarize
from .models import ModelsError, get_model
from .node import check_candidate, run_stress
from .paths import ENV_FILE
from .prompts import VARIANTS
from .providers import SetupError, make_provider
from .stress import format_table, stress


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m first_edit", description="First Edit generation runner.")
    commands = parser.add_subparsers(dest="command", required=True)

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
    return parser


def _brief_ids(args: argparse.Namespace) -> list[str]:
    if args.all:
        return list_briefs(corpus_only=True)
    load_brief(args.brief)  # fails early on an unknown id
    return [args.brief]


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    load_dotenv(ENV_FILE)
    try:
        entry = get_model(args.model)
        brief_ids = _brief_ids(args)
        if args.command == "generate":
            if args.samples < 1:
                raise SetupError("--samples must be at least 1")
            if args.max_cost is not None and entry.price is None:
                print(f'note: model "{entry.id}" has no prices, so --max-cost cannot apply')
            budget = Budget(max_requests=args.max_requests, max_cost=args.max_cost)
            print(f"generate {entry.id}, variant {args.variant}, {args.samples} sample(s) per brief, {len(brief_ids)} brief(s)")
            results = generate(entry, brief_ids, args.variant, args.samples, budget,
                               provider_factory=make_provider, gate=check_candidate)
            print("\n".join(summarize(results, budget)))
            return 0
        rows = stress(entry.id, brief_ids, args.variant, run=run_stress)
        print(format_table(rows))
        harness_errors = [row for row in rows if row.status == "harness-error"]
        for row in harness_errors:
            print(f"harness error for {row.candidate}: {row.error}", file=sys.stderr)
        return 1 if harness_errors else 0
    except (ModelsError, BriefError, SetupError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
