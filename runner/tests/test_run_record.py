"""run-record: the run record (docs/RUNS.md) from synthetic generation records
and stress summaries. No network and no Node."""

import json
from pathlib import Path

from first_edit.models import ModelEntry
from first_edit.run_queue import Job, Plan
from first_edit.run_record import build_record, render_record, write_record

BRIEFS = ["brief-a", "brief-b"]
FREE = ModelEntry(id="free-mock", provider="openai-compatible", base_url="https://api.example.test/v1",
                  api_key_env="TEST_KEY", model="vendor/mock:free", params={"max_tokens": 1000})
PAID = ModelEntry(id="paid-mock", provider="openai-compatible", base_url="https://api.example.test/v1",
                  api_key_env="TEST_KEY", model="vendor/paid", params={"max_tokens": 2000})
IDLE = ModelEntry(id="idle-mock", provider="openai-compatible", base_url="https://api.example.test/v1",
                  api_key_env="TEST_KEY", model="vendor/idle:free", params={"max_tokens": 1000})
SPARE = ModelEntry(id="spare-mock", provider="openai-compatible", base_url="https://api.example.test/v1",
                   api_key_env="TEST_KEY", model="vendor/spare:free", params={"max_tokens": 1000})
MODELS = {entry.id: entry for entry in (FREE, PAID, IDLE, SPARE)}


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def add_generation(root: Path, cid: str, *, status: str = "generated", valid: bool = True,
                   received: str | None = "2026-11-13T10:00:00+00:00", generated: str = "2026-11-13T10:00:05+00:00",
                   params: dict | None = None, reported: str | None = "vendor/mock:free",
                   served_by: str | None = "Vendor") -> None:
    model = MODELS[cid.split("/")[0]]
    record = {"model": {**model.describe(), "params": params if params is not None else model.params},
              "status": status, "valid": valid, "generatedAt": generated}
    if status != "api-error":
        record.update({"receivedAt": received, "reportedModel": reported, "reportedProvider": served_by})
    write_json(root / "candidates" / cid / "generation.json", record)


def add_summary(root: Path, cid: str, *, suite: str | None = "v1", commit: str = "abc1234", dirty: bool = False,
                playwright: str = "1.65.0", chromium: str = "158.0.1") -> None:
    brief = cid.split("/")[1]
    write_json(root / "runs" / brief / cid.replace("/", "__") / "summary.json", {
        "schemaVersion": 3, **({"suite": suite} if suite is not None else {}),
        "harness": {"commit": commit, "dirty": dirty},
        "versions": {"playwright": playwright, "chromium": chromium},
    })


def plan(root: Path) -> Plan:
    return Plan([Job("free-mock", ("plain", "hinted"), tuple(BRIEFS), 1),
                 Job("idle-mock", ("plain",), tuple(BRIEFS), 1),
                 Job("spare-mock", ("plain",), tuple(BRIEFS), 1, only_if_blocked=("idle-mock",))],
                root / "runs", root / "out")


def record(root: Path, the_plan: Plan | None = None) -> dict:
    return build_record(the_plan or plan(root), MODELS, BRIEFS, plan_file=root / "plan.toml",
                        candidates_dir=root / "candidates")


def test_counts_valid_invalid_and_failed_calls_per_variant(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1")
    add_generation(tmp_path, "free-mock/brief-b/plain-s1", valid=False)
    add_generation(tmp_path, "free-mock/brief-a/hinted-s1")
    add_generation(tmp_path, "free-mock/brief-a/hinted-s2")
    add_generation(tmp_path, "free-mock/brief-b/hinted-s1", status="api-error", valid=False)
    model = record(tmp_path)["models"][0]
    assert model["id"] == "free-mock"
    assert model["variants"] == [
        {"variant": "plain", "samples": 2, "sampleNumbers": [1], "briefs": 2, "valid": 1, "invalid": 1, "failed": 0},
        {"variant": "hinted", "samples": 3, "sampleNumbers": [1, 2], "briefs": 2, "valid": 2, "invalid": 0,
         "failed": 1},
    ]


def test_records_the_entry_what_the_provider_reported_and_the_call_times(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1", received="2026-11-13T10:00:00+00:00")
    add_generation(tmp_path, "free-mock/brief-b/plain-s1", received="2026-11-14T08:30:00+00:00",
                   reported="vendor/mock-0917:free", served_by="Other host")
    # A failed call has no reply, so it is dated by its record.
    add_generation(tmp_path, "free-mock/brief-b/hinted-s1", status="api-error", valid=False,
                   generated="2026-11-12T23:59:00+00:00")
    model = record(tmp_path)["models"][0]
    assert (model["provider"], model["baseUrl"], model["providerModel"]) == (
        "openai-compatible", "https://api.example.test/v1", "vendor/mock:free")
    assert model["reportedModels"] == ["vendor/mock-0917:free", "vendor/mock:free"]
    assert model["reportedProviders"] == ["Other host", "Vendor"]
    assert model["calls"] == {"first": "2026-11-12T23:59:00+00:00", "last": "2026-11-14T08:30:00+00:00"}
    assert model["free"] is True


def test_lists_every_distinct_parameter_set_the_records_name(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1")
    add_generation(tmp_path, "free-mock/brief-b/plain-s1", params={"max_tokens": 1000, "temperature": 0})
    assert sorted(record(tmp_path)["models"][0]["params"], key=len) == [
        '{"max_tokens": 1000}', '{"max_tokens": 1000, "temperature": 0}']


def test_reads_the_suite_commit_and_browser_versions_from_the_stress_summaries(tmp_path: Path) -> None:
    for brief in BRIEFS:
        add_generation(tmp_path, f"free-mock/{brief}/plain-s1")
        add_generation(tmp_path, f"free-mock/{brief}/hinted-s1")
    add_generation(tmp_path, "free-mock/brief-a/hinted-s2", valid=False)
    add_summary(tmp_path, "free-mock/brief-a/plain-s1")
    add_summary(tmp_path, "free-mock/brief-b/plain-s1", suite=None, commit="def5678", dirty=True)
    add_summary(tmp_path, "free-mock/brief-a/hinted-s1", suite="v1.1")
    stress = record(tmp_path)["models"][0]["stress"]
    assert stress == {
        "stressed": 3, "notStressed": 1,
        # A summary without the suite field is from the step 10 harness, suite v1.
        "suites": {"v1": 2, "v1.1": 1},
        "commits": {"abc1234": 2, "def5678 (dirty)": 1},
        "playwright": {"1.65.0": 3}, "chromium": {"158.0.1": 3},
    }


def test_covers_the_active_jobs_models_in_plan_order_and_names_the_rest(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1")
    # A model outside the plan is not part of the run.
    add_generation(tmp_path, "paid-mock/brief-a/plain-s1", reported="vendor/paid")
    result = record(tmp_path)
    assert [m["id"] for m in result["models"]] == ["free-mock", "idle-mock"]
    idle = result["models"][1]
    assert idle["variants"] == [] and idle["calls"] == {"first": None, "last": None}
    assert result["blocked"] == {}
    assert result["inactiveFallbacks"] == [{"model": "spare-mock", "onlyIfBlocked": ["idle-mock"]}]

    write_json(tmp_path / "runs" / "queue-state.json", {"blocked": {"idle-mock": "first two samples failed: HTTP 403"},
                                                        "probe": {}})
    result = record(tmp_path)
    assert [m["id"] for m in result["models"]] == ["free-mock", "idle-mock", "spare-mock"]
    assert result["blocked"] == {"idle-mock": "first two samples failed: HTTP 403"}
    assert result["inactiveFallbacks"] == []


def test_the_record_says_whether_every_model_is_a_free_variant(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1")
    text = render_record(record(tmp_path))
    assert "Every model in this run is a free-tier variant" in text
    assert "No frontier model was tested (D-057)." in text

    mixed = Plan([Job("free-mock", ("plain",), tuple(BRIEFS), 1), Job("paid-mock", ("plain",), tuple(BRIEFS), 1)],
                 tmp_path / "runs", tmp_path / "out")
    text = render_record(record(tmp_path, mixed))
    assert "Every model in this run is a free-tier variant" not in text
    assert "Not free-tier variants: paid-mock." in text


def test_renders_every_table_and_is_the_same_on_every_run(tmp_path: Path) -> None:
    add_generation(tmp_path, "free-mock/brief-a/plain-s1")
    add_generation(tmp_path, "free-mock/brief-b/plain-s1", status="api-error", valid=False)
    add_summary(tmp_path, "free-mock/brief-a/plain-s1")
    text = render_record(record(tmp_path))
    assert text.startswith("# Run record\n")
    for heading in ("## Models", "## Samples and calls", "## Request parameters", "## Stress runs", "## Queue"):
        assert f"\n{heading}\n" in text
    assert ("| free-mock | openai-compatible | https://api.example.test/v1 | vendor/mock:free | vendor/mock:free | "
            "Vendor | 2026-11-13T10:00:00+00:00 | 2026-11-13T10:00:05+00:00 |") in text
    assert "| free-mock | plain | 2 | s1 | 2 | 1 | 0 | 1 |" in text
    assert "| idle-mock | - | 0 | - | 0 | 0 | 0 | 0 |" in text
    assert "In all: 2 samples, 1 valid, 0 invalid, 1 failed." in text
    assert '| free-mock | `{"max_tokens": 1000}` |' in text
    assert "| free-mock | 1 | 0 | v1 (1) | abc1234 (1) | 1.65.0 (1) | 158.0.1 (1) |" in text
    assert "- Blocked models: none." in text
    assert "- Not active: spare-mock, a fallback that runs only if one of idle-mock is blocked." in text
    # No timestamp of its own: the same records give the same bytes.
    first = write_record(record(tmp_path), tmp_path / "a" / "RUNS.md").read_bytes()
    second = write_record(record(tmp_path), tmp_path / "b" / "RUNS.md").read_bytes()
    assert first == second and b"\r\n" not in first
