"""Shared test helpers: a fake provider, a fake gate and a quiet generate()."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from first_edit.briefs import Brief
from first_edit.budget import Budget
from first_edit.cache import Cache
from first_edit.generate import SampleResult, generate
from first_edit.models import ModelEntry
from first_edit.providers import Completion, ProviderError

VALID_REPLY = "```tsx\nexport default function A() {\n  return null;\n}\n```"


def chat_response(content: str, finish_reason: str = "stop", prompt_tokens: int = 1000, completion_tokens: int = 500) -> dict[str, Any]:
    return {
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": finish_reason}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
    }


class FakeProvider:
    """Counts calls; replies with fixed content, or raises the given error."""

    def __init__(self, content: str = VALID_REPLY, finish_reason: str = "stop", error: ProviderError | None = None,
                 raw: dict[str, Any] | None = None) -> None:
        self.content = content
        self.finish_reason = finish_reason
        self.error = error
        self.raw = raw
        self.calls = 0

    def complete(self, messages: list[dict[str, str]], brief: Brief) -> Completion:
        self.calls += 1
        if self.error:
            raise self.error
        raw = self.raw or chat_response(self.content, self.finish_reason)
        return Completion(raw=raw, latency_ms=12, attempts=1)


@pytest.fixture
def entry() -> ModelEntry:
    return ModelEntry(id="test-model", provider="openai-compatible", base_url="https://api.example.test/v1",
                      api_key_env="TEST_KEY", model="vendor/test", params={"max_tokens": 1000})


@pytest.fixture
def run(tmp_path: Path):
    """generate() into tmp_path with a fake gate that accepts everything."""

    def _run(entry: ModelEntry, provider: FakeProvider, briefs: list[str], *, budget: Budget | None = None,
             samples: int = 1, gate=None) -> list[SampleResult]:
        return generate(
            entry, briefs, "plain", samples, budget or Budget(),
            provider_factory=lambda _entry: provider,
            gate=gate or (lambda _brief, _candidate: {"valid": True, "reasons": []}),
            cache=Cache(tmp_path / "cache"),
            candidates_dir=tmp_path / "candidates",
            out=lambda _line: None,
        )

    return _run
