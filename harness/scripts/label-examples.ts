/**
 * Screenshots the check-lab cases that the labelling tool shows as example
 * pairs on its first screen (docs/LABELLING.md).
 *
 *   npm run label:examples
 *
 * Reads runner/first_edit/label_ui/examples.json and writes one clean PNG per
 * lab case to runner/first_edit/label_ui/examples/<id>.png, rendered at the
 * case's own viewport. The picture is cropped to the content plus the stage's
 * 16px padding; a page wider than the screen keeps its full width, so the
 * part past the screen's edge stays visible.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { examplesDir, readExamples } from '../lib/label-examples.ts';
import { repoRoot } from '../lib/paths.ts';
import { openPage } from '../lib/render.ts';
import { startServer } from '../lib/server.ts';
import { DEFAULT_VIEWPORT, LAB_CASES } from '../src/lab/cases.ts';

async function main(): Promise<void> {
  const pairs = readExamples();
  const ids = [...new Set(pairs.flatMap((pair) => [pair.left.lab, pair.right.lab]))];
  await mkdir(examplesDir, { recursive: true });

  const server = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    for (const id of ids) {
      const labCase = LAB_CASES.find((candidate) => candidate.id === id);
      if (!labCase) throw new Error(`unknown lab case "${id}" in examples.json`);
      const viewport = labCase.viewport ?? DEFAULT_VIEWPORT;
      const { context, page } = await openPage(browser, server.origin, `?lab=${id}`, viewport);
      try {
        const clip = await page.evaluate(() => {
          const root = document.getElementById('fe-root')!;
          const range = document.createRange();
          range.selectNodeContents(root);
          let right = 0;
          let bottom = 0;
          const boxes = [...range.getClientRects(), ...[...root.querySelectorAll('*')].map((el) => el.getBoundingClientRect())];
          for (const box of boxes) {
            if (box.width === 0 && box.height === 0) continue;
            right = Math.max(right, box.right + window.scrollX);
            bottom = Math.max(bottom, box.bottom + window.scrollY);
          }
          const doc = document.documentElement;
          const widened = doc.scrollWidth > doc.clientWidth + 1;
          return {
            x: 0,
            y: 0,
            width: widened ? doc.scrollWidth : Math.min(doc.clientWidth, Math.ceil(right) + 16),
            height: Math.min(doc.scrollHeight, Math.ceil(bottom) + 16),
          };
        });
        const file = path.join(examplesDir, `${id}.png`);
        await page.screenshot({ path: file, clip, fullPage: true, animations: 'disabled', caret: 'hide' });
        console.log(`${id}: ${clip.width}x${clip.height} on a ${viewport.width}px screen -> ${path.relative(repoRoot, file)}`);
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
  console.error(`label:examples failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
