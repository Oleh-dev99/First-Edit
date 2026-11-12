"""The prompt: a fixed system message and a user message built from the brief.

The text lives in prompts/system.md, prompts/user.md (a template) and
prompts/hint.md and is used verbatim; it is part of the method.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from .briefs import Brief
from .paths import PROMPTS_DIR

VARIANTS = ("plain", "hinted")

_PLACEHOLDER = re.compile(r"\{(brief|props|fixture)\}")


def _prompt_file(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


def build_messages(brief: Brief, variant: str) -> list[dict[str, str]]:
    """The system and user messages for one brief in one variant."""
    if variant not in VARIANTS:
        raise ValueError(f'unknown variant "{variant}"; expected one of {", ".join(VARIANTS)}')
    values = {
        "brief": brief.brief_md.strip(),
        "props": brief.props_ts.strip(),
        "fixture": brief.fixture_json.strip(),
    }
    # One pass, so text inside the brief is never taken for a placeholder.
    user = _PLACEHOLDER.sub(lambda match: values[match.group(1)], _prompt_file("user.md"))
    if variant == "hinted":
        user = f"{user}\n\n{_prompt_file('hint.md')}"
    return [{"role": "system", "content": _prompt_file("system.md")}, {"role": "user", "content": user}]


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def prompt_hash(messages: list[dict[str, str]]) -> str:
    return sha256(canonical_json(messages))
