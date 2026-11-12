from pathlib import Path

import pytest

from first_edit.briefs import load_brief
from first_edit.prompts import VARIANTS, build_messages, prompt_hash

SNAPSHOTS = Path(__file__).parent / "snapshots"


def render(messages: list[dict[str, str]]) -> str:
    return "".join(f"=== {message['role']} ===\n{message['content']}\n" for message in messages)


@pytest.mark.parametrize("variant", VARIANTS)
def test_prompt_matches_the_stored_snapshot(variant: str) -> None:
    messages = build_messages(load_brief("pricing-table"), variant)
    assert render(messages) == (SNAPSHOTS / f"pricing-table.{variant}.txt").read_text(encoding="utf-8")


def test_hinted_is_the_plain_message_plus_the_hint() -> None:
    brief = load_brief("pricing-table")
    plain, hinted = build_messages(brief, "plain"), build_messages(brief, "hinted")
    assert hinted[0] == plain[0]
    assert hinted[1]["content"].startswith(plain[1]["content"] + "\n\nThe component will be used with real content")
    assert hinted[1]["content"].endswith("Nothing may overflow, be cut off or overlap.")
    assert prompt_hash(plain) != prompt_hash(hinted)


def test_messages_are_system_then_user() -> None:
    messages = build_messages(load_brief("nav-header"), "plain")
    assert [message["role"] for message in messages] == ["system", "user"]
    assert messages[0]["content"].startswith("Write one React component in TypeScript")
    assert "```ts\n/** The top navigation bar of a web app. */" in messages[1]["content"]
    assert messages[1]["content"].endswith('"email": "priya.raman@example.com"\n  }\n}\n```')


def test_unknown_variant_is_rejected() -> None:
    with pytest.raises(ValueError):
        build_messages(load_brief("pricing-table"), "spicy")
