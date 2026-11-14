/**
 * The site's data: the files `python -m first_edit export-site` writes to
 * public/data. Every share and interval shown is computed here from its
 * counts with the same Wilson formula as the run report, so the figures match
 * report.md exactly.
 */

export type Interval = [number, number];
export type Variant = 'plain' | 'hinted';

export interface Share {
  count: number;
  of: number;
  share: number | null;
  ci95: Interval | null;
}

export interface CaseRate {
  failed: number;
  applicable: number;
  tier?: string;
}

export interface Group {
  model: string;
  variant: Variant;
  pooled: boolean;
  candidates: number;
  valid: number;
  invalid: number;
  apiErrors: number;
  notStressed: number;
  cleanBaseline: number;
  bornBroken: number;
  baselineCrash: number;
  missingBriefs: string[];
  brokeOnce: { core: Share; all: Share };
  failureRate: { core: CaseRate; extreme: CaseRate; all: CaseRate };
  failedByCase: Record<string, CaseRate & { tier: string }>;
  failedByCheck: Record<string, number>;
}

export interface Pairs {
  pairs: number;
  bothBroke: number;
  plainOnly: number;
  hintedOnly: number;
  neither: number;
  p: number;
}

export interface DecisionLine {
  met: boolean;
  detail: string;
}

export interface Model {
  id: string;
  model: string | null;
  finished: boolean;
  calls: { first: string | null; last: string | null };
}

export interface CaseInfo {
  id: string;
  tier: 'core' | 'extreme';
  description: string;
}

export interface Run {
  source: { run: string; runs: string };
  status: { finished: string[]; models: number; preliminary: boolean };
  suite: { version: string; stressSummaries: number; commits: Record<string, number> };
  models: Model[];
  cases: CaseInfo[];
  checks: string[];
  briefs: string[];
  groups: Group[];
  hintEffect: { perModel: Record<string, Pairs>; pooled: Pairs };
  sensitivity: Record<Variant, (Share & { removed: string })[]>;
  decisions: { models: string[]; lines: null | Record<'coverage' | 'hintEffect' | 'modelEffect', DecisionLine> };
  totals: { candidates: number };
}

export interface Picture {
  src: string;
  width: number;
  height: number;
  /** exported width over the screenshot's width (page pixels) */
  scale: number;
}

export interface Finding {
  check: string;
  severity: 'error' | 'info';
  selector: string | null;
  text: string | null;
  rect: { x: number; y: number; width: number; height: number } | null;
  detail: Record<string, unknown> | null;
}

export type Outcome = 'failed' | 'survived' | 'born-broken' | 'baseline-crash';

export interface CaseEntry {
  id: string;
  model: string;
  brief: string;
  variant: Variant;
  sample: number;
  candidate: string;
  case: string;
  tier: 'core' | 'extreme' | null;
  description: string;
  outcome: Outcome;
  status: string;
  checks: string[];
  findings: Finding[];
  error: string | null;
  viewport: { width: number; height: number } | null;
  images: { before: Picture | null; after: Picture | null; annotated: Picture | null };
  source: string | null;
}

export interface Cases {
  survivedSample: { seed: number; size: number; of: number };
  counts: Record<Outcome, number>;
  cases: CaseEntry[];
}

export interface Brief {
  id: string;
  title: string;
  category: string;
  brief: string;
  props: string;
  fixture: string;
  reference: Picture | null;
}

export interface Briefs {
  prompt: { system: string; user: string; hint: string };
  briefs: Brief[];
}

export interface RateSet {
  all: Share;
  core: Share;
  extreme: Share;
  byCheck?: Record<string, Share>;
}

export interface Calibration {
  set: string;
  partial: boolean;
  labellers: number;
  items: { total: number; labelled: number; primary: number; repeats: number };
  labels: Record<'broken' | 'fine' | 'other' | 'unsure', number>;
  precision: RateSet;
  missRate: { all: Share } & Record<string, Share>;
  recall: { estimate: number | null; reason: string | null };
  other: { count: number; failedBySuite: number };
  unsure: number;
  selfConsistency: Share;
  disagreements: { failedNotBroken: string[]; passedBroken: string[] };
  guided: { file: string | null; reason: string | null; items: string[]; cases: string[] };
  unguided: {
    items: { primary: number; repeats: number };
    precision: RateSet;
    missRate: { all: Share };
    recall: { estimate: number | null };
    selfConsistency: Share;
  };
  adjudication: null | {
    disagreements: number;
    answered: number;
    answers: Record<'suite-right' | 'label-right' | 'defined-differently', number>;
    definedDifferently: string[];
    all: { precision: RateSet; missRate: { all: Share } };
    unguided: { precision: RateSet; missRate: { all: Share } };
  };
}

export interface SiteData {
  run: Run;
  cases?: Cases;
  briefs?: Briefs;
  calibration?: Calibration;
}

/** A path under the site's base, e.g. url('data/run.json'). */
export function url(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(url(`data/${name}.json`));
  if (!response.ok) throw new Error(`data/${name}.json: ${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

/** run.json, which every page needs for its status banner, and the page's other files. */
export async function loadData(extra: ('cases' | 'briefs' | 'calibration')[]): Promise<SiteData> {
  const [run, ...rest] = await Promise.all([fetchJson<Run>('run'), ...extra.map((name) => fetchJson<unknown>(name))]);
  const data: SiteData = { run };
  extra.forEach((name, index) => {
    (data as unknown as Record<string, unknown>)[name] = rest[index];
  });
  return data;
}

/**
 * The briefs with no component from any model yet, in the run's brief order:
 * the queue has not reached them, or their components were superseded when the
 * brief's text changed (D-059). A model's own gaps are in its groups' missingBriefs.
 */
export function briefsWithoutComponent(run: Run): string[] {
  const own = run.groups.filter((group) => !group.pooled);
  return run.briefs.filter((brief) => own.every((group) => group.missingBriefs.includes(brief)));
}

/** z for a two-sided 95% interval, as in the run report. */
const Z_95 = 1.959964;

/** The Wilson score interval, [low, high]; null without trials. */
export function wilson(successes: number, trials: number): Interval | null {
  if (trials <= 0) return null;
  const p = successes / trials;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / trials;
  const centre = (p + z2 / (2 * trials)) / denominator;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** A share recomputed exactly from its counts. */
export function exact(count: number, of: number): Share {
  return { count, of, share: of ? count / of : null, ci95: wilson(count, of) };
}

/**
 * x to one decimal exactly as the run report's Python formats it: correctly
 * rounded, with an exact tie (only quarters such as 6.25 are) going to the even
 * digit, where JavaScript's toFixed would round it up.
 */
export function fixed1(x: number): string {
  const quarters = x * 4;
  if (Number.isInteger(quarters) && quarters % 2 !== 0) {
    const n = Math.floor(x * 10);
    return ((n % 2 === 0 ? n : n + 1) / 10).toFixed(1);
  }
  return x.toFixed(1);
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '–';
  return `${fixed1(value * 100)}%`;
}

/** The change from `reference` to `value` in percentage points: "+0.0", "-28.6". */
export function points(value: number | null, reference: number | null): string {
  if (value === null || reference === null) return '–';
  const text = fixed1((value - reference) * 100);
  return text.startsWith('-') ? text : `+${text}`;
}

export function range(ci: Interval | null): string {
  return ci ? `${pct(ci[0])} to ${pct(ci[1])}` : 'no interval';
}

/** "14 of 21, 66.7% (95% interval 45.4% to 82.8%)" */
export function rateText(count: number, of: number): string {
  if (!of) return `${count} of ${of}`;
  const share = exact(count, of);
  return `${count} of ${of}, ${pct(share.share)} (95% interval ${range(share.ci95)})`;
}

export const VARIANT_TEXT: Record<Variant, string> = { plain: 'plain prompt', hinted: 'hinted prompt' };
