"""The generate command: prompt a model for candidates and gate them."""

from __future__ import annotations

import json
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .briefs import Brief, load_brief
from .budget import Budget, call_cost, estimate_call_cost
from .cache import Cache, cache_key
from .extract import extract_code
from .ledger import DailyLimitReached, FreeRequestLedger, QuotaExhausted
from .models import ModelEntry
from .paths import CANDIDATES_DIR, REPO_ROOT
from .prompts import build_messages, prompt_hash
from .providers import Provider, ProviderError, Reply, parse_reply

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


def spend(entry: ModelEntry, reply: Reply) -> float | None:
    """What a call cost: the cost the response reports, else the configured
    prices times the reported usage (output includes reasoning tokens)."""
    if reply.reported_cost is not None:
        return reply.reported_cost
    return call_cost(entry.price, reply.input_tokens, reply.output_tokens)


def empty_reply_reasons(reply: Reply) -> list[dict[str, str]]:
    """Reasons for a reply with no content: "empty", plus "reasoning-exhausted"
    when the output budget ran out and the provider reports reasoning tokens
    (the model spent the budget thinking and never answered)."""
    if reply.content.strip():
        return []
    reasons = [{"rule": "empty", "message": "the reply has no content"}]
    if reply.finish_reason == "length" and (reply.reasoning_tokens or 0) > 0:
        reasons.append({
            "rule": "reasoning-exhausted",
            "message": f"the output budget was spent on reasoning ({reply.reasoning_tokens} of "
                       f"{reply.output_tokens} output tokens)",
        })
    return reasons


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


def generate_sample(
    entry: ModelEntry,
    brief: Brief,
    variant: str,
    sample: int,
    budget: Budget,
    *,
    provider: Callable[[], Provider],
    gate: Gate,
    cache: Cache,
    candidates_dir: Path = CANDIDATES_DIR,
    ledger: FreeRequestLedger | None = None,
    refusal: str | None = None,
    out: Callable[[str], None] = print,
) -> SampleResult:
    """Generates one candidate. The reply comes from the cache when it can;
    otherwise the provider is called, unless the budget or `refusal` stops
    it (the sample is skipped and gets no files). Raises QuotaExhausted when
    a quota (the free daily ledger, a subscription's usage limit) allows no
    call; the sample then gets no files either, so a later run calls it.
    Invalid output is recorded, never re-rolled."""
    messages = build_messages(brief, variant)
    cid = candidate_id(entry.id, brief.id, variant, sample)
    directory = candidates_dir / cid
    key = cache_key(entry, messages, sample)
    base: dict[str, Any] = {
        "schemaVersion": GENERATION_SCHEMA_VERSION,
        "brief": brief.id,
        "candidate": cid,
        "model": entry.describe(),
        "variant": variant,
        "sample": sample,
        "cacheKey": key,
        "promptHash": prompt_hash(messages),
    }

    record = cache.get(key)
    cached = record is not None
    if record is None:
        stop = budget.refusal(estimate_call_cost(entry, messages)) or refusal
        if stop:
            out(f"  {brief.id} {variant}-s{sample}: skipped, {stop}")
            return SampleResult(brief.id, variant, sample, cid, "skipped")
        if ledger is not None and (limit := ledger.refusal()):
            raise DailyLimitReached(limit)
        try:
            completion = provider().complete(messages, brief)
        except ProviderError as error:
            budget.record(None)
            _reset(directory)
            reasons = [{"rule": "api-error", "message": str(error)}]
            _write_json(
                directory / "generation.json",
                {**base, "cached": False, "generatedAt": _now(), "status": "api-error", "attempts": error.attempts,
                 "error": str(error), "valid": False, "reasons": reasons},
            )
            out(f"  {brief.id} {variant}-s{sample}: API error after {error.attempts} attempt(s): {error}")
            return SampleResult(brief.id, variant, sample, cid, "api-error", False, reasons)
        reply = parse_reply(completion.raw)
        budget.record(spend(entry, reply))
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

    reasons = empty_reply_reasons(reply)
    gate_valid = not reasons
    if not reasons:
        # An empty file would only fail the gate for having no default export.
        verdict = gate(brief.id, cid)
        reasons = list(verdict.get("reasons", []))
        gate_valid = bool(verdict.get("valid"))
    if reply.finish_reason == "length":
        reasons.append({"rule": "truncated", "message": "the reply was cut off by the token limit"})
    valid = gate_valid and not reasons

    _write_json(
        directory / "generation.json",
        {
            **base,
            "cached": cached,
            "generatedAt": _now(),
            "receivedAt": record.get("receivedAt"),
            "status": "generated",
            "reportedModel": reply.reported_model,
            "reportedProvider": reply.reported_provider,
            "usage": {
                "inputTokens": reply.input_tokens,
                "cachedInputTokens": reply.cached_input_tokens,
                "outputTokens": reply.output_tokens,
                "reasoningTokens": reply.reasoning_tokens,
            },
            "estimatedCostUsd": call_cost(entry.price, reply.input_tokens, reply.output_tokens),
            "actualCostUsd": reply.reported_cost,
            **({"cli": reply.cli} if reply.cli is not None else {}),
            "latencyMs": record.get("latencyMs"),
            "attempts": record.get("attempts"),
            "finishReason": reply.finish_reason,
            "extraction": {"blocks": extraction.blocks, "method": extraction.method},
            "warnings": extraction.warnings,
            "valid": valid,
            "reasons": reasons,
        },
    )
    where = directory.relative_to(REPO_ROOT).as_posix() if directory.is_relative_to(REPO_ROOT) else directory
    verdict_text = "valid" if valid else "invalid: " + "; ".join(f"[{r['rule']}] {r['message']}" for r in reasons)
    out(f"  {brief.id} {variant}-s{sample}: {verdict_text} ({'cache hit' if cached else 'called'}) -> {where}")
    return SampleResult(brief.id, variant, sample, cid, "cached" if cached else "called", valid, reasons)


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
    ledger: FreeRequestLedger | None = None,
    out: Callable[[str], None] = print,
) -> list[SampleResult]:
    """Generates `samples` candidates per brief (see generate_sample). Once a
    quota stops a call, every later call is skipped too; cache hits are still
    served."""
    cache = cache or Cache()
    providers: list[Provider] = []

    def provider() -> Provider:
        if not providers:
            providers.append(provider_factory(entry))
        return providers[0]

    results: list[SampleResult] = []
    #: Set once a quota stops a call; later calls are skipped.
    exhausted: str | None = None
    for brief_id in brief_ids:
        brief = load_brief(brief_id)
        for sample in range(1, samples + 1):
            try:
                results.append(generate_sample(
                    entry, brief, variant, sample, budget, provider=provider, gate=gate, cache=cache,
                    candidates_dir=candidates_dir, ledger=ledger, refusal=exhausted, out=out,
                ))
            except QuotaExhausted as error:
                exhausted = str(error)
                cid = candidate_id(entry.id, brief_id, variant, sample)
                results.append(SampleResult(brief_id, variant, sample, cid, "skipped"))
                out(f"  {brief_id} {variant}-s{sample}: skipped, {exhausted}")
    return results


def summarize(results: list[SampleResult], budget: Budget) -> list[str]:
    count = lambda status: sum(1 for result in results if result.status == status)  # noqa: E731
    produced = [result for result in results if result.valid is not None and result.status != "api-error"]
    lines = [
        f"samples: {len(results)}  called: {count('called')}  cache hits: {count('cached')}  "
        f"api errors: {count('api-error')}  skipped: {count('skipped')}",
        f"valid: {sum(1 for result in produced if result.valid)}  invalid: {sum(1 for result in produced if not result.valid)}"
        f"  provider calls: {budget.requests}  spend: ${budget.spent:.4f}",
    ]
    skipped = [result for result in results if result.status == "skipped"]
    if skipped:
        lines.append("skipped (budget or daily limit): " + ", ".join(f"{r.brief} {r.variant}-s{r.sample}" for r in skipped))
    return lines
