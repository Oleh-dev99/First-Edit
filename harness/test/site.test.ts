// The results site passes its own suite: built and served under its GitHub
// Pages base path, every page has no error finding from the five checks at
// 1280 px and at 320 px, loads nothing from another server, and requests no
// file the build lacks. The Method page states this result.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { SITE_PAGES, SITE_WIDTHS, buildSite, bundleChecks, checkPage, serveStatic, type StaticServer } from '../lib/site-check.ts';

let outDir = '';
let server: StaticServer;
let browser: Browser;
let checks = '';

before(async () => {
  outDir = await mkdtemp(path.join(os.tmpdir(), 'first-edit-site-'));
  await buildSite(outDir);
  server = await serveStatic(outDir);
  checks = await bundleChecks();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await server?.close();
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

test('every page of the site has no error finding at 1280 and 320 px', async () => {
  const rows: string[] = [];
  const problems: string[] = [];
  for (const page of SITE_PAGES) {
    for (const width of SITE_WIDTHS) {
      const result = await checkPage(browser, server.origin, checks, page, width);
      for (const [state, findings] of [['as it opens', result.findings], ['opened', result.openFindings]] as const) {
        const errors = findings.filter((finding) => finding.severity === 'error');
        rows.push(`/${page} at ${width}px, ${state}: ${errors.length} errors, ${findings.length - errors.length} info`);
        for (const finding of errors) {
          problems.push(`/${page} at ${width}px, ${state}: ${finding.check} on ${finding.selector} ` +
            JSON.stringify(finding.text ?? ''));
        }
      }
      for (const failed of result.failed) problems.push(`/${page} at ${width}px: ${failed}`);
      for (const blocked of result.blocked) problems.push(`/${page} at ${width}px: requested another server: ${blocked}`);
      for (const error of result.pageErrors) problems.push(`/${page} at ${width}px: page error: ${error}`);
    }
  }
  console.log(rows.join('\n'));
  assert.equal(rows.length, SITE_PAGES.length * SITE_WIDTHS.length * 2);
  assert.deepStrictEqual(problems, []);
});
