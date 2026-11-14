"""The calibrate command: the suite's verdicts against blind human labels
(docs/LABELLING.md, D-050, D-051, D-055, D-056).

Reads a label set (labelset.py), its labels (answers.py) and the stress
results it was drawn from, and writes summary.json, report.md and
gallery.html:

- precision: of the items the suite failed, the share labelled broken;
- miss rate: of the items the suite passed, the share labelled broken;
- estimated recall over all cases, weighting each stratum by its size;
- "other" labels, self-consistency on the repeated items, and a gallery of
  every item where the label and the suite disagree.

Every rate counts each case once (a repeat only measures self-consistency)
and leaves out "unsure"; "other" counts as not broken (D-051). Every rate is
given twice: over all items, and over the unguided items only, leaving out
the cases discussed with someone before labelling (D-056). The blind rates
come first; below them, when the owner has adjudicated the disagreements,
precision and the miss rate again with every "the suite is right" answer in
place of the blind label (D-055).
"""

from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path
from typing import Any

from .answers import ADJUDICATIONS, LABELS, AdjudicationStore, LabelStore
from .labelset import STRATA, adjudication_path, guided_path, labels_path
from .paths import ARCHIVE_DIR, REPO_ROOT
from .providers import SetupError
from .summarize import CHECKS, GALLERY_STYLE, _ci, _figure, _finding, _pct, _share, rounded

CALIBRATION_SCHEMA_VERSION = 2
#: Labels that judge an item; "unsure" is reported and left out of every rate.
RATED = ("broken", "fine", "other")
#: The per-check row for failed items without a check (a render error or a timeout).
NO_CHECK = "render error or timeout"
FAILED_STRATA = ("failed-core", "failed-extreme")
SURVIVED_STRATA = ("survived-focus", "survived-other")
#: Every label set has one labeller (docs/LABELLING.md, Limitations).
LABELLERS = 1
#: How the report and the adjudication tool name each answer.
ADJUDICATION_TEXT = {
    "suite-right": "the suite is right",
    "label-right": "my label is right",
    "defined-differently": "we define it differently",
}


def failed_by_suite(item: dict[str, Any]) -> bool:
    return item["stratum"] in FAILED_STRATA


def _display(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix() if path.is_relative_to(REPO_ROOT) else path.as_posix()


def load_labels(set_path: Path, label_set: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The saved answers of a set, by item id."""
    store = LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]])
    return {record["item"]: record for record in store.records()}


def load_guided(set_path: Path, label_set: dict[str, Any]) -> dict[str, Any]:
    """The guided items (D-056) from labels/<set>.guided.json, and the cases
    they make: an item and its repeat show one case, so when either was
    discussed, both are guided."""
    path = guided_path(set_path)
    by_id = {item["id"]: item for item in label_set["items"]}
    if not path.is_file():
        return {"file": None, "reason": None, "items": [], "cases": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except ValueError as error:
        raise SetupError(f"{path}: {error}") from error
    if not isinstance(data, dict) or data.get("set") != label_set["name"] or not isinstance(data.get("items"), list):
        raise SetupError(f'{path}: expected {{"set": "{label_set["name"]}", "items": [...]}}')
    unknown = [item for item in data["items"] if item not in by_id]
    if unknown:
        raise SetupError(f"{path}: not items of {label_set['name']}: {', '.join(map(str, unknown))}")
    cases = sorted({by_id[item].get("repeatOf") or item for item in data["items"]})
    return {"file": _display(path), "reason": data.get("reason"), "items": sorted(data["items"]), "cases": cases}


def disagreement_ids(label_set: dict[str, Any], labels: dict[str, dict[str, Any]]) -> dict[str, list[str]]:
    """Primary items where the blind label and the suite differ: failed but
    labelled fine or other, and passed but labelled broken."""
    primaries = [item for item in label_set["items"] if item.get("repeatOf") is None]
    label_of = lambda item: labels.get(item["id"], {}).get("label")  # noqa: E731
    return {"failedNotBroken": [item["id"] for item in primaries
                                if failed_by_suite(item) and label_of(item) in ("fine", "other")],
            "passedBroken": [item["id"] for item in primaries
                             if not failed_by_suite(item) and label_of(item) == "broken"]}


def item_run_dir(runs_dir: Path, item: dict[str, Any], archive_dir: Path = ARCHIVE_DIR) -> Path:
    """An item's stress run in runs_dir or, once its candidate was superseded
    (D-059), in the archive folder that mirrors runs_dir
    (results/archive/<corpus>/<runs directory name>/)."""
    name = item["candidate"].replace("/", "__")
    run_dir = runs_dir / item["brief"] / name
    if run_dir.is_dir() or not archive_dir.is_dir():
        return run_dir
    for folder in sorted(p for p in archive_dir.iterdir() if p.is_dir()):
        moved = folder / runs_dir.name / item["brief"] / name
        if moved.is_dir():
            return moved
    return run_dir


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def case_outputs(runs_dir: Path, item: dict[str, Any],
                 archive_dir: Path = ARCHIVE_DIR) -> tuple[Path | None, list[dict[str, Any]]]:
    """An item's annotated screenshot and new findings, read from its run."""
    run_dir = item_run_dir(runs_dir, item, archive_dir)
    summary = _read_json(run_dir / "summary.json") or {}
    entry = next((e for e in summary.get("cases", []) if e.get("id") == item["case"]), {})
    files = entry.get("files") or {}
    result = _read_json(run_dir / files["result"]) if files.get("result") else None
    annotated = run_dir / files["annotated"] if files.get("annotated") else None
    return annotated, list((result or {}).get("newFindings") or [])


def load_adjudication(set_path: Path, label_set: dict[str, Any]) -> dict[str, dict[str, Any]] | None:
    """The owner's adjudication answers by item id, or None without the file."""
    path = adjudication_path(set_path)
    if not path.is_file():
        return None
    store = AdjudicationStore(path, [item["id"] for item in label_set["items"]])
    return {record["item"]: record for record in store.records()}


def _rated_share(items: list[dict[str, Any]], labels: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Broken / rated items (labelled broken, fine or other), with a Wilson interval."""
    rated = [item for item in items if labels.get(item["id"], {}).get("label") in RATED]
    broken = sum(1 for item in rated if labels[item["id"]]["label"] == "broken")
    return _share(broken, len(rated))


def recall_estimate(primaries: list[dict[str, Any]], labels: dict[str, dict[str, Any]],
                    sizes: dict[str, int]) -> dict[str, Any]:
    """Recall over all cases of the population: the estimated broken cases the
    suite failed, over all estimated broken cases. Each stratum's broken count
    is its size times the share of its rated items labelled broken."""
    strata = {}
    for stratum in STRATA:
        share = _rated_share([item for item in primaries if item["stratum"] == stratum], labels)
        size = sizes.get(stratum, 0)
        estimated = 0.0 if size == 0 else (size * share["share"] if share["of"] else None)
        strata[stratum] = {"size": size, "rated": share["of"], "broken": share["count"], "estimatedBroken": estimated}
    if any(entry["estimatedBroken"] is None for entry in strata.values()):
        missing = [s for s, entry in strata.items() if entry["estimatedBroken"] is None]
        return {"estimate": None, "reason": f"no rated item in {', '.join(missing)}", "strata": strata}
    caught = sum(strata[s]["estimatedBroken"] for s in FAILED_STRATA)
    missed = sum(strata[s]["estimatedBroken"] for s in SURVIVED_STRATA)
    if caught + missed == 0:
        return {"estimate": None, "reason": "no item is labelled broken", "strata": strata}
    return {"estimate": caught / (caught + missed), "reason": None, "strata": strata,
            "estimatedBroken": {"failedBySuite": caught, "passedBySuite": missed}}


def harness_check(items: list[dict[str, Any]], runs_dir: Path, archive_dir: Path = ARCHIVE_DIR) -> dict[str, int]:
    """Items whose run in runs_dir is missing, or was stressed again with
    another harness commit since the set was built, and items whose run is
    read from the archive because their candidate was superseded (D-059)."""
    summaries: dict[Path, dict[str, Any] | None] = {}
    changed = missing = archived = 0
    for item in items:
        run_dir = item_run_dir(runs_dir, item, archive_dir)
        archived += run_dir.is_relative_to(archive_dir)
        if run_dir not in summaries:
            summaries[run_dir] = _read_json(run_dir / "summary.json")
        summary = summaries[run_dir]
        if summary is None:
            missing += 1
        elif (summary.get("harness") or {}).get("commit") != (item.get("harness") or {}).get("commit"):
            changed += 1
    return {"items": len(items), "changed": changed, "missingRuns": missing, "archived": archived}


def _counts(group: list[dict[str, Any]], labels: dict[str, dict[str, Any]]) -> dict[str, int]:
    found = Counter(labels.get(item["id"], {}).get("label") or "unlabelled" for item in group)
    return {label: found.get(label, 0) for label in (*LABELS, "unlabelled")}


def _precision(failed: list[dict[str, Any]], labels: dict[str, dict[str, Any]], *,
               by_check: bool = True) -> dict[str, Any]:
    precision = {"all": _rated_share(failed, labels),
                 "core": _rated_share([item for item in failed if item["stratum"] == "failed-core"], labels),
                 "extreme": _rated_share([item for item in failed if item["stratum"] == "failed-extreme"], labels)}
    if by_check:
        checks = {check: _rated_share([item for item in failed if check in item["suite"]["checks"]], labels)
                  for check in CHECKS}
        checks[NO_CHECK] = _rated_share([item for item in failed if not item["suite"]["checks"]], labels)
        precision["byCheck"] = {check: share for check, share in checks.items() if share["of"]}
    return precision


def _miss_rate(survived: list[dict[str, Any]], labels: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return {"all": _rated_share(survived, labels),
            **{stratum: _rated_share([item for item in survived if item["stratum"] == stratum], labels)
               for stratum in SURVIVED_STRATA}}


def _rates(primaries: list[dict[str, Any]], repeats: list[dict[str, Any]], by_id: dict[str, dict[str, Any]],
           labels: dict[str, dict[str, Any]], sizes: dict[str, int]) -> dict[str, Any]:
    """Every rate over the given primary items and repeats."""
    label_of = lambda item: labels.get(item["id"], {}).get("label")  # noqa: E731
    failed = [item for item in primaries if failed_by_suite(item)]
    survived = [item for item in primaries if not failed_by_suite(item)]
    other = [item for item in primaries if label_of(item) == "other"]
    pairs = [(by_id[item["repeatOf"]], item) for item in repeats]
    both = [(first, second) for first, second in pairs if label_of(first) and label_of(second)]
    same = sum(1 for first, second in both if label_of(first) == label_of(second))
    differing = [{"item": first["id"], "repeat": second["id"], "first": label_of(first), "second": label_of(second)}
                 for first, second in both if label_of(first) != label_of(second)]
    return {
        "labels": _counts(primaries, labels),
        "precision": _precision(failed, labels),
        "missRate": _miss_rate(survived, labels),
        "recall": recall_estimate(primaries, labels, sizes),
        "other": {"count": len(other), "failedBySuite": sum(1 for item in other if failed_by_suite(item))},
        "unsure": sum(1 for item in primaries if label_of(item) == "unsure"),
        "selfConsistency": {**_share(same, len(both)), "differing": differing},
    }


def adjudicated_labels(label_set: dict[str, Any], labels: dict[str, dict[str, Any]],
                       answers: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """The labels after adjudication (D-055): every disagreement answered "the
    suite is right" takes the suite's verdict (broken for a failed item, fine
    for a passed one); every other answer, and no answer, keeps the blind label."""
    by_id = {item["id"]: item for item in label_set["items"]}
    found = disagreement_ids(label_set, labels)
    after = dict(labels)
    for item_id in (*found["failedNotBroken"], *found["passedBroken"]):
        if answers.get(item_id, {}).get("answer") == "suite-right":
            label = "broken" if failed_by_suite(by_id[item_id]) else "fine"
            after[item_id] = {**labels[item_id], "label": label}
    return after


def build_calibration(label_set: dict[str, Any], labels: dict[str, dict[str, Any]], runs_dir: Path, *,
                      partial: bool = False, guided: dict[str, Any] | None = None,
                      adjudication: dict[str, dict[str, Any]] | None = None,
                      adjudication_file: str | None = None, archive_dir: Path = ARCHIVE_DIR) -> dict[str, Any]:
    """The calibration numbers; refuses while an item has no label, unless `partial`."""
    items = label_set["items"]
    unlabelled = [item for item in items if item["id"] not in labels]
    if unlabelled and not partial:
        raise SetupError(f"{len(unlabelled)} of {len(items)} items have no label yet; label every item, "
                         "or pass --partial for numbers over the labelled items only")
    guided = guided or {"file": None, "reason": None, "items": [], "cases": []}
    guided_cases = set(guided["cases"])
    primaries = [item for item in items if item.get("repeatOf") is None]
    repeats = [item for item in items if item.get("repeatOf") is not None]
    by_id = {item["id"]: item for item in items}
    sizes = {stratum: data["size"] for stratum, data in label_set["composition"]["strata"].items()}

    by_stratum = {stratum: {"size": sizes.get(stratum, 0),
                            "drawn": sum(1 for item in primaries if item["stratum"] == stratum),
                            **_counts([item for item in primaries if item["stratum"] == stratum], labels)}
                  for stratum in STRATA}
    blind = _rates(primaries, repeats, by_id, labels, sizes)
    unguided_primaries = [item for item in primaries if item["id"] not in guided_cases]
    unguided_repeats = [item for item in repeats if item["repeatOf"] not in guided_cases]
    unguided = _rates(unguided_primaries, unguided_repeats, by_id, labels, sizes)

    found = disagreement_ids(label_set, labels)
    summary = {
        "schemaVersion": CALIBRATION_SCHEMA_VERSION,
        "set": label_set["name"],
        "seed": label_set["seed"],
        "runs": label_set["runs"],
        "partial": bool(unlabelled),
        "labellers": LABELLERS,
        "items": {"total": len(items), "labelled": len(items) - len(unlabelled), "unlabelled": len(unlabelled),
                  "primary": len(primaries), "repeats": len(repeats)},
        "labels": blind["labels"],
        "byStratum": by_stratum,
        "repeatLabels": _counts(repeats, labels),
        "precision": blind["precision"],
        "missRate": blind["missRate"],
        "recall": blind["recall"],
        "other": blind["other"],
        "unsure": blind["unsure"],
        "selfConsistency": blind["selfConsistency"],
        "disagreements": found,
        "harness": harness_check(items, runs_dir, archive_dir),
        "guided": {**guided, "byStratum": {stratum: sum(1 for item in primaries if item["id"] in guided_cases
                                                        and item["stratum"] == stratum) for stratum in STRATA}},
        "unguided": {"items": {"primary": len(unguided_primaries), "repeats": len(unguided_repeats)}, **unguided},
        "adjudication": None,
    }
    if adjudication is not None:
        summary["adjudication"] = _adjudication(label_set, labels, adjudication, adjudication_file, guided_cases)
    return summary


def _adjudication(label_set: dict[str, Any], labels: dict[str, dict[str, Any]],
                  answers: dict[str, dict[str, Any]], file: str | None, guided_cases: set[str]) -> dict[str, Any]:
    found = disagreement_ids(label_set, labels)
    ids = [*found["failedNotBroken"], *found["passedBroken"]]
    after = adjudicated_labels(label_set, labels, answers)
    primaries = [item for item in label_set["items"] if item.get("repeatOf") is None]
    unguided = [item for item in primaries if item["id"] not in guided_cases]

    def rates(group: list[dict[str, Any]]) -> dict[str, Any]:
        return {"precision": _precision([item for item in group if failed_by_suite(item)], after, by_check=False),
                "missRate": {"all": _rated_share([item for item in group if not failed_by_suite(item)], after)}}

    counts = Counter(answers[item_id]["answer"] for item_id in ids if item_id in answers)
    return {
        "file": file,
        "disagreements": len(ids),
        "answered": sum(counts.values()),
        "answers": {answer: counts.get(answer, 0) for answer in ADJUDICATIONS},
        "unanswered": [item_id for item_id in ids if item_id not in answers],
        "definedDifferently": [item_id for item_id in ids
                               if answers.get(item_id, {}).get("answer") == "defined-differently"],
        "notDisagreements": sorted(item_id for item_id in answers if item_id not in ids),
        "all": rates(primaries),
        "unguided": rates(unguided),
    }


# --- report.md -------------------------------------------------------------------


def _rate(share: dict[str, Any]) -> list[str]:
    return [f"{share['count']}/{share['of']}", _pct(share["share"]), _ci(share["ci95"])]


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header),
            *("| " + " | ".join(row) + " |" for row in rows)]


RATE_HEADER = ["items", "labelled broken", "share", "95% interval",
               "unguided: labelled broken", "share", "95% interval"]


def _twice(name: str, every: dict[str, Any], unguided: dict[str, Any] | None) -> list[str]:
    """One row: a rate over all items, then over the unguided items."""
    return [name, *_rate(every), *(_rate(unguided) if unguided is not None else ["-", "-", "-"])]


def _guided_sentence(summary: dict[str, Any], set_name: str) -> str:
    guided = summary["guided"]
    if not guided["file"]:
        return (f"No guided items are recorded (labels/{set_name}.guided.json does not exist), so the rates over "
                "unguided items equal the rates over all items (D-056).")
    reason = f" ({guided['reason']})" if guided["reason"] else ""
    return (f"Guided items (D-056): {len(guided['items'])} item(s){reason}, listed in {guided['file']}. An item and "
            f"its repeat show one case, so they make {len(guided['cases'])} guided case(s). Every rate is given "
            "twice: over all items, and over the unguided items only.")


def render_report(summary: dict[str, Any]) -> str:
    items = summary["items"]
    unguided = summary["unguided"]
    out = ["# Calibration report", ""]
    if summary["partial"]:
        out += [f"**Partial: {items['labelled']} of {items['total']} items are labelled** (calibrate --partial). "
                "Every number below covers the labelled items only and will change as labelling goes on.", ""]
    out += [
        f"Generated by `python -m first_edit calibrate` for label set {summary['set']} (seed {summary['seed']}), "
        f"drawn from {summary['runs']}. The labeller saw the two clean screenshots of each item, the brief and the "
        "case in plain words, and nothing of the suite's result (D-050). Each case counts once; a repeated item only "
        "measures self-consistency. \"unsure\" is left out of every rate; \"other\" counts as not broken (D-051). "
        f"Labellers: {summary['labellers']}.", "",
        _guided_sentence(summary, summary["set"]), ""]
    harness = summary["harness"]
    if harness["changed"] or harness["missingRuns"]:
        out += [f"Warning: {harness['changed']} item(s) were stressed again with another harness commit since the "
                f"set was built, and {harness['missingRuns']} have no run in the runs directory; their findings and "
                "annotated screenshots may not match what was labelled.", ""]
    if harness.get("archived"):
        out += [f"{harness['archived']} of {harness['items']} items come from candidates superseded since the set was "
                "built (a brief's text changed, D-059). They still measure the suite: their runs, pictures included, "
                "are read from the archive.", ""]

    out += ["## Items labelled", "",
            "Primary items per stratum (each case once), then the repeats. Size is the number of cases in the "
            "stratum when the set was built; guided is the number of its drawn cases that are guided.", ""]
    guided_counts = summary["guided"]["byStratum"]
    rows = [[stratum, str(data["size"]), str(data["drawn"]), *(str(data[label]) for label in (*LABELS, "unlabelled")),
             str(guided_counts.get(stratum, 0))]
            for stratum, data in summary["byStratum"].items()]
    repeat = summary["repeatLabels"]
    rows.append(["repeats", "-", str(items["repeats"]), *(str(repeat[label]) for label in (*LABELS, "unlabelled")),
                 "-"])
    labels = summary["labels"]
    rows.append(["all primary items", "-", str(items["primary"]),
                 *(str(labels[label]) for label in (*LABELS, "unlabelled")), str(len(summary["guided"]["cases"]))])
    out += _table(["stratum", "size", "drawn", *LABELS, "unlabelled", "guided"], rows)

    precision, unguided_precision = summary["precision"], unguided["precision"]
    out += ["", "## Precision", "",
            "Of the items the suite failed, the share labelled broken, with a 95% Wilson interval, over all items "
            "and over the unguided items. Per check, an item counts for every check with new errors in it.", ""]
    rows = [_twice("failed, all", precision["all"], unguided_precision["all"]),
            _twice("failed, core cases", precision["core"], unguided_precision["core"]),
            _twice("failed, extreme cases", precision["extreme"], unguided_precision["extreme"])]
    rows += [_twice(f"check: {check}", share, unguided_precision["byCheck"].get(check))
             for check, share in precision["byCheck"].items()]
    out += _table(RATE_HEADER, rows)

    miss, unguided_miss = summary["missRate"], unguided["missRate"]
    out += ["", "## Miss rate", "", "Of the items the suite passed, the share labelled broken.", ""]
    out += _table(RATE_HEADER, [_twice("passed, all", miss["all"], unguided_miss["all"]),
                                *(_twice(f"passed, {stratum}", miss[stratum], unguided_miss[stratum])
                                  for stratum in SURVIVED_STRATA)])

    recall, unguided_recall = summary["recall"], unguided["recall"]
    out += ["", "## Estimated recall", "",
            "The share of all broken cases that the suite fails, over every case of the clean-baseline candidates "
            "the set was drawn from. Each stratum's broken cases are estimated as its size times the share of its "
            "rated items labelled broken. This is an estimate from a sample: it carries the sampling error of every "
            "stratum, so no interval is given, and it holds only for the runs the set was drawn from.", ""]

    def estimated(data: dict[str, Any]) -> str:
        return "-" if data["estimatedBroken"] is None else f"{data['estimatedBroken']:.1f}"

    out += _table(["stratum", "size", "rated", "labelled broken", "estimated broken cases",
                   "unguided: rated", "labelled broken", "estimated broken cases"],
                  [[stratum, str(data["size"]), str(data["rated"]), str(data["broken"]), estimated(data),
                    str(unguided_recall["strata"][stratum]["rated"]), str(unguided_recall["strata"][stratum]["broken"]),
                    estimated(unguided_recall["strata"][stratum])]
                   for stratum, data in recall["strata"].items()])

    def recall_text(value: dict[str, Any]) -> str:
        return f"**{_pct(value['estimate'])}**" if value["estimate"] is not None else f"not available ({value['reason']})"

    out += ["", f"Estimated recall: {recall_text(recall)} over all items; {recall_text(unguided_recall)} over the "
                "unguided items."]

    other, unguided_other = summary["other"], unguided["other"]
    out += ["", "## Other and unsure", "",
            f"- \"other\" (something looks wrong, but not a kind the suite checks for): {other['count']} item(s), "
            f"{other['failedBySuite']} of them failed by the suite; unguided: {unguided_other['count']}, "
            f"{unguided_other['failedBySuite']} failed.",
            f"- \"unsure\": {summary['unsure']} item(s), left out of the rates; unguided: {unguided['unsure']}."]

    consistency, unguided_consistency = summary["selfConsistency"], unguided["selfConsistency"]
    out += ["", "## Self-consistency", "",
            f"Repeated items labelled the same both times: {consistency['count']}/{consistency['of']} "
            f"({_pct(consistency['share'])}, 95% interval {_ci(consistency['ci95'])}); unguided: "
            f"{unguided_consistency['count']}/{unguided_consistency['of']} ({_pct(unguided_consistency['share'])}, "
            f"95% interval {_ci(unguided_consistency['ci95'])})."]
    for pair in consistency["differing"]:
        out.append(f"- {pair['item']} and its repeat {pair['repeat']}: {pair['first']}, then {pair['second']}")

    disagreements = summary["disagreements"]
    out += ["", "## Disagreements", "",
            f"Failed by the suite but labelled fine or other: {len(disagreements['failedNotBroken'])}. "
            f"Passed by the suite but labelled broken: {len(disagreements['passedBroken'])}. "
            "gallery.html shows each with both pictures, the annotated screenshot, the findings and the note."]
    out += _adjudication_section(summary)
    return "\n".join(out) + "\n"


def _adjudication_section(summary: dict[str, Any]) -> list[str]:
    adjudication = summary["adjudication"]
    if adjudication is None:
        return ["", f"No adjudication yet: labels/{summary['set']}.adjudication.jsonl does not exist, so the rates "
                    "after adjudication are left out (D-055)."]
    out = ["", "## After adjudication", "",
           "Not blind. The labeller saw each disagreement again with the suite's result (both clean pictures, the "
           "annotated screenshot and the findings) and answered: the suite is right, my label is right, or we "
           "define it differently (D-055). Below, every \"the suite is right\" answer replaces the blind label; "
           "every other answer keeps it. The blind rates above are unchanged.", "",
           f"Answered: {adjudication['answered']} of {adjudication['disagreements']} disagreements "
           f"(from {adjudication['file']}).", ""]
    out += _table(["answer", "items"], [[ADJUDICATION_TEXT[answer], str(count)]
                                        for answer, count in adjudication["answers"].items()]
                  + [["not answered yet", str(len(adjudication["unanswered"]))]])
    every, unguided = adjudication["all"], adjudication["unguided"]
    out += [""] + _table(RATE_HEADER, [
        _twice("precision: failed, all", every["precision"]["all"], unguided["precision"]["all"]),
        _twice("precision: failed, core cases", every["precision"]["core"], unguided["precision"]["core"]),
        _twice("precision: failed, extreme cases", every["precision"]["extreme"], unguided["precision"]["extreme"]),
        _twice("miss rate: passed, all", every["missRate"]["all"], unguided["missRate"]["all"])])
    defined = adjudication["definedDifferently"]
    out += ["", f"\"We define it differently\": {len(defined)} item(s)" + (f": {', '.join(defined)}." if defined else ".")]
    if adjudication["notDisagreements"]:
        out.append(f"Ignored: {len(adjudication['notDisagreements'])} answer(s) for items that are no longer "
                   f"disagreements ({', '.join(adjudication['notDisagreements'])}).")
    return out


# --- gallery.html ----------------------------------------------------------------


def _card(item: dict[str, Any], record: dict[str, Any], runs_dir: Path, out_dir: Path, *,
          guided: bool = False, adjudicated: dict[str, Any] | None = None, archive_dir: Path = ARCHIVE_DIR) -> str:
    """One disagreement; every picture and finding is read from its run (item_run_dir)."""
    run_dir = item_run_dir(runs_dir, item, archive_dir)
    annotated, findings = case_outputs(runs_dir, item, archive_dir)
    suite = item["suite"]
    verdict = "failed" if failed_by_suite(item) else "survived"
    meta = [f'<span class="tag {"failed" if verdict == "failed" else "survived"}">suite: {verdict}</span>',
            f'<span class="tag tier">{html.escape(str(suite["tier"]))}</span>',
            f"labelled <b>{html.escape(record['label'])}</b>",
            f"stratum {html.escape(item['stratum'])}"]
    if suite["checks"]:
        meta.append("checks: " + ", ".join(html.escape(check) for check in suite["checks"]))
    if guided:
        meta.append("guided")
    if adjudicated:
        meta.append(f"adjudicated: <b>{html.escape(ADJUDICATION_TEXT[adjudicated['answer']])}</b>")
    title = " &middot; ".join(html.escape(part) for part in (item["id"], item["candidate"], item["case"]))
    body = [f'<article class="card {verdict}">', f"<h3>{title}</h3>", f'<p class="meta">{" &middot; ".join(meta)}</p>']
    if record.get("note"):
        body.append(f'<p class="note">Note: {html.escape(record["note"])}</p>')
    if adjudicated and adjudicated.get("note"):
        body.append(f'<p class="note">Adjudication note: {html.escape(adjudicated["note"])}</p>')
    body.append('<div class="shots three">'
                + _figure(run_dir / Path(item["pictures"]["reference"]).name, "before (as labelled)", out_dir)
                + _figure(run_dir / Path(item["pictures"]["case"]).name, "after (as labelled)", out_dir)
                + _figure(annotated, "after, annotated", out_dir) + "</div>")
    if findings:
        body.append(f"<details open><summary>{len(findings)} new finding(s)</summary><ul>"
                    + "".join(_finding(finding) for finding in findings) + "</ul></details>")
    body.append("</article>")
    return "\n".join(body)


def render_gallery(summary: dict[str, Any], label_set: dict[str, Any], labels: dict[str, dict[str, Any]],
                   runs_dir: Path, out_dir: Path, adjudication: dict[str, dict[str, Any]] | None = None, *,
                   archive_dir: Path = ARCHIVE_DIR) -> str:
    by_id = {item["id"]: item for item in label_set["items"]}
    guided_cases = set(summary["guided"]["cases"])
    sections = []
    for key, title in (("failedNotBroken", "Failed by the suite, labelled fine or other"),
                       ("passedBroken", "Passed by the suite, labelled broken")):
        ids = summary["disagreements"][key]
        cards = "\n".join(_card(by_id[i], labels[i], runs_dir, out_dir, guided=i in guided_cases,
                                adjudicated=(adjudication or {}).get(i), archive_dir=archive_dir) for i in ids) or '<p class="meta">None.</p>'
        sections.append(f"<section><h2>{title} ({len(ids)})</h2><div class=\"cards\">\n{cards}\n</div></section>")
    partial = ('<p class="meta"><b>Partial:</b> not every item is labelled yet.</p>' if summary["partial"] else "")
    style = GALLERY_STYLE + (".shots.three { grid-template-columns: repeat(3, 1fr); } "
                             ".note { margin: 0 0 8px; padding: 4px 8px; background: #fffbeb; border-radius: 4px; }")
    return (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        f"<title>Calibration disagreements</title>\n<style>{style}</style>\n</head>\n<body>\n"
        f"<header><h1>Calibration disagreements: {html.escape(summary['set'])}</h1>{partial}"
        "<p class=\"meta\">Every item where the blind label and the suite's verdict differ. Screenshots open full "
        "size on click.</p></header>\n" + "\n".join(sections) + "\n</body>\n</html>\n"
    )


def write_calibration(summary: dict[str, Any], gallery: str, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name, text in (("summary.json", json.dumps(rounded(summary), indent=2, ensure_ascii=False) + "\n"),
                       ("report.md", render_report(summary)),
                       ("gallery.html", gallery)):
        path = out_dir / name
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    return written


def calibrate(set_path: Path, label_set: dict[str, Any], runs_dir: Path, out_dir: Path, *,
              partial: bool = False, archive_dir: Path = ARCHIVE_DIR) -> list[Path]:
    labels = load_labels(set_path, label_set)
    adjudication = load_adjudication(set_path, label_set)
    summary = build_calibration(label_set, labels, runs_dir, partial=partial, guided=load_guided(set_path, label_set),
                                adjudication=adjudication,
                                adjudication_file=_display(adjudication_path(set_path)) if adjudication is not None
                                else None, archive_dir=archive_dir)
    gallery = render_gallery(summary, label_set, labels, runs_dir, out_dir, adjudication, archive_dir=archive_dir)
    return write_calibration(summary, gallery, out_dir)
