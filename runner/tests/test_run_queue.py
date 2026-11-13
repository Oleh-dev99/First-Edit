"""run-next with the mock model, a fake ledger and a fake stress runner:
resuming after a stop, a blocked model and its fallback, nothing left to
do, and a dry run. No network and no Node."""

import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from first_edit.briefs import list_briefs
from first_edit.cache import Cache
from first_edit.ledger import FreeRequestLedger
from first_edit.models import ModelEntry, load_models
from first_edit.providers import MockProvider, ProviderError
from first_edit.run_queue import Deps, Job, Plan, PlanError, QueueState, load_plan, run_next
from first_edit.summarize import build_summary, load_candidates, write_outputs

from test_summarize import add_run

BRIEFS = ("pricing-table", "data-table")
FREE = ModelEntry(id="free-mock", provider="openai-compatible", base_url="https://api.example.test/v1",
                  api_key_env="TEST_KEY", model="vendor/mock:free", params={"max_tokens": 1000})
BLOCKED = ModelEntry(id="far-away", provider="openai-compatible", base_url="https://api.example.test/v1",
                     api_key_env="TEST_KEY", model="vendor/far:free", params={"max_tokens": 1000})
FALLBACK = ModelEntry(id="mock-reference", provider="mock")
MODELS = {entry.id: entry for entry in (FREE, BLOCKED, FALLBACK)}


class LedgeredMock(MockProvider):
    """The mock model, counting every request in the ledger like a free model."""

    def __init__(self, entry: ModelEntry, ledger: FreeRequestLedger | None, calls: list[str]) -> None:
        super().__init__(entry)
        self.ledger, self.calls = ledger, calls

    def complete(self, messages, brief):
        if self.ledger is not None:
            self.ledger.before_request()
        self.calls.append(f"{self.entry.id}/{brief.id}")
        return super().complete(messages, brief)


class RegionBlocked:
    def __init__(self, ledger: FreeRequestLedger | None, calls: list[str]) -> None:
        self.ledger, self.calls = ledger, calls

    def complete(self, messages, brief):
        if self.ledger is not None:
            self.ledger.before_request()
        self.calls.append(f"far-away/{brief.id}")
        raise ProviderError('HTTP 403: {"error":{"message":"This model is not available in your region."}}')


class World:
    """Temporary directories, a clock, a fake ledger and the call log."""

    def __init__(self, tmp_path: Path, *, limit: int = 45) -> None:
        self.root = tmp_path
        self.clock = [datetime(2026, 11, 13, 22, 0, tzinfo=timezone.utc)]
        self.ledger = FreeRequestLedger(tmp_path / "free-requests.json", limit=limit, min_interval=0,
                                        now=lambda: self.clock[0], sleep=lambda _seconds: None)
        self.calls: list[str] = []
        self.stressed: list[str] = []
        self.lines: list[str] = []

    def provider(self, entry: ModelEntry, ledger: FreeRequestLedger | None):
        if entry.id == "far-away":
            return RegionBlocked(ledger, self.calls)
        return LedgeredMock(entry, ledger, self.calls)

    def stress(self, brief_id: str, candidate: str, runs_dir: Path) -> subprocess.CompletedProcess[str]:
        self.stressed.append(candidate)
        add_run(self.root, candidate, suite="v1", harness={"commit": "abc1234", "dirty": False})
        return subprocess.CompletedProcess([], 0, "", "")

    def summarize(self, plan: Plan, model_ids: list[str], finished: list[str]) -> list[Path]:
        candidates = load_candidates(model_ids, list(BRIEFS), candidates_dir=self.root / "candidates",
                                     runs_dir=plan.runs_dir)
        summary = build_summary(candidates, model_ids, list(BRIEFS), {m: MODELS[m].describe() for m in model_ids},
                                finished=finished)
        return write_outputs(candidates, summary, plan.out_dir)

    def deps(self) -> Deps:
        return Deps(models=MODELS, provider_factory=self.provider,
                    gate=lambda _brief, _candidate: {"valid": True, "reasons": []},
                    stress_runner=self.stress, ledger=self.ledger, summarize=self.summarize,
                    cache=Cache(self.root / "cache"), candidates_dir=self.root / "candidates",
                    now=lambda: self.clock[0], out=self.lines.append)

    def plan(self, *jobs: Job) -> Plan:
        return Plan(list(jobs), self.root / "runs", self.root / "out")


def job(model: str, **kwargs) -> Job:
    return Job(model, kwargs.pop("variants", ("plain", "hinted")), kwargs.pop("briefs", BRIEFS), 1, **kwargs)


def test_resuming_after_the_daily_limit_stops_a_free_model(tmp_path: Path) -> None:
    world = World(tmp_path, limit=3)
    plan = world.plan(job("free-mock"))

    first = run_next(plan, world.deps())
    # Three requests fit in the day; the fourth sample waits for the next UTC day.
    assert (first["called"], first["stressed"]) == (3, 3)
    assert first["remaining"] == {"1. free-mock": 1}
    assert first["continue"] == ["free models: after 2026-11-14T00:00Z (the ledger allows 3 requests a UTC day)"]
    assert "stopped: free-mock: daily free-request limit reached (3 sent today, UTC 2026-11-13)" in world.lines
    assert (tmp_path / "out" / "report.md").is_file()

    # The same day: nothing can be called, and nothing is repeated.
    again = run_next(plan, world.deps())
    assert (again["called"], again["stressed"], len(world.calls)) == (0, 0, 3)

    world.clock[0] += timedelta(hours=3)
    second = run_next(plan, world.deps())
    assert (second["called"], second["stressed"], second["remaining"]) == (1, 1, {})
    # Every sample was called exactly once, and stressed once.
    assert sorted(world.calls) == sorted(f"free-mock/{brief}" for brief in BRIEFS for _variant in range(2))
    assert len(world.stressed) == 4 == len(set(world.stressed))
    assert second["finished"] == ["free-mock"]
    report = (tmp_path / "out" / "report.md").read_text(encoding="utf-8")
    assert "Covering the models whose queued jobs are all finished: free-mock." in report


def test_a_blocked_model_is_skipped_and_its_fallback_runs(tmp_path: Path) -> None:
    world = World(tmp_path)
    plan = world.plan(job("far-away"), job("mock-reference", only_if_blocked=("far-away",)))

    result = run_next(plan, world.deps())
    # The first two samples failed with a region error: blocked after two calls, not four.
    assert world.calls[:2] == ["far-away/pricing-table", "far-away/pricing-table"]
    assert sum(1 for call in world.calls if call.startswith("far-away")) == 2
    assert "far-away" in result["blocked"] and "not available in your region" in result["blocked"]["far-away"]
    # The fallback ran in the same pass and finished; the blocked model is not finished.
    assert sum(1 for call in world.calls if call.startswith("mock-reference")) == 4
    assert result["finished"] == ["mock-reference"]
    assert QueueState(plan.state_file).blocked.keys() == {"far-away"}

    # A later pass never calls the blocked model again.
    run_next(plan, world.deps())
    assert sum(1 for call in world.calls if call.startswith("far-away")) == 2


def test_nothing_left_to_do(tmp_path: Path) -> None:
    world = World(tmp_path)
    plan = world.plan(job("mock-reference"))
    run_next(plan, world.deps())
    calls, stressed = len(world.calls), len(world.stressed)
    world.lines.clear()

    result = run_next(plan, world.deps())
    assert (result["called"], result["cached"], result["stressed"], result["remaining"]) == (0, 0, 0, {})
    assert (len(world.calls), len(world.stressed)) == (calls, stressed)
    assert "remaining: nothing left to do" in world.lines and "continue: nothing left to do" in world.lines


def test_a_dry_run_calls_and_writes_nothing(tmp_path: Path) -> None:
    world = World(tmp_path)
    plan = world.plan(job("free-mock"), job("mock-reference", only_if_blocked=("free-mock",)))
    result = run_next(plan, world.deps(), dry_run=True)
    assert result == {"dryRun": True, "remaining": {"1. free-mock": 4}}
    assert world.calls == [] and not (tmp_path / "candidates").exists() and not (tmp_path / "out").exists()
    assert world.ledger.used() == 0


def test_the_plan_file() -> None:
    plan = load_plan(models=load_models())
    assert plan.runs_dir.name == "runs-run2" and plan.out_dir.name == "run2"
    models = [job.model for job in plan.jobs]
    assert models[:5] == ["ernie-5.5-flash-free", "nemotron-3.5-free", "gemma-4-31b-free", "nemotron-3-ultra-free",
                          "north-mini-code-free"]
    assert plan.jobs[-1].only_if_blocked == ("gemma-4-31b-free", "nemotron-3-ultra-free", "north-mini-code-free")
    # 160 free calls: 2 x 10 x 2 plus 3 x 20 x 2.
    assert sum(len(job.sample_keys()) for job in plan.jobs if not job.only_if_blocked) == 160
    assert all(len(job.brief_ids()) in (10, 20) for job in plan.jobs)
    # The spike models get only the ten step 11 briefs; they have the other ten from step 8.
    step11 = {"activity-feed", "checkout-summary", "confirm-dialog", "day-agenda", "invoice-summary", "sidebar-nav",
              "site-footer", "tabs-panel", "team-directory", "testimonial-grid"}
    assert set(plan.jobs[0].brief_ids()) == set(plan.jobs[1].brief_ids()) == step11
    assert set(plan.jobs[2].brief_ids()) == set(list_briefs(corpus_only=True))


def test_an_invalid_plan_is_an_error(tmp_path: Path) -> None:
    path = tmp_path / "plan.toml"
    path.write_text('runs_dir = "r"\nout = "o"\n[[job]]\nmodel = "nope"\nvariants = ["plain"]\nbriefs = "all"\nsamples = 1\n',
                    encoding="utf-8")
    with pytest.raises(PlanError, match="unknown model"):
        load_plan(path, models=MODELS)
    path.write_text('runs_dir = "r"\nout = "o"\n[[job]]\nmodel = "free-mock"\nvariants = ["loud"]\nbriefs = "all"\n'
                    'samples = 1\n', encoding="utf-8")
    with pytest.raises(PlanError, match="variants"):
        load_plan(path, models=MODELS)
