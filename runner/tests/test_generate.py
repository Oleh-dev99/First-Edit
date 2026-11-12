"""generate(): the cache, the budget guards, cut-off replies and API errors."""

import json
from dataclasses import replace
from pathlib import Path

from first_edit.budget import Budget, estimate_call_cost
from first_edit.cache import cache_key
from first_edit.models import ModelEntry, Price
from first_edit.prompts import build_messages
from first_edit.briefs import load_brief
from first_edit.providers import ProviderError

from conftest import VALID_REPLY, FakeProvider, chat_response

BRIEFS = ["pricing-table", "data-table"]


def generation(tmp_path: Path, candidate: str) -> dict:
    return json.loads((tmp_path / "candidates" / candidate / "generation.json").read_text(encoding="utf-8"))


def test_cache_miss_calls_and_stores_then_a_hit_reuses(tmp_path: Path, entry: ModelEntry, run) -> None:
    provider = FakeProvider()
    first = run(entry, provider, ["pricing-table"])
    assert (provider.calls, first[0].status) == (1, "called")
    key = cache_key(entry, build_messages(load_brief("pricing-table"), "plain"), 1)
    assert (tmp_path / "cache" / f"{key}.json").is_file()

    second = run(entry, provider, ["pricing-table"])
    assert (provider.calls, second[0].status) == (1, "cached")
    record = generation(tmp_path, "test-model/pricing-table/plain-s1")
    assert (record["cached"], record["cacheKey"], record["valid"]) == (True, key, True)
    assert (tmp_path / "candidates/test-model/pricing-table/plain-s1/Component.tsx").read_text() == (
        "export default function A() {\n  return null;\n}\n"
    )


def test_samples_and_params_change_the_cache_key(entry: ModelEntry) -> None:
    messages = build_messages(load_brief("pricing-table"), "plain")
    keys = {
        cache_key(entry, messages, 1),
        cache_key(entry, messages, 2),
        cache_key(replace(entry, params={"max_tokens": 2000}), messages, 1),
        cache_key(entry, build_messages(load_brief("pricing-table"), "hinted"), 1),
    }
    assert len(keys) == 4
    # A price change does not change the reply, so it keeps the key.
    assert cache_key(replace(entry, price=Price(1.0, 2.0)), messages, 1) == cache_key(entry, messages, 1)


def test_generation_json_records_the_call(tmp_path: Path, entry: ModelEntry, run) -> None:
    run(replace(entry, price=Price(input=2.0, output=10.0)), FakeProvider(), ["pricing-table"])
    record = generation(tmp_path, "test-model/pricing-table/plain-s1")
    assert record["model"]["api_key_env"] == "TEST_KEY"
    assert record["usage"] == {"inputTokens": 1000, "cachedInputTokens": None, "outputTokens": 500, "reasoningTokens": None}
    assert record["estimatedCostUsd"] == (1000 * 2.0 + 500 * 10.0) / 1_000_000
    assert (record["actualCostUsd"], record["reportedModel"], record["reportedProvider"]) == (None, None, None)
    assert (record["latencyMs"], record["attempts"], record["finishReason"]) == (12, 1, "stop")
    assert record["extraction"] == {"blocks": 1, "method": "single-block"}


def test_generation_json_records_what_the_provider_reports(tmp_path: Path, entry: ModelEntry, run) -> None:
    # An OpenRouter-style response: the serving model and provider, reasoning
    # and cached tokens, and the actual cost in usage.
    raw = chat_response(VALID_REPLY, prompt_tokens=2000, completion_tokens=7000)
    raw.update({"model": "vendor/test-20261001", "provider": "Vendor"})
    raw["usage"].update({
        "prompt_tokens_details": {"cached_tokens": 1500},
        "completion_tokens_details": {"reasoning_tokens": 4000},
        "cost": 0.0123,
    })
    budget = Budget()
    run(replace(entry, price=Price(input=1.0, output=5.0)), FakeProvider(raw=raw), ["pricing-table"], budget=budget)
    record = generation(tmp_path, "test-model/pricing-table/plain-s1")
    assert (record["reportedModel"], record["reportedProvider"]) == ("vendor/test-20261001", "Vendor")
    assert record["usage"] == {"inputTokens": 2000, "cachedInputTokens": 1500, "outputTokens": 7000, "reasoningTokens": 4000}
    assert record["estimatedCostUsd"] == (2000 * 1.0 + 7000 * 5.0) / 1_000_000
    assert record["actualCostUsd"] == 0.0123
    # The budget counts the reported cost, not the estimate.
    assert budget.spent == 0.0123


def test_without_a_reported_cost_the_budget_counts_prices_times_usage(entry: ModelEntry, run) -> None:
    budget = Budget()
    run(replace(entry, price=Price(input=1.0, output=5.0)), FakeProvider(), ["pricing-table"], budget=budget)
    assert budget.spent == (1000 * 1.0 + 500 * 5.0) / 1_000_000


def test_a_cut_off_reply_is_invalid(tmp_path: Path, entry: ModelEntry, run) -> None:
    provider = FakeProvider(content="```tsx\nexport default function A() {", finish_reason="length")
    (result,) = run(entry, provider, ["pricing-table"])
    assert result.valid is False
    assert {"rule": "truncated", "message": "the reply was cut off by the token limit"} in result.reasons
    record = generation(tmp_path, "test-model/pricing-table/plain-s1")
    assert record["warnings"] == ["no fenced code block in the reply; used the whole reply"]


def test_invalid_output_is_recorded_and_never_re_rolled(tmp_path: Path, entry: ModelEntry, run) -> None:
    provider = FakeProvider()
    gate = lambda _brief, _candidate: {"valid": False, "reasons": [{"rule": "imports", "message": 'imports "clsx"'}]}  # noqa: E731
    run(entry, provider, ["pricing-table"], gate=gate)
    run(entry, provider, ["pricing-table"], gate=gate)
    assert provider.calls == 1
    assert generation(tmp_path, "test-model/pricing-table/plain-s1")["valid"] is False


def test_an_api_error_is_recorded_and_not_cached(tmp_path: Path, entry: ModelEntry, run) -> None:
    provider = FakeProvider(error=ProviderError("HTTP 400: bad request", attempts=1))
    (result,) = run(entry, provider, ["pricing-table"])
    assert (result.status, result.valid) == ("api-error", False)
    record = generation(tmp_path, "test-model/pricing-table/plain-s1")
    assert (record["status"], record["error"]) == ("api-error", "HTTP 400: bad request")
    assert not (tmp_path / "candidates/test-model/pricing-table/plain-s1/Component.tsx").exists()
    assert not list((tmp_path / "cache").glob("*.json"))
    run(entry, provider, ["pricing-table"])
    assert provider.calls == 2


def test_max_requests_stops_before_the_next_call(entry: ModelEntry, run) -> None:
    provider = FakeProvider()
    results = run(entry, provider, BRIEFS, budget=Budget(max_requests=1), samples=2)
    assert provider.calls == 1
    assert [result.status for result in results] == ["called", "skipped", "skipped", "skipped"]


def test_cache_hits_do_not_count_against_the_budget(entry: ModelEntry, run) -> None:
    provider = FakeProvider()
    run(entry, provider, ["pricing-table"])
    results = run(entry, provider, BRIEFS, budget=Budget(max_requests=0))
    assert [result.status for result in results] == ["cached", "skipped"]
    assert provider.calls == 1


def test_max_cost_stops_before_a_call_that_could_exceed_it(entry: ModelEntry, run) -> None:
    priced = replace(entry, price=Price(input=1000.0, output=1000.0))
    estimate = estimate_call_cost(priced, build_messages(load_brief("pricing-table"), "plain"))
    assert estimate is not None and estimate > 1.0

    provider = FakeProvider()
    results = run(priced, provider, ["pricing-table"], budget=Budget(max_cost=estimate / 2))
    assert (provider.calls, results[0].status) == (0, "skipped")

    results = run(priced, provider, ["pricing-table"], budget=Budget(max_cost=estimate * 2))
    assert (provider.calls, results[0].status) == (1, "called")


def test_max_cost_is_ignored_without_prices(entry: ModelEntry, run) -> None:
    provider = FakeProvider()
    results = run(entry, provider, ["pricing-table"], budget=Budget(max_cost=0.0))
    assert (provider.calls, results[0].status) == (1, "called")
