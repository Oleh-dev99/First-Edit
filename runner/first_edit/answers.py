"""Answers to the items of a label set, saved as JSON lines after every change.

Two kinds share one store: the blind labels (labels/<set>.labels.jsonl,
{"item", "label", "note", "ms"}, D-050) and the owner's adjudication of the
disagreements (labels/<set>.adjudication.jsonl, {"item", "answer", "note",
"ms"}, D-055). One line per answered item, in the order of the last answer:
answering again replaces an item's line and moves it to the end, and undo
removes the last line. The file is replaced atomically on every save.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .providers import SetupError

#: The blind labels (D-050, D-051).
LABELS = ("broken", "fine", "other", "unsure")
#: The adjudication answers (D-055): 1 the suite is right, 2 my label is right,
#: 3 we define it differently.
ADJUDICATIONS = ("suite-right", "label-right", "defined-differently")
MAX_NOTE = 2000


class AnswerStore:
    """One answer per item, from a fixed list of values, with an optional note."""

    #: the record's key for the answer
    key = "label"
    values: tuple[str, ...] = LABELS
    #: what the item ids are, for error messages
    scope = "the set"

    def __init__(self, path: Path, item_ids: list[str]) -> None:
        self.path = path
        self._ids = set(item_ids)
        self._records: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()
        if path.is_file():
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except ValueError as error:
                    raise SetupError(f"{path}, line {number}: {error}") from error
                item = record.get("item")
                if item not in self._ids:
                    raise SetupError(f"{path}, line {number}: item {item!r} is not in {self.scope}")
                if record.get(self.key) not in self.values:
                    raise SetupError(f"{path}, line {number}: unknown {self.key} {record.get(self.key)!r}")
                self._records.pop(item, None)
                self._records[item] = record

    def answers(self) -> dict[str, dict[str, str]]:
        """The current answer per item: {item: {key, "note"}}."""
        with self._lock:
            return {item: {self.key: r[self.key], "note": r.get("note") or ""} for item, r in self._records.items()}

    def records(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(record) for record in self._records.values()]

    def _check(self, item: str, note: str) -> None:
        if item not in self._ids:
            raise ValueError(f"unknown item {item!r}")
        if not isinstance(note, str) or len(note) > MAX_NOTE:
            raise ValueError(f"a note is text of at most {MAX_NOTE} characters")

    def answer(self, item: str, value: str, note: str = "", ms: int | None = None) -> None:
        """Answers an item (again); the answer becomes the last one."""
        self._check(item, note)
        if value not in self.values:
            raise ValueError(f"unknown {self.key} {value!r}")
        if ms is not None and (not isinstance(ms, int) or isinstance(ms, bool) or ms < 0):
            raise ValueError("ms is a whole number of milliseconds")
        with self._lock:
            self._records.pop(item, None)
            self._records[item] = {"item": item, self.key: value, "note": note.strip(), "ms": ms}
            self._save()

    def set_note(self, item: str, note: str) -> None:
        """Changes the note of an answered item, keeping its place and its time."""
        self._check(item, note)
        with self._lock:
            if item not in self._records:
                raise ValueError(f"item {item} has no {self.key} yet")
            self._records[item]["note"] = note.strip()
            self._save()

    def undo(self) -> str | None:
        """Removes the last answer and returns its item, or None."""
        with self._lock:
            if not self._records:
                return None
            item = next(reversed(self._records))
            del self._records[item]
            self._save()
            return item

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(self.path.name + ".tmp")
        text = "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in self._records.values())
        temporary.write_text(text, encoding="utf-8", newline="\n")
        os.replace(temporary, self.path)


class LabelStore(AnswerStore):
    """The blind labels of one set (labels/<set>.labels.jsonl)."""

    key = "label"
    values = LABELS

    def labels(self) -> dict[str, dict[str, str]]:
        """The current label per item: {item: {"label", "note"}}."""
        return self.answers()


class AdjudicationStore(AnswerStore):
    """The owner's answers to the disagreements (labels/<set>.adjudication.jsonl)."""

    key = "answer"
    values = ADJUDICATIONS
    scope = "the set's disagreements"
