"""The label command: a local, blind labelling tool (docs/LABELLING.md, D-050),
and, with --adjudicate, the owner's adjudication of the disagreements (D-055).

A small HTTP server on 127.0.0.1 serves one HTML page and the pictures of a
label set.

Labelling is blind. The browser only ever receives what browser_state()
builds: the item id, the brief, the case in plain words, opaque picture URLs
and the screen widths. The set file's suite verdicts, strata, models,
variants and paths stay on the server. Answers are saved after every change
to labels/<set>.labels.jsonl (answers.py).

Adjudication is not blind, on purpose: once every item is labelled, it shows
each disagreement between the labels and the suite, one per screen, with both
clean pictures, the annotated screenshot, the suite's findings and the blind
label, and asks: the suite is right, my label is right, or we define it
differently. Answers are saved to labels/<set>.adjudication.jsonl. The page
shows nothing else about an item: no one's analysis of it.
"""

from __future__ import annotations

import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .answers import LABELS, AdjudicationStore, AnswerStore, LabelStore
from .calibrate import ADJUDICATION_TEXT, case_outputs, disagreement_ids, failed_by_suite, item_run_dir, load_labels
from .labelset import adjudication_path, describe_case, labels_path, resolve
from .paths import ARCHIVE_DIR, PACKAGE_DIR, REPO_ROOT
from .providers import SetupError

__all__ = ["LABELS", "LabelStore", "LabelServer", "browser_state", "adjudication_state", "load_examples",
           "open_tool", "serve"]

HOST = "127.0.0.1"
DEFAULT_PORT = 8765
UI_DIR = PACKAGE_DIR / "label_ui"
MAX_BODY = 16_384
PICTURE_URL = re.compile(r"^/pictures/(i\d{3,})/(left|right|annotated)$")
EXAMPLE_URL = re.compile(r"^/examples/(\d+)/(left|right)$")
#: The keys of the adjudication page, in order.
ADJUDICATION_KEYS = {"1": "suite-right", "2": "label-right", "3": "defined-differently"}


def load_examples(ui_dir: Path = UI_DIR) -> list[dict[str, Any]]:
    """The example pairs of the first screen (label_ui/examples.json)."""
    return json.loads((ui_dir / "examples.json").read_text(encoding="utf-8"))


def browser_state(label_set: dict[str, Any], store: LabelStore, examples: list[dict[str, Any]]) -> dict[str, Any]:
    """Everything the browser receives about the set when labelling. It must
    never carry the suite's result for an item (D-050): no stratum, verdict,
    tier, check, model, variant or file path, only this whitelist."""
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


def _shown_finding(finding: dict[str, Any]) -> dict[str, Any]:
    return {key: finding.get(key) for key in ("check", "severity", "text", "selector", "detail")}


def adjudication_state(label_set: dict[str, Any], labels: dict[str, dict[str, Any]], store: AdjudicationStore,
                       findings: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Everything the adjudication page receives: each disagreement with the
    suite's verdict, its findings and the blind label, and nothing more."""
    by_id = {item["id"]: item for item in label_set["items"]}
    found = disagreement_ids(label_set, labels)
    items = []
    for item_id in (*found["failedNotBroken"], *found["passedBroken"]):
        item = by_id[item_id]
        rtl = item["case"] == "dir-rtl"
        items.append({
            "id": item_id,
            "brief": item["brief"],
            "case": item["case"],
            "description": describe_case(item["case"]),
            "suite": {"verdict": "failed" if failed_by_suite(item) else "passed", "tier": item["suite"]["tier"],
                      "checks": list(item["suite"]["checks"]), "status": item["suite"]["status"]},
            "label": {"label": labels[item_id]["label"], "note": labels[item_id].get("note") or ""},
            "left": {"url": f"/pictures/{item_id}/left", "screen": item["screens"]["reference"], "rtl": False},
            "right": {"url": f"/pictures/{item_id}/right", "screen": item["screens"]["case"], "rtl": rtl},
            "annotated": {"url": f"/pictures/{item_id}/annotated", "screen": item["screens"]["case"], "rtl": rtl},
            "findings": [_shown_finding(finding) for finding in findings.get(item_id, [])],
        })
    choices = [{"key": key, "value": value, "text": ADJUDICATION_TEXT[value]} for key, value in ADJUDICATION_KEYS.items()]
    return {"mode": "adjudicate", "set": label_set["name"], "choices": choices, "items": items,
            "answers": store.answers()}


class LabelServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, label_set: dict[str, Any], store: AnswerStore, *, root: Path = REPO_ROOT,
                 ui_dir: Path = UI_DIR, port: int = DEFAULT_PORT,
                 labels: dict[str, dict[str, Any]] | None = None, archive_dir: Path = ARCHIVE_DIR) -> None:
        """`labels` (the blind labels) switches the server to adjudication."""
        self.label_set = label_set
        self.store = store
        self.ui_dir = ui_dir
        self.labels = labels
        self.examples = load_examples(ui_dir)
        runs_dir = resolve(label_set["runs"], root)

        def picture(item: dict[str, Any], key: str) -> Path:
            """Where the set recorded the picture, or, once the candidate was
            superseded (D-059), the same file in its archived run."""
            path = resolve(item["pictures"][key], root)
            return path if path.is_file() else item_run_dir(runs_dir, item, archive_dir) / path.name

        self.pictures: dict[str, dict[str, Path | None]] = {
            item["id"]: {"left": picture(item, "reference"), "right": picture(item, "case")}
            for item in label_set["items"]}
        self.findings: dict[str, list[dict[str, Any]]] = {}
        if labels is not None:
            by_id = {item["id"]: item for item in label_set["items"]}
            found = disagreement_ids(label_set, labels)
            for item_id in (*found["failedNotBroken"], *found["passedBroken"]):
                annotated, findings = case_outputs(runs_dir, by_id[item_id], archive_dir)
                self.pictures[item_id]["annotated"] = annotated
                self.findings[item_id] = findings
        super().__init__((HOST, port), LabelHandler)

    @property
    def adjudicating(self) -> bool:
        return self.labels is not None

    @property
    def port(self) -> int:
        return self.server_address[1]

    def missing_pictures(self) -> int:
        shown = self.findings.keys() if self.adjudicating else self.pictures.keys()
        return sum(1 for item in shown for path in self.pictures[item].values() if path is None or not path.is_file())

    def state(self) -> dict[str, Any]:
        if self.adjudicating:
            return adjudication_state(self.label_set, self.labels, self.store, self.findings)
        return browser_state(self.label_set, self.store, self.examples)


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

    def _file(self, path: Path | None, content_type: str, cache: str) -> None:
        if path is None or not path.is_file():
            return self._error(HTTPStatus.NOT_FOUND, "not found")
        self._send(HTTPStatus.OK, path.read_bytes(), content_type, cache)

    def do_GET(self) -> None:  # noqa: N802 - the base class's name
        if not self._allowed_host():
            return self._error(HTTPStatus.FORBIDDEN, "unexpected host")
        server = self.server
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            page = "adjudicate.html" if server.adjudicating else "index.html"
            return self._file(server.ui_dir / page, "text/html; charset=utf-8", "no-store")
        if path == "/api/state":
            return self._json(server.state())
        match = PICTURE_URL.match(path)
        if match and match.group(1) in server.pictures and match.group(2) in server.pictures[match.group(1)]:
            return self._file(server.pictures[match.group(1)][match.group(2)], "image/png", "private, max-age=86400")
        match = EXAMPLE_URL.match(path)
        if match and not server.adjudicating and int(match.group(1)) < len(server.examples):
            lab = server.examples[int(match.group(1))][match.group(2)]["lab"]
            return self._file(server.ui_dir / "examples" / f"{lab}.png", "image/png", "private, max-age=86400")
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
                store.answer(str(body.get("item")), str(body.get(store.key)), body.get("note") or "", body.get("ms"))
                return self._json({"answers": store.answers()})
            if self.path == "/api/note":
                store.set_note(str(body.get("item")), body.get("note") or "")
                return self._json({"answers": store.answers()})
            if self.path == "/api/undo":
                undone = store.undo()
                return self._json({"undone": undone, "answers": store.answers()})
        except ValueError as error:
            return self._error(HTTPStatus.BAD_REQUEST, str(error))
        self._error(HTTPStatus.NOT_FOUND, "not found")


def open_tool(set_path: Path, label_set: dict[str, Any], *, port: int = DEFAULT_PORT,
              root: Path = REPO_ROOT, adjudicate: bool = False) -> LabelServer:
    """The server for a set, with its answers loaded; not yet serving."""
    labels = None
    if adjudicate:
        labels = load_labels(set_path, label_set)
        unlabelled = len(label_set["items"]) - len(labels)
        if unlabelled:
            raise SetupError(f"{unlabelled} of {len(label_set['items'])} items have no label yet; "
                             "label every item before adjudicating")
        found = disagreement_ids(label_set, labels)
        store: AnswerStore = AdjudicationStore(adjudication_path(set_path),
                                               [*found["failedNotBroken"], *found["passedBroken"]])
    else:
        store = LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]])
    try:
        return LabelServer(label_set, store, root=root, port=port, labels=labels)
    except OSError as error:
        raise SetupError(f"cannot listen on {HOST}:{port} ({error}); pass another --port") from error


def serve(server: LabelServer) -> None:
    store = server.store
    total = len(server.findings) if server.adjudicating else len(server.label_set["items"])
    noun = "disagreements answered" if server.adjudicating else "items labelled"
    done = len(store.answers())
    missing = server.missing_pictures()
    shown = (store.path.relative_to(REPO_ROOT).as_posix() if store.path.is_relative_to(REPO_ROOT) else store.path)
    kind = "adjudication" if server.adjudicating else "labelling"
    print(f"{server.label_set['name']} {kind}: {done} of {total} {noun}; answers are saved to {shown}")
    if missing:
        print(f"warning: {missing} picture(s) of this set are missing from disk; such items show no picture")
    print(f"open http://{HOST}:{server.port}/ in a browser. Ctrl+C stops the tool; start it again to continue.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\nstopped: {len(store.answers())} of {total} {noun}")
    finally:
        server.server_close()
