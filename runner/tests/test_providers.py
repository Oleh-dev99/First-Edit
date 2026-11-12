import json

import httpx
import pytest

from first_edit.briefs import load_brief
from first_edit.models import ModelEntry
from first_edit.providers import MockProvider, OpenAICompatibleProvider, ProviderError, make_provider, parse_reply

from conftest import chat_response

MESSAGES = [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
BRIEF = load_brief("pricing-table")


def make(responses: list, params: dict | None = None):
    """A provider whose transport replays `responses` (ints are statuses, "timeout" raises)."""
    requests: list[httpx.Request] = []
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        item = responses.pop(0)
        if item == "timeout":
            raise httpx.ReadTimeout("slow", request=request)
        if item == 200:
            return httpx.Response(200, json=chat_response("```tsx\nx\n```"))
        if item == "not-json":
            return httpx.Response(200, text="nope")
        return httpx.Response(item, text=f"status {item}")

    entry = ModelEntry(id="m", provider="openai-compatible", base_url="https://api.example.test/v1/",
                       api_key_env="KEY", model="vendor/model", params=params or {})
    provider = OpenAICompatibleProvider(entry, "secret", client=httpx.Client(transport=httpx.MockTransport(handler)),
                                        sleep=sleeps.append, backoff_seconds=1.0)
    return provider, requests, sleeps


def test_sends_model_messages_and_params_and_nothing_else() -> None:
    provider, requests, _ = make([200], params={"max_tokens": 100})
    completion = provider.complete(MESSAGES, BRIEF)
    (request,) = requests
    assert request.url == "https://api.example.test/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer secret"
    assert json.loads(request.content) == {"model": "vendor/model", "messages": MESSAGES, "max_tokens": 100}
    assert completion.attempts == 1
    assert parse_reply(completion.raw).content == "```tsx\nx\n```"


def test_retries_429_and_5xx_with_exponential_backoff() -> None:
    provider, requests, sleeps = make([429, 503, 200])
    assert provider.complete(MESSAGES, BRIEF).attempts == 3
    assert (len(requests), sleeps) == (3, [1.0, 2.0])


def test_retries_timeouts() -> None:
    provider, _, sleeps = make(["timeout", 200])
    assert provider.complete(MESSAGES, BRIEF).attempts == 2
    assert sleeps == [1.0]


def test_gives_up_after_four_attempts() -> None:
    provider, requests, sleeps = make([500, 502, 503, 504])
    with pytest.raises(ProviderError, match="gave up after 4 attempts") as raised:
        provider.complete(MESSAGES, BRIEF)
    assert (raised.value.attempts, len(requests), sleeps) == (4, 4, [1.0, 2.0, 4.0])


@pytest.mark.parametrize("status", [400, 401, 404])
def test_other_api_errors_fail_at_once(status: int) -> None:
    provider, requests, sleeps = make([status])
    with pytest.raises(ProviderError, match=f"HTTP {status}"):
        provider.complete(MESSAGES, BRIEF)
    assert (len(requests), sleeps) == (1, [])


def test_a_body_that_is_not_json_fails() -> None:
    provider, _, sleeps = make(["not-json"])
    with pytest.raises(ProviderError, match="invalid response"):
        provider.complete(MESSAGES, BRIEF)
    assert sleeps == []


def test_mock_replies_with_the_reference_in_one_tsx_fence() -> None:
    completion = MockProvider(ModelEntry(id="mock-reference", provider="mock")).complete(MESSAGES, BRIEF)
    reply = parse_reply(completion.raw)
    assert reply.content.startswith("```tsx\n// Reference implementation for the pricing-table brief.")
    assert reply.content.endswith("\n```")
    assert reply.finish_reason == "stop"


def test_mock_fails_for_a_brief_without_reference() -> None:
    with pytest.raises(ProviderError, match="no reference candidate"):
        MockProvider(ModelEntry(id="mock-reference", provider="mock")).complete(MESSAGES, load_brief("hello-card"))


def test_a_real_provider_needs_its_key() -> None:
    entry = ModelEntry(id="m", provider="openai-compatible", base_url="https://x", api_key_env="NO_SUCH_KEY", model="m")
    with pytest.raises(Exception, match="NO_SUCH_KEY"):
        make_provider(entry, environ={})
