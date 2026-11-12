"""The models file (runner/models.toml): which models the runner may call."""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .paths import MODELS_FILE

PROVIDERS = ("mock", "openai-compatible")
MODEL_ID = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
ENTRY_KEYS = {"id", "provider", "base_url", "api_key_env", "model", "params", "price"}


class ModelsError(ValueError):
    """The models file is malformed, or a model id is unknown."""


@dataclass(frozen=True)
class Price:
    """USD per million tokens."""

    input: float
    output: float


@dataclass(frozen=True)
class ModelEntry:
    id: str
    provider: str
    base_url: str | None = None
    api_key_env: str | None = None
    model: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    price: Price | None = None

    def identity(self) -> dict[str, Any]:
        """The fields that decide the reply. Part of the cache key; price and key name are not."""
        return {"id": self.id, "provider": self.provider, "base_url": self.base_url, "model": self.model}

    def describe(self) -> dict[str, Any]:
        """The entry as recorded in generation.json. Names the key's variable, never the key."""
        return {
            **self.identity(),
            "api_key_env": self.api_key_env,
            "params": self.params,
            "price": None if self.price is None else {"input": self.price.input, "output": self.price.output},
        }


def _number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def _entry(raw: Any, index: int) -> ModelEntry:
    where = f"model #{index + 1}"
    if not isinstance(raw, dict):
        raise ModelsError(f"{where}: must be a table")
    unknown = sorted(set(raw) - ENTRY_KEYS)
    if unknown:
        raise ModelsError(f"{where}: unknown keys {unknown}")
    model_id = raw.get("id")
    if not isinstance(model_id, str) or not MODEL_ID.match(model_id):
        raise ModelsError(f"{where}: id must match {MODEL_ID.pattern}")
    where = f'model "{model_id}"'

    provider = raw.get("provider")
    if provider not in PROVIDERS:
        raise ModelsError(f"{where}: provider must be one of {', '.join(PROVIDERS)}")
    if provider == "openai-compatible":
        for key in ("base_url", "api_key_env", "model"):
            if not isinstance(raw.get(key), str) or not raw[key]:
                raise ModelsError(f"{where}: {key} is required for openai-compatible")

    params = raw.get("params", {})
    if not isinstance(params, dict):
        raise ModelsError(f"{where}: params must be a table")
    if "model" in params or "messages" in params:
        raise ModelsError(f"{where}: params may not set model or messages")

    price = raw.get("price")
    if price is not None:
        if not isinstance(price, dict) or set(price) != {"input", "output"} or not all(map(_number, price.values())):
            raise ModelsError(f"{where}: price must be {{ input = <USD>, output = <USD> }} per million tokens")
        price = Price(float(price["input"]), float(price["output"]))

    return ModelEntry(
        id=model_id,
        provider=provider,
        base_url=raw.get("base_url"),
        api_key_env=raw.get("api_key_env"),
        model=raw.get("model"),
        params=dict(params),
        price=price,
    )


def load_models(path: Path = MODELS_FILE) -> dict[str, ModelEntry]:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    entries: dict[str, ModelEntry] = {}
    for index, raw in enumerate(data.get("model", [])):
        entry = _entry(raw, index)
        if entry.id in entries:
            raise ModelsError(f'model "{entry.id}" is listed twice')
        entries[entry.id] = entry
    return entries


def get_model(model_id: str, path: Path = MODELS_FILE) -> ModelEntry:
    entries = load_models(path)
    if model_id not in entries:
        known = ", ".join(sorted(entries)) or "none"
        raise ModelsError(f'unknown model "{model_id}" (known: {known})')
    return entries[model_id]
