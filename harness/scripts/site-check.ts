// npm run site:check [-- --screenshots <dir>]
// Builds the results site, serves it under its GitHub Pages base path and runs
// the suite's checks on every page at 1280 and 320 px, printing every error
// finding. With --screenshots, also saves a full-page screenshot of each.

import { mkdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { SITE_PAGES, SITE_WIDTHS, buildSite, bundleChecks, checkPage, serveStatic } from '../lib/site-check.ts';

const flag = process.argv.indexOf('--screenshots');
const shots = flag >= 0 ? path.resolve(process.argv[flag + 1] ?? 'site-screenshots') : null;
if (shots) mkdirSync(shots, { recursive: true });

const outDir = await mkdtemp(path.join(os.tmpdir(), 'first-edit-site-'));
let failures = 0;
try {
  await buildSite(outDir);
  const server = await serveStatic(outDir);
  const checks = await bundleChecks();
  const browser = await chromium.launch();
  try {
    for (const page of SITE_PAGES) {
      for (const width of SITE_WIDTHS) {
        const name = `${page.replace('/?outcome=all', '-all').replace(/\/$/, '') || 'overview'}-${width}`;
        const result = await checkPage(browser, server.origin, checks, page, width,
          shots ? path.join(shots, `${name}.png`) : undefined);
        const all = [...result.findings, ...result.openFindings];
        const errors = all.filter((finding) => finding.severity === 'error');
        const problems = errors.length + result.failed.length + result.blocked.length + result.pageErrors.length;
        failures += problems;
        console.log(`/${page} at ${width}px (and with ${result.opened} disclosures opened): ${errors.length} error ` +
          `findings, ${all.length - errors.length} info` +
          (result.failed.length ? `, ${result.failed.length} failed requests` : '') +
          (result.blocked.length ? `, ${result.blocked.length} requests to other servers` : '') +
          (result.pageErrors.length ? `, ${result.pageErrors.length} page errors` : ''));
        for (const finding of errors) {
          const tail = finding.selector.split(' > ').slice(-3).join(' > ');
          console.log(`  ${finding.check}: ${tail} ${JSON.stringify((finding.text ?? '').slice(0, 60))} ` +
            JSON.stringify(finding.detail ?? {}).slice(0, 160));
        }
        for (const line of [...result.failed, ...result.blocked, ...result.pageErrors]) console.log(`  ${line}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
} finally {
  await rm(outDir, { recursive: true, force: true });
}
if (shots) console.log(`screenshots in ${shots}`);
process.exit(failures ? 1 : 0);
