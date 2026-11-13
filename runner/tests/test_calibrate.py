"""calibrate: the arithmetic on a small hand-made set, worked out by hand.

Strata sizes: failed-core 4, failed-extreme 10, survived-focus 20, survived-other 100.

  item  stratum         case               checks                        label
  i001  failed-core     text-long          content-spill                 broken
  i002  failed-core     text-longword      text-clipped, content-spill   broken
  i003  failed-core     list-many          page-overflow-x               fine
  i004  failed-core     list-0             (render error)                other
  i005  failed-extreme  text-unbroken      content-spill                 broken
  i006  failed-extreme  text-unbroken@320  page-overflow-x               unsure
  i007  survived-focus  text-longword@320                                broken
  i008  survived-focus  text-long@320                                    fine
  i009  survived-focus  number-large@320                                 fine
  i010  survived-focus  viewport-320                                     fine
  i011  survived-other  text-empty                                       fine
  i012  survived-other  dir-rtl                                          other
  i013  repeat of i001                                                   broken (same)
  i014  repeat of i008                                                   broken (differs)
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from labelfixtures import add_run

from first_edit.calibrate import NO_CHECK, build_calibration, calibrate, load_labels, render_report
from first_edit.labelset import labels_path
from first_edit.labeltool import LabelStore
from first_edit.providers import SetupError

CANDIDATE = "m/brief-a/plain-s1"
ROWS = [
    ("i001", "failed-core", "text-long", ["content-spill"], "broken"),
    ("i002", "failed-core", "text-longword", ["text-clipped", "content-spill"], "broken"),
    ("i003", "failed-core", "list-many", ["page-overflow-x"], "fine"),
    ("i004", "failed-core", "list-0", [], "other"),
    ("i005", "failed-extreme", "text-unbroken", ["content-spill"], "broken"),
    ("i006", "failed-extreme", "text-unbroken@320", ["page-overflow-x"], "unsure"),
    ("i007", "survived-focus", "text-longword@320", [], "broken"),
    ("i008", "survived-focus", "text-long@320", [], "fine"),
    ("i009", "survived-focus", "number-large@320", [], "fine"),
    ("i010", "survived-focus", "viewport-320", [], "fine"),
    ("i011", "survived-other", "text-empty", [], "fine"),
    ("i012", "survived-other", "dir-rtl", [], "other"),
]
SIZES = {"failed-core": 4, "failed-extreme": 10, "survived-focus": 20, "survived-other": 100}


def _item(item_id: str, stratum: str, case: str, checks: list[str], repeat_of: str | None = None) -> dict:
    run = f"runs/brief-a/{CANDIDATE.replace('/', '__')}"
    reference = "viewport-320" if case.endswith("@320") else "baseline"
    return {
        "id": item_id, "candidate": CANDIDATE, "brief": "brief-a", "case": case,
        "suite": {"tier": "extreme" if case.startswith("text-unbroken") else "core",
                  "status": "render-error" if case == "list-0" else "ok",
                  "survived": stratum.startswith("survived"), "checks": checks},
        "harness": {"commit": "abc1234", "dirty": False},
        "pictures": {"reference": f"{run}/{reference}.png", "case": f"{run}/{case}.png"},
        "screens": {"reference": 1280, "case": 1280},
        "stratum": stratum, "stratumSize": SIZES[stratum], "repeatOf": repeat_of,
    }


@pytest.fixture
def setup(tmp_path: Path) -> tuple[Path, dict, Path]:
    runs = tmp_path / "runs"
    add_run(runs, CANDIDATE, failed={case: checks or ["text-overlap"] for _, stratum, case, checks, _ in ROWS
                                     if stratum.startswith("failed")})
    items = [_item(item_id, stratum, case, checks) for item_id, stratum, case, checks, _ in ROWS]
    items.append({**items[0], "id": "i013", "repeatOf": "i001"})
    items.append({**items[7], "id": "i014", "repeatOf": "i008"})
    label_set = {"schemaVersion": 1, "name": "hand", "seed": 1, "runs": "runs",
                 "composition": {"strata": {s: {"size": n, "drawn": 0} for s, n in SIZES.items()}}, "items": items}
    set_path = tmp_path / "labels" / "hand.json"
    set_path.parent.mkdir()
    set_path.write_text(json.dumps(label_set), encoding="utf-8")
    store = LabelStore(labels_path(set_path), [item["id"] for item in items])
    for item_id, _, _, _, label in ROWS:
        store.answer(item_id, label, "squeezed column" if item_id == "i012" else "", 1000)
    store.answer("i013", "broken", "", 900)
    store.answer("i014", "broken", "", 900)
    return set_path, label_set, runs


def share(result: dict) -> tuple:
    return result["count"], result["of"], round(result["share"], 4), [round(x, 4) for x in result["ci95"]]


def test_precision_overall_per_tier_and_per_check(setup) -> None:
    set_path, label_set, runs = setup
    summary = build_calibration(label_set, load_labels(set_path, label_set), runs)
    precision = summary["precision"]
    # failed and rated: i001 b, i002 b, i003 f, i004 o, i005 b (i006 is unsure)
    assert share(precision["all"]) == (3, 5, 0.6, [0.2307, 0.8824])
    assert share(precision["core"]) == (2, 4, 0.5, [0.15, 0.85])
    assert share(precision["extreme"])[:3] == (1, 1, 1.0)
    by_check = precision["byCheck"]
    assert set(by_check) == {"content-spill", "text-clipped", "page-overflow-x", NO_CHECK}
    assert share(by_check["content-spill"]) == (3, 3, 1.0, [0.4385, 1.0])
    assert share(by_check["text-clipped"])[:2] == (1, 1)
    assert share(by_check["page-overflow-x"])[:2] == (0, 1)  # i006 is unsure, left out
    assert share(by_check[NO_CHECK])[:2] == (0, 1)


def test_miss_rate(setup) -> None:
    set_path, label_set, runs = setup
    miss = build_calibration(label_set, load_labels(set_path, label_set), runs)["missRate"]
    assert share(miss["all"]) == (1, 6, 0.1667, [0.0301, 0.5635])
    assert share(miss["survived-focus"])[:3] == (1, 4, 0.25)
    assert share(miss["survived-other"])[:3] == (0, 2, 0.0)


def test_recall_weights_each_stratum_by_its_size(setup) -> None:
    set_path, label_set, runs = setup
    recall = build_calibration(label_set, load_labels(set_path, label_set), runs)["recall"]
    # estimated broken: core 4 x 2/4 = 2, extreme 10 x 1/1 = 10, focus 20 x 1/4 = 5, other 100 x 0/2 = 0
    assert {s: e["estimatedBroken"] for s, e in recall["strata"].items()} == {
        "failed-core": 2.0, "failed-extreme": 10.0, "survived-focus": 5.0, "survived-other": 0.0}
    assert recall["estimate"] == pytest.approx(12 / 17)
    # unweighted, the sample alone would say 3 / 4: weighting matters
    assert recall["estimatedBroken"] == {"failedBySuite": 12.0, "passedBySuite": 5.0}


def test_other_unsure_counts_and_self_consistency(setup) -> None:
    set_path, label_set, runs = setup
    summary = build_calibration(label_set, load_labels(set_path, label_set), runs)
    assert summary["labels"] == {"broken": 4, "fine": 5, "other": 2, "unsure": 1, "unlabelled": 0}
    assert summary["byStratum"]["failed-core"] == {"size": 4, "drawn": 4, "broken": 2, "fine": 1, "other": 1,
                                                    "unsure": 0, "unlabelled": 0}
    assert summary["other"] == {"count": 2, "failedBySuite": 1}
    assert summary["unsure"] == 1
    consistency = summary["selfConsistency"]
    assert share(consistency) == (1, 2, 0.5, [0.0945, 0.9055])
    assert consistency["differing"] == [{"item": "i008", "repeat": "i014", "first": "fine", "second": "broken"}]
    assert summary["disagreements"] == {"failedNotBroken": ["i003", "i004"], "passedBroken": ["i007"]}
    assert summary["items"] == {"total": 14, "labelled": 14, "unlabelled": 0, "primary": 12, "repeats": 2}
    assert summary["harness"] == {"items": 14, "changed": 0, "missingRuns": 0}
    assert summary["partial"] is False


def test_it_refuses_until_every_item_is_labelled_unless_partial(setup, tmp_path: Path) -> None:
    set_path, label_set, runs = setup
    store = LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]])
    store.undo()  # i014 loses its label
    with pytest.raises(SetupError, match="1 of 14 items have no label yet"):
        calibrate(set_path, label_set, runs, tmp_path / "out")
    assert not (tmp_path / "out").exists()
    written = calibrate(set_path, label_set, runs, tmp_path / "out", partial=True)
    assert [path.name for path in written] == ["summary.json", "report.md", "gallery.html"]
    report = (tmp_path / "out" / "report.md").read_text(encoding="utf-8")
    assert report.startswith("# Calibration report\n\n**Partial: 13 of 14 items are labelled**")
    summary = json.loads((tmp_path / "out" / "summary.json").read_text(encoding="utf-8"))
    assert summary["partial"] is True and summary["selfConsistency"]["of"] == 1


def test_report_and_gallery(setup, tmp_path: Path) -> None:
    set_path, label_set, runs = setup
    calibrate(set_path, label_set, runs, tmp_path / "out")
    report = (tmp_path / "out" / "report.md").read_text(encoding="utf-8")
    assert "Partial" not in report
    assert "| failed, all | 3/5 | 60.0% | 23.1% to 88.2% |" in report
    assert "Estimated recall: **70.6%**" in report
    assert "an estimate from a sample" in report
    assert "- i008 and its repeat i014: fine, then broken" in report
    gallery = (tmp_path / "out" / "gallery.html").read_text(encoding="utf-8")
    assert gallery.count("<article") == 3
    for item_id in ("i003", "i004", "i007"):
        assert f"<h3>{item_id} &middot;" in gallery
    assert "list-many.annotated.png" in gallery and "baseline.png" in gallery
    assert "list-many text" in gallery  # the finding from the case's JSON
    assert "i012" not in gallery  # "other" on a passed case is no disagreement


def test_the_note_of_a_disagreement_is_shown(setup, tmp_path: Path) -> None:
    set_path, label_set, runs = setup
    LabelStore(labels_path(set_path), [item["id"] for item in label_set["items"]]).set_note("i003", "fits on screen")
    calibrate(set_path, label_set, runs, tmp_path / "out")
    assert "Note: fits on screen" in (tmp_path / "out" / "gallery.html").read_text(encoding="utf-8")


def test_a_run_stressed_again_since_the_set_is_flagged(setup, tmp_path: Path) -> None:
    set_path, label_set, runs = setup
    add_run(runs, CANDIDATE, commit="fff9999")
    summary = build_calibration(label_set, load_labels(set_path, label_set), runs)
    assert summary["harness"]["changed"] == 14
    assert "Warning: 14 item(s) were stressed again" in render_report(summary)


# --- guided items (D-056) and adjudication (D-055) ---------------------------------
#
# Guided: i002 and i014 (the repeat of i008), so the guided cases are i002 and i008.
# Unguided failed and rated: i001 b, i003 f, i004 o, i005 b -> precision 2/4, core 1/3.
# Unguided passed and rated: i007 b, i009 f, i010 f, i011 f, i012 o -> miss rate 1/5.
# Unguided recall: core 4 x 1/3, extreme 10 x 1/1, focus 20 x 1/3, other 100 x 0/2 -> (4/3 + 10) / (4/3 + 10 + 20/3).
# Unguided self-consistency: only the pair i001/i013 is left, the same both times -> 1/1.
#
# Adjudicated: i003 the suite is right (-> broken), i004 we define it differently (stays other),
# i007 the suite is right (-> fine). Precision after: i001 b, i002 b, i003 b, i004 o, i005 b -> 4/5;
# miss rate after: no passed item is broken -> 0/6.

from first_edit.answers import AdjudicationStore  # noqa: E402
from first_edit.calibrate import adjudicated_labels, load_adjudication, load_guided  # noqa: E402
from first_edit.labelset import adjudication_path, guided_path  # noqa: E402


def _guide(set_path: Path, items: list[str], name: str = "hand") -> None:
    guided_path(set_path).write_text(json.dumps({"set": name, "reason": "discussed before labelling",
                                                 "items": items}), encoding="utf-8")


def _adjudicate(set_path: Path, answers: dict[str, str]) -> None:
    store = AdjudicationStore(adjudication_path(set_path), ["i003", "i004", "i007"])
    for item_id, answer in answers.items():
        store.answer(item_id, answer, "", 500)


def _summary(set_path: Path, label_set: dict, runs: Path) -> dict:
    labels = load_labels(set_path, label_set)
    return build_calibration(label_set, labels, runs, guided=load_guided(set_path, label_set),
                             adjudication=load_adjudication(set_path, label_set), adjudication_file="adj")


def test_guided_items_are_left_out_of_the_unguided_rates(setup) -> None:
    set_path, label_set, runs = setup
    _guide(set_path, ["i014", "i002"])
    summary = _summary(set_path, label_set, runs)
    assert summary["guided"]["items"] == ["i002", "i014"] and summary["guided"]["cases"] == ["i002", "i008"]
    assert summary["guided"]["byStratum"] == {"failed-core": 1, "failed-extreme": 0, "survived-focus": 1,
                                              "survived-other": 0}
    unguided = summary["unguided"]
    assert unguided["items"] == {"primary": 10, "repeats": 1}
    assert share(unguided["precision"]["all"])[:2] == (2, 4)
    assert share(unguided["precision"]["core"])[:2] == (1, 3)
    assert share(unguided["missRate"]["all"])[:2] == (1, 5)
    assert unguided["recall"]["estimate"] == pytest.approx((4 / 3 + 10) / (4 / 3 + 10 + 20 / 3))
    assert share(unguided["selfConsistency"])[:2] == (1, 1)
    # the rates over all items are the blind ones, unchanged
    assert share(summary["precision"]["all"]) == (3, 5, 0.6, [0.2307, 0.8824])
    report = render_report(summary)
    assert "Guided items (D-056): 2 item(s) (discussed before labelling)" in report
    assert "they make 2 guided case(s)" in report
    assert "| failed, all | 3/5 | 60.0% | 23.1% to 88.2% | 2/4 | 50.0% |" in report
    assert "over all items; **63.0%** over the unguided items" in report  # 11.33 / 18


def test_without_a_guided_file_the_unguided_rates_equal_the_others(setup) -> None:
    set_path, label_set, runs = setup
    summary = _summary(set_path, label_set, runs)
    assert summary["guided"]["file"] is None and summary["guided"]["cases"] == []
    assert summary["unguided"]["precision"] == summary["precision"]
    assert summary["unguided"]["missRate"] == summary["missRate"]
    assert "No guided items are recorded" in render_report(summary)


def test_a_bad_guided_file_is_refused(setup) -> None:
    set_path, label_set, _ = setup
    _guide(set_path, ["i999"])
    with pytest.raises(SetupError, match="not items of hand: i999"):
        load_guided(set_path, label_set)
    _guide(set_path, ["i001"], name="another-set")
    with pytest.raises(SetupError, match="expected"):
        load_guided(set_path, label_set)


def test_after_adjudication_the_suite_is_right_answers_replace_the_blind_label(setup) -> None:
    set_path, label_set, runs = setup
    _adjudicate(set_path, {"i003": "suite-right", "i004": "defined-differently", "i007": "suite-right"})
    summary = _summary(set_path, label_set, runs)
    adjudication = summary["adjudication"]
    assert adjudication["disagreements"] == 3 and adjudication["answered"] == 3 and adjudication["unanswered"] == []
    assert adjudication["answers"] == {"suite-right": 2, "label-right": 0, "defined-differently": 1}
    assert adjudication["definedDifferently"] == ["i004"]
    assert share(adjudication["all"]["precision"]["all"])[:2] == (4, 5)
    assert share(adjudication["all"]["missRate"]["all"])[:2] == (0, 6)
    # the blind rates stay as they were
    assert share(summary["precision"]["all"])[:2] == (3, 5) and share(summary["missRate"]["all"])[:2] == (1, 6)
    labels = load_labels(set_path, label_set)
    after = adjudicated_labels(label_set, labels, load_adjudication(set_path, label_set))
    assert (after["i003"]["label"], after["i004"]["label"], after["i007"]["label"]) == ("broken", "other", "fine")
    assert labels["i003"]["label"] == "fine"  # the blind label itself is never changed
    report = render_report(summary)
    assert report.index("## Precision") < report.index("## After adjudication")
    assert "| precision: failed, all | 4/5 | 80.0% |" in report
    assert "| miss rate: passed, all | 0/6 | 0.0% |" in report
    assert "\"We define it differently\": 1 item(s): i004." in report


def test_a_partial_adjudication_keeps_the_blind_label_of_unanswered_items(setup) -> None:
    set_path, label_set, runs = setup
    _adjudicate(set_path, {"i003": "label-right"})
    adjudication = _summary(set_path, label_set, runs)["adjudication"]
    assert adjudication["answered"] == 1 and adjudication["unanswered"] == ["i004", "i007"]
    assert share(adjudication["all"]["precision"]["all"])[:2] == (3, 5)
    assert share(adjudication["all"]["missRate"]["all"])[:2] == (1, 6)


def test_without_an_adjudication_file_the_section_is_left_out(setup, tmp_path: Path) -> None:
    set_path, label_set, runs = setup
    calibrate(set_path, label_set, runs, tmp_path / "out")
    report = (tmp_path / "out" / "report.md").read_text(encoding="utf-8")
    assert "## After adjudication" not in report
    assert "No adjudication yet: labels/hand.adjudication.jsonl does not exist" in report
    summary = json.loads((tmp_path / "out" / "summary.json").read_text(encoding="utf-8"))
    assert summary["adjudication"] is None and summary["labellers"] == 1
