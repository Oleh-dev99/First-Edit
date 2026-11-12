// The new-finding rule, and the stress matrix: both hello-card samples
// through every mutation in headless Chromium.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { errorCounts, formatStressTable, newFindings, runStress, type StressSummary } from '../lib/stress.ts';
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

  test('errorCounts counts errors per check', () => {
    const counts = errorCounts([finding('text-overlap', 'a'), finding('text-overlap', 'b'), finding('text-clipped', 'c', 'info')]);
    assert.deepStrictEqual(counts, { 'page-overflow-x': 0, 'text-clipped': 0, 'content-spill': 0, 'text-overlap': 2 });
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

  test('robust survives every applicable mutation', async (t) => {
    const summary = await stress('robust', t);
    assert.equal(summary.baseline.status, 'ok');
    assert.equal(summary.baseline.errors, 0);
    assert.equal(summary.totals.applicable, 10);
    const failed = summary.mutations.filter((entry) => entry.applicable && entry.survived !== true);
    assert.deepStrictEqual(failed.map((entry) => entry.id), []);
  });

  test('brittle has no baseline errors and fails text-unbroken, list-many and viewport-320', async (t) => {
    const summary = await stress('brittle', t);
    assert.equal(summary.baseline.status, 'ok');
    assert.equal(summary.baseline.errors, 0);
    for (const id of ['text-unbroken', 'list-many', 'viewport-320']) {
      const entry = summary.mutations.find((candidate) => candidate.id === id);
      assert.equal(entry?.status, 'ok', `${id} rendered`);
      assert.equal(entry?.survived, false, `${id} fails`);
    }
  });
});
