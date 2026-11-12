// The stress runner: renders the baseline and every applicable mutation of
// one candidate, runs the checks and decides which cases survive.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Browser } from 'playwright';
import { CHECK_NAMES, type CheckName, type Finding } from '../src/checks/finding.ts';
import { applyContentMutation } from '../src/mutations/content.ts';
import {
  MUTATION_IDS,
  isContentMutation,
  mutationKind,
  viewportFor,
  type MutationId,
  type MutationKind,
  type Viewport,
} from '../src/mutations/index.ts';
import { annotate } from './annotate.ts';
import { loadBrief } from './briefs.ts';
import { candidateQuery, collectFindings, loadPage, type LoadStatus } from './render.ts';

/** Version of the summary.json contract; bump on any incompatible change. */
export const SCHEMA_VERSION = 1;

export type CaseStatus = LoadStatus | 'not-applicable';

export type ErrorCounts = Record<CheckName, number>;

/** File names inside the run directory. */
export interface CaseFiles {
  result: string;
  screenshot: string | null;
  annotated: string | null;
}

export interface MutationEntry {
  id: MutationId;
  kind: MutationKind;
  applicable: boolean;
  status: CaseStatus;
  /** null when not applicable. */
  survived: boolean | null;
  /** New error findings per check; null when not applicable or not rendered. */
  newErrors: ErrorCounts | null;
  files: CaseFiles | null;
}

export interface StressSummary {
  schemaVersion: number;
  brief: string;
  candidate: string;
  fixture: string;
  versions: { playwright: string; chromium: string };
  baseline: { status: LoadStatus; errors: number; viewport: Viewport; files: CaseFiles };
  mutations: MutationEntry[];
  totals: {
    mutations: number;
    applicable: number;
    survived: number;
    failed: number;
    /** survived / applicable, rounded to 4 decimals; null when nothing is applicable. */
    survivalRate: number | null;
  };
}

const playwrightVersion = (createRequire(import.meta.url)('playwright/package.json') as { version: string })
  .version;

/** A finding is new if it is an error and no baseline finding has the same check and selector. */
export function newFindings(findings: Finding[], baseline: Finding[]): Finding[] {
  const known = new Set(baseline.map((finding) => `${finding.check} ${finding.selector}`));
  return findings.filter(
    (finding) => finding.severity === 'error' && !known.has(`${finding.check} ${finding.selector}`),
  );
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
  screenshot: Buffer | null;
}

async function renderCase(browser: Browser, origin: string, query: string, viewport: Viewport): Promise<Rendered> {
  const loaded = await loadPage(browser, origin, query, viewport);
  try {
    // A page that timed out may be hung; do not wait on it for a screenshot.
    if (loaded.status === 'timeout') return { status: 'timeout', error: loaded.error, findings: [], screenshot: null };
    const findings = loaded.status === 'ok' ? await collectFindings(loaded.page) : [];
    const shot = loaded.page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
    // A failed render still gets a screenshot of the error page when one can be taken.
    const screenshot = loaded.status === 'ok' ? await shot : await shot.catch(() => null);
    return { status: loaded.status, error: loaded.error, findings, screenshot };
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
 * mutation, runs the checks and returns the summary. A case survives if it
 * rendered and has no new findings. Error findings in the baseline are
 * "born broken" and never count against a mutation.
 */
export async function runStress(options: StressOptions): Promise<StressSummary> {
  const { browser, origin, brief, candidate, outDir } = options;
  const fixtureName = 'baseline';
  const { fixture, fields } = loadBrief(brief, fixtureName);
  if (outDir) {
    await rm(outDir, { recursive: true, force: true });
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
    findings: baseline.findings,
  });

  const mutations: MutationEntry[] = [];
  for (const id of MUTATION_IDS) {
    const kind = mutationKind(id);
    const changed = isContentMutation(id) ? applyContentMutation(fixture, fields, id).changed : null;
    if (changed !== null && changed.length === 0) {
      mutations.push({ id, kind, applicable: false, status: 'not-applicable', survived: null, newErrors: null, files: null });
      continue;
    }
    const viewport = viewportFor(id);
    const query = candidateQuery(brief, candidate, fixtureName, id);
    const rendered = await renderCase(browser, origin, query, viewport);
    const renderedOk = rendered.status === 'ok';
    const fresh = renderedOk ? newFindings(rendered.findings, baseline.findings) : [];
    const survived = renderedOk && fresh.length === 0;
    const newErrors = renderedOk ? errorCounts(fresh) : null;
    const files = await save(id, rendered, {
      case: id,
      brief,
      candidate,
      fixture: fixtureName,
      mutation: { id, kind },
      changed,
      query,
      viewport,
      status: rendered.status,
      error: rendered.error,
      survived,
      newErrors,
      newFindings: fresh,
      findings: rendered.findings,
    });
    mutations.push({ id, kind, applicable: true, status: rendered.status, survived, newErrors, files });
  }

  const applicable = mutations.filter((entry) => entry.applicable).length;
  const survived = mutations.filter((entry) => entry.survived === true).length;
  const summary: StressSummary = {
    schemaVersion: SCHEMA_VERSION,
    brief,
    candidate,
    fixture: fixtureName,
    versions: { playwright: playwrightVersion, chromium: browser.version() },
    baseline: { status: baseline.status, errors: bornBroken.length, viewport: baselineViewport, files: baselineFiles },
    mutations,
    totals: {
      mutations: mutations.length,
      applicable,
      survived,
      failed: applicable - survived,
      survivalRate: applicable === 0 ? null : Math.round((survived / applicable) * 10_000) / 10_000,
    },
  };
  if (outDir) await writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

/** The stress table: one row per mutation, then the survival rate. */
export function formatStressTable(summary: StressSummary): string {
  const header = ['mutation', 'status', ...CHECK_NAMES, 'survived'];
  const rows = summary.mutations.map((entry) => [
    entry.id,
    entry.status,
    ...CHECK_NAMES.map((name) => (entry.newErrors ? String(entry.newErrors[name]) : '-')),
    entry.survived === null ? '-' : entry.survived ? 'yes' : 'no',
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: string[]): string =>
    cells.map((cell, column) => (column < 2 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join('  ');
  const { totals, baseline } = summary;
  const rate = totals.survivalRate === null ? 'n/a' : `${Math.round(totals.survivalRate * 100)}%`;
  return [
    `${summary.brief}  ${summary.candidate}`,
    `baseline: ${baseline.status}, ${baseline.errors} born-broken error${baseline.errors === 1 ? '' : 's'}`,
    '',
    line(header),
    ...rows.map(line),
    '',
    `survival rate: ${totals.survived}/${totals.applicable} = ${rate}`,
  ].join('\n');
}
