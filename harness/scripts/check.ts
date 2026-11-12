/**
 * Renders one case and runs every check on it.
 *
 *   npm run check -- --brief <id> --candidate <path> [--fixture <name>] [--width <px>]
 *
 * Writes to results/checks/:
 *   <name>.json            the findings
 *   <name>.png             a clean full-page screenshot
 *   <name>.annotated.png   red outlines on errors, amber on info findings
 * where <name> is <source>__<brief>__<variant>__<fixture>__<width>.
 * Prints a one-line summary. Exits non-zero only if the case fails to render.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { annotate } from '../lib/annotate.ts';
import { countFindings } from '../lib/findings.ts';
import { candidateQuery, collectFindings, openPage } from '../lib/render.ts';
import { repoRoot, startServer } from '../lib/server.ts';
import { CHECK_NAMES } from '../src/checks/finding.ts';

const HEIGHT = 800;
const USAGE =
  'usage: npm run check -- --brief <id> --candidate <path> [--fixture <name>] [--width <px>]';

function readArgs(): { brief: string; candidate: string; fixture: string; width: number } {
  const { values } = parseArgs({
    options: {
      brief: { type: 'string' },
      candidate: { type: 'string' },
      fixture: { type: 'string', default: 'baseline' },
      width: { type: 'string', default: '1280' },
    },
    strict: true,
  });
  const width = Number(values.width);
  if (!values.brief || !values.candidate || !Number.isInteger(width) || width < 1) {
    throw new Error(USAGE);
  }
  return { brief: values.brief, candidate: values.candidate, fixture: values.fixture ?? 'baseline', width };
}

async function main(): Promise<void> {
  const args = readArgs();
  const viewport = { width: args.width, height: HEIGHT };
  const name = [...args.candidate.split('/'), args.fixture, String(args.width)].join('__');
  const outDir = path.join(repoRoot, 'results', 'checks');
  await mkdir(outDir, { recursive: true });

  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const query = candidateQuery(args.brief, args.candidate, args.fixture);
    const { context, page } = await openPage(browser, server.origin, query, viewport);
    try {
      const findings = await collectFindings(page);
      const pageSize = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
      }));
      const clean = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' });
      const annotated = await annotate(browser, clean, findings);
      const counts = countFindings(findings);

      const report = { ...args, viewport, page: pageSize, counts, findings };
      await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
      await writeFile(path.join(outDir, `${name}.png`), clean);
      await writeFile(path.join(outDir, `${name}.annotated.png`), annotated);

      const errors = CHECK_NAMES.filter((check) => counts[check].error > 0)
        .map((check) => `${check} ${counts[check].error}`)
        .join(', ');
      const errorTotal = findings.filter((f) => f.severity === 'error').length;
      const infoTotal = findings.length - errorTotal;
      console.log(
        `${args.candidate} fixture=${args.fixture} ${args.width}x${HEIGHT}: ` +
          `${errorTotal} error${errorTotal === 1 ? '' : 's'}${errors ? ` (${errors})` : ''}, ${infoTotal} info ` +
          `-> results/checks/${name}.{json,png,annotated.png}`,
      );
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
