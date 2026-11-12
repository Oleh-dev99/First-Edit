// Sample matrix: the robust and brittle hello-card samples x fixtures
// (baseline, stress) x widths (1280, 320), rendered in headless Chromium.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { countFindings, formatCounts, type Counts } from '../lib/findings.ts';
import { candidateQuery, collectFindings, openPage } from '../lib/render.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { CHECK_NAMES, type CheckName } from '../src/checks/finding.ts';

const BRIEF = 'hello-card';
const VARIANTS = ['robust', 'brittle'] as const;
const FIXTURES = ['baseline', 'stress'] as const;
const WIDTHS = [1280, 320] as const;
const HEIGHT = 800;

type Variant = (typeof VARIANTS)[number];
type Fixture = (typeof FIXTURES)[number];

/** Checks with at least one error. */
function failingChecks(counts: Counts): CheckName[] {
  return CHECK_NAMES.filter((name) => counts[name].error > 0);
}

/** Asserts the expectation for one cell; returns a label for it. */
function expectFor(variant: Variant, fixture: Fixture, width: number, counts: Counts): string {
  const failing = failingChecks(counts);
  if (variant === 'robust') {
    assert.deepStrictEqual(failing, [], 'robust: 0 errors');
    return '0 errors';
  }
  if (fixture === 'baseline' && width === 1280) {
    assert.deepStrictEqual(failing, [], 'brittle, baseline, 1280: 0 errors');
    return '0 errors';
  }
  if (fixture === 'baseline' && width === 320) {
    assert.deepStrictEqual(failing, ['page-overflow-x'], 'brittle, baseline, 320: page-overflow-x only');
    return 'page-overflow-x only';
  }
  if (fixture === 'stress' && width === 1280) {
    for (const check of ['text-clipped', 'content-spill', 'text-overlap'] as const) {
      assert.ok(counts[check].error >= 1, `brittle, stress, 1280: expected ${check} at least once`);
    }
    return 'text-clipped, content-spill and text-overlap each at least once';
  }
  return 'recorded only (no expectation)';
}

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

for (const variant of VARIANTS) {
  for (const fixture of FIXTURES) {
    for (const width of WIDTHS) {
      test(`${variant} ${fixture} ${width}`, async (t) => {
        const candidate = `_samples/${BRIEF}/${variant}`;
        const query = candidateQuery(BRIEF, candidate, fixture);
        const { context, page } = await openPage(browser, server.origin, query, { width, height: HEIGHT });
        try {
          const counts = countFindings(await collectFindings(page));
          t.diagnostic(`actual (error/info): ${formatCounts(counts)}`);
          t.diagnostic(`expected: ${expectFor(variant, fixture, width, counts)}`);
        } finally {
          await context.close();
        }
      });
    }
  }
}
