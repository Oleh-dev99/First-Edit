"""The summarize command: per model and variant numbers from generation.json
and the stress results, written as summary.json, report.md and a static
gallery.html of cases.

The headline (D-033) is the share of clean-baseline candidates that broke at
least once in a core case, with a 95% Wilson interval; the same measure over
all cases, extreme ones included, is shown beside it (D-039). The failure
rate per case and the mean survival rate, per tier, are secondary. The
report also shows the core headline with each case family removed in turn
(D-045). Every scored number covers clean-baseline candidates only (D-015).
Numbers are computed exact and rounded once, when summary.json is written.
The gallery shows every case of a clean-baseline candidate (failed or
survived) and the baseline of every born-broken or crashed candidate.
"""

from __future__ import annotations

import html
import json
import math
import os
import statistics
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .paths import CANDIDATES_DIR, RUNS_DIR
from .providers import SetupError
from .stress import baseline_state, find_candidates

SUMMARY_SCHEMA_VERSION = 3
#: The version of the harness's stress summary.json that this module reads.
STRESS_SCHEMA_VERSION = 3
#: The stress suite these numbers come from: cases, tiers, checks, tolerances
#: and the new-finding rule, frozen as suite v1 (D-044). Stress summaries
#: record it; a schema 3 summary without the field was written by the step 10
#: harness before the field existed, and that harness is suite v1.
SUITE_VERSION = "v1"
CHECKS = ("page-overflow-x", "text-clipped", "content-spill", "text-overlap", "off-screen")
CONTENT_MUTATIONS = ("text-long", "text-longword", "text-unbroken", "text-empty", "list-0", "list-1", "list-many",
                     "number-large")
#: Every case in run order: the mutations, then the content mutations at 320 px (D-032).
CASES = (*CONTENT_MUTATIONS, "viewport-320", "text-200pct", "dir-rtl", *(f"{m}@320" for m in CONTENT_MUTATIONS))
#: core cases make the headline; extreme cases are reported beside it (D-039).
TIERS = ("core", "extreme")
#: The tier of every case, as the harness writes it into each case entry.
CASE_TIERS = {case: "extreme" if case.split("@")[0] == "text-unbroken" else "core" for case in CASES}
#: Scopes of the per-tier numbers: each tier, then every case.
SCOPES = (*TIERS, "all")


def family_of(case_id: str) -> str:
    """A case's family is its mutation: a content mutation and its @320 case
    form one family, an environment mutation is a family of one case."""
    return case_id.split("@")[0]


#: Families with core cases, in run order. text-unbroken is extreme only, so
#: removing it never changes the headline.
CORE_FAMILIES = tuple(dict.fromkeys(family_of(case) for case in CASES if CASE_TIERS[case] == "core"))
VARIANT_ORDER = ("plain", "hinted")
#: The model name of a pooled group: every model of one variant.
POOLED = "all models"
#: z for a two-sided 95% interval.
Z_95 = 1.959964
#: Decimals of the floats written to summary.json. Numbers are computed exact
#: and rounded once, when written, and the report formats the exact values: a
#: rate rounded to 4 decimals and then to a 1-decimal percentage can round up
#: twice (30/38 printed as 79.0% instead of 78.9%).
FLOAT_DECIMALS = 4
#: Keys whose values keep the precision they are computed with: costs, and
#: per-case counts (2 decimals, as the report shows them).
KEEP_PRECISION = ("perCase", "usd", "costUsd", "actualUsd", "estimatedUsd")


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def rounded(value: Any, key: str | None = None) -> Any:
    """`value` with every float rounded to FLOAT_DECIMALS, except under the
    keys in KEEP_PRECISION; used once, when summary.json is written."""
    if key in KEEP_PRECISION:
        return value
    if isinstance(value, float):
        return round(value, FLOAT_DECIMALS)
    if isinstance(value, dict):
        return {k: rounded(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [rounded(item, key) for item in value]
    return value


def wilson(successes: int, trials: int, z: float = Z_95) -> list[float] | None:
    """The Wilson score interval for a proportion, [low, high], exact; None without trials."""
    if trials <= 0:
        return None
    p = successes / trials
    denominator = 1 + z * z / trials
    centre = (p + z * z / (2 * trials)) / denominator
    half = z * math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
    return [max(0.0, centre - half), min(1.0, centre + half)]


def _share(count: int, of: int) -> dict[str, Any]:
    return {"count": count, "of": of, "share": count / of if of else None, "ci95": wilson(count, of)}


@dataclass
class Case:
    """One case as the gallery shows it."""

    model: str
    brief: str
    variant: str
    sample: int
    candidate: str
    #: "baseline" or a case id ("text-long", "text-long@320")
    case: str
    status: str
    #: "failed", "survived", "born-broken" or "baseline-crash"
    outcome: str
    #: checks with new errors (failed) or baseline errors (born broken)
    checks: list[str]
    findings: list[dict[str, Any]]
    error: str | None
    screenshot: Path | None
    annotated: Path | None
    query: str | None
    viewport: dict[str, Any] | None
    truncations: int
    #: content-hidden values (normalized), when the case was measured
    hidden_values: list[str] = field(default_factory=list)
    #: "core" or "extreme"; None for a baseline
    tier: str | None = None


@dataclass
class Candidate:
    model: str
    brief: str
    variant: str
    sample: int
    candidate: str
    generation: dict[str, Any]
    #: the stress run's summary.json; None when not stressed
    summary: dict[str, Any] | None
    run_dir: Path
    cases: list[Case] = field(default_factory=list)

    @property
    def state(self) -> str:
        """api-error (no candidate), invalid, not-stressed, or once stressed
        baseline-crash, born-broken or clean (D-038)."""
        if self.generation.get("status") == "api-error":
            return "api-error"
        if not self.generation.get("valid"):
            return "invalid"
        if self.summary is None:
            return "not-stressed"
        return baseline_state(self.summary)

    def applicable_cases(self, tier: str | None = None) -> list[dict[str, Any]]:
        """Applicable cases of one tier ("core" or "extreme"), or of both (None)."""
        return [entry for entry in (self.summary or {}).get("cases", [])
                if entry.get("applicable") and (tier is None or entry.get("tier") == tier)]

    def broke(self, tier: str | None = None, without: str | None = None) -> bool:
        """True if an applicable case of the tier (or any case) failed, leaving
        out the cases of the family `without` when it is given."""
        return any(not entry.get("survived") for entry in self.applicable_cases(tier)
                   if without is None or family_of(entry["id"]) != without)

    def survival_rate(self, tier: str | None = None) -> float | None:
        """Survived / applicable cases of the tier (or of all cases), exact."""
        cases = self.applicable_cases(tier)
        return sum(1 for entry in cases if entry.get("survived")) / len(cases) if cases else None


def _case_from_files(candidate: Candidate, case_id: str, entry: dict[str, Any], outcome: str) -> Case:
    files = entry.get("files") or {}
    result = _read_json(candidate.run_dir / files["result"]) if files.get("result") else None
    result = result or {}
    if case_id == "baseline":
        findings = list(result.get("bornBroken") or [])
    else:
        findings = list(result.get("newFindings") or [])
    if outcome == "failed":
        checks = sorted(name for name, count in (entry.get("newErrors") or {}).items() if count)
    elif outcome == "born-broken":
        checks = sorted({finding["check"] for finding in findings if "check" in finding})
    else:
        checks = []

    def image(name: str | None) -> Path | None:
        return candidate.run_dir / name if name else None

    return Case(
        model=candidate.model, brief=candidate.brief, variant=candidate.variant, sample=candidate.sample,
        candidate=candidate.candidate, case=case_id, status=entry.get("status") or result.get("status") or "unknown",
        outcome=outcome, checks=checks, findings=findings, error=result.get("error"),
        screenshot=image(files.get("screenshot")), annotated=image(files.get("annotated")),
        query=result.get("query"), viewport=result.get("viewport"), truncations=entry.get("truncations") or 0,
        hidden_values=list(result.get("hiddenValues") or []),
        tier=None if case_id == "baseline" else entry.get("tier"),
    )


def load_candidates(model_ids: list[str], brief_ids: list[str], *, candidates_dir: Path = CANDIDATES_DIR,
                    runs_dir: Path = RUNS_DIR) -> list[Candidate]:
    """Every generated sample of the given models, with its stress results.
    A stress summary of another schema version is an error: re-run stress."""
    found = []
    for model_id in model_ids:
        for brief_id, variant, sample in find_candidates(model_id, brief_ids, None, candidates_dir):
            cid = f"{model_id}/{brief_id}/{variant}-s{sample}"
            generation = _read_json(candidates_dir / cid / "generation.json")
            if generation is None:
                continue
            run_dir = runs_dir / brief_id / cid.replace("/", "__")
            summary = _read_json(run_dir / "summary.json") if generation.get("valid") else None
            if summary is not None and summary.get("schemaVersion") != STRESS_SCHEMA_VERSION:
                raise SetupError(f"{run_dir / 'summary.json'} has stress schema {summary.get('schemaVersion')}; "
                                 f"summarize reads schema {STRESS_SCHEMA_VERSION}, so re-run stress into this runs directory")
            if summary is not None and summary.get("suite", SUITE_VERSION) != SUITE_VERSION:
                raise SetupError(f"{run_dir / 'summary.json'} was run with suite {summary.get('suite')}; "
                                 f"summarize reads suite {SUITE_VERSION}")
            candidate = Candidate(model_id, brief_id, variant, sample, cid, generation, summary, run_dir)
            state = candidate.state
            if state in ("born-broken", "baseline-crash"):
                candidate.cases.append(_case_from_files(candidate, "baseline", candidate.summary["baseline"], state))
            elif state == "clean":
                for entry in candidate.applicable_cases():
                    outcome = "survived" if entry.get("survived") else "failed"
                    candidate.cases.append(_case_from_files(candidate, entry["id"], entry, outcome))
            found.append(candidate)
    return found


def _sum(values: list[int | float | None]) -> int | float | None:
    present = [value for value in values if value is not None]
    return sum(present) if present else None


def _failure_rate(entries: list[dict[str, Any]]) -> dict[str, Any]:
    failed = sum(1 for entry in entries if not entry.get("survived"))
    return {"failed": failed, "applicable": len(entries),
            "rate": failed / len(entries) if entries else None, "ci95": wilson(failed, len(entries))}


def _survival(rates: list[float | None]) -> dict[str, Any]:
    present = [rate for rate in rates if rate is not None]
    return {"candidates": len(present), "mean": statistics.fmean(present) if present else None,
            "min": min(present) if present else None, "max": max(present) if present else None}


def group_stats(candidates: list[Candidate], brief_ids: list[str]) -> dict[str, Any]:
    """The numbers for one model and variant (or one variant pooled across models)."""
    generated = [c for c in candidates if c.state != "api-error"]
    invalid = [c for c in generated if c.state == "invalid"]
    clean = [c for c in generated if c.state == "clean"]
    tier_of = lambda scope: None if scope == "all" else scope  # noqa: E731

    by_rule: Counter[str] = Counter()
    for c in invalid:
        by_rule.update({reason.get("rule", "?") for reason in c.generation.get("reasons", [])})

    case_entries = [entry for c in clean for entry in c.applicable_cases()]
    failed_entries = [entry for entry in case_entries if not entry.get("survived")]
    by_case = {
        case: {
            "tier": CASE_TIERS[case],
            "failed": sum(1 for e in failed_entries if e["id"] == case),
            "applicable": sum(1 for e in case_entries if e["id"] == case),
        }
        for case in CASES
    }
    by_check = {check: sum(1 for e in failed_entries if (e.get("newErrors") or {}).get(check)) for check in CHECKS}

    rendered_ok = [c.summary["baseline"] for c in clean] + [e for e in case_entries if e.get("status") == "ok"]
    truncations = sum(entry.get("truncations") or 0 for entry in rendered_ok)
    measured = [e for e in case_entries if e.get("contentHidden") is not None]
    hidden = sum(e["contentHidden"] for e in measured)

    usage = [c.generation.get("usage") or {} for c in generated]
    actual = [c.generation.get("actualCostUsd") for c in generated]
    estimated = [c.generation.get("estimatedCostUsd") for c in generated]
    spend = [a if a is not None else e for a, e in zip(actual, estimated)]
    present = {c.brief for c in candidates}

    return {
        "candidates": len(generated),
        "valid": len(generated) - len(invalid),
        "invalid": len(invalid),
        "invalidByRule": dict(sorted(by_rule.items())),
        "apiErrors": len(candidates) - len(generated),
        "missingBriefs": [brief for brief in brief_ids if brief not in present],
        "notStressed": sum(1 for c in generated if c.state == "not-stressed"),
        "cleanBaseline": len(clean),
        "bornBroken": sum(1 for c in generated if c.state == "born-broken"),
        "baselineCrash": sum(1 for c in generated if c.state == "baseline-crash"),
        # The headline uses core cases; the same measure over all cases stands beside it (D-039).
        "brokeOnce": {scope: _share(sum(1 for c in clean if c.broke(tier_of(scope))), len(clean))
                      for scope in ("core", "all")},
        "failureRate": {scope: _failure_rate([e for c in clean for e in c.applicable_cases(tier_of(scope))])
                        for scope in SCOPES},
        "survival": {scope: _survival([c.survival_rate(tier_of(scope)) for c in clean]) for scope in SCOPES},
        "cases": {
            "applicable": len(case_entries),
            "failed": len(failed_entries),
            "renderErrors": sum(1 for e in case_entries if e.get("status") == "render-error"),
            "timeouts": sum(1 for e in case_entries if e.get("status") == "timeout"),
        },
        "failedByCase": by_case,
        "failedByCheck": by_check,
        "truncations": {
            "total": truncations,
            "renderedCases": len(rendered_ok),
            "perCase": round(truncations / len(rendered_ok), 2) if rendered_ok else None,
        },
        "contentHidden": {
            "total": hidden,
            "measuredCases": len(measured),
            "casesWithHidden": sum(1 for e in measured if e["contentHidden"] > 0),
            "perCase": round(hidden / len(measured), 2) if measured else None,
        },
        "tokens": {
            "input": _sum([u.get("inputTokens") for u in usage]),
            "cachedInput": _sum([u.get("cachedInputTokens") for u in usage]),
            "output": _sum([u.get("outputTokens") for u in usage]),
            "reasoning": _sum([u.get("reasoningTokens") for u in usage]),
        },
        "cost": {
            "usd": round(sum(value for value in spend if value is not None), 6),
            "actualUsd": _sum(actual),
            "estimatedUsd": _sum(estimated),
            "callsWithActualCost": sum(1 for value in actual if value is not None),
        },
    }


def _cell(candidates: list[Candidate]) -> str:
    """One brief x model cell of the survival table."""
    if not candidates:
        return "-"
    parts = []
    for c in sorted(candidates, key=lambda c: c.sample):
        state = c.state
        if state == "clean":
            counts = []
            for tier in TIERS:
                cases = c.applicable_cases(tier)
                counts.append(f"{sum(1 for e in cases if e.get('survived'))}/{len(cases)} {tier}")
            parts.append(", ".join(counts))
        else:
            parts.append(state.replace("-", " "))
    return "; ".join(parts)


def sensitivity(candidates: list[Candidate]) -> dict[str, list[dict[str, Any]]]:
    """Per variant, pooled over models: the core headline, then the same with
    each core case family removed in turn (D-045). One row per family, the
    first with "removed": None."""
    rows: dict[str, list[dict[str, Any]]] = {}
    for variant in VARIANT_ORDER:
        members = [c for c in candidates if c.variant == variant]
        if not members:
            continue
        clean = [c for c in members if c.state == "clean"]
        rows[variant] = [
            {"removed": family, **_share(sum(1 for c in clean if c.broke("core", without=family)), len(clean))}
            for family in (None, *CORE_FAMILIES)
        ]
    return rows


def build_summary(candidates: list[Candidate], model_ids: list[str], brief_ids: list[str],
                  models: dict[str, dict[str, Any]]) -> dict[str, Any]:
    groups = []
    for model_id in model_ids:
        for variant in VARIANT_ORDER:
            members = [c for c in candidates if c.model == model_id and c.variant == variant]
            if members:
                groups.append({"model": model_id, "variant": variant, "pooled": False, **group_stats(members, brief_ids)})
    # One pooled group per variant when more than one model has candidates of it.
    for variant in VARIANT_ORDER:
        members = [c for c in candidates if c.variant == variant]
        if len({c.model for c in members}) > 1:
            groups.append({"model": POOLED, "variant": variant, "pooled": True, **group_stats(members, brief_ids)})

    model_info = []
    for model_id in model_ids:
        members = [c for c in candidates if c.model == model_id]
        received = sorted(c.generation["receivedAt"] for c in members if c.generation.get("receivedAt"))
        model_info.append({
            "id": model_id,
            "model": models.get(model_id, {}).get("model"),
            "reportedModels": sorted({c.generation["reportedModel"] for c in members if c.generation.get("reportedModel")}),
            "calls": {"first": received[0] if received else None, "last": received[-1] if received else None},
        })

    survival_by_brief = {
        variant: {
            brief: {
                model_id: _cell([c for c in candidates if (c.model, c.brief, c.variant) == (model_id, brief, variant)])
                for model_id in model_ids
            }
            for brief in brief_ids
        }
        for variant in VARIANT_ORDER
        if any(c.variant == variant for c in candidates)
    }

    own = [g for g in groups if not g["pooled"]]
    totals = {
        "candidates": sum(g["candidates"] for g in own),
        "tokens": {key: _sum([g["tokens"][key] for g in own]) for key in ("input", "cachedInput", "output", "reasoning")},
        "costUsd": round(sum(g["cost"]["usd"] for g in own), 6),
    }
    stressed = [c.summary for c in candidates if c.summary is not None]
    return {
        "schemaVersion": SUMMARY_SCHEMA_VERSION,
        # Stress summaries without the field come from the step 10 harness (suite v1).
        "suite": {"version": SUITE_VERSION, "stressSummaries": len(stressed),
                  "recorded": sum(1 for summary in stressed if "suite" in summary)},
        "cases": [{"id": case, "tier": CASE_TIERS[case]} for case in CASES],
        "checks": list(CHECKS),
        "models": model_info,
        "briefs": brief_ids,
        "groups": groups,
        "sensitivity": sensitivity(candidates),
        "survivalByBrief": survival_by_brief,
        "totals": totals,
    }


# --- report.md ---------------------------------------------------------------

def _pct(value: float | None) -> str:
    return "-" if value is None else f"{value * 100:.1f}%"


def _ci(interval: list[float] | None) -> str:
    return "-" if interval is None else f"{interval[0] * 100:.1f}% to {interval[1] * 100:.1f}%"


def _points(value: float | None, reference: float | None) -> str:
    """The change from `reference` to `value` in percentage points."""
    return "-" if value is None or reference is None else f"{(value - reference) * 100:+.1f}"


def _num(value: int | float | None) -> str:
    return "-" if value is None else f"{value:,}"


def _usd(value: float | None) -> str:
    return "-" if value is None else f"${value:.4f}"


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines += ["| " + " | ".join(row) + " |" for row in rows]
    return lines


def _suite_line(suite: dict[str, Any]) -> str:
    line = (f"Suite {suite['version']} (D-044): the cases, tiers, checks, tolerances and new-finding rule are "
            f"frozen; only bug fixes change them, each recorded in DECISIONS.")
    unrecorded = suite["stressSummaries"] - suite["recorded"]
    if unrecorded:
        line += (f" {unrecorded} of {suite['stressSummaries']} stress summaries predate the suite field; they were "
                 f"written by the step 10 harness, which is suite {suite['version']}.")
    return line


def _sensitivity_section(rows: dict[str, list[dict[str, Any]]]) -> list[str]:
    """The core headline per variant, pooled over models, with each case family removed (D-045)."""
    if not rows:
        return []
    variants = list(rows)
    out = ["", "## Headline sensitivity", "",
           "The core headline per variant, pooled over every model in this report, recomputed with one case family "
           "removed: a mutation together with its @320 case. The change is in percentage points against the "
           "headline (first row). text-unbroken is extreme and never part of the headline (D-045).", ""]
    header = ["removed"]
    for variant in variants:
        header += [f"{variant}: broke, core cases", "share", "95% interval", "change"]
    body = []
    for index, family in enumerate((None, *CORE_FAMILIES)):
        row = ["none" if family is None else family]
        for variant in variants:
            cell, base = rows[variant][index], rows[variant][0]
            row += [f"{cell['count']}/{cell['of']}", _pct(cell["share"]), _ci(cell["ci95"]),
                    "-" if family is None else _points(cell["share"], base["share"])]
        body.append(row)
    return out + _table(header, body)


def render_report(summary: dict[str, Any]) -> str:
    groups = summary["groups"]
    label = lambda g: f"{g['model']} {g['variant']}"  # noqa: E731
    out = ["# Spike report", ""]
    out += [
        "Generated by `python -m first_edit summarize`. Every scored number covers",
        "clean-baseline candidates only (D-015); born-broken and crashed",
        "candidates are counted, not scored. A candidate runs 19 cases at most:",
        "the eleven mutations and the eight content mutations again at 320 px",
        "(D-032). Every case is core or extreme: text-unbroken and",
        "text-unbroken@320 (a 60-letter word) are extreme, the rest core (D-039).",
        "The headline is the share of clean-baseline candidates that broke at",
        "least once in a core case, with a 95% Wilson interval (D-033); the same",
        "measure over all cases stands beside it. Content hidden (D-036) and",
        "truncations (D-021) are info only. Costs are the cost the provider",
        "reported, or configured prices times usage where it reported none.",
        "",
        _suite_line(summary["suite"]),
        "",
        "## Models",
        "",
    ]
    out += _table(
        ["id", "provider model", "reported model", "first call", "last call"],
        [[m["id"], m["model"] or "-", ", ".join(m["reportedModels"]) or "-", m["calls"]["first"] or "-",
          m["calls"]["last"] or "-"] for m in summary["models"]],
    )
    if not groups:
        return "\n".join([*out, "", "No generated candidates for these models."]) + "\n"

    out += ["", "## Broke at least once (headline)", "",
            "Clean-baseline candidates with at least one failed core case, with a 95% Wilson interval. "
            "Beside it, the same measure over all cases, the extreme ones included.", ""]
    out += _table(
        ["model", "variant", "clean baseline", "broke, core cases", "share", "95% interval",
         "broke, all cases", "share", "95% interval"],
        [[g["model"], g["variant"], str(g["cleanBaseline"]),
          *(cell for scope in ("core", "all") for cell in (
              str(g["brokeOnce"][scope]["count"]), _pct(g["brokeOnce"][scope]["share"]), _ci(g["brokeOnce"][scope]["ci95"])))]
         for g in groups],
    )
    out += _sensitivity_section(summary["sensitivity"])
    out += ["", "## Failure rate and mean survival per tier", "",
            "Failed / applicable cases of clean-baseline candidates, with a 95% Wilson interval, and the mean, "
            "minimum and maximum of each candidate's survival rate over the tier's cases.", ""]
    out += _table(
        ["model", "variant", "tier", "failed cases", "failure rate", "95% interval", "mean survival", "min", "max"],
        [[g["model"], g["variant"], "all cases" if scope == "all" else scope,
          f"{g['failureRate'][scope]['failed']}/{g['failureRate'][scope]['applicable']}",
          _pct(g["failureRate"][scope]["rate"]), _ci(g["failureRate"][scope]["ci95"]),
          _pct(g["survival"][scope]["mean"]), _pct(g["survival"][scope]["min"]), _pct(g["survival"][scope]["max"])]
         for g in groups for scope in SCOPES],
    )

    out += ["", "## Candidates", ""]
    out += _table(
        ["model", "variant", "candidates", "valid", "invalid", "api errors", "clean baseline", "born broken",
         "baseline crash"],
        [[g["model"], g["variant"], str(g["candidates"]), str(g["valid"]), str(g["invalid"]), str(g["apiErrors"]),
          str(g["cleanBaseline"]), str(g["bornBroken"]), str(g["baselineCrash"])] for g in groups],
    )
    own = [g for g in groups if not g["pooled"]]
    missing = [f"{label(g)}: {', '.join(g['missingBriefs'])}" for g in own if g["missingBriefs"]]
    not_stressed = [f"{label(g)}: {g['notStressed']}" for g in own if g["notStressed"]]
    if missing:
        out += ["", "Briefs with no candidate (skipped by the budget or never generated): " + "; ".join(missing) + "."]
    if not_stressed:
        out += ["", "Valid candidates with no stress results: " + "; ".join(not_stressed) + "."]

    out += ["", "## Invalid candidates by rule", ""]
    rules = sorted({rule for g in groups for rule in g["invalidByRule"]})
    if rules:
        out += _table(["rule", *map(label, groups)], [[rule, *(str(g["invalidByRule"].get(rule, 0)) for g in groups)] for rule in rules])
    else:
        out += ["No invalid candidates."]

    out += ["", "## Failed cases per case", "", "Failed / applicable cases of clean-baseline candidates.", ""]
    out += _table(
        ["case", "tier", *map(label, groups)],
        [[case, CASE_TIERS[case],
          *(f"{g['failedByCase'][case]['failed']}/{g['failedByCase'][case]['applicable']}" for g in groups)]
         for case in CASES]
        + [[f"all {scope}" if scope != "all" else "all cases", "",
            *(f"{g['failureRate'][scope]['failed']}/{g['failureRate'][scope]['applicable']}" for g in groups)]
           for scope in SCOPES],
    )
    out += ["", "## Failed cases per check", "",
            "Cases with at least one new error from the check; a case can count under several checks.", ""]
    out += _table(
        ["check", *map(label, groups)],
        [[check, *(str(g["failedByCheck"][check]) for g in groups)] for check in CHECKS]
        + [["render error", *(str(g["cases"]["renderErrors"]) for g in groups)],
           ["timeout", *(str(g["cases"]["timeouts"]) for g in groups)]],
    )
    out += ["", "## Truncations and content hidden", "",
            "Truncations: text cut with an ellipsis or a line clamp, per rendered case (D-021). Content hidden: "
            "fixture values shown at 1280 and not shown at 320, at 200% text or in RTL, per measured case (D-036). "
            "Neither fails a case.", ""]
    out += _table(
        ["model", "variant", "truncations", "rendered cases", "per case", "content hidden", "measured cases",
         "cases with hidden content", "per case"],
        [[g["model"], g["variant"], str(g["truncations"]["total"]), str(g["truncations"]["renderedCases"]),
          "-" if g["truncations"]["perCase"] is None else f"{g['truncations']['perCase']:.2f}",
          str(g["contentHidden"]["total"]), str(g["contentHidden"]["measuredCases"]),
          str(g["contentHidden"]["casesWithHidden"]),
          "-" if g["contentHidden"]["perCase"] is None else f"{g['contentHidden']['perCase']:.2f}"] for g in groups],
    )
    out += ["", "## Tokens and cost", ""]
    out += _table(
        ["model", "variant", "input", "cached input", "output", "of which reasoning", "cost", "reported cost", "estimated cost"],
        [[g["model"], g["variant"], _num(g["tokens"]["input"]), _num(g["tokens"]["cachedInput"]), _num(g["tokens"]["output"]),
          _num(g["tokens"]["reasoning"]), _usd(g["cost"]["usd"]),
          f"{_usd(g['cost']['actualUsd'])} ({g['cost']['callsWithActualCost']}/{g['candidates']})",
          _usd(g["cost"]["estimatedUsd"])] for g in own],
    )
    totals = summary["totals"]
    out += ["", f"Total: {totals['candidates']} candidates, {_num(totals['tokens']['input'])} input and "
                f"{_num(totals['tokens']['output'])} output tokens ({_num(totals['tokens']['reasoning'])} reasoning), "
                f"{_usd(totals['costUsd'])}."]

    for variant, table in summary["survivalByBrief"].items():
        model_ids = [m["id"] for m in summary["models"]]
        out += ["", f"## Survival by brief, {variant}", "",
                "Survived / applicable cases per candidate, core and extreme (samples separated by semicolons); "
                "other states are named.", ""]
        out += _table(["brief", *model_ids], [[brief, *(row[m] for m in model_ids)] for brief, row in table.items()])
    return "\n".join(out) + "\n"


# --- gallery.html ------------------------------------------------------------

GALLERY_STYLE = """
:root { --bg: #f8fafc; --card: #ffffff; --ink: #0f172a; --muted: #475569; --line: #e2e8f0;
        --bad: #b91c1c; --bad-bg: #fef2f2; --ok: #15803d; --ok-bg: #f0fdf4; --warn: #b45309; --warn-bg: #fffbeb; }
* { box-sizing: border-box; }
body { margin: 0; font: 14px/1.45 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
header { position: sticky; top: 0; z-index: 1; background: var(--card); border-bottom: 1px solid var(--line);
         padding: 12px 16px; }
h1 { font-size: 18px; margin: 0 0 8px; }
h2 { font-size: 16px; margin: 24px 16px 8px; }
form { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
label { display: flex; gap: 6px; align-items: center; color: var(--muted); }
select { font: inherit; padding: 2px 4px; }
.count { color: var(--muted); }
.cards { display: grid; gap: 16px; padding: 0 16px 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 720px), 1fr)); }
.card { background: var(--card); border: 1px solid var(--line); border-left: 4px solid var(--ok); border-radius: 6px;
        padding: 12px; min-width: 0; }
.card.failed, .card.born-broken, .card.baseline-crash { border-left-color: var(--bad); }
.card h3 { font-size: 14px; margin: 0 0 4px; overflow-wrap: anywhere; }
.meta { margin: 0 0 8px; color: var(--muted); overflow-wrap: anywhere; }
.tag { display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.tag.failed, .tag.born-broken, .tag.baseline-crash { color: var(--bad); background: var(--bad-bg); }
.tag.survived { color: var(--ok); background: var(--ok-bg); }
.tag.hidden-content { color: var(--warn); background: var(--warn-bg); }
.tag.tier { color: var(--muted); background: var(--line); }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
figure { margin: 0; min-width: 0; }
figure img { display: block; width: 100%; height: auto; max-height: 420px; object-fit: contain; object-position: top left;
             border: 1px solid var(--line); background: #f1f5f9; }
figcaption { color: var(--muted); font-size: 12px; }
.missing { display: grid; place-items: center; height: 120px; border: 1px dashed var(--line); color: var(--muted); }
.error { color: var(--bad); white-space: pre-wrap; overflow-wrap: anywhere; }
details { margin-top: 8px; }
details li { margin: 4px 0; overflow-wrap: anywhere; }
code { font-size: 12px; overflow-wrap: anywhere; }
.hidden { display: none; }
@media (max-width: 640px) { header { position: static; } .shots { grid-template-columns: 1fr; } }
"""

GALLERY_SCRIPT = """
const filters = [...document.querySelectorAll('#filters select')];
function apply() {
  const wanted = Object.fromEntries(filters.map((select) => [select.name, select.value]));
  for (const section of document.querySelectorAll('section[data-section]')) {
    let shown = 0;
    for (const card of section.querySelectorAll('.card')) {
      const match = Object.entries(wanted).every(([name, value]) =>
        value === '' || (name === 'check' ? card.dataset.checks.split(' ').includes(value) : card.dataset[name] === value));
      card.classList.toggle('hidden', !match);
      if (match) shown++;
    }
    section.querySelector('.count').textContent = `${shown} of ${section.querySelectorAll('.card').length} shown`;
  }
}
filters.forEach((select) => select.addEventListener('change', apply));
apply();
"""


def _href(path: Path | None, out_dir: Path) -> str | None:
    if path is None or not path.is_file():
        return None
    try:
        return os.path.relpath(path, out_dir).replace(os.sep, "/")
    except ValueError:  # another drive on Windows
        return path.resolve().as_uri()


def _figure(path: Path | None, caption: str, out_dir: Path) -> str:
    href = _href(path, out_dir)
    if href is None:
        return f'<figure><div class="missing">no screenshot</div><figcaption>{caption}</figcaption></figure>'
    src = html.escape(href, quote=True)
    return (f'<figure><a href="{src}" target="_blank" rel="noopener"><img loading="lazy" src="{src}" alt="{caption} screenshot">'
            f"</a><figcaption>{caption}</figcaption></figure>")


def _finding(finding: dict[str, Any]) -> str:
    parts = [f"<b>{html.escape(str(finding.get('check')))}</b> {html.escape(str(finding.get('severity')))}",
             f"<code>{html.escape(str(finding.get('selector')))}</code>"]
    if finding.get("text"):
        parts.append(f"&ldquo;{html.escape(str(finding['text']))}&rdquo;")
    if finding.get("detail"):
        parts.append(f"<code>{html.escape(json.dumps(finding['detail'], ensure_ascii=False))}</code>")
    return "<li>" + " &middot; ".join(parts) + "</li>"


def _card(case: Case, out_dir: Path) -> str:
    attrs = {
        "model": case.model, "variant": case.variant, "brief": case.brief, "mutation": case.case,
        "tier": case.tier or "", "checks": " ".join(case.checks), "outcome": case.outcome,
        "hidden": "yes" if case.hidden_values else "no",
    }
    data = " ".join(f'data-{name}="{html.escape(value, quote=True)}"' for name, value in attrs.items())
    viewport = case.viewport or {}
    meta = [f'<span class="tag {case.outcome}">{case.outcome.replace("-", " ")}</span>']
    if case.tier:
        meta.append(f'<span class="tag tier">{html.escape(case.tier)}</span>')
    meta.append(f"status {html.escape(case.status)}")
    if case.hidden_values:
        meta.append(f'<span class="tag hidden-content">content hidden {len(case.hidden_values)}</span>')
    if viewport:
        meta.append(f"{viewport.get('width')}x{viewport.get('height')}")
    if case.checks:
        meta.append("checks: " + ", ".join(html.escape(check) for check in case.checks))
    meta.append(f"truncations {case.truncations}")
    title = " &middot; ".join(html.escape(part) for part in (case.model, case.brief, f"{case.variant}-s{case.sample}", case.case))
    body = [f'<article class="card {case.outcome}" {data}>', f"<h3>{title}</h3>",
            f'<p class="meta">{" &middot; ".join(meta)}</p>']
    if case.error:
        body.append(f'<p class="error">{html.escape(case.error)}</p>')
    body.append('<div class="shots">' + _figure(case.screenshot, "clean", out_dir) + _figure(case.annotated, "annotated", out_dir) + "</div>")
    if case.findings:
        label = "new findings" if case.outcome == "failed" else "born-broken findings"
        body.append(f"<details><summary>{len(case.findings)} {label}</summary><ul>"
                    + "".join(_finding(finding) for finding in case.findings) + "</ul></details>")
    if case.hidden_values:
        body.append(f"<details><summary>{len(case.hidden_values)} hidden value(s), shown at 1280</summary><ul>"
                    + "".join(f"<li>&ldquo;{html.escape(value)}&rdquo;</li>" for value in case.hidden_values) + "</ul></details>")
    if case.query:
        body.append(f'<p class="meta"><code>{html.escape(case.query)}</code> at {viewport.get("width", "?")} px</p>')
    body.append("</article>")
    return "\n".join(body)


def _options(name: str, label: str, values: list[str]) -> str:
    options = "".join(f'<option value="{html.escape(v, quote=True)}">{html.escape(v)}</option>' for v in values)
    return f'<label>{label} <select name="{name}"><option value="">all</option>{options}</select></label>'


def render_gallery(candidates: list[Candidate], out_dir: Path) -> str:
    cases = [case for c in candidates for case in c.cases]
    order = {case: index for index, case in enumerate(("baseline", *CASES))}
    cases.sort(key=lambda case: (case.model, case.brief, VARIANT_ORDER.index(case.variant) if case.variant in VARIANT_ORDER else 9,
                                 case.sample, order.get(case.case, 99)))
    failing = [case for case in cases if case.outcome != "survived"]
    survived = [case for case in cases if case.outcome == "survived"]

    def values(attribute: str) -> list[str]:
        found = {getattr(case, attribute) for case in cases}
        if attribute == "case":
            return [m for m in ("baseline", *CASES) if m in found]
        if attribute == "variant":
            return [v for v in VARIANT_ORDER if v in found]
        return sorted(found)

    checks = [check for check in CHECKS if any(check in case.checks for case in cases)]
    filters = "".join([
        _options("model", "model", values("model")),
        _options("variant", "variant", values("variant")),
        _options("brief", "brief", values("brief")),
        _options("mutation", "case", values("case")),
        _options("tier", "tier", [tier for tier in TIERS if any(case.tier == tier for case in cases)]),
        _options("check", "check", checks),
        _options("hidden", "content hidden", ["yes", "no"]),
    ])
    sections = []
    for key, title, members in (
        ("failing", "Failed cases, born-broken and crashed baselines", failing),
        ("survived", "Survived cases", survived),
    ):
        cards = "\n".join(_card(case, out_dir) for case in members) or '<p class="meta">None.</p>'
        sections.append(f'<section data-section="{key}"><h2>{title} <span class="count"></span></h2>'
                        f'<div class="cards">\n{cards}\n</div></section>')
    return (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<title>Spike gallery</title>\n"
        f"<style>{GALLERY_STYLE}</style>\n</head>\n<body>\n"
        "<header><h1>Spike gallery</h1>"
        f'<p class="meta">{len(failing)} failed cases and born-broken or crashed baselines, {len(survived)} survived cases. '
        "Cases of clean-baseline candidates only, plus the baseline of each born-broken or crashed candidate. "
        "Screenshots open full size on click.</p>"
        f'<form id="filters">{filters}</form></header>\n'
        + "\n".join(sections)
        + f"\n<script>{GALLERY_SCRIPT}</script>\n</body>\n</html>\n"
    )


def write_outputs(candidates: list[Candidate], summary: dict[str, Any], out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    for name, text in (
        ("summary.json", json.dumps(rounded(summary), indent=2, ensure_ascii=False) + "\n"),
        ("report.md", render_report(summary)),
        ("gallery.html", render_gallery(candidates, out_dir)),
    ):
        path = out_dir / name
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    return written
