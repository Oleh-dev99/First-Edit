"""The doctor command: is every configured model usable? Spends no tokens.

For each real model it checks that the key variable is set (by name only;
the key is never printed), that the model is listed at {base_url}/models,
and compares the listed prices with the configured ones. A listed price
above the configured one makes the model unusable, because the budget
guards would then undercount spend.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import httpx

from .models import ModelEntry, ModelsError, Price, load_models
from .paths import MODELS_FILE, REPO_ROOT

#: Listing pages followed at most (OpenRouter returns everything in one).
MAX_PAGES = 20
#: Price fields, other than prompt and completion, that add to what a call
#: costs and that the budget estimate does not include.
EXTRA_COST_FIELDS = ("request", "internal_reasoning")


@dataclass
class Listing:
    """{base_url}/models, fetched once per base URL."""

    models: dict[str, dict[str, Any]] = field(default_factory=dict)
    error: str | None = None


def fetch_listing(client: httpx.Client, base_url: str, api_key: str | None) -> Listing:
    """Every model listed at {base_url}/models, by id. Follows `links.next`."""
    url: str | None = f"{base_url.rstrip('/')}/models"
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    listing = Listing()
    for _ in range(MAX_PAGES):
        if url is None:
            break
        try:
            response = client.get(url, headers=headers)
        except httpx.HTTPError as error:
            listing.error = f"{type(error).__name__} for GET {url}"
            return listing
        if response.status_code != 200:
            listing.error = f"HTTP {response.status_code} for GET {url}"
            return listing
        try:
            body = response.json()
            items = body["data"]
        except (ValueError, KeyError, TypeError):
            listing.error = f"unexpected response from GET {url}"
            return listing
        for item in items:
            if isinstance(item, dict) and isinstance(item.get("id"), str):
                listing.models[item["id"]] = item
        following = (body.get("links") or {}).get("next") if isinstance(body.get("links"), dict) else None
        url = urljoin(url, following) if isinstance(following, str) and following else None
    return listing


def per_million(value: Any) -> float | None:
    """A listed per-token USD price (a string such as "0.0000001") per million tokens."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or number < 0:
        return None
    return round(number * 1_000_000, 6)


def _money(value: float | None) -> str:
    return "-" if value is None else f"{value:.2f}"


def _price_line(label: str, configured: float | None, listed: float | None) -> tuple[str, bool]:
    """The comparison line and whether it makes the model unusable."""
    head = f"  {label:<10} configured {_money(configured):>6}  listed {_money(listed):>6}  "
    if listed is None:
        return head + "NOT LISTED: cannot be compared", False
    if configured is None:
        return head + "no configured price: --max-cost cannot apply", False
    if math.isclose(configured, listed, rel_tol=1e-9, abs_tol=1e-9):
        return head + "same", False
    if listed > configured:
        return head + "DIFFERENT: listed is HIGHER, the budget would undercount", True
    return head + "DIFFERENT: listed is lower", False


def check_model(entry: ModelEntry, environ: Mapping[str, str], listing: Listing | None) -> tuple[list[str], bool]:
    """Report lines for one model and whether it is usable."""
    if entry.provider == "mock":
        return [f"{entry.id}: mock, no network", "  result     usable"], True

    lines = [f"{entry.id}: {entry.provider}  {entry.base_url}  {entry.model}"]
    usable = True

    key_set = bool(environ.get(entry.api_key_env or ""))
    lines.append(f"  key        {entry.api_key_env}: {'set' if key_set else 'NOT SET'}")
    usable &= key_set

    if listing is None or listing.error:
        lines.append(f"  model      cannot check: {listing.error if listing else 'no listing'}")
        lines.append("  result     UNUSABLE")
        return lines, False

    listed = listing.models.get(entry.model or "")
    if listed is None:
        lines.append(f"  model      NOT LISTED at {entry.base_url}/models")
        lines.append("  result     UNUSABLE")
        return lines, False

    context = listed.get("context_length")
    max_output = (listed.get("top_provider") or {}).get("max_completion_tokens")
    lines.append(f"  model      listed (context {context if context else '-'}, max output {max_output if max_output else '-'})")

    pricing = listed.get("pricing") or {}
    price: Price | None = entry.price
    for label, configured_value, listed_value in (
        ("price in", price.input if price else None, per_million(pricing.get("prompt"))),
        ("price out", price.output if price else None, per_million(pricing.get("completion"))),
    ):
        line, problem = _price_line(label, configured_value, listed_value)
        lines.append(line)
        usable &= not problem
    extras = {name: pricing[name] for name in EXTRA_COST_FIELDS if (per_million(pricing.get(name)) or 0) > 0}
    if extras:
        lines.append("  note       other listed prices, not in the budget estimate: "
                     + ", ".join(f"{name}={value}" for name, value in extras.items()))

    max_tokens = entry.params.get("max_tokens") or entry.params.get("max_completion_tokens")
    if isinstance(max_tokens, int) and isinstance(max_output, int) and max_tokens > max_output:
        lines.append(f"  note       params max_tokens {max_tokens} is above the listed max output {max_output}")

    lines.append(f"  result     {'usable' if usable else 'UNUSABLE'}")
    return lines, usable


def run_doctor(
    *,
    environ: Mapping[str, str],
    client: httpx.Client,
    models_file: Path = MODELS_FILE,
    out: Callable[[str], None] = print,
) -> int:
    """0 when every configured model is usable, 1 when one is not, 2 when the
    models file is invalid."""
    where = models_file.relative_to(REPO_ROOT).as_posix() if models_file.is_relative_to(REPO_ROOT) else models_file
    try:
        entries = load_models(models_file)
    except (ModelsError, OSError, ValueError) as error:
        out(f"models file {where}: INVALID: {error}")
        return 2
    out(f"models file {where}: valid, {len(entries)} model(s)")

    listings: dict[str, Listing] = {}
    unusable = []
    for entry in entries.values():
        listing = None
        if entry.provider != "mock":
            base_url = entry.base_url or ""
            if base_url not in listings:
                listings[base_url] = fetch_listing(client, base_url, environ.get(entry.api_key_env or "") or None)
            listing = listings[base_url]
        lines, usable = check_model(entry, environ, listing)
        out("")
        for line in lines:
            out(line)
        if not usable:
            unusable.append(entry.id)

    out("")
    if unusable:
        out(f"unusable: {', '.join(unusable)}")
        return 1
    out("every configured model is usable")
    return 0
