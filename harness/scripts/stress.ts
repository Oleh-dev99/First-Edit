/**
 * Stress runner.
 *
 *   npm run stress -- --brief <id> --candidate <path>
 *
 * Renders the baseline and every applicable mutation, runs the checks and
 * writes to results/runs/<brief>/<candidate with / replaced by __>/:
 * baseline.json, <mutation>.json per case, a clean and an annotated
 * screenshot per case, and summary.json. Prints the stress table and the
 * survival rate. Exits 0 whatever the survival rate; non-zero only when the
 * harness itself fails.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { candidatesDir, repoRoot, resultsDir } from '../lib/paths.ts';
import { startServer } from '../lib/server.ts';
import { formatStressTable, runStress } from '../lib/stress.ts';

const USAGE = 'usage: npm run stress -- --brief <id> --candidate <path>';

function readArgs(): { brief: string; candidate: string } {
  const { values } = parseArgs({
    options: { brief: { type: 'string' }, candidate: { type: 'string' } },
    strict: true,
  });
  if (!values.brief || !values.candidate) throw new Error(USAGE);
  if (!existsSync(path.join(candidatesDir, values.candidate, 'Component.tsx'))) {
    throw new Error(`no candidate at candidates/${values.candidate}/Component.tsx`);
  }
  return { brief: values.brief, candidate: values.candidate };
}

async function main(): Promise<void> {
  const { brief, candidate } = readArgs();
  const outDir = path.join(resultsDir, 'runs', brief, candidate.split('/').join('__'));
  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const summary = await runStress({ browser, origin: server.origin, brief, candidate, outDir });
    console.log(formatStressTable(summary));
    console.log(`results: ${path.relative(repoRoot, outDir).split(path.sep).join('/')}/`);
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`stress failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
