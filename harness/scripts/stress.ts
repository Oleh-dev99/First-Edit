/**
 * Stress runner.
 *
 *   npm run stress -- --brief <id> --candidate <path> [--runs-dir <dir>]
 *
 * Renders the baseline and every applicable case, runs the checks and
 * writes to <runs-dir>/<brief>/<candidate with / replaced by __>/:
 * baseline.json, <case>.json per case, a clean and an annotated screenshot
 * per case, and summary.json. The runs directory defaults to results/runs;
 * a relative path is taken from the repository root. Prints the stress
 * table and the survival rate. Exits 0 whatever the survival rate; non-zero
 * only when the harness itself fails.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { candidatesDir, repoRoot, resultsDir } from '../lib/paths.ts';
import { startServer } from '../lib/server.ts';
import { formatStressTable, runStress } from '../lib/stress.ts';

const USAGE = 'usage: npm run stress -- --brief <id> --candidate <path> [--runs-dir <dir>]';

function readArgs(): { brief: string; candidate: string; runsDir: string } {
  const { values } = parseArgs({
    options: { brief: { type: 'string' }, candidate: { type: 'string' }, 'runs-dir': { type: 'string' } },
    strict: true,
  });
  if (!values.brief || !values.candidate) throw new Error(USAGE);
  if (!existsSync(path.join(candidatesDir, values.candidate, 'Component.tsx'))) {
    throw new Error(`no candidate at candidates/${values.candidate}/Component.tsx`);
  }
  const runsDir = values['runs-dir'] === undefined ? path.join(resultsDir, 'runs') : path.resolve(repoRoot, values['runs-dir']);
  return { brief: values.brief, candidate: values.candidate, runsDir };
}

async function main(): Promise<void> {
  const { brief, candidate, runsDir } = readArgs();
  const outDir = path.join(runsDir, brief, candidate.split('/').join('__'));
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
