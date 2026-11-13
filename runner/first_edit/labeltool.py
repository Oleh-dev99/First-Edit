"""The label command: a local, blind labelling tool (docs/LABELLING.md, D-050).

A small HTTP server on 127.0.0.1 serves one HTML page (label_ui/index.html)
and the two clean screenshots of each item of a label set. The browser only
ever receives what browser_state() builds: the item id, the brief, the case
in plain words, opaque picture URLs and the screen widths. The set file's
suite verdicts, strata, models, variants and paths stay on the server.

Answers are saved after every change to labels/<set>.labels.jsonl, one line
per labelled item: {"item", "label", "note", "ms"}, in the order of the last
answer, so the tool can be closed and resumed, and undo removes the last line.
"""

from __future__ import annotations

import json
import os
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .labelset import describe_case, labels_path, resolve
from .paths import PACKAGE_DIR, REPO_ROOT
from .providers import SetupError

LABELS = ("broken", "fine", "other", "unsure")
HOST = "127.0.0.1"
DEFAULT_PORT = 8765
UI_DIR = PACKAGE_DIR / "label_ui"
MAX_NOTE = 2000
MAX_BODY = 16_384
PICTURE_URL = re.compile(r"^/pictures/(i\d{3,})/(left|right)$")
EXAMPLE_URL = re.compile(r"^/examples/(\d+)/(left|right)$")


class LabelStore:
    """The labels of one set, saved to a JSON-lines file after every change."""

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
                    raise SetupError(f"{path}, line {number}: item {item!r} is not in the set")
                if record.get("label") not in LABELS:
                    raise SetupError(f"{path}, line {number}: unknown label {record.get('label')!r}")
                self._records.pop(item, None)
                self._records[item] = record

    def labels(self) -> dict[str, dict[str, str]]:
        """The current answer per item: {item: {"label", "note"}}."""
        with self._lock:
            return {item: {"label": r["label"], "note": r.get("note") or ""} for item, r in self._records.items()}

    def records(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(record) for record in self._records.values()]

    def _check(self, item: str, note: str) -> None:
        if item not in self._ids:
            raise ValueError(f"unknown item {item!r}")
        if not isinstance(note, str) or len(note) > MAX_NOTE:
            raise ValueError(f"a note is text of at most {MAX_NOTE} characters")

    def answer(self, item: str, label: str, note: str = "", ms: int | None = None) -> None:
        """Labels an item (again); the answer becomes the last one."""
        self._check(item, note)
        if label not in LABELS:
            raise ValueError(f"unknown label {label!r}")
        if ms is not None and (not isinstance(ms, int) or isinstance(ms, bool) or ms < 0):
            raise ValueError("ms is a whole number of milliseconds")
        with self._lock:
            self._records.pop(item, None)
            self._records[item] = {"item": item, "label": label, "note": note.strip(), "ms": ms}
            self._save()

    def set_note(self, item: str, note: str) -> None:
        """Changes the note of a labelled item, keeping its place and its time."""
        self._check(item, note)
        with self._lock:
            if item not in self._records:
                raise ValueError(f"item {item} has no label yet")
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


def load_examples(ui_dir: Path = UI_DIR) -> list[dict[str, Any]]:
    """The example pairs of the first screen (label_ui/examples.json)."""
    return json.loads((ui_dir / "examples.json").read_text(encoding="utf-8"))


def browser_state(label_set: dict[str, Any], store: LabelStore, examples: list[dict[str, Any]]) -> dict[str, Any]:
    """Everything the browser receives about the set. It must never carry the
    suite's result for an item (D-050): no stratum, verdict, tier, check,
    model, variant or file path, only this whitelist."""
    items = []
    for item in label_set["items"]:
        items.append({
            "id": item["id"],
            "brief": item["brief"],
            "description": describe_case(item["case"]),
            "left": {"url": f"/pictures/{item['id']}/left", "screen": item["screens"]["reference"], "rtl": False},
            "right": {"url": f"/pictures/{item['id']}/right", "screen": item["screens"]["case"],
                      "rtl": item["case"] == "dir-rtl"},
        })
    shown_examples = [{
        "kind": example["kind"], "caption": example["caption"],
        "left": {"url": f"/examples/{n}/left", "screen": example["left"]["screen"], "rtl": False},
        "right": {"url": f"/examples/{n}/right", "screen": example["right"]["screen"], "rtl": False},
    } for n, example in enumerate(examples)]
    return {"set": label_set["name"], "labels": list(LABELS), "items": items, "answers": store.labels(),
            "examples": shown_examples}


class LabelServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, label_set: dict[str, Any], store: LabelStore, *, root: Path = REPO_ROOT,
                 ui_dir: Path = UI_DIR, port: int = DEFAULT_PORT) -> None:
        self.label_set = label_set
        self.store = store
        self.ui_dir = ui_dir
        self.examples = load_examples(ui_dir)
        self.pictures = {item["id"]: {"left": resolve(item["pictures"]["reference"], root),
                                      "right": resolve(item["pictures"]["case"], root)}
                         for item in label_set["items"]}
        super().__init__((HOST, port), LabelHandler)

    @property
    def port(self) -> int:
        return self.server_address[1]

    def missing_pictures(self) -> int:
        return sum(1 for pair in self.pictures.values() for path in pair.values() if not path.is_file())


class LabelHandler(BaseHTTPRequestHandler):
    server: LabelServer

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 - the base class's name
        pass  # quiet: the terminal shows only what serve() prints

    def _allowed_host(self) -> bool:
        """Only requests addressed to this server (no DNS rebinding)."""
        return self.headers.get("Host") in (f"{HOST}:{self.server.port}", f"localhost:{self.server.port}")

    def _send(self, status: HTTPStatus, body: bytes, content_type: str, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, value: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        self._send(status, json.dumps(value, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, status: HTTPStatus, message: str) -> None:
        self._json({"error": message}, status)

    def _file(self, path: Path, content_type: str, cache: str) -> None:
        if not path.is_file():
            return self._error(HTTPStatus.NOT_FOUND, "not found")
        self._send(HTTPStatus.OK, path.read_bytes(), content_type, cache)

    def do_GET(self) -> None:  # noqa: N802 - the base class's name
        if not self._allowed_host():
            return self._error(HTTPStatus.FORBIDDEN, "unexpected host")
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            return self._file(self.server.ui_dir / "index.html", "text/html; charset=utf-8", "no-store")
        if path == "/api/state":
            return self._json(browser_state(self.server.label_set, self.server.store, self.server.examples))
        match = PICTURE_URL.match(path)
        if match and match.group(1) in self.server.pictures:
            return self._file(self.server.pictures[match.group(1)][match.group(2)], "image/png", "private, max-age=86400")
        match = EXAMPLE_URL.match(path)
        if match and int(match.group(1)) < len(self.server.examples):
            lab = self.server.examples[int(match.group(1))][match.group(2)]["lab"]
            return self._file(self.server.ui_dir / "examples" / f"{lab}.png", "image/png", "private, max-age=86400")
        self._error(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802 - the base class's name
        if not self._allowed_host():
            return self._error(HTTPStatus.FORBIDDEN, "unexpected host")
        origin = self.headers.get("Origin")
        if origin is not None and origin not in (f"http://{HOST}:{self.server.port}",
                                                 f"http://localhost:{self.server.port}"):
            return self._error(HTTPStatus.FORBIDDEN, "unexpected origin")
        if (self.headers.get("Content-Type") or "").split(";")[0].strip() != "application/json":
            return self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "send JSON")
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "too large")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("send a JSON object")
            store = self.server.store
            if self.path == "/api/answer":
                store.answer(str(body.get("item")), str(body.get("label")), body.get("note") or "", body.get("ms"))
                return self._json({"answers": store.labels()})
            if self.path == "/api/note":
                store.set_note(str(body.get("item")), body.get("note") or "")
                return self._json({"answers": store.labels()})
            if self.path == "/api/undo":
                undone = store.undo()
                return self._json({"undone": undone, "answers": store.labels()})
        except ValueError as error:
            return self._error(HTTPStatus.BAD_REQUEST, str(error))
        self._error(HTTPStatus.NOT_FOUND, "not found")


def open_tool(set_path: Path, label_set: dict[str, Any], *, port: int = DEFAULT_PORT,
              root: Path = REPO_ROOT) -> LabelServer:
    """The server for a set, with its labels loaded; not yet serving."""
    store = LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]])
    try:
        return LabelServer(label_set, store, root=root, port=port)
    except OSError as error:
        raise SetupError(f"cannot listen on {HOST}:{port} ({error}); pass another --port") from error


def serve(server: LabelServer) -> None:
    total = len(server.label_set["items"])
    done = len(server.store.labels())
    missing = server.missing_pictures()
    print(f"{server.label_set['name']}: {done} of {total} items labelled; answers are saved to "
          f"{server.store.path.relative_to(REPO_ROOT).as_posix() if server.store.path.is_relative_to(REPO_ROOT) else server.store.path}")
    if missing:
        print(f"warning: {missing} picture(s) of this set are missing from disk; such items show no picture")
    print(f"open http://{HOST}:{server.port}/ in a browser. Ctrl+C stops the tool; start it again to continue.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nstopped: {len(server.store.labels())} of {total} items labelled")
    finally:
        server.server_close()
