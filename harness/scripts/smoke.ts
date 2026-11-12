/**
 * Smoke render. Starts Vite on a free port, renders one sample candidate in
 * headless Chromium at two viewport widths and saves a screenshot of each to
 * results/smoke/. Exits non-zero if the page reports an error or times out.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { candidateQuery, openPage } from '../lib/render.ts';
import { repoRoot, startServer } from '../lib/server.ts';

const BRIEF = 'hello-card';
const CANDIDATE = '_samples/hello-card/robust';
const WIDTHS = [1280, 320];
const HEIGHT = 800;

const outDir = path.join(repoRoot, 'results', 'smoke');
const variant = path.posix.basename(CANDIDATE);

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    for (const width of WIDTHS) {
      const viewport = { width, height: HEIGHT };
      const { context, page } = await openPage(browser, server.origin, candidateQuery(BRIEF, CANDIDATE), viewport);
      try {
        const file = path.join(outDir, `${BRIEF}__${variant}__${width}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const shown = path.relative(repoRoot, file).split(path.sep).join('/');
        console.log(`${width}x${HEIGHT}  scrollWidth=${scrollWidth}  clientWidth=${clientWidth}  ${shown}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(`smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
