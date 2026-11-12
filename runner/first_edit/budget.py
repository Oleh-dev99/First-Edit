"""Request and cost budgets for a generate run."""

from __future__ import annotations

from dataclasses import dataclass

from .models import ModelEntry, Price
from .providers import estimate_tokens

#: Output tokens assumed for a call whose params set no max_tokens.
DEFAULT_MAX_OUTPUT_TOKENS = 16_000


def call_cost(price: Price | None, input_tokens: int | None, output_tokens: int | None) -> float | None:
    """USD for a finished call; None without prices or usage."""
    if price is None or input_tokens is None or output_tokens is None:
        return None
    return (input_tokens * price.input + output_tokens * price.output) / 1_000_000


def estimate_call_cost(entry: ModelEntry, messages: list[dict[str, str]]) -> float | None:
    """Upper estimate before a call: the prompt (4 characters per token) plus
    the most output the params allow. None without prices."""
    if entry.price is None:
        return None
    input_tokens = estimate_tokens(sum(len(message["content"]) for message in messages))
    max_output = entry.params.get("max_tokens") or entry.params.get("max_completion_tokens") or DEFAULT_MAX_OUTPUT_TOKENS
    return (input_tokens * entry.price.input + int(max_output) * entry.price.output) / 1_000_000


@dataclass
class Budget:
    """Counts provider calls (a call and its retries count once) and spend.
    Cache hits cost nothing and are never counted."""

    max_requests: int | None = None
    max_cost: float | None = None
    requests: int = 0
    spent: float = 0.0

    def refusal(self, estimated_cost: float | None) -> str | None:
        """Why the next call may not be made, or None if it may."""
        if self.max_requests is not None and self.requests >= self.max_requests:
            return f"--max-requests {self.max_requests} reached"
        if self.max_cost is not None and estimated_cost is not None and self.spent + estimated_cost > self.max_cost:
            return (
                f"--max-cost ${self.max_cost:.4f} would be exceeded "
                f"(spent ${self.spent:.4f}, next call up to ${estimated_cost:.4f})"
            )
        return None

    def record(self, cost: float | None) -> None:
        self.requests += 1
        self.spent += cost or 0.0
