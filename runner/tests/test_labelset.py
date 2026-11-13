"""label-set: a blind, stratified, deterministic sample of stressed cases."""

import json
from collections import Counter
from pathlib import Path

import pytest

from labelfixtures import add_run, big_runs

from first_edit.labelset import (
    FOCUS_CASES,
    MIN_GAP,
    build_label_set,
    describe_case,
    dumps_label_set,
    labels_path,
    load_label_set,
    write_label_set,
)
from first_edit.providers import SetupError


@pytest.fixture(scope="module")
def runs(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, int]]:
    """Read only: built once for the module."""
    runs = tmp_path_factory.mktemp("label-runs") / "runs"
    return runs, big_runs(runs)


@pytest.fixture
def root(runs) -> Path:
    """The directory the set's paths are relative to."""
    return runs[0].parent


def test_composition(root: Path, runs) -> None:
    runs_dir, sizes = runs
    label_set = build_label_set(runs_dir, "set-01", 1, root=root)
    items = label_set["items"]
    primaries = [item for item in items if item["repeatOf"] is None]
    drawn = Counter(item["stratum"] for item in primaries)
    # every failed core case, 40 of the failed extreme cases, 120 survived cases
    # of which at least half from the focus cases, and 20 repeats
    assert drawn == {"failed-core": sizes["failed-core"], "failed-extreme": 40, "survived-focus": 60, "survived-other": 60}
    assert len(items) - len(primaries) == 20
    assert len(items) == sizes["failed-core"] + 40 + 120 + 20
    for item in items:
        assert item["stratumSize"] == sizes[item["stratum"]]
        assert item["suite"]["survived"] == item["stratum"].startswith("survived")
        if item["suite"]["survived"]:
            assert (item["stratum"] == "survived-focus") == (item["case"] in FOCUS_CASES)
        else:
            assert item["stratum"] == f"failed-{item['suite']['tier']}"
    composition = label_set["composition"]
    assert composition["strata"]["failed-extreme"] == {"size": sizes["failed-extreme"], "drawn": 40}
    assert composition["focusShareOfSurvived"] == 0.5
    assert composition["candidates"] == {"clean": 30, "bornBroken": 1, "baselineCrash": 1}
    assert composition["skippedNoScreenshot"] == 1


def test_only_cases_of_clean_model_candidates(root: Path, runs) -> None:
    runs_dir, _ = runs
    items = build_label_set(runs_dir, "set-01", 1, root=root)["items"]
    briefs = {item["brief"] for item in items}
    assert not briefs & {"brief-born", "brief-crash", "brief-ref"}
    assert not any(item["candidate"].startswith("_") for item in items)
    assert not any(item["case"] == "dir-rtl" and item["brief"] == "brief-29" for item in items)


def test_every_failed_core_case_is_in_the_set(root: Path, runs) -> None:
    runs_dir, _ = runs
    items = build_label_set(runs_dir, "set-01", 1, root=root)["items"]
    failed_core = {(item["candidate"], item["case"]) for item in items if item["stratum"] == "failed-core"}
    assert ("m0/brief-00/hinted-s1", "list-many") in failed_core
    assert sum(1 for _, case in failed_core if case == "text-longword@320") == 12


def test_the_set_is_deterministic_for_a_seed(root: Path, runs) -> None:
    runs_dir, _ = runs
    first = dumps_label_set(build_label_set(runs_dir, "set-01", 1, root=root))
    assert dumps_label_set(build_label_set(runs_dir, "set-01", 1, root=root)) == first
    other = build_label_set(runs_dir, "set-01", 2, root=root)
    assert dumps_label_set(other) != first
    assert len(other["items"]) == len(json.loads(first)["items"])


def test_the_list_is_shuffled(root: Path, runs) -> None:
    runs_dir, _ = runs
    items = build_label_set(runs_dir, "set-01", 1, root=root)["items"]
    assert [item["id"] for item in items] == [f"i{n:03d}" for n in range(1, len(items) + 1)]
    first_half = Counter(item["stratum"] for item in items[: len(items) // 2])
    assert len(first_half) == 4  # every stratum appears early, not in blocks


def test_repeats_point_to_earlier_or_later_primaries_far_enough_away(root: Path, runs) -> None:
    runs_dir, _ = runs
    items = build_label_set(runs_dir, "set-01", 1, root=root)["items"]
    position = {item["id"]: n for n, item in enumerate(items)}
    by_id = {item["id"]: item for item in items}
    repeats = [item for item in items if item["repeatOf"] is not None]
    assert len({item["repeatOf"] for item in repeats}) == 20
    for repeat in repeats:
        original = by_id[repeat["repeatOf"]]
        assert original["repeatOf"] is None
        assert {k: v for k, v in original.items() if k not in ("id", "repeatOf")} == \
               {k: v for k, v in repeat.items() if k not in ("id", "repeatOf")}
        assert abs(position[repeat["id"]] - position[original["id"]]) >= MIN_GAP


def test_pictures_and_screens(root: Path, runs) -> None:
    runs_dir, _ = runs
    items = build_label_set(runs_dir, "set-01", 1, root=root)["items"]
    for item in items:
        pictures, screens = item["pictures"], item["screens"]
        run_dir = f"runs/{item['brief']}/{item['candidate'].replace('/', '__')}"
        assert pictures["case"] == f"{run_dir}/{item['case']}.png"
        if item["case"].endswith("@320"):
            assert pictures["reference"] == f"{run_dir}/viewport-320.png"
            assert screens == {"reference": 320, "case": 320}
        else:
            assert pictures["reference"] == f"{run_dir}/baseline.png"
            assert screens == {"reference": 1280, "case": 320 if item["case"] == "viewport-320" else 1280}
        assert item["harness"] == {"commit": "abc1234", "dirty": False}


def test_few_focus_cases_are_filled_from_the_others(tmp_path: Path) -> None:
    runs = tmp_path / "runs"
    for n in range(4):  # 4 x 6 focus cases survive, so fewer than 60
        add_run(runs, f"m/brief-{n}/plain-s1")
    label_set = build_label_set(runs, "s", 7, root=tmp_path)
    drawn = label_set["composition"]["strata"]
    assert drawn["survived-focus"] == {"size": 24, "drawn": 24}
    assert drawn["survived-other"] == {"size": 52, "drawn": 52}
    assert label_set["composition"]["focusShareOfSurvived"] == 24 / 76


def test_write_refuses_to_overwrite_and_load_checks_the_file(tmp_path: Path, root: Path, runs) -> None:
    runs_dir, _ = runs
    label_set = build_label_set(runs_dir, "set-01", 1, root=root)
    path = tmp_path / "labels" / "set-01.json"
    write_label_set(label_set, path)
    assert load_label_set(path) == label_set
    with pytest.raises(SetupError, match="never rebuilt"):
        write_label_set(label_set, path)
    assert labels_path(path) == tmp_path / "labels" / "set-01.labels.jsonl"
    broken = json.loads(path.read_text(encoding="utf-8"))
    broken["items"][1]["id"] = broken["items"][0]["id"]
    (tmp_path / "bad.json").write_text(json.dumps(broken), encoding="utf-8")
    with pytest.raises(SetupError, match="duplicate"):
        load_label_set(tmp_path / "bad.json")


def test_describe_case() -> None:
    assert describe_case("text-longword@320") == "a 30-letter word, phone width"
    assert describe_case("viewport-320") == "phone width"
    assert describe_case("text-200pct") == "text at 200% size"
    assert describe_case("list-many") == "lists ten times longer"
