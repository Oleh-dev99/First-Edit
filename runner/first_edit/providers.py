"""Model providers: "mock" (no network) and "openai-compatible" chat completions."""

from __future__ import annotations

import math
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from .briefs import Brief, reference_component
from .ledger import FREE_MAX_ATTEMPTS, FreeRequestLedger, is_free
from .models import ModelEntry

MAX_ATTEMPTS = 4
#: Read timeout. A long reply with reasoning can take minutes, and a timed-out
#: call that is retried may be billed twice, so this is generous.
DEFAULT_TIMEOUT_SECONDS = 600.0
DEFAULT_BACKOFF_SECONDS = 2.0


class ProviderError(Exception):
    """A call failed for good: a non-retryable API error, or retries ran out."""

    def __init__(self, message: str, attempts: int = 1) -> None:
        super().__init__(message)
        self.attempts = attempts


class SetupError(RuntimeError):
    """The runner cannot work at all: a missing key, npm or file."""


@dataclass(frozen=True)
class Completion:
    """A successful call: the raw response body plus timing."""

    raw: dict[str, Any]
    latency_ms: int
    attempts: int


@dataclass(frozen=True)
class Reply:
    content: str
    finish_reason: str | None
    input_tokens: int | None
    #: Includes reasoning tokens, which are billed as output.
    output_tokens: int | None
    reasoning_tokens: int | None = None
    cached_input_tokens: int | None = None
    #: The model that served the request, as the response names it.
    reported_model: str | None = None
    #: The upstream provider, when the response names it (OpenRouter does).
    reported_provider: str | None = None
    #: The cost the response reports (OpenRouter: usage.cost, in USD credits).
    reported_cost: float | None = None


class Provider(Protocol):
    def complete(self, messages: list[dict[str, str]], brief: Brief) -> Completion: ...


def estimate_tokens(characters: int) -> int:
    """Rough token count, used only for the mock's usage and for cost estimates."""
    return math.ceil(characters / 4)


def parse_reply(raw: dict[str, Any]) -> Reply:
    """The reply text, finish reason and token usage of a chat completion."""
    try:
        choice = raw["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise ProviderError(f"unexpected response shape: {error!r}") from error
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    usage = raw.get("usage") or {}
    prompt_details = usage.get("prompt_tokens_details") or {}
    completion_details = usage.get("completion_tokens_details") or {}
    cost = usage.get("cost")
    provider = raw.get("provider")
    model = raw.get("model")
    return Reply(
        content="" if content is None else str(content),
        finish_reason=choice.get("finish_reason"),
        input_tokens=_count(usage.get("prompt_tokens")),
        output_tokens=_count(usage.get("completion_tokens")),
        reasoning_tokens=_count(completion_details.get("reasoning_tokens")),
        cached_input_tokens=_count(prompt_details.get("cached_tokens")),
        reported_model=model if isinstance(model, str) else None,
        reported_provider=provider if isinstance(provider, str) else None,
        reported_cost=float(cost) if isinstance(cost, (int, float)) and not isinstance(cost, bool) else None,
    )


def _count(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


class MockProvider:
    """Replies with the brief's reference candidate inside one tsx code fence."""

    def __init__(self, entry: ModelEntry) -> None:
        self.entry = entry

    def complete(self, messages: list[dict[str, str]], brief: Brief) -> Completion:
        path = reference_component(brief.id)
        if not path.is_file():
            raise ProviderError(f'mock: brief "{brief.id}" has no reference candidate')
        content = f"```tsx\n{path.read_text(encoding='utf-8').rstrip()}\n```"
        prompt_tokens = estimate_tokens(sum(len(message["content"]) for message in messages))
        completion_tokens = estimate_tokens(len(content))
        raw = {
            "id": f"mock-{brief.id}",
            "object": "chat.completion",
            "model": self.entry.id,
            "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }
        return Completion(raw=raw, latency_ms=0, attempts=1)


class OpenAICompatibleProvider:
    """POST {base_url}/chat/completions with a Bearer key.

    Timeouts, HTTP 429 and 5xx are retried with exponential backoff, at most
    max_attempts attempts in all. Any other error fails the call at once.
    before_request, if given, runs before every HTTP request, retries
    included; it may wait, and it may raise to stop the request being sent.
    """

    def __init__(
        self,
        entry: ModelEntry,
        api_key: str,
        *,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        backoff_seconds: float = DEFAULT_BACKOFF_SECONDS,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        max_attempts: int = MAX_ATTEMPTS,
        before_request: Callable[[], None] | None = None,
    ) -> None:
        self.entry = entry
        self.api_key = api_key
        self.client = client or httpx.Client(timeout=timeout_seconds)
        self.sleep = sleep
        self.backoff_seconds = backoff_seconds
        self.max_attempts = max_attempts
        self.before_request = before_request

    def request_body(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        """Model and messages plus the entry's params; no temperature or seed unless params sets them."""
        return {"model": self.entry.model, "messages": messages, **self.entry.params}

    def complete(self, messages: list[dict[str, str]], brief: Brief) -> Completion:
        url = f"{(self.entry.base_url or '').rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        body = self.request_body(messages)
        for attempt in range(1, self.max_attempts + 1):
            if self.before_request is not None:
                self.before_request()
            started = time.monotonic()
            try:
                response = self.client.post(url, json=body, headers=headers)
            except httpx.TimeoutException as error:
                problem = f"timeout ({type(error).__name__})"
            else:
                status = response.status_code
                if status == 200:
                    try:
                        raw = response.json()
                        parse_reply(raw)
                    except (ValueError, ProviderError) as error:
                        raise ProviderError(f"invalid response: {error}", attempt) from error
                    return Completion(raw=raw, latency_ms=round((time.monotonic() - started) * 1000), attempts=attempt)
                if status != 429 and status < 500:
                    raise ProviderError(f"HTTP {status}: {response.text[:300]}", attempt)
                problem = f"HTTP {status}"
            if attempt == self.max_attempts:
                raise ProviderError(f"{problem}; gave up after {attempt} attempts", attempt)
            self.sleep(self.backoff_seconds * 2 ** (attempt - 1))
        raise AssertionError("unreachable")


def make_provider(
    entry: ModelEntry, environ: Mapping[str, str] = os.environ, *, ledger: FreeRequestLedger | None = None
) -> Provider:
    """The provider for an entry. A free model variant (":free") gets
    FREE_MAX_ATTEMPTS attempts per sample, and every request goes through the
    daily ledger, which spaces requests and refuses the one past the limit."""
    if entry.provider == "mock":
        return MockProvider(entry)
    key_name = entry.api_key_env or ""
    api_key = environ.get(key_name, "")
    if not api_key:
        raise SetupError(f'model "{entry.id}" needs the environment variable {key_name} (put it in .env)')
    if is_free(entry):
        ledger = ledger or FreeRequestLedger()
        return OpenAICompatibleProvider(entry, api_key, max_attempts=FREE_MAX_ATTEMPTS,
                                        before_request=ledger.before_request)
    return OpenAICompatibleProvider(entry, api_key)
