// The new-finding rule, and the stress matrix: both hello-card samples
// through every case in headless Chromium.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { startServer, type HarnessServer } from '../lib/server.ts';
import {
  errorCounts,
  formatStressTable,
  newFindings,
  runStress,
  truncationCount,
  type StressSummary,
} from '../lib/stress.ts';
import type { Finding } from '../src/checks/finding.ts';

const finding = (check: Finding['check'], selector: string, severity: Finding['severity'] = 'error'): Finding => ({
  check,
  severity,
  selector,
  rect: { x: 0, y: 0, width: 1, height: 1 },
  text: null,
  detail: {},
});

describe('newFindings', () => {
  test('an error is new unless a baseline finding has the same check and selector', () => {
    const baseline = [finding('text-clipped', 'p'), finding('content-spill', 'h2', 'info')];
    const current = [
      finding('text-clipped', 'p'),
      finding('content-spill', 'h2'),
      finding('content-spill', 'p'),
      finding('text-overlap', 'p'),
      finding('text-clipped', 'li', 'info'),
    ];
    assert.deepStrictEqual(newFindings(current, baseline), [finding('content-spill', 'p'), finding('text-overlap', 'p')]);
  });

  test('truncationCount counts text-clipped info findings only', () => {
    const findings = [
      finding('text-clipped', 'a', 'info'),
      finding('text-clipped', 'b', 'info'),
      finding('text-clipped', 'c'),
      finding('content-spill', 'd', 'info'),
    ];
    assert.equal(truncationCount(findings), 2);
  });

  test('errorCounts counts errors per check', () => {
    const counts = errorCounts([finding('text-overlap', 'a'), finding('text-overlap', 'b'), finding('text-clipped', 'c', 'info')]);
    assert.deepStrictEqual(counts, {
      'page-overflow-x': 0,
      'text-clipped': 0,
      'content-spill': 0,
      'text-overlap': 2,
      'off-screen': 0,
    });
  });
});

describe('stress matrix', () => {
  let server: HarnessServer;
  let browser: Browser;

  before(async () => {
    server = await startServer();
    browser = await chromium.launch();
  });

  after(async () => {
    await browser?.close();
    await server?.close();
  });

  const stress = async (variant: string, t: { diagnostic(message: string): void }): Promise<StressSummary> => {
    const summary = await runStress({
      browser,
      origin: server.origin,
      brief: 'hello-card',
      candidate: `_samples/hello-card/${variant}`,
    });
    for (const line of formatStressTable(summary).split('\n')) t.diagnostic(line);
    return summary;
  };

  test('robust survives every applicable case and hides no content', async (t) => {
    const summary = await stress('robust', t);
    assert.equal(summary.schemaVersion, 3);
    assert.equal(summary.baseline.status, 'ok');
    assert.equal(summary.baseline.errors, 0);
    assert.equal(summary.totals.applicable, 19);
    assert.deepStrictEqual(
      summary.cases.filter((entry) => entry.tier === 'extreme').map((entry) => entry.id),
      ['text-unbroken', 'text-unbroken@320'],
    );
    const failed = summary.cases.filter((entry) => entry.applicable && entry.survived !== true);
    assert.deepStrictEqual(failed.map((entry) => entry.id), []);
    assert.equal(summary.totals.contentHidden, 0);
    // content-hidden is measured at 320, at 200% text and in RTL, and nowhere else.
    const measured = summary.cases.filter((entry) => entry.contentHidden !== null).map((entry) => entry.id);
    assert.deepStrictEqual(measured, [
      'viewport-320', 'text-200pct', 'dir-rtl',
      'text-long@320', 'text-longword@320', 'text-unbroken@320', 'text-empty@320', 'list-0@320', 'list-1@320', 'list-many@320', 'number-large@320',
    ]);
  });

  test('brittle has no baseline errors and fails text-unbroken, list-many and viewport-320', async (t) => {
    const summary = await stress('brittle', t);
    assert.equal(summary.baseline.status, 'ok');
    assert.equal(summary.baseline.errors, 0);
    for (const id of ['text-unbroken', 'list-many', 'viewport-320']) {
      const entry = summary.cases.find((candidate) => candidate.id === id);
      assert.equal(entry?.status, 'ok', `${id} rendered`);
      assert.equal(entry?.survived, false, `${id} fails`);
    }
    // The tag pills run out of the card under these two (the step 4 spill gap).
    for (const id of ['text-long', 'text-200pct']) {
      const entry = summary.cases.find((candidate) => candidate.id === id);
      assert.ok((entry?.newErrors?.['content-spill'] ?? 0) >= 1, `${id} reports content-spill`);
    }
    // At 320 the page already overflows (viewport-320), so a phone-width case
    // counts only what its content adds: list-0 removes the pills and adds nothing.
    const list0 = summary.cases.find((candidate) => candidate.id === 'list-0@320');
    assert.equal(list0?.reference, 'viewport-320');
    assert.equal(list0?.survived, true);
  });
});
