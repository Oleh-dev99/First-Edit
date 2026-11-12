"""Briefs on disk: meta.json, brief.md, props.ts and the baseline fixture."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .paths import BRIEFS_DIR, CANDIDATES_DIR


class BriefError(ValueError):
    """A brief does not exist or cannot be read."""


@dataclass(frozen=True)
class Brief:
    id: str
    title: str
    category: str
    sample: bool
    brief_md: str
    props_ts: str
    fixture_json: str


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8").removeprefix("﻿")


def load_brief(brief_id: str, briefs_dir: Path = BRIEFS_DIR) -> Brief:
    directory = briefs_dir / brief_id
    if not (directory / "meta.json").is_file():
        raise BriefError(f'unknown brief "{brief_id}"')
    meta = json.loads(_read(directory / "meta.json"))
    return Brief(
        id=brief_id,
        title=meta["title"],
        category=meta["category"],
        sample=bool(meta["sample"]),
        brief_md=_read(directory / "brief.md"),
        props_ts=_read(directory / "props.ts"),
        fixture_json=_read(directory / "fixture.baseline.json"),
    )


def list_briefs(corpus_only: bool = False, briefs_dir: Path = BRIEFS_DIR) -> list[str]:
    """Brief ids in alphabetical order; corpus_only leaves out sample briefs."""
    ids = sorted(path.name for path in briefs_dir.iterdir() if (path / "meta.json").is_file())
    if corpus_only:
        ids = [brief_id for brief_id in ids if not load_brief(brief_id, briefs_dir).sample]
    return ids


def reference_component(brief_id: str) -> Path:
    return CANDIDATES_DIR / "_reference" / brief_id / "v1" / "Component.tsx"
