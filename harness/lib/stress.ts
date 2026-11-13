// The stress runner: renders the baseline and every applicable case of one
// candidate (every mutation, then every content mutation at 320 px), runs the
// checks, decides which cases survive and measures content-hidden.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Browser } from 'playwright';
import { CHECK_NAMES, type CheckName, type Finding } from '../src/checks/finding.ts';
import { hiddenValues, type VisibleValue } from '../src/measures/visible-values.ts';
import { CASES, type CaseId, type CaseKind, type FindingsReference } from '../src/mutations/cases.ts';
import { applyContentMutation } from '../src/mutations/content.ts';
import { isContentMutation, mutationKind, viewportFor, type MutationId, type Viewport } from '../src/mutations/index.ts';
import { annotate } from './annotate.ts';
import { loadBrief } from './briefs.ts';
import { candidateQuery, collectFindings, loadPage, type LoadStatus } from './render.ts';

/** Version of the summary.json contract; bump on any incompatible change. */
export const SCHEMA_VERSION = 2;

export type CaseStatus = LoadStatus | 'not-applicable';

export type ErrorCounts = Record<CheckName, number>;

/** File names inside the run directory. */
export interface CaseFiles {
  result: string;
  screenshot: string | null;
  annotated: string | null;
}

export interface CaseEntry {
  id: CaseId;
  /** The mutation the page applies. */
  mutation: MutationId;
  kind: CaseKind;
  viewport: Viewport;
  /** The render whose findings decide what is new. */
  reference: FindingsReference;
  applicable: boolean;
  status: CaseStatus;
  /** null when not applicable. */
  survived: boolean | null;
  /** New error findings per check; null when not applicable or not rendered. */
  newErrors: ErrorCounts | null;
  /** text-clipped info findings (ellipsis or line clamp) in the case; null when not rendered. */
  truncations: number | null;
  /**
   * content-hidden: values visible in the same data at 1280 with default
   * settings and not visible here; null when the case is not measured or
   * either render failed.
   */
  contentHidden: number | null;
  files: CaseFiles | null;
}

export interface StressSummary {
  schemaVersion: number;
  brief: string;
  candidate: string;
  fixture: string;
  versions: { playwright: string; chromium: string };
  baseline: {
    status: LoadStatus;
    errors: number;
    /** text-clipped info findings at baseline; null when the baseline did not render. */
    truncations: number | null;
    viewport: Viewport;
    files: CaseFiles;
  };
  cases: CaseEntry[];
  totals: {
    cases: number;
    applicable: number;
    survived: number;
    failed: number;
    /** survived / applicable, rounded to 4 decimals; null when nothing is applicable. */
    survivalRate: number | null;
    /** content-hidden values over every measured case. */
    contentHidden: number;
  };
}

const playwrightVersion = (createRequire(import.meta.url)('playwright/package.json') as { version: string })
  .version;

/**
 * A finding is new if it is an error and no finding of the reference render
 * (the baseline, or viewport-320 for content@320 cases) has the same check
 * and selector.
 */
export function newFindings(findings: Finding[], reference: Finding[]): Finding[] {
  const known = new Set(reference.map((finding) => `${finding.check} ${finding.selector}`));
  return findings.filter(
    (finding) => finding.severity === 'error' && !known.has(`${finding.check} ${finding.selector}`),
  );
}

/** Deliberate truncations: text-clipped info findings (ellipsis or line clamp). */
export function truncationCount(findings: Finding[]): number {
  return findings.filter((finding) => finding.check === 'text-clipped' && finding.severity === 'info').length;
}

export function errorCounts(findings: Finding[]): ErrorCounts {
  const counts = Object.fromEntries(CHECK_NAMES.map((name) => [name, 0])) as ErrorCounts;
  for (const finding of findings) if (finding.severity === 'error') counts[finding.check]++;
  return counts;
}

interface Rendered {
  status: LoadStatus;
  error: string | null;
  findings: Finding[];
  /** Which content values are visible; null when the page did not render. */
  visible: VisibleValue[] | null;
  screenshot: Buffer | null;
}

async function renderCase(browser: Browser, origin: string, query: string, viewport: Viewport): Promise<Rendered> {
  const loaded = await loadPage(browser, origin, query, viewport);
  try {
    // A page that timed out may be hung; do not wait on it for a screenshot.
    if (loaded.status === 'timeout') {
      return { status: 'timeout', error: loaded.error, findings: [], visible: null, screenshot: null };
    }
    const ok = loaded.status === 'ok';
    const findings = ok ? await collectFindings(loaded.page) : [];
    const visible = ok ? await loaded.page.evaluate(() => window.__FE_VISIBLE_VALUES__?.() ?? []) : null;
    const shot = loaded.page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
    // A failed render still gets a screenshot of the error page when one can be taken.
    const screenshot = ok ? await shot : await shot.catch(() => null);
    return { status: loaded.status, error: loaded.error, findings, visible, screenshot };
  } finally {
    await loaded.context.close();
  }
}

export interface StressOptions {
  browser: Browser;
  origin: string;
  brief: string;
  candidate: string;
  /** Write the results here, replacing the directory. Omit to write nothing. */
  outDir?: string;
}

/**
 * Renders the baseline (fixture "baseline", 1280x800) and every applicable
 * case, runs the checks and returns the summary. A case survives if it
 * rendered and has no new findings: errors that its reference render (the
 * baseline, or viewport-320 for content@320 cases) does not have. Error
 * findings in the baseline are "born broken" and never count against a case.
 * content-hidden is measured for cases at 320, at 200% text and in RTL; it
 * never fails a case.
 */
export async function runStress(options: StressOptions): Promise<StressSummary> {
  const { browser, origin, brief, candidate, outDir } = options;
  const fixtureName = 'baseline';
  const { fixture, fields } = loadBrief(brief, fixtureName);
  if (outDir) {
    // Retries ride out transient Windows locks (EBUSY) from scanners or open folder windows.
    await rm(outDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    await mkdir(outDir, { recursive: true });
  }

  const save = async (name: string, rendered: Rendered, record: object): Promise<CaseFiles> => {
    const files: CaseFiles = {
      result: `${name}.json`,
      screenshot: rendered.screenshot ? `${name}.png` : null,
      annotated: rendered.screenshot ? `${name}.annotated.png` : null,
    };
    if (!outDir) return files;
    await writeFile(path.join(outDir, files.result), `${JSON.stringify(record, null, 2)}\n`);
    if (rendered.screenshot && files.screenshot && files.annotated) {
      await writeFile(path.join(outDir, files.screenshot), rendered.screenshot);
      await writeFile(path.join(outDir, files.annotated), await annotate(browser, rendered.screenshot, rendered.findings));
    }
    return files;
  };

  const baselineViewport = viewportFor(null);
  const baselineQuery = candidateQuery(brief, candidate, fixtureName);
  const baseline = await renderCase(browser, origin, baselineQuery, baselineViewport);
  const bornBroken = baseline.findings.filter((finding) => finding.severity === 'error');
  const baselineTruncations = baseline.status === 'ok' ? truncationCount(baseline.findings) : null;
  const baselineFiles = await save('baseline', baseline, {
    case: 'baseline',
    brief,
    candidate,
    fixture: fixtureName,
    query: baselineQuery,
    viewport: baselineViewport,
    status: baseline.status,
    error: baseline.error,
    bornBroken,
    truncations: baselineTruncations,
    findings: baseline.findings,
  });

  /** Renders so far, by case id, for the findings and content-hidden references. */
  const renders = new Map<string, Rendered>([['baseline', baseline]]);
  const cases: CaseEntry[] = [];
  for (const spec of CASES) {
    const { id, mutation, kind, viewport, reference, hiddenReference } = spec;
    const changed = isContentMutation(mutation) ? applyContentMutation(fixture, fields, mutation).changed : null;
    const common = { id, mutation, kind, viewport, reference };
    if (changed !== null && changed.length === 0) {
      cases.push({
        ...common,
        applicable: false,
        status: 'not-applicable',
        survived: null,
        newErrors: null,
        truncations: null,
        contentHidden: null,
        files: null,
      });
      continue;
    }
    const query = candidateQuery(brief, candidate, fixtureName, mutation);
    const rendered = await renderCase(browser, origin, query, viewport);
    renders.set(id, rendered);
    const renderedOk = rendered.status === 'ok';
    const referenceRender = renders.get(reference);
    const referenceFindings = referenceRender?.status === 'ok' ? referenceRender.findings : [];
    const fresh = renderedOk ? newFindings(rendered.findings, referenceFindings) : [];
    const survived = renderedOk && fresh.length === 0;
    const newErrors = renderedOk ? errorCounts(fresh) : null;
    const truncations = renderedOk ? truncationCount(rendered.findings) : null;
    const hiddenRender = hiddenReference === null ? undefined : renders.get(hiddenReference);
    const hidden =
      rendered.visible !== null && hiddenRender?.visible ? hiddenValues(hiddenRender.visible, rendered.visible) : null;
    const contentHidden = hidden === null ? null : hidden.length;
    const files = await save(id, rendered, {
      case: id,
      kind,
      brief,
      candidate,
      fixture: fixtureName,
      mutation: { id: mutation, kind: mutationKind(mutation) },
      changed,
      query,
      viewport,
      reference,
      status: rendered.status,
      error: rendered.error,
      survived,
      newErrors,
      truncations,
      contentHidden,
      hiddenReference,
      hiddenValues: hidden,
      newFindings: fresh,
      findings: rendered.findings,
    });
    cases.push({ ...common, applicable: true, status: rendered.status, survived, newErrors, truncations, contentHidden, files });
  }

  const applicable = cases.filter((entry) => entry.applicable).length;
  const survived = cases.filter((entry) => entry.survived === true).length;
  const summary: StressSummary = {
    schemaVersion: SCHEMA_VERSION,
    brief,
    candidate,
    fixture: fixtureName,
    versions: { playwright: playwrightVersion, chromium: browser.version() },
    baseline: {
      status: baseline.status,
      errors: bornBroken.length,
      truncations: baselineTruncations,
      viewport: baselineViewport,
      files: baselineFiles,
    },
    cases,
    totals: {
      cases: cases.length,
      applicable,
      survived,
      failed: applicable - survived,
      survivalRate: applicable === 0 ? null : Math.round((survived / applicable) * 10_000) / 10_000,
      contentHidden: cases.reduce((sum, entry) => sum + (entry.contentHidden ?? 0), 0),
    },
  };
  if (outDir) await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

/** The stress table: one row per case, then the survival rate and content hidden. */
export function formatStressTable(summary: StressSummary): string {
  const header = ['case', 'status', ...CHECK_NAMES, 'survived', 'truncations', 'hidden'];
  const rows = summary.cases.map((entry) => [
    entry.id,
    entry.status,
    ...CHECK_NAMES.map((name) => (entry.newErrors ? String(entry.newErrors[name]) : '-')),
    entry.survived === null ? '-' : entry.survived ? 'yes' : 'no',
    entry.truncations === null ? '-' : String(entry.truncations),
    entry.contentHidden === null ? '-' : String(entry.contentHidden),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: string[]): string =>
    cells.map((cell, column) => (column < 2 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join('  ');
  const { totals, baseline } = summary;
  const rate = totals.survivalRate === null ? 'n/a' : `${Math.round(totals.survivalRate * 100)}%`;
  return [
    `${summary.brief}  ${summary.candidate}`,
    `baseline: ${baseline.status}, ${baseline.errors} born-broken error${baseline.errors === 1 ? '' : 's'}, ` +
      `${baseline.truncations ?? '-'} truncation${baseline.truncations === 1 ? '' : 's'}`,
    '',
    line(header),
    ...rows.map(line),
    '',
    `survival rate: ${totals.survived}/${totals.applicable} = ${rate}; content hidden: ${totals.contentHidden}`,
  ].join('\n');
}
