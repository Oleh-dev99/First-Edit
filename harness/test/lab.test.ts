// Renders every check-lab case in headless Chromium and asserts the exact
// error and info counts for every check, so a "-" case also proves that
// no other check fires.

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { countFindings, expectedCounts, formatCounts } from '../lib/findings.ts';
import { collectFindings, openPage } from '../lib/render.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { DEFAULT_VIEWPORT, LAB_CASES } from '../src/lab/cases.ts';

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

for (const labCase of LAB_CASES) {
  const name = `${labCase.check} ${labCase.description} [${labCase.id}]`;
  test(name, { todo: labCase.knownFailure }, async (t) => {
    const viewport = labCase.viewport ?? DEFAULT_VIEWPORT;
    const { context, page } = await openPage(browser, server.origin, `?lab=${labCase.id}`, viewport);
    try {
      const findings = await collectFindings(page);
      const actual = countFindings(findings);
      const expected = expectedCounts(labCase.expected);
      t.diagnostic(`expected ${formatCounts(expected)} | actual ${formatCounts(actual)}`);
      if (!isDeepStrictEqual(actual, expected)) {
        for (const finding of findings) t.diagnostic(JSON.stringify(finding));
      }
      assert.deepStrictEqual(actual, expected);
      if (labCase.culprits !== undefined) {
        const overflow = findings.find((finding) => finding.check === 'page-overflow-x');
        const culprits = overflow?.detail.culprits as string[] | undefined;
        if (typeof labCase.culprits === 'number') {
          assert.equal(culprits?.length, labCase.culprits, 'page-overflow-x culprits');
        } else {
          assert.deepStrictEqual(culprits, labCase.culprits, 'page-overflow-x culprits');
        }
      }
    } finally {
      await context.close();
    }
  });
}
