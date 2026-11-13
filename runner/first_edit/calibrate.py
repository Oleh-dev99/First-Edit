"""The calibrate command: the suite's verdicts against blind human labels
(docs/LABELLING.md, D-050, D-051).

Reads a label set (labelset.py), its labels (labeltool.py) and the stress
results it was drawn from, and writes summary.json, report.md and
gallery.html:

- precision: of the items the suite failed, the share labelled broken;
- miss rate: of the items the suite passed, the share labelled broken;
- estimated recall over all cases, weighting each stratum by its size;
- "other" labels, self-consistency on the repeated items, and a gallery of
  every item where the label and the suite disagree.

Every rate counts each case once (a repeat only measures self-consistency)
and leaves out "unsure"; "other" counts as not broken (D-051).
"""

from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path
from typing import Any

from .labelset import STRATA, labels_path
from .labeltool import LABELS, LabelStore
from .providers import SetupError
from .summarize import CHECKS, GALLERY_STYLE, _ci, _figure, _finding, _pct, _share, rounded

CALIBRATION_SCHEMA_VERSION = 1
#: Labels that judge an item; "unsure" is reported and left out of every rate.
RATED = ("broken", "fine", "other")
#: The per-check row for failed items without a check (a render error or a timeout).
NO_CHECK = "render error or timeout"
FAILED_STRATA = ("failed-core", "failed-extreme")
SURVIVED_STRATA = ("survived-focus", "survived-other")


def failed_by_suite(item: dict[str, Any]) -> bool:
    return item["stratum"] in FAILED_STRATA


def load_labels(set_path: Path, label_set: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """The saved answers of a set, by item id."""
    store = LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]])
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


def _run_dir(runs_dir: Path, item: dict[str, Any]) -> Path:
    return runs_dir / item["brief"] / item["candidate"].replace("/", "__")


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def harness_check(items: list[dict[str, Any]], runs_dir: Path) -> dict[str, int]:
    """Items whose run in runs_dir is missing, or was stressed again with
    another harness commit since the set was built."""
    summaries: dict[Path, dict[str, Any] | None] = {}
    changed = missing = 0
    for item in items:
        run_dir = _run_dir(runs_dir, item)
        if run_dir not in summaries:
            summaries[run_dir] = _read_json(run_dir / "summary.json")
        summary = summaries[run_dir]
        if summary is None:
            missing += 1
        elif (summary.get("harness") or {}).get("commit") != (item.get("harness") or {}).get("commit"):
            changed += 1
    return {"items": len(items), "changed": changed, "missingRuns": missing}


def build_calibration(label_set: dict[str, Any], labels: dict[str, dict[str, Any]], runs_dir: Path, *,
                      partial: bool = False) -> dict[str, Any]:
    """The calibration numbers; refuses while an item has no label, unless `partial`."""
    items = label_set["items"]
    unlabelled = [item for item in items if item["id"] not in labels]
    if unlabelled and not partial:
        raise SetupError(f"{len(unlabelled)} of {len(items)} items have no label yet; label every item, "
                         "or pass --partial for numbers over the labelled items only")
    primaries = [item for item in items if item.get("repeatOf") is None]
    repeats = [item for item in items if item.get("repeatOf") is not None]
    by_id = {item["id"]: item for item in items}
    label_of = lambda item: labels.get(item["id"], {}).get("label")  # noqa: E731
    sizes = {stratum: data["size"] for stratum, data in label_set["composition"]["strata"].items()}

    def counts(group: list[dict[str, Any]]) -> dict[str, int]:
        found = Counter(label_of(item) or "unlabelled" for item in group)
        return {label: found.get(label, 0) for label in (*LABELS, "unlabelled")}

    by_stratum = {stratum: {"size": sizes.get(stratum, 0),
                            "drawn": sum(1 for item in primaries if item["stratum"] == stratum),
                            **counts([item for item in primaries if item["stratum"] == stratum])}
                  for stratum in STRATA}

    failed = [item for item in primaries if failed_by_suite(item)]
    survived = [item for item in primaries if not failed_by_suite(item)]
    by_check = {check: _rated_share([item for item in failed if check in item["suite"]["checks"]], labels)
                for check in CHECKS}
    by_check[NO_CHECK] = _rated_share([item for item in failed if not item["suite"]["checks"]], labels)
    precision = {"all": _rated_share(failed, labels),
                 "core": _rated_share([item for item in failed if item["stratum"] == "failed-core"], labels),
                 "extreme": _rated_share([item for item in failed if item["stratum"] == "failed-extreme"], labels),
                 "byCheck": {check: share for check, share in by_check.items() if share["of"]}}
    miss_rate = {"all": _rated_share(survived, labels),
                 **{stratum: _rated_share([item for item in survived if item["stratum"] == stratum], labels)
                    for stratum in SURVIVED_STRATA}}

    other = [item for item in primaries if label_of(item) == "other"]
    pairs = [(by_id[item["repeatOf"]], item) for item in repeats]
    both = [(first, second) for first, second in pairs if label_of(first) and label_of(second)]
    same = sum(1 for first, second in both if label_of(first) == label_of(second))
    differing = [{"item": first["id"], "repeat": second["id"], "first": label_of(first), "second": label_of(second)}
                 for first, second in both if label_of(first) != label_of(second)]

    failed_not_broken = [item["id"] for item in failed if label_of(item) in ("fine", "other")]
    passed_broken = [item["id"] for item in survived if label_of(item) == "broken"]
    return {
        "schemaVersion": CALIBRATION_SCHEMA_VERSION,
        "set": label_set["name"],
        "seed": label_set["seed"],
        "runs": label_set["runs"],
        "partial": bool(unlabelled),
        "items": {"total": len(items), "labelled": len(items) - len(unlabelled), "unlabelled": len(unlabelled),
                  "primary": len(primaries), "repeats": len(repeats)},
        "labels": counts(primaries),
        "byStratum": by_stratum,
        "repeatLabels": counts(repeats),
        "precision": precision,
        "missRate": miss_rate,
        "recall": recall_estimate(primaries, labels, sizes),
        "other": {"count": len(other), "failedBySuite": sum(1 for item in other if failed_by_suite(item))},
        "unsure": sum(1 for item in primaries if label_of(item) == "unsure"),
        "selfConsistency": {**_share(same, len(both)), "differing": differing},
        "disagreements": {"failedNotBroken": failed_not_broken, "passedBroken": passed_broken},
        "harness": harness_check(items, runs_dir),
    }


# --- report.md -------------------------------------------------------------------


def _rate(share: dict[str, Any]) -> list[str]:
    return [f"{share['count']}/{share['of']}", _pct(share["share"]), _ci(share["ci95"])]


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(header) + " |", "|" + "---|" * len(header),
            *("| " + " | ".join(row) + " |" for row in rows)]


def render_report(summary: dict[str, Any]) -> str:
    items = summary["items"]
    out = ["# Calibration report", ""]
    if summary["partial"]:
        out += [f"**Partial: {items['labelled']} of {items['total']} items are labelled** (calibrate --partial). "
                "Every number below covers the labelled items only and will change as labelling goes on.", ""]
    out += [
        f"Generated by `python -m first_edit calibrate` for label set {summary['set']} (seed {summary['seed']}), "
        f"drawn from {summary['runs']}. The labeller saw the two clean screenshots of each item, the brief and the "
        "case in plain words, and nothing of the suite's result (D-050). Each case counts once; a repeated item only "
        "measures self-consistency. \"unsure\" is left out of every rate; \"other\" counts as not broken (D-051).", ""]
    harness = summary["harness"]
    if harness["changed"] or harness["missingRuns"]:
        out += [f"Warning: {harness['changed']} item(s) were stressed again with another harness commit since the "
                f"set was built, and {harness['missingRuns']} have no run in the runs directory; their findings and "
                "annotated screenshots may not match what was labelled.", ""]

    out += ["## Items labelled", "",
            "Primary items per stratum (each case once), then the repeats. Size is the number of cases in the "
            "stratum when the set was built.", ""]
    rows = [[stratum, str(data["size"]), str(data["drawn"]), *(str(data[label]) for label in (*LABELS, "unlabelled"))]
            for stratum, data in summary["byStratum"].items()]
    repeat = summary["repeatLabels"]
    rows.append(["repeats", "-", str(items["repeats"]), *(str(repeat[label]) for label in (*LABELS, "unlabelled"))])
    labels = summary["labels"]
    rows.append(["all primary items", "-", str(items["primary"]), *(str(labels[label]) for label in (*LABELS, "unlabelled"))])
    out += _table(["stratum", "size", "drawn", *LABELS, "unlabelled"], rows)

    precision = summary["precision"]
    out += ["", "## Precision", "",
            "Of the items the suite failed, the share labelled broken, with a 95% Wilson interval. Per check, an item "
            "counts for every check with new errors in it.", ""]
    rows = [["failed, all", *_rate(precision["all"])], ["failed, core cases", *_rate(precision["core"])],
            ["failed, extreme cases", *_rate(precision["extreme"])]]
    rows += [[f"check: {check}", *_rate(share)] for check, share in precision["byCheck"].items()]
    out += _table(["items", "labelled broken", "share", "95% interval"], rows)

    miss = summary["missRate"]
    out += ["", "## Miss rate", "", "Of the items the suite passed, the share labelled broken.", ""]
    out += _table(["items", "labelled broken", "share", "95% interval"],
                  [["passed, all", *_rate(miss["all"])],
                   *([f"passed, {stratum}", *_rate(miss[stratum])] for stratum in SURVIVED_STRATA)])

    recall = summary["recall"]
    out += ["", "## Estimated recall", "",
            "The share of all broken cases that the suite fails, over every case of the clean-baseline candidates "
            "the set was drawn from. Each stratum's broken cases are estimated as its size times the share of its "
            "rated items labelled broken. This is an estimate from a sample: it carries the sampling error of every "
            "stratum, so no interval is given, and it holds only for the runs the set was drawn from.", ""]
    out += _table(["stratum", "size", "rated", "labelled broken", "estimated broken cases"],
                  [[stratum, str(data["size"]), str(data["rated"]), str(data["broken"]),
                    "-" if data["estimatedBroken"] is None else f"{data['estimatedBroken']:.1f}"]
                   for stratum, data in recall["strata"].items()])
    out += ["", f"Estimated recall: **{_pct(recall['estimate'])}**" if recall["estimate"] is not None
            else f"Estimated recall: not available ({recall['reason']})."]

    other = summary["other"]
    out += ["", "## Other and unsure", "",
            f"- \"other\" (something looks wrong, but not a kind the suite checks for): {other['count']} item(s), "
            f"{other['failedBySuite']} of them failed by the suite.",
            f"- \"unsure\": {summary['unsure']} item(s), left out of the rates."]

    consistency = summary["selfConsistency"]
    out += ["", "## Self-consistency", "",
            f"Repeated items labelled the same both times: {consistency['count']}/{consistency['of']} "
            f"({_pct(consistency['share'])}, 95% interval {_ci(consistency['ci95'])})."]
    for pair in consistency["differing"]:
        out.append(f"- {pair['item']} and its repeat {pair['repeat']}: {pair['first']}, then {pair['second']}")

    disagreements = summary["disagreements"]
    out += ["", "## Disagreements", "",
            f"Failed by the suite but labelled fine or other: {len(disagreements['failedNotBroken'])}. "
            f"Passed by the suite but labelled broken: {len(disagreements['passedBroken'])}. "
            "gallery.html shows each with both pictures, the annotated screenshot, the findings and the note."]
    return "\n".join(out) + "\n"


# --- gallery.html ----------------------------------------------------------------


def _card(item: dict[str, Any], record: dict[str, Any], runs_dir: Path, out_dir: Path) -> str:
    """One disagreement; every picture and finding is read from runs_dir."""
    run_dir = _run_dir(runs_dir, item)
    summary = _read_json(run_dir / "summary.json") or {}
    entry = next((e for e in summary.get("cases", []) if e.get("id") == item["case"]), {})
    files = entry.get("files") or {}
    result = _read_json(run_dir / files["result"]) if files.get("result") else None
    findings = (result or {}).get("newFindings") or []
    annotated = run_dir / files["annotated"] if files.get("annotated") else None
    suite = item["suite"]
    verdict = "failed" if failed_by_suite(item) else "survived"
    meta = [f'<span class="tag {"failed" if verdict == "failed" else "survived"}">suite: {verdict}</span>',
            f'<span class="tag tier">{html.escape(str(suite["tier"]))}</span>',
            f"labelled <b>{html.escape(record['label'])}</b>",
            f"stratum {html.escape(item['stratum'])}"]
    if suite["checks"]:
        meta.append("checks: " + ", ".join(html.escape(check) for check in suite["checks"]))
    title = " &middot; ".join(html.escape(part) for part in (item["id"], item["candidate"], item["case"]))
    body = [f'<article class="card {verdict}">', f"<h3>{title}</h3>", f'<p class="meta">{" &middot; ".join(meta)}</p>']
    if record.get("note"):
        body.append(f'<p class="note">Note: {html.escape(record["note"])}</p>')
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
                   runs_dir: Path, out_dir: Path) -> str:
    by_id = {item["id"]: item for item in label_set["items"]}
    sections = []
    for key, title in (("failedNotBroken", "Failed by the suite, labelled fine or other"),
                       ("passedBroken", "Passed by the suite, labelled broken")):
        ids = summary["disagreements"][key]
        cards = "\n".join(_card(by_id[i], labels[i], runs_dir, out_dir) for i in ids) or '<p class="meta">None.</p>'
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
              partial: bool = False) -> list[Path]:
    labels = load_labels(set_path, label_set)
    summary = build_calibration(label_set, labels, runs_dir, partial=partial)
    return write_calibration(summary, render_gallery(summary, label_set, labels, runs_dir, out_dir), out_dir)

