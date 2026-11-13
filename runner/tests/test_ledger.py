"""The daily request ledger for free model variants: counting, the limit, spacing."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from first_edit.ledger import DailyLimitReached, FreeRequestLedger, is_free
from first_edit.models import ModelEntry

START = datetime(2026, 11, 13, 9, 0, 0, tzinfo=timezone.utc)


class Clock:
    """A fake UTC clock; sleeping advances it."""

    def __init__(self, at: datetime = START) -> None:
        self.at = at
        self.sleeps: list[float] = []

    def now(self) -> datetime:
        return self.at

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.at += timedelta(seconds=seconds)

    def advance(self, seconds: float) -> None:
        self.at += timedelta(seconds=seconds)


def ledger(path: Path, clock: Clock, limit: int = 45) -> FreeRequestLedger:
    return FreeRequestLedger(path / "free-requests.json", limit=limit, now=clock.now, sleep=clock.sleep)


def test_only_ids_ending_in_free_are_free() -> None:
    entry = lambda model: ModelEntry(id="m", provider="openai-compatible", base_url="https://x", api_key_env="K", model=model)  # noqa: E731
    assert is_free(entry("vendor/model:free"))
    assert not is_free(entry("vendor/model"))
    assert not is_free(entry("vendor/free-model"))
    assert not is_free(ModelEntry(id="mock-reference", provider="mock"))


def test_counts_every_request_and_refuses_number_46(tmp_path: Path) -> None:
    clock = Clock()
    book = ledger(tmp_path, clock)
    for _ in range(45):
        book.before_request()
        clock.advance(10)
    assert (book.used(), book.remaining()) == (45, 0)
    assert book.refusal() == "daily free-request limit reached (45 sent today, UTC 2026-11-13)"
    with pytest.raises(DailyLimitReached, match="45 sent today"):
        book.before_request()
    # A refused request is not counted.
    assert book.used() == 45
    assert json.loads((tmp_path / "free-requests.json").read_text())["days"] == {"2026-11-13": 45}


def test_the_count_survives_a_new_process(tmp_path: Path) -> None:
    clock = Clock()
    for _ in range(3):
        ledger(tmp_path, clock).before_request()
        clock.advance(10)
    book = ledger(tmp_path, clock)
    assert (book.used(), book.remaining()) == (3, 42)
    assert book.status() == "free requests today (UTC 2026-11-13): 3 sent, 42 left of 45"


def test_a_new_utc_day_starts_a_new_count(tmp_path: Path) -> None:
    clock = Clock(datetime(2026, 11, 13, 23, 59, 50, tzinfo=timezone.utc))
    book = ledger(tmp_path, clock, limit=2)
    book.before_request()
    clock.advance(5)
    book.before_request()
    assert book.refusal() is not None
    clock.advance(10)  # 2026-11-14 00:00:05 UTC
    assert (book.today(), book.used(), book.refusal()) == ("2026-11-14", 0, None)
    book.before_request()
    assert json.loads((tmp_path / "free-requests.json").read_text())["days"] == {"2026-11-13": 2, "2026-11-14": 1}


def test_the_day_is_the_utc_day_whatever_the_local_zone(tmp_path: Path) -> None:
    # 01:00 on the 14th in UTC+2 is 23:00 on the 13th in UTC.
    clock = Clock(datetime(2026, 11, 14, 1, 0, tzinfo=timezone(timedelta(hours=2))))
    book = ledger(tmp_path, clock)
    book.before_request()
    assert json.loads((tmp_path / "free-requests.json").read_text())["days"] == {"2026-11-13": 1}


def test_requests_are_spaced_at_least_four_seconds_apart(tmp_path: Path) -> None:
    clock = Clock()
    book = ledger(tmp_path, clock)
    book.before_request()
    assert clock.sleeps == []
    clock.advance(1.5)
    book.before_request()
    assert clock.sleeps == [2.5]
    clock.advance(30)
    book.before_request()
    assert clock.sleeps == [2.5]


def test_spacing_holds_across_processes(tmp_path: Path) -> None:
    clock = Clock()
    ledger(tmp_path, clock).before_request()
    clock.advance(1)
    ledger(tmp_path, clock).before_request()
    assert clock.sleeps == [3.0]


def test_a_clock_that_went_backwards_waits_one_interval(tmp_path: Path) -> None:
    clock = Clock()
    book = ledger(tmp_path, clock)
    book.before_request()
    clock.advance(-60)
    book.before_request()
    assert clock.sleeps == [4.0]


def test_a_refused_request_does_not_wait(tmp_path: Path) -> None:
    clock = Clock()
    book = ledger(tmp_path, clock, limit=1)
    book.before_request()
    with pytest.raises(DailyLimitReached):
        book.before_request()
    assert clock.sleeps == []
