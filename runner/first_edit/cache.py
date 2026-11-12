"""The response cache: results/cache/<key>.json holds a provider's raw reply.

The key covers everything that decides the reply: the model entry's
identity (id, provider, base URL, provider model id), its params, both
messages and the sample number. A hit is reused as is, so a sample is never
re-rolled.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import ModelEntry
from .paths import CACHE_DIR
from .prompts import canonical_json, sha256


def cache_key(entry: ModelEntry, messages: list[dict[str, str]], sample: int) -> str:
    payload = {"model": entry.identity(), "params": entry.params, "messages": messages, "sample": sample}
    return sha256(canonical_json(payload))


class Cache:
    def __init__(self, directory: Path = CACHE_DIR) -> None:
        self.directory = directory

    def path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def get(self, key: str) -> dict[str, Any] | None:
        path = self.path(key)
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def put(self, key: str, record: dict[str, Any]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self.path(key)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        temporary.replace(path)
