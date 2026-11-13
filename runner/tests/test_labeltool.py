"""label: the blind labelling tool. The browser never receives a suite
result, and labels are saved, resumed and undone correctly."""

from __future__ import annotations

import http.client
import json
import re
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest

from labelfixtures import add_run

from first_edit.labelset import build_label_set, labels_path, write_label_set
from first_edit.labeltool import LabelServer, LabelStore, browser_state, load_examples, open_tool
from first_edit.providers import SetupError
from first_edit.summarize import CHECKS


@pytest.fixture
def label_set(tmp_path: Path) -> tuple[Path, dict]:
    runs = tmp_path / "runs"
    add_run(runs, "secret-model/brief-a/plain-s1",
            failed={"text-long": ["content-spill"], "text-unbroken@320": ["page-overflow-x", "text-overlap"]})
    add_run(runs, "secret-model/brief-b/hinted-s1", failed={"viewport-320": ["off-screen"], "dir-rtl": ["text-clipped"]})
    add_run(runs, "other-model/brief-c/plain-s2")
    label_set = build_label_set(runs, "set-t", 3, root=tmp_path, repeats=5, survived=20)
    path = tmp_path / "labels" / "set-t.json"
    write_label_set(label_set, path)
    return path, label_set


@contextmanager
def running(server: LabelServer) -> Iterator[str]:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.port}"
    finally:
        server.shutdown()
        server.server_close()


def get(url: str) -> tuple[int, bytes]:
    try:
        with urllib.request.urlopen(url) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def post(url: str, body: dict, content_type: str = "application/json") -> tuple[int, dict]:
    request = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": content_type})
    try:
        with urllib.request.urlopen(request) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read() or b"{}")


# --- what the browser receives -------------------------------------------------


def _forbidden(label_set: dict) -> set[str]:
    """Strings that would reveal a suite result, a model, a variant or a file."""
    return {
        "stratum", "survived", "failed", "tier", "core", "extreme", "suite", "harness", "repeat", "checks",
        "plain", "hinted", "candidate", "runs/", ".png", "secret-model", "other-model", "abc1234", *CHECKS,
        *(item["case"] for item in label_set["items"]),
    }


def test_the_state_sent_to_the_browser_carries_no_suite_result(label_set) -> None:
    path, data = label_set
    assert {item["stratum"] for item in data["items"]} >= {"failed-core", "failed-extreme", "survived-other"}
    server = open_tool(path, data, port=0, root=path.parent.parent)
    with running(server) as origin:
        status, body = get(f"{origin}/api/state")
    assert status == 200
    state = json.loads(body)
    assert set(state) == {"set", "labels", "items", "answers", "examples"}
    assert len(state["items"]) == len(data["items"])
    for shown, item in zip(state["items"], data["items"], strict=True):
        # a whitelist: the same fields for a failed and a survived case
        assert set(shown) == {"id", "brief", "description", "left", "right"}
        assert shown["id"] == item["id"] and shown["brief"] == item["brief"]
        for side in ("left", "right"):
            assert set(shown[side]) == {"url", "screen", "rtl"}
            assert shown[side]["url"] == f"/pictures/{item['id']}/{side}"
    for example in state["examples"]:
        assert set(example) == {"kind", "caption", "left", "right"}
        assert re.fullmatch(r"/examples/\d+/(left|right)", example["left"]["url"])
    text = json.dumps(state)
    for word in _forbidden(data):
        assert word not in text, word


def test_the_page_itself_names_no_check_or_verdict(label_set) -> None:
    path, data = label_set
    server = open_tool(path, data, port=0, root=path.parent.parent)
    with running(server) as origin:
        status, body = get(f"{origin}/")
    assert status == 200
    page = body.decode("utf-8")
    for word in (*CHECKS, "survived", "failed", "stratum", "suite", "candidate", "annotated", "findings"):
        assert word not in page, word


def test_pictures_are_served_only_by_item_id(label_set) -> None:
    path, data = label_set
    root = path.parent.parent
    server = open_tool(path, data, port=0, root=root)
    item = data["items"][0]
    with running(server) as origin:
        assert get(f"{origin}/pictures/{item['id']}/left") == (200, (root / item["pictures"]["reference"]).read_bytes())
        assert get(f"{origin}/pictures/{item['id']}/right") == (200, (root / item["pictures"]["case"]).read_bytes())
        assert get(f"{origin}/pictures/i999/left")[0] == 404
        assert get(f"{origin}/pictures/{item['id']}/annotated")[0] == 404
        assert get(f"{origin}/{item['pictures']['case']}")[0] == 404
        assert get(f"{origin}/pictures/..%2F..%2Fsummary.json/left")[0] == 404
        status, body = get(f"{origin}/examples/0/right")
        assert status == 200 and body.startswith(b"\x89PNG")
        assert get(f"{origin}/examples/{len(load_examples())}/left")[0] == 404


def test_requests_from_elsewhere_are_refused(label_set) -> None:
    path, data = label_set
    server = open_tool(path, data, port=0, root=path.parent.parent)
    with running(server) as origin:
        connection = http.client.HTTPConnection("127.0.0.1", server.port)
        connection.request("GET", "/api/state", headers={"Host": "attacker.example"})
        assert connection.getresponse().status == 403
        connection.close()
        request = urllib.request.Request(f"{origin}/api/answer", method="POST",
                                         data=json.dumps({"item": "i001", "label": "fine"}).encode(),
                                         headers={"Content-Type": "application/json", "Origin": "https://attacker.example"})
        with pytest.raises(urllib.error.HTTPError) as refused:
            urllib.request.urlopen(request)
        assert refused.value.code == 403
        assert post(f"{origin}/api/answer", {"item": "i001", "label": "fine"}, "text/plain")[0] == 415
    assert not labels_path(path).exists()


# --- saving, resuming and undoing ----------------------------------------------


def lines(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_the_store_saves_after_every_answer_and_resumes(tmp_path: Path) -> None:
    path = tmp_path / "set.labels.jsonl"
    store = LabelStore(path, ["i001", "i002", "i003"])
    store.answer("i001", "broken", "text runs out of the card", 4200)
    assert lines(path) == [{"item": "i001", "label": "broken", "note": "text runs out of the card", "ms": 4200}]
    store.answer("i002", "fine", "", 900)
    store.answer("i003", "unsure", "  ", 300)
    resumed = LabelStore(path, ["i001", "i002", "i003"])
    assert resumed.labels() == {"i001": {"label": "broken", "note": "text runs out of the card"},
                                "i002": {"label": "fine", "note": ""}, "i003": {"label": "unsure", "note": ""}}
    assert not path.with_name(path.name + ".tmp").exists()


def test_answering_again_replaces_the_label_and_becomes_the_last_answer(tmp_path: Path) -> None:
    path = tmp_path / "set.labels.jsonl"
    store = LabelStore(path, ["i001", "i002"])
    store.answer("i001", "broken", ms=10)
    store.answer("i002", "fine", ms=20)
    store.answer("i001", "other", "squeezed column", ms=30)
    assert [(r["item"], r["label"]) for r in lines(path)] == [("i002", "fine"), ("i001", "other")]
    store.set_note("i002", "wraps a lot")
    assert [(r["item"], r["note"], r["ms"]) for r in lines(path)] == [("i002", "wraps a lot", 20),
                                                                       ("i001", "squeezed column", 30)]


def test_undo_removes_the_last_answer(tmp_path: Path) -> None:
    path = tmp_path / "set.labels.jsonl"
    store = LabelStore(path, ["i001", "i002", "i003"])
    for item in ("i001", "i002", "i003"):
        store.answer(item, "unsure", ms=1)
    assert store.undo() == "i003"
    assert store.undo() == "i002"
    assert [r["item"] for r in lines(path)] == ["i001"]
    assert LabelStore(path, ["i001", "i002", "i003"]).labels() == {"i001": {"label": "unsure", "note": ""}}
    assert store.undo() == "i001"
    assert store.undo() is None
    assert path.read_text(encoding="utf-8") == ""


def test_the_store_rejects_bad_input(tmp_path: Path) -> None:
    store = LabelStore(tmp_path / "s.labels.jsonl", ["i001"])
    with pytest.raises(ValueError, match="unknown label"):
        store.answer("i001", "maybe")
    with pytest.raises(ValueError, match="unknown item"):
        store.answer("i999", "fine")
    with pytest.raises(ValueError, match="no label yet"):
        store.set_note("i001", "a note")
    with pytest.raises(ValueError, match="at most"):
        store.answer("i001", "fine", "x" * 2001)
    (tmp_path / "other.labels.jsonl").write_text('{"item": "i777", "label": "fine"}\n', encoding="utf-8")
    with pytest.raises(SetupError, match="not in the set"):
        LabelStore(tmp_path / "other.labels.jsonl", ["i001"])


def test_answers_notes_and_undo_over_http_survive_a_restart(label_set) -> None:
    path, data = label_set
    root = path.parent.parent
    ids = [item["id"] for item in data["items"]]
    with running(open_tool(path, data, port=0, root=root)) as origin:
        assert post(f"{origin}/api/answer", {"item": ids[0], "label": "broken", "note": "", "ms": 1500})[0] == 200
        assert post(f"{origin}/api/answer", {"item": ids[1], "label": "fine", "note": "tight", "ms": 800})[0] == 200
        status, body = post(f"{origin}/api/note", {"item": ids[0], "note": "spills"})
        assert status == 200 and body["answers"][ids[0]] == {"label": "broken", "note": "spills"}
        assert post(f"{origin}/api/answer", {"item": ids[2], "label": "nope"})[0] == 400
        assert post(f"{origin}/api/note", {"item": ids[3], "note": "x"})[0] == 400
    assert [r["item"] for r in lines(labels_path(path))] == [ids[0], ids[1]]
    server = open_tool(path, data, port=0, root=root)
    with running(server) as origin:
        state = json.loads(get(f"{origin}/api/state")[1])
        assert state["answers"] == {ids[0]: {"label": "broken", "note": "spills"}, ids[1]: {"label": "fine", "note": "tight"}}
        status, body = post(f"{origin}/api/undo", {})
        assert status == 200 and body["undone"] == ids[1] and list(body["answers"]) == [ids[0]]
    assert lines(labels_path(path)) == [{"item": ids[0], "label": "broken", "note": "spills", "ms": 1500}]


def test_browser_state_lists_the_answers(label_set, tmp_path: Path) -> None:
    _, data = label_set
    store = LabelStore(tmp_path / "x.labels.jsonl", [item["id"] for item in data["items"]])
    store.answer(data["items"][0]["id"], "other", "collapsed", 5)
    state = browser_state(data, store, load_examples())
    assert state["answers"] == {data["items"][0]["id"]: {"label": "other", "note": "collapsed"}}
    assert state["labels"] == ["broken", "fine", "other", "unsure"]
