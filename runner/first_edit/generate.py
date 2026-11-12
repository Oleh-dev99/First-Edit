"""The generate command: prompt a model for candidates and gate them."""

from __future__ import annotations

import json
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .briefs import load_brief
from .budget import Budget, call_cost, estimate_call_cost
from .cache import Cache, cache_key
from .extract import extract_code
from .models import ModelEntry
from .paths import CANDIDATES_DIR, REPO_ROOT
from .prompts import build_messages, prompt_hash
from .providers import Provider, ProviderError, parse_reply

GENERATION_SCHEMA_VERSION = 1

Gate = Callable[[str, str], dict[str, Any]]
ProviderFactory = Callable[[ModelEntry], Provider]


@dataclass
class SampleResult:
    brief: str
    variant: str
    sample: int
    candidate: str
    #: "called", "cached", "api-error" or "skipped"
    status: str
    valid: bool | None = None
    reasons: list[dict[str, str]] = field(default_factory=list)


def candidate_id(model_id: str, brief_id: str, variant: str, sample: int) -> str:
    return f"{model_id}/{brief_id}/{variant}-s{sample}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _reset(directory: Path) -> None:
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True)


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def generate(
    entry: ModelEntry,
    brief_ids: list[str],
    variant: str,
    samples: int,
    budget: Budget,
    *,
    provider_factory: ProviderFactory,
    gate: Gate,
    cache: Cache | None = None,
    candidates_dir: Path = CANDIDATES_DIR,
    out: Callable[[str], None] = print,
) -> list[SampleResult]:
    """Generates `samples` candidates per brief. Replies come from the cache
    when they can; otherwise the provider is called within the budget. Every
    sample gets a generation.json; invalid output is recorded, never re-rolled."""
    cache = cache or Cache()
    provider: Provider | None = None
    results: list[SampleResult] = []

    for brief_id in brief_ids:
        brief = load_brief(brief_id)
        messages = build_messages(brief, variant)
        hash_of_prompt = prompt_hash(messages)
        for sample in range(1, samples + 1):
            cid = candidate_id(entry.id, brief_id, variant, sample)
            directory = candidates_dir / cid
            key = cache_key(entry, messages, sample)
            base: dict[str, Any] = {
                "schemaVersion": GENERATION_SCHEMA_VERSION,
                "brief": brief_id,
                "candidate": cid,
                "model": entry.describe(),
                "variant": variant,
                "sample": sample,
                "cacheKey": key,
                "promptHash": hash_of_prompt,
            }

            record = cache.get(key)
            cached = record is not None
            if record is None:
                refusal = budget.refusal(estimate_call_cost(entry, messages))
                if refusal:
                    results.append(SampleResult(brief_id, variant, sample, cid, "skipped"))
                    out(f"  {brief_id} {variant}-s{sample}: skipped, {refusal}")
                    continue
                provider = provider or provider_factory(entry)
                try:
                    completion = provider.complete(messages, brief)
                except ProviderError as error:
                    budget.record(None)
                    _reset(directory)
                    reasons = [{"rule": "api-error", "message": str(error)}]
                    _write_json(
                        directory / "generation.json",
                        {**base, "cached": False, "generatedAt": _now(), "status": "api-error", "attempts": error.attempts,
                         "error": str(error), "valid": False, "reasons": reasons},
                    )
                    results.append(SampleResult(brief_id, variant, sample, cid, "api-error", False, reasons))
                    out(f"  {brief_id} {variant}-s{sample}: API error after {error.attempts} attempt(s): {error}")
                    continue
                reply = parse_reply(completion.raw)
                budget.record(call_cost(entry.price, reply.input_tokens, reply.output_tokens))
                record = {
                    "key": key,
                    "request": {"model": entry.identity(), "params": entry.params, "sample": sample, "messages": messages},
                    "response": completion.raw,
                    "latencyMs": completion.latency_ms,
                    "attempts": completion.attempts,
                    "receivedAt": _now(),
                }
                cache.put(key, record)

            reply = parse_reply(record["response"])
            extraction = extract_code(reply.content)
            _reset(directory)
            (directory / "Component.tsx").write_text(extraction.code, encoding="utf-8", newline="\n")

            verdict = gate(brief_id, cid)
            reasons = list(verdict.get("reasons", []))
            if reply.finish_reason == "length":
                reasons.append({"rule": "truncated", "message": "the reply was cut off by the token limit"})
            valid = bool(verdict.get("valid")) and not reasons

            _write_json(
                directory / "generation.json",
                {
                    **base,
                    "cached": cached,
                    "generatedAt": _now(),
                    "receivedAt": record.get("receivedAt"),
                    "status": "generated",
                    "usage": {"inputTokens": reply.input_tokens, "outputTokens": reply.output_tokens},
                    "estimatedCostUsd": call_cost(entry.price, reply.input_tokens, reply.output_tokens),
                    "latencyMs": record.get("latencyMs"),
                    "attempts": record.get("attempts"),
                    "finishReason": reply.finish_reason,
                    "extraction": {"blocks": extraction.blocks, "method": extraction.method},
                    "warnings": extraction.warnings,
                    "valid": valid,
                    "reasons": reasons,
                },
            )
            results.append(SampleResult(brief_id, variant, sample, cid, "cached" if cached else "called", valid, reasons))
            where = directory.relative_to(REPO_ROOT).as_posix() if directory.is_relative_to(REPO_ROOT) else directory
            verdict_text = "valid" if valid else "invalid: " + "; ".join(f"[{r['rule']}] {r['message']}" for r in reasons)
            out(f"  {brief_id} {variant}-s{sample}: {verdict_text} ({'cache hit' if cached else 'called'}) -> {where}")

    return results


def summarize(results: list[SampleResult], budget: Budget) -> list[str]:
    count = lambda status: sum(1 for result in results if result.status == status)  # noqa: E731
    produced = [result for result in results if result.valid is not None and result.status != "api-error"]
    lines = [
        f"samples: {len(results)}  called: {count('called')}  cache hits: {count('cached')}  "
        f"api errors: {count('api-error')}  skipped: {count('skipped')}",
        f"valid: {sum(1 for result in produced if result.valid)}  invalid: {sum(1 for result in produced if not result.valid)}"
        f"  provider calls: {budget.requests}  estimated spend: ${budget.spent:.4f}",
    ]
    skipped = [result for result in results if result.status == "skipped"]
    if skipped:
        lines.append("skipped (budget): " + ", ".join(f"{r.brief} {r.variant}-s{r.sample}" for r in skipped))
    return lines
