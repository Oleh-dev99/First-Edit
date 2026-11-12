"""Pulling the component's code out of a model's reply."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# A fenced block: an opening fence at the start of a line, with an optional
# language tag, up to the next fence at the start of a line.
FENCED_BLOCK = re.compile(r"^```[^\n`]*\n(.*?)^```[ \t]*$", re.DOTALL | re.MULTILINE)


@dataclass(frozen=True)
class Extraction:
    code: str
    blocks: int
    #: "single-block", "largest-block" or "whole-reply"
    method: str
    warnings: list[str] = field(default_factory=list)


def _with_newline(code: str) -> str:
    return code if code.endswith("\n") else f"{code}\n"


def extract_code(reply: str) -> Extraction:
    """Exactly one fenced block is used as is. With several, the largest is
    used and a warning recorded. With none, the whole reply is used and the
    gate decides."""
    blocks = [match.group(1) for match in FENCED_BLOCK.finditer(reply)]
    if len(blocks) == 1:
        return Extraction(_with_newline(blocks[0]), 1, "single-block")
    if blocks:
        largest = max(blocks, key=len)
        warning = f"{len(blocks)} code blocks in the reply; used the largest ({len(largest)} characters)"
        return Extraction(_with_newline(largest), len(blocks), "largest-block", [warning])
    return Extraction(_with_newline(reply), 0, "whole-reply", ["no fenced code block in the reply; used the whole reply"])
