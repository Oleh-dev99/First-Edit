"""The daily request ledger for free model variants.

Model ids ending in ":free" (OpenRouter) cost nothing but are limited per
account: 20 requests a minute and 50 a day. Every HTTP request sent to such
a model, retries and failures included, is counted per UTC day in
results/cache/free-requests.json, and the runner refuses to send more than
FREE_DAILY_LIMIT in one day. Requests are also spaced at least
FREE_MIN_INTERVAL_SECONDS apart, across separate commands too, because the
time of the last request is kept in the same file.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import ModelEntry
from .paths import CACHE_DIR

FREE_SUFFIX = ":free"
#: Our own daily cap, kept below the provider's 50 a day.
FREE_DAILY_LIMIT = 45
#: Attempts per sample for a free model (4 for other models).
FREE_MAX_ATTEMPTS = 2
FREE_MIN_INTERVAL_SECONDS = 4.0
LEDGER_FILE = CACHE_DIR / "free-requests.json"


def is_free(entry: ModelEntry) -> bool:
    """A free model variant: its provider model id ends in ":free"."""
    return entry.provider == "openai-compatible" and (entry.model or "").endswith(FREE_SUFFIX)


class DailyLimitReached(Exception):
    """The day's free-request allowance is used up. Nothing was sent."""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FreeRequestLedger:
    """Counts free-model HTTP requests per UTC day and spaces them out."""

    def __init__(
        self,
        path: Path = LEDGER_FILE,
        *,
        limit: int = FREE_DAILY_LIMIT,
        min_interval: float = FREE_MIN_INTERVAL_SECONDS,
        now: Callable[[], datetime] = _utc_now,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.path = path
        self.limit = limit
        self.min_interval = min_interval
        self.now = now
        self.sleep = sleep

    def _load(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"days": {}, "lastRequestAt": None}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return {"days": dict(data.get("days") or {}), "lastRequestAt": data.get("lastRequestAt")}

    def _save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        record = {"limit": self.limit, **data}
        temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8", newline="\n")
        temporary.replace(self.path)

    def today(self) -> str:
        """The current UTC day, e.g. "2026-11-13"."""
        return self.now().astimezone(timezone.utc).date().isoformat()

    def used(self) -> int:
        return int(self._load()["days"].get(self.today(), 0))

    def remaining(self) -> int:
        return max(0, self.limit - self.used())

    def refusal(self) -> str | None:
        """Why no further free request may be sent today, or None if one may."""
        if self.remaining() > 0:
            return None
        return f"daily free-request limit reached ({self.limit} sent today, UTC {self.today()})"

    def status(self) -> str:
        return f"free requests today (UTC {self.today()}): {self.used()} sent, {self.remaining()} left of {self.limit}"

    def before_request(self) -> None:
        """Called right before every HTTP request to a free model. Raises
        DailyLimitReached, without counting, when the day's limit is used up;
        otherwise waits out the minimum interval since the last request and
        counts this one before it is sent."""
        refusal = self.refusal()
        if refusal:
            raise DailyLimitReached(refusal)
        data = self._load()
        last = data["lastRequestAt"]
        if last is not None:
            elapsed = (self.now() - datetime.fromisoformat(last)).total_seconds()
            if elapsed < self.min_interval:
                # A clock that went backwards waits one interval, never longer.
                self.sleep(min(self.min_interval, self.min_interval - elapsed))
        sent_at = self.now().astimezone(timezone.utc)
        day = sent_at.date().isoformat()
        data["days"][day] = int(data["days"].get(day, 0)) + 1
        data["lastRequestAt"] = sent_at.isoformat()
        self._save(data)
