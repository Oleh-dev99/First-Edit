/**
 * Smoke render. Starts Vite on a free port, renders one sample candidate in
 * headless Chromium at two viewport widths and saves a screenshot of each to
 * results/smoke/. Exits non-zero if the page reports an error or times out.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, errors, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';

const BRIEF = 'hello-card';
const CANDIDATE = '_samples/hello-card/robust';
const WIDTHS = [1280, 320];
const HEIGHT = 800;
const TIMEOUT_MS = 30_000;

const harnessDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = path.resolve(harnessDir, '..');
const outDir = path.join(repoRoot, 'results', 'smoke');
const variant = path.posix.basename(CANDIDATE);

async function startServer(): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    root: harnessDir,
    configFile: path.join(harnessDir, 'vite.config.ts'),
    logLevel: 'warn',
    clearScreen: false,
    // Port 0 lets the OS pick a free port.
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('Vite did not report a listening port');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function renderAt(browser: Browser, origin: string, width: number): Promise<void> {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  try {
    // No network during render: only the local Vite server may be reached.
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`)) return route.continue();
      console.warn(`blocked request: ${url}`);
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    await page.goto(`${origin}/?brief=${BRIEF}&candidate=${CANDIDATE}`, { timeout: TIMEOUT_MS });
    try {
      await page.waitForFunction(
        () => window.__FE_READY__ === true || window.__FE_ERROR__ !== undefined,
        undefined,
        { timeout: TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        throw new Error(`timed out after ${TIMEOUT_MS} ms waiting for __FE_READY__ at ${width}px`);
      }
      throw error;
    }

    const renderError = await page.evaluate(() => window.__FE_ERROR__);
    if (renderError !== undefined) throw new Error(`page error at ${width}px: ${renderError}`);

    const file = path.join(outDir, `${BRIEF}__${variant}__${width}.png`);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' });

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const shown = path.relative(repoRoot, file).split(path.sep).join('/');
    console.log(
      `${width}x${HEIGHT}  scrollWidth=${scrollWidth}  clientWidth=${clientWidth}  ${shown}`,
    );
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const { server, origin } = await startServer();
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    for (const width of WIDTHS) {
      await renderAt(browser, origin, width);
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
