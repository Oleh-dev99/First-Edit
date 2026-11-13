"""The label-set command: a blind, stratified sample of stressed cases for
human labelling (docs/LABELLING.md, D-050).

A label item is one case of one clean-baseline candidate, shown as two clean
screenshots: the case's reference render (the baseline, or viewport-320 for a
case at 320 px) and the case render. Items are drawn per stratum of the
suite's verdict, so that calibration can weight each stratum by its size:

- failed-core: every failed core case
- failed-extreme: a simple random sample of the failed extreme cases
- survived-focus: survived cases of FOCUS_CASES, where missed failures are
  most likely; at least half of the survived items
- survived-other: every other survived case

A number of items are then repeated to measure self-consistency, and the
whole list is shuffled. The set file records each item's suite verdict, so it
is never sent to the labelling tool's browser (labeltool.py sends a whitelist).
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Any

from .paths import REPO_ROOT
from .providers import SetupError
from .stress import baseline_state
from .summarize import CASES, CHECKS, STRESS_SCHEMA_VERSION, SUITE_PATTERN, SUITE_VERSION

SET_SCHEMA_VERSION = 1

#: Plain-language descriptions of the content and environment mutations; a
#: case at 320 px adds ", phone width".
MUTATION_DESCRIPTIONS = {
    "text-long": "longer text, as after translation",
    "text-longword": "a 30-letter word",
    "text-unbroken": "a 60-letter word",
    "text-empty": "optional text left empty",
    "list-0": "empty lists",
    "list-1": "lists with one item",
    "list-many": "lists ten times longer",
    "number-large": "very large numbers",
    "viewport-320": "phone width",
    "text-200pct": "text at 200% size",
    "dir-rtl": "right-to-left page",
}

#: Survived cases where missed failures are most likely; at least half of the
#: survived items come from these.
FOCUS_CASES = ("text-longword@320", "text-long@320", "number-large@320", "list-many", "viewport-320", "text-200pct")

STRATA = ("failed-core", "failed-extreme", "survived-focus", "survived-other")

#: The composition of a set (docs/LABELLING.md).
FAILED_EXTREME = 40
SURVIVED = 120
FOCUS_SHARE = 0.5
REPEATS = 20
#: The fewest items between an item and its repeat that the shuffle aims for.
MIN_GAP = 10
#: Shuffles tried to reach MIN_GAP before the one with the widest gap is kept.
SHUFFLE_TRIES = 1000


def describe_case(case_id: str) -> str:
    """The case in plain words, e.g. "a 30-letter word, phone width"."""
    mutation, _, at = case_id.partition("@")
    description = MUTATION_DESCRIPTIONS[mutation]
    return f"{description}, phone width" if at == "320" else description


def labels_path(set_path: Path) -> Path:
    """Where the labels of a set are saved: labels/set-01.json -> labels/set-01.labels.jsonl."""
    return set_path.with_name(f"{set_path.stem}.labels.jsonl")


def _relative(path: Path, root: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()


def resolve(path: str, root: Path = REPO_ROOT) -> Path:
    """A path recorded in a set: relative to the repository root, or absolute."""
    candidate = Path(path)
    return candidate if candidate.is_absolute() else root / candidate


def _read_summary(path: Path) -> dict[str, Any]:
    summary = json.loads(path.read_text(encoding="utf-8"))
    if summary.get("schemaVersion") != STRESS_SCHEMA_VERSION:
        raise SetupError(f"{path} has stress schema {summary.get('schemaVersion')}; label-set reads schema "
                         f"{STRESS_SCHEMA_VERSION}")
    if not SUITE_PATTERN.match(str(summary.get("suite", SUITE_VERSION))):
        raise SetupError(f"{path} was run with suite {summary.get('suite')}; label-set reads suite {SUITE_VERSION}")
    return summary


def collect_cases(runs_dir: Path, root: Path = REPO_ROOT) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    """Every applicable case of every clean-baseline model candidate in
    runs_dir, by stratum, in a fixed order; and counts of what was read."""
    pools: dict[str, list[dict[str, Any]]] = {stratum: [] for stratum in STRATA}
    states = {"clean": 0, "born-broken": 0, "baseline-crash": 0}
    no_screenshot = 0
    suites = set()
    order = {case: index for index, case in enumerate(CASES)}
    for summary_file in sorted(runs_dir.glob("*/*/summary.json")):
        summary = _read_summary(summary_file)
        candidate = summary.get("candidate") or ""
        if not candidate or candidate.startswith("_"):
            continue  # samples and references are not model output
        state = baseline_state(summary)
        states[state] += 1
        if state != "clean":
            continue
        suites.add(str(summary.get("suite", SUITE_VERSION)))
        run_dir = summary_file.parent
        baseline = summary["baseline"]
        entries = {entry["id"]: entry for entry in summary["cases"]}
        references = {"baseline": ((baseline.get("files") or {}).get("screenshot"),
                                   (baseline.get("viewport") or {}).get("width", 1280))}
        narrow = entries.get("viewport-320")
        if narrow is not None:
            references["viewport-320"] = (((narrow.get("files") or {}).get("screenshot")),
                                          (narrow.get("viewport") or {}).get("width", 320))
        harness = summary.get("harness") or {"commit": None, "dirty": None}
        for entry in sorted((e for e in summary["cases"] if e.get("applicable")), key=lambda e: order.get(e["id"], 99)):
            case_id = entry["id"]
            reference = entry.get("reference") or ("viewport-320" if case_id.endswith("@320") else "baseline")
            reference_file, reference_width = references.get(reference, (None, None))
            case_file = (entry.get("files") or {}).get("screenshot")
            if not reference_file or not case_file or not (run_dir / reference_file).is_file() \
                    or not (run_dir / case_file).is_file():
                no_screenshot += 1
                continue
            survived = bool(entry.get("survived"))
            if survived:
                stratum = "survived-focus" if case_id in FOCUS_CASES else "survived-other"
            else:
                stratum = "failed-extreme" if entry.get("tier") == "extreme" else "failed-core"
            pools[stratum].append({
                "candidate": candidate,
                "brief": summary.get("brief") or candidate.split("/")[1],
                "case": case_id,
                "suite": {
                    "tier": entry.get("tier"),
                    "status": entry.get("status"),
                    "survived": survived,
                    "checks": [check for check in CHECKS if (entry.get("newErrors") or {}).get(check)],
                },
                "harness": {"commit": harness.get("commit"), "dirty": harness.get("dirty")},
                "pictures": {"reference": _relative(run_dir / reference_file, root),
                             "case": _relative(run_dir / case_file, root)},
                "screens": {"reference": reference_width, "case": (entry.get("viewport") or {}).get("width")},
            })
    counts = {"candidates": {"clean": states["clean"], "bornBroken": states["born-broken"],
                             "baselineCrash": states["baseline-crash"]},
              "skippedNoScreenshot": no_screenshot, "suites": sorted(suites)}
    return pools, counts


def _gap(order: list[int], pairs: list[tuple[int, int]]) -> int:
    """The smallest distance between an item and its repeat in `order`."""
    if not pairs:
        return len(order)
    position = {entry: index for index, entry in enumerate(order)}
    return min(abs(position[a] - position[b]) for a, b in pairs)


def build_label_set(runs_dir: Path, name: str, seed: int, *, root: Path = REPO_ROOT,
                    failed_extreme: int = FAILED_EXTREME, survived: int = SURVIVED, focus_share: float = FOCUS_SHARE,
                    repeats: int = REPEATS, min_gap: int = MIN_GAP) -> dict[str, Any]:
    """The label set for the stress results in runs_dir: deterministic for a seed."""
    pools, counts = collect_cases(runs_dir, root)
    rng = random.Random(seed)
    drawn: dict[str, list[dict[str, Any]]] = {"failed-core": list(pools["failed-core"])}
    drawn["failed-extreme"] = rng.sample(pools["failed-extreme"], min(failed_extreme, len(pools["failed-extreme"])))
    focus_pool, other_pool = pools["survived-focus"], pools["survived-other"]
    focus_target = math.ceil(survived * focus_share)
    focus_count = min(len(focus_pool), max(focus_target, survived - len(other_pool)))
    other_count = min(len(other_pool), survived - focus_count)
    drawn["survived-focus"] = rng.sample(focus_pool, focus_count)
    drawn["survived-other"] = rng.sample(other_pool, other_count)

    primaries = [{**case, "stratum": stratum, "stratumSize": len(pools[stratum])}
                 for stratum in STRATA for case in drawn[stratum]]
    originals = sorted(rng.sample(range(len(primaries)), min(repeats, len(primaries))))
    entries = [*range(len(primaries)), *(len(primaries) + n for n in range(len(originals)))]
    pairs = [(original, len(primaries) + n) for n, original in enumerate(originals)]

    best, best_gap = None, -1
    for _ in range(SHUFFLE_TRIES):
        order = list(entries)
        rng.shuffle(order)
        gap = _gap(order, pairs)
        if gap > best_gap:
            best, best_gap = order, gap
        if gap >= min_gap:
            break
    assert best is not None

    ids = {entry: f"i{index:03d}" for index, entry in enumerate(best, 1)}
    items = []
    for entry in best:
        if entry < len(primaries):
            item, repeat_of = primaries[entry], None
        else:
            original = originals[entry - len(primaries)]
            item, repeat_of = primaries[original], ids[original]
        items.append({"id": ids[entry], **item, "repeatOf": repeat_of})

    composition = {
        "strata": {stratum: {"size": len(pools[stratum]), "drawn": len(drawn[stratum])} for stratum in STRATA},
        "focusCases": list(FOCUS_CASES),
        "focusShareOfSurvived": (focus_count / (focus_count + other_count)) if focus_count + other_count else None,
        "repeats": len(originals),
        "items": len(items),
        "smallestRepeatGap": best_gap if pairs else None,
        **counts,
    }
    return {"schemaVersion": SET_SCHEMA_VERSION, "name": name, "seed": seed, "runs": _relative(runs_dir, root),
            "composition": composition, "items": items}


def dumps_label_set(label_set: dict[str, Any]) -> str:
    """The set as JSON, one item per line so that sets diff cleanly."""
    head = {key: value for key, value in label_set.items() if key != "items"}
    lines = json.dumps(head, indent=2, ensure_ascii=False)[:-2].splitlines()
    items = [json.dumps(item, ensure_ascii=False) for item in label_set["items"]]
    lines[-1] += ","
    lines.append('  "items": [')
    lines += [f"    {item}{',' if n < len(items) - 1 else ''}" for n, item in enumerate(items)]
    lines += ["  ]", "}"]
    return "\n".join(lines) + "\n"


def write_label_set(label_set: dict[str, Any], path: Path) -> None:
    if path.exists():
        raise SetupError(f"{path} exists; a label set is never rebuilt once made, so pick a new --name")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps_label_set(label_set), encoding="utf-8", newline="\n")


def load_label_set(path: Path) -> dict[str, Any]:
    """A label set file, checked for its schema, unique ids and repeat references."""
    try:
        label_set = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SetupError(f"cannot read the label set {path}: {error}") from error
    if label_set.get("schemaVersion") != SET_SCHEMA_VERSION:
        raise SetupError(f"{path} has set schema {label_set.get('schemaVersion')}; expected {SET_SCHEMA_VERSION}")
    ids = [item["id"] for item in label_set["items"]]
    if len(set(ids)) != len(ids):
        raise SetupError(f"{path} has duplicate item ids")
    known = set(ids)
    for item in label_set["items"]:
        if item.get("repeatOf") is not None and item["repeatOf"] not in known:
            raise SetupError(f"{path}: item {item['id']} repeats an unknown item {item['repeatOf']}")
        if item.get("stratum") not in STRATA:
            raise SetupError(f"{path}: item {item['id']} has an unknown stratum {item.get('stratum')}")
    return label_set


def format_composition(label_set: dict[str, Any]) -> str:
    composition = label_set["composition"]
    rows = [f"{stratum:<16} {data['drawn']:>5} of {data['size']}" for stratum, data in composition["strata"].items()]
    share = composition["focusShareOfSurvived"]
    lines = [f"label set {label_set['name']} (seed {label_set['seed']}) from {label_set['runs']}:",
             *rows,
             f"{'repeats':<16} {composition['repeats']:>5}",
             f"{'items':<16} {composition['items']:>5}",
             f"focus cases make up {share:.0%} of the survived items" if share is not None else "no survived items",
             f"candidates: {composition['candidates']['clean']} clean baseline (labelled), "
             f"{composition['candidates']['bornBroken']} born broken and "
             f"{composition['candidates']['baselineCrash']} baseline crash (not labelled); "
             f"{composition['skippedNoScreenshot']} case(s) without both screenshots left out"]
    if composition["smallestRepeatGap"] is not None:
        lines.append(f"an item and its repeat are at least {composition['smallestRepeatGap']} items apart")
    return "\n".join(lines)
