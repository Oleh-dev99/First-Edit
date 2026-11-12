from first_edit.extract import extract_code


def test_one_block_is_used_as_is() -> None:
    reply = "Here is the component:\n\n```tsx\nexport default function A() {}\n```\n\nEnjoy."
    extraction = extract_code(reply)
    assert extraction.code == "export default function A() {}\n"
    assert (extraction.blocks, extraction.method, extraction.warnings) == (1, "single-block", [])


def test_several_blocks_use_the_largest_with_a_warning() -> None:
    reply = "```bash\nnpm i\n```\n\n```tsx\nexport default function A() {\n  return null;\n}\n```\n\n```css\n.x {}\n```"
    extraction = extract_code(reply)
    assert extraction.code == "export default function A() {\n  return null;\n}\n"
    assert (extraction.blocks, extraction.method) == (3, "largest-block")
    assert extraction.warnings == ["3 code blocks in the reply; used the largest (47 characters)"]


def test_no_block_uses_the_whole_reply() -> None:
    reply = "export default function A() { return null; }"
    extraction = extract_code(reply)
    assert extraction.code == reply + "\n"
    assert (extraction.blocks, extraction.method) == (0, "whole-reply")
    assert extraction.warnings == ["no fenced code block in the reply; used the whole reply"]


def test_a_cut_off_reply_has_no_complete_block() -> None:
    reply = "```tsx\nexport default function A() {\n  return <div className=\"p-4"
    extraction = extract_code(reply)
    assert (extraction.blocks, extraction.method) == (0, "whole-reply")
    assert extraction.code.startswith("```tsx\n")


def test_fence_inside_a_line_is_not_a_block() -> None:
    reply = "Use ```inline``` fences.\n```\nconst a = 1;\n```"
    extraction = extract_code(reply)
    assert (extraction.blocks, extraction.code) == (1, "const a = 1;\n")
