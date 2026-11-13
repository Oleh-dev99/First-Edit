// The new-finding rule matches findings by an index-free key of tags and
// classes (D-040): renders three lab pages in headless Chromium and compares
// their findings the way the stress runner does.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { collectFindings, openPage } from '../lib/render.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { newFindings } from '../lib/stress.ts';
import type { Finding } from '../src/checks/finding.ts';
import { DEFAULT_VIEWPORT } from '../src/lab/cases.ts';

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

async function findingsOf(id: string): Promise<Finding[]> {
  const { context, page } = await openPage(browser, server.origin, `?lab=${id}`, DEFAULT_VIEWPORT);
  try {
    return await collectFindings(page);
  } finally {
    await context.close();
  }
}

test('the match key is the path of tags and classes, with no positions', async () => {
  const findings = await findingsOf('match-list-3');
  assert.deepStrictEqual(
    findings.map((finding) => finding.matchKey),
    Array(3).fill('#fe-root > ul.cards > li.card > span.name'),
  );
  assert.equal(findings[2]?.selector, '#fe-root > ul:nth-child(1) > li:nth-child(3) > span:nth-child(1)');
});

test('a list that grows does not turn an existing flaw into a new finding', async () => {
  const reference = await findingsOf('match-list-3');
  const grown = await findingsOf('match-list-6');
  // By selector, the three added cards would be new.
  const selectors = new Set(reference.map((finding) => finding.selector));
  assert.equal(grown.filter((finding) => !selectors.has(finding.selector)).length, 3);
  assert.deepStrictEqual(newFindings(grown, reference), []);
});

test('a finding at a structurally different place is still new', async () => {
  const reference = await findingsOf('match-list-3');
  const fresh = newFindings(await findingsOf('match-list-moved'), reference);
  assert.deepStrictEqual(
    fresh.map((finding) => [finding.check, finding.matchKey]),
    [['content-spill', '#fe-root > div.summary > span.name']],
  );
});
