"""The run queue: runner/plan.toml lists jobs in order, and run-next works
through them (docs/SPEC.md, Run queue; D-048).

A job is a model, its variants, its briefs ("all" or a list) and a number of
samples. run-next generates every sample that is missing (a sample is done
once its generation.json says "generated" for the current cache key, so
finished work is never repeated), stops a free model's job when the daily
ledger allows no more, marks a model blocked when its first two samples both
fail with a rate-limit, availability or region error, stresses every valid
candidate that has no fresh stress result, re-runs summarize, and prints what
it did, what remains and when it can continue. It is safe to run any number
of times: it never re-rolls a sample and never clears the cache.
"""

from __future__ import annotations

import json
import re
import threading
import tomllib
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .briefs import list_briefs, load_brief
from .budget import Budget
from .cache import Cache, cache_key
from .generate import Gate, SampleResult, candidate_id, generate_sample
from .ledger import DailyLimitReached, FreeRequestLedger, QuotaExhausted, is_free
from .models import ModelEntry
from .paths import CANDIDATES_DIR, REPO_ROOT, RUNNER_DIR
from .prompts import VARIANTS, build_messages
from .providers import Provider
from .stress import Runner, StressRow, find_candidates, stress_candidate

PLAN_FILE = RUNNER_DIR / "plan.toml"
JOB_KEYS = {"model", "variants", "briefs", "samples", "parallel", "only_if_blocked"}
#: At most this many jobs marked parallel run at once.
MAX_PARALLEL = 2
#: An API error that says the model cannot be reached from here: rate limits,
#: availability and region blocks. Two in a row on a model's first two
#: samples mark the model blocked.
BLOCKING_ERROR = re.compile(r"HTTP (?:403|404|429|502|503)\b|region|not available|unavailable|no endpoints",
                            re.IGNORECASE)


class PlanError(ValueError):
    """The plan file is malformed."""


@dataclass(frozen=True)
class Job:
    model: str
    variants: tuple[str, ...]
    #: None means every corpus brief.
    briefs: tuple[str, ...] | None
    samples: int
    #: Jobs marked parallel may run two at a time.
    parallel: bool = False
    #: A fallback job runs only if one of these models is blocked.
    only_if_blocked: tuple[str, ...] = ()

    def brief_ids(self) -> list[str]:
        return list(self.briefs) if self.briefs is not None else list_briefs(corpus_only=True)

    def sample_keys(self) -> list[tuple[str, str, int]]:
        """(brief, variant, sample) in run order: brief by brief, so that a
        stopped job leaves complete plain and hinted pairs."""
        return [(brief, variant, sample) for brief in self.brief_ids() for variant in self.variants
                for sample in range(1, self.samples + 1)]


@dataclass(frozen=True)
class Plan:
    jobs: list[Job]
    runs_dir: Path
    out_dir: Path

    @property
    def state_file(self) -> Path:
        return self.runs_dir / "queue-state.json"


def load_plan(path: Path = PLAN_FILE, *, models: dict[str, ModelEntry]) -> Plan:
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    for key in ("runs_dir", "out"):
        if not isinstance(data.get(key), str) or not data[key]:
            raise PlanError(f"{path.name}: {key} is required")
    jobs = []
    for index, raw in enumerate(data.get("job", [])):
        where = f"job #{index + 1}"
        if not isinstance(raw, dict) or set(raw) - JOB_KEYS:
            raise PlanError(f"{where}: unknown keys {sorted(set(raw) - JOB_KEYS) if isinstance(raw, dict) else raw}")
        model = raw.get("model")
        if model not in models:
            raise PlanError(f'{where}: unknown model "{model}"')
        variants = raw.get("variants")
        if not isinstance(variants, list) or not variants or any(v not in VARIANTS for v in variants):
            raise PlanError(f"{where}: variants must be a list of {', '.join(VARIANTS)}")
        briefs = raw.get("briefs")
        if briefs == "all":
            brief_ids = None
        elif isinstance(briefs, list) and briefs and all(isinstance(b, str) for b in briefs):
            for brief_id in briefs:
                load_brief(brief_id)  # fails on an unknown brief
            brief_ids = tuple(briefs)
        else:
            raise PlanError(f'{where}: briefs must be "all" or a list of brief ids')
        samples = raw.get("samples")
        if not isinstance(samples, int) or isinstance(samples, bool) or samples < 1:
            raise PlanError(f"{where}: samples must be a positive integer")
        fallback_for = raw.get("only_if_blocked", [])
        if not isinstance(fallback_for, list) or any(m not in models for m in fallback_for):
            raise PlanError(f"{where}: only_if_blocked must list known models")
        jobs.append(Job(model, tuple(variants), brief_ids, samples, bool(raw.get("parallel", False)),
                        tuple(fallback_for)))
    return Plan(jobs, REPO_ROOT / data["runs_dir"], REPO_ROOT / data["out"])


class QueueState:
    """runs_dir/queue-state.json: blocked models and the outcome of each
    model's first two samples. Thread-safe."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.Lock()
        data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        self.blocked: dict[str, str] = dict(data.get("blocked") or {})
        self.probe: dict[str, list[str]] = {k: list(v) for k, v in (data.get("probe") or {}).items()}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps({"blocked": self.blocked, "probe": self.probe}, indent=2) + "\n",
                             encoding="utf-8", newline="\n")
        temporary.replace(self.path)

    def record(self, model: str, result: SampleResult, error: str | None) -> str | None:
        """Counts a model's first two samples. Returns the reason when this
        sample makes the model blocked."""
        with self.lock:
            outcomes = self.probe.setdefault(model, [])
            if len(outcomes) >= 2 or model in self.blocked:
                return None
            if result.status == "api-error" and error and BLOCKING_ERROR.search(error):
                outcomes.append(f"blocking: {error[:200]}")
            elif result.status == "api-error":
                outcomes.append(f"error: {(error or '')[:200]}")
            else:
                outcomes.append("ok")
            reason = None
            if len(outcomes) == 2 and all(outcome.startswith("blocking") for outcome in outcomes):
                reason = "first two samples failed: " + " | ".join(outcome[len("blocking: "):] for outcome in outcomes)
                self.blocked[model] = reason
            self.save()
            return reason


@dataclass
class Deps:
    """Everything run-next touches, so that tests can replace it."""

    models: dict[str, ModelEntry]
    provider_factory: Callable[[ModelEntry, FreeRequestLedger | None], Provider]
    gate: Gate
    stress_runner: Runner
    ledger: FreeRequestLedger
    summarize: Callable[[Plan, list[str], list[str]], list[Path]]
    cache: Cache = field(default_factory=Cache)
    candidates_dir: Path = CANDIDATES_DIR
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)
    out: Callable[[str], None] = print


def is_done(deps: Deps, entry: ModelEntry, brief_id: str, variant: str, sample: int) -> bool:
    """A sample is done when its generation.json says "generated" for the
    current cache key (the prompt and the model entry are unchanged)."""
    record_file = deps.candidates_dir / candidate_id(entry.id, brief_id, variant, sample) / "generation.json"
    if not record_file.is_file():
        return False
    record = json.loads(record_file.read_text(encoding="utf-8"))
    key = cache_key(entry, build_messages(load_brief(brief_id), variant), sample)
    return record.get("status") == "generated" and record.get("cacheKey") == key


def active_jobs(plan: Plan, state: QueueState) -> list[Job]:
    """The jobs that run: every job except a fallback whose models are all unblocked."""
    return [job for job in plan.jobs if not job.only_if_blocked or any(m in state.blocked for m in job.only_if_blocked)]


def pending(deps: Deps, job: Job) -> list[tuple[str, str, int]]:
    entry = deps.models[job.model]
    return [key for key in job.sample_keys() if not is_done(deps, entry, *key)]


@dataclass
class JobReport:
    job: Job
    results: list[SampleResult] = field(default_factory=list)
    #: Why the job stopped early: a quota, a blocked model.
    stopped: str | None = None


def run_job(deps: Deps, job: Job, state: QueueState, free_stop: list[str]) -> JobReport:
    """Generates the job's missing samples, one at a time."""
    report = JobReport(job)
    budget = Budget()
    entry = deps.models[job.model]
    free = is_free(entry)
    ledger = deps.ledger if free else None
    providers: list[Provider] = []

    def provider() -> Provider:
        if not providers:
            providers.append(deps.provider_factory(entry, ledger))
        return providers[0]

    prefix = f"[{job.model}]"
    for brief_id, variant, sample in pending(deps, job):
        if job.model in state.blocked:
            report.stopped = f"blocked: {state.blocked[job.model]}"
            break
        if free and free_stop:
            report.stopped = free_stop[0]
            break
        try:
            result = generate_sample(entry, load_brief(brief_id), variant, sample, budget, provider=provider,
                                     gate=deps.gate, cache=deps.cache, candidates_dir=deps.candidates_dir,
                                     ledger=ledger, out=lambda line: deps.out(f"{prefix}{line}"))
        except QuotaExhausted as error:
            report.stopped = str(error)
            if isinstance(error, DailyLimitReached):
                free_stop.append(str(error))
            deps.out(f"{prefix}  {brief_id} {variant}-s{sample}: stopped, {error}")
            break
        report.results.append(result)
        error = result.reasons[0]["message"] if result.status == "api-error" and result.reasons else None
        blocked = state.record(job.model, result, error)
        if blocked:
            report.stopped = f"blocked: {blocked}"
            deps.out(f"{prefix}  model blocked: {blocked}")
            break
    return report


def stress_new(deps: Deps, plan: Plan, model_ids: list[str]) -> list[StressRow]:
    """Stresses every valid candidate of the given models that has no stress
    result in the plan's runs directory, or an older one than its Component.tsx."""
    rows = []
    brief_ids = list_briefs(corpus_only=True)
    for model_id in model_ids:
        for brief_id, variant, sample in find_candidates(model_id, brief_ids, None, deps.candidates_dir):
            cid = f"{model_id}/{brief_id}/{variant}-s{sample}"
            record_file = deps.candidates_dir / cid / "generation.json"
            if not record_file.is_file() or not json.loads(record_file.read_text(encoding="utf-8")).get("valid"):
                continue
            summary = plan.runs_dir / brief_id / cid.replace("/", "__") / "summary.json"
            component = deps.candidates_dir / cid / "Component.tsx"
            if summary.is_file() and summary.stat().st_mtime >= component.stat().st_mtime:
                continue
            rows.append(stress_candidate(model_id, brief_id, variant, sample, run=deps.stress_runner,
                                         candidates_dir=deps.candidates_dir, runs_dir=plan.runs_dir, out=deps.out))
    return rows


def finished_models(deps: Deps, plan: Plan, state: QueueState) -> list[str]:
    """Models whose queued jobs are all finished: not blocked, every sample
    generated and every valid candidate stressed."""
    jobs = active_jobs(plan, state)
    finished = []
    for model_id in dict.fromkeys(job.model for job in jobs):
        own = [job for job in jobs if job.model == model_id]
        if model_id in state.blocked or any(pending(deps, job) for job in own):
            continue
        unstressed = False
        for job in own:
            for brief_id, variant, sample in job.sample_keys():
                cid = candidate_id(model_id, brief_id, variant, sample)
                record = json.loads((deps.candidates_dir / cid / "generation.json").read_text(encoding="utf-8"))
                summary = plan.runs_dir / brief_id / cid.replace("/", "__") / "summary.json"
                if record.get("valid") and not summary.is_file():
                    unstressed = True
        if not unstressed:
            finished.append(model_id)
    return finished


def _next_utc_midnight(now: datetime) -> str:
    day = now.astimezone(timezone.utc).date() + timedelta(days=1)
    return f"{day.isoformat()}T00:00Z"


def run_next(plan: Plan, deps: Deps, *, dry_run: bool = False) -> dict[str, Any]:
    """One pass through the queue. Returns what was done and what remains."""
    out = deps.out
    state = QueueState(plan.state_file)
    jobs = active_jobs(plan, state)
    out(f"run-next: {len(jobs)} active job(s) of {len(plan.jobs)}; {deps.ledger.status()}")

    if dry_run:
        remaining = {}
        for index, job in enumerate(jobs, 1):
            todo = pending(deps, job)
            remaining[f"{index}. {job.model}"] = len(todo)
            entry = deps.models[job.model]
            note = "blocked" if job.model in state.blocked else ("free" if is_free(entry) else entry.provider)
            out(f"  job {index} {job.model} ({note}): {len(job.sample_keys()) - len(todo)} done, {len(todo)} to generate")
        out(f"dry run: nothing was called, stressed or written; {deps.ledger.remaining()} free request(s) left today")
        return {"dryRun": True, "remaining": remaining}

    free_stop: list[str] = []
    reports: list[JobReport] = []
    index = 0
    while index < len(jobs):
        group = [jobs[index]]
        while (group[-1].parallel and index + len(group) < len(jobs) and jobs[index + len(group)].parallel
               and len(group) < MAX_PARALLEL):
            group.append(jobs[index + len(group)])
        if len(group) == 1:
            reports.append(run_job(deps, group[0], state, free_stop))
        else:
            out("  running " + " and ".join(job.model for job in group) + " at the same time")
            with ThreadPoolExecutor(max_workers=len(group)) as pool:
                reports += list(pool.map(lambda job: run_job(deps, job, state, free_stop), group))
        index += len(group)

    # A fallback can become active during this pass when a model was blocked.
    for job in active_jobs(plan, state):
        if job not in jobs:
            out(f"  fallback {job.model} is now active")
            reports.append(run_job(deps, job, state, free_stop))

    jobs = active_jobs(plan, state)
    model_ids = list(dict.fromkeys(job.model for job in jobs))
    stressed = stress_new(deps, plan, model_ids)
    finished = finished_models(deps, plan, state)
    written = deps.summarize(plan, model_ids, finished)

    results = [result for report in reports for result in report.results]
    count = lambda status: sum(1 for r in results if r.status == status)  # noqa: E731
    remaining = {f"{n}. {job.model}": len(pending(deps, job)) for n, job in enumerate(jobs, 1)}
    remaining = {key: value for key, value in remaining.items() if value}
    continue_at = []
    if any(is_free(deps.models[job.model]) and remaining.get(f"{n}. {job.model}") for n, job in enumerate(jobs, 1)
           if job.model not in state.blocked):
        if deps.ledger.remaining() == 0 or free_stop:
            continue_at.append(f"free models: after {_next_utc_midnight(deps.now())} (the ledger allows "
                               f"{deps.ledger.limit} requests a UTC day)")
        else:
            continue_at.append("free models: now (requests left today)")
    usage_stops = [r.stopped for r in reports if r.stopped and "usage limit" in r.stopped]
    if usage_stops:
        continue_at.append(f"claude-cli models: after the plan's usage limit resets ({usage_stops[0]})")

    out("")
    out(f"done: called {count('called')}, cache hits {count('cached')}, api errors {count('api-error')}, "
        f"skipped {count('skipped')}; valid {sum(1 for r in results if r.valid)}, "
        f"invalid {sum(1 for r in results if r.valid is False and r.status != 'api-error')}; "
        f"stressed {sum(1 for r in stressed if r.status == 'stressed')}, "
        f"harness errors {sum(1 for r in stressed if r.status == 'harness-error')}")
    for report in reports:
        if report.stopped:
            out(f"stopped: {report.job.model}: {report.stopped}")
    out("remaining: " + (", ".join(f"job {k}: {v} sample(s)" for k, v in remaining.items()) or "nothing left to do"))
    out("blocked: " + (", ".join(f"{m} ({why})" for m, why in state.blocked.items()) or "none"))
    out("finished: " + (", ".join(finished) or "none"))
    out("continue: " + ("; ".join(continue_at) if continue_at else ("nothing left to do" if not remaining else "now")))
    for path in written:
        out(f"wrote {path.relative_to(REPO_ROOT).as_posix() if path.is_relative_to(REPO_ROOT) else path}")
    return {
        "dryRun": False,
        "called": count("called"), "cached": count("cached"), "apiErrors": count("api-error"),
        "skipped": count("skipped"), "stressed": sum(1 for r in stressed if r.status == "stressed"),
        "remaining": remaining, "blocked": dict(state.blocked), "finished": finished, "continue": continue_at,
        "stopped": {report.job.model: report.stopped for report in reports if report.stopped},
    }
