/**
 * Validates briefs and their reference candidates.
 *
 *   npm run briefs:check [-- --brief <id>]
 *
 * Per brief: the required files, meta.json, the fields map against the
 * baseline fixture, the fixture against Props (type-level), the corpus
 * rules and the number of applicable mutations. Per reference candidate
 * (candidates/_reference/<id>/v1): its default export accepts Props, it
 * imports only react, its baseline is clean, every applicable case of both
 * tiers survives and no case hides content (stress results go to
 * results/runs/<id>/). Prints one row per brief and exits non-zero if any
 * brief fails.
 */
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { MUTATION_COUNT, checkBriefStatic, checkReference, listBriefs, type BriefCheck } from '../lib/brief-check.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';

function table(checks: BriefCheck[]): string {
  const header = ['brief', 'sample', 'applicable', 'reference survival', 'result'];
  const rows = checks.map((check) => [
    check.id,
    check.sample ? 'yes' : 'no',
    check.applicable === null ? '-' : `${check.applicable}/${MUTATION_COUNT}`,
    check.survival ? `${check.survival.survived}/${check.survival.applicable}` : '-',
    check.problems.length === 0 ? 'pass' : 'FAIL',
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column]!.length)));
  const line = (cells: string[]): string => cells.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();
  return [line(header), ...rows.map(line)].join('\n');
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { brief: { type: 'string' } }, strict: true });
  const all = listBriefs();
  if (values.brief !== undefined && !all.includes(values.brief)) throw new Error(`no brief "${values.brief}"`);
  const checks = (values.brief ? [values.brief] : all).map(checkBriefStatic);

  if (checks.some((check) => check.reference)) {
    let server: HarnessServer | undefined;
    let browser: Browser | undefined;
    try {
      server = await startServer();
      browser = await chromium.launch();
      for (const check of checks) await checkReference(check, browser, server.origin);
    } finally {
      await browser?.close();
      await server?.close();
    }
  }

  console.log(table(checks));
  for (const check of checks.filter((c) => c.problems.length > 0)) {
    console.log(`\n${check.id}:`);
    for (const problem of check.problems) console.log(`  - ${problem}`);
  }
  if (checks.some((check) => check.problems.length > 0)) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`briefs:check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
