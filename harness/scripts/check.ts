/**
 * Renders one case and runs every check on it.
 *
 *   npm run check -- --brief <id> --candidate <path>
 *                    [--fixture <name>] [--mutation <id>] [--width <px>]
 *
 * Writes to results/checks/:
 *   <name>.json            the findings
 *   <name>.png             a clean full-page screenshot
 *   <name>.annotated.png   red outlines on errors, amber on info findings
 * where <name> is <source>__<brief>__<variant>__<fixture>[__<mutation>]__<width>.
 * The width defaults to the mutation's viewport (1280, or 320 for
 * viewport-320); the height is 800. Prints a one-line summary. Exits
 * non-zero only if the case fails to render.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { annotate } from '../lib/annotate.ts';
import { loadBrief } from '../lib/briefs.ts';
import { countFindings } from '../lib/findings.ts';
import { repoRoot } from '../lib/paths.ts';
import { candidateQuery, collectFindings, openPage } from '../lib/render.ts';
import { startServer } from '../lib/server.ts';
import { CHECK_NAMES } from '../src/checks/finding.ts';
import { applyContentMutation } from '../src/mutations/content.ts';
import {
  MUTATION_IDS,
  isContentMutation,
  isMutationId,
  viewportFor,
  type MutationId,
} from '../src/mutations/index.ts';

const USAGE =
  'usage: npm run check -- --brief <id> --candidate <path> ' +
  '[--fixture <name>] [--mutation <id>] [--width <px>]';

interface Args {
  brief: string;
  candidate: string;
  fixture: string;
  mutation: MutationId | null;
  width: number;
}

function readArgs(): Args {
  const { values } = parseArgs({
    options: {
      brief: { type: 'string' },
      candidate: { type: 'string' },
      fixture: { type: 'string', default: 'baseline' },
      mutation: { type: 'string' },
      width: { type: 'string' },
    },
    strict: true,
  });
  if (!values.brief || !values.candidate) throw new Error(USAGE);
  if (values.mutation !== undefined && !isMutationId(values.mutation)) {
    throw new Error(`unknown mutation "${values.mutation}"; known: ${MUTATION_IDS.join(', ')}`);
  }
  const mutation = values.mutation ?? null;
  const width = values.width === undefined ? viewportFor(mutation).width : Number(values.width);
  if (!Number.isInteger(width) || width < 1) throw new Error(USAGE);
  return { brief: values.brief, candidate: values.candidate, fixture: values.fixture ?? 'baseline', mutation, width };
}

async function main(): Promise<void> {
  const args = readArgs();
  const viewport = { width: args.width, height: viewportFor(args.mutation).height };
  const name = [
    ...args.candidate.split('/'),
    args.fixture,
    ...(args.mutation ? [args.mutation] : []),
    String(args.width),
  ].join('__');
  const outDir = path.join(repoRoot, 'results', 'checks');
  await mkdir(outDir, { recursive: true });

  // Content mutations are applied in the page; compute the changed paths here too.
  let changed: string[] | null = null;
  if (args.mutation !== null && isContentMutation(args.mutation)) {
    const { fixture, fields } = loadBrief(args.brief, args.fixture);
    changed = applyContentMutation(fixture, fields, args.mutation).changed;
  }

  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const query = candidateQuery(args.brief, args.candidate, args.fixture, args.mutation);
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

      const report = { ...args, query, viewport, changed, page: pageSize, counts, findings };
      await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
      await writeFile(path.join(outDir, `${name}.png`), clean);
      await writeFile(path.join(outDir, `${name}.annotated.png`), annotated);

      const errors = CHECK_NAMES.filter((check) => counts[check].error > 0)
        .map((check) => `${check} ${counts[check].error}`)
        .join(', ');
      const errorTotal = findings.filter((f) => f.severity === 'error').length;
      const infoTotal = findings.length - errorTotal;
      const mutationNote =
        args.mutation === null ? '' : ` mutation=${args.mutation}${changed?.length === 0 ? ' (not applicable: nothing changed)' : ''}`;
      console.log(
        `${args.candidate} fixture=${args.fixture}${mutationNote} ${viewport.width}x${viewport.height}: ` +
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
