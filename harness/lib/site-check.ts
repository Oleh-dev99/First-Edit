// The results site (site/) checked with the suite's own checks: build it,
// serve the build under its GitHub Pages base path, and run the five checks
// on every page at 1280 and 320 px, as a candidate is checked. The site is
// loaded in the same browser context as a candidate (scale 1, light, reduced
// motion, UTC), and every request outside the site is blocked and recorded.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import type { Browser } from 'playwright';
import { build } from 'vite';
import type { Finding } from '../src/checks/finding.ts';
import { harnessDir, repoRoot } from './paths.ts';

export const siteDir = path.join(repoRoot, 'site');
/** The path the site is published under on GitHub Pages. */
export const SITE_BASE = '/First-Edit/';
/** Every page of the site, as paths under the base; the gallery also with every case shown, not only the failed ones. */
export const SITE_PAGES = ['', 'results/', 'gallery/', 'gallery/?outcome=all', 'method/', 'briefs/'] as const;
export const SITE_WIDTHS = [1280, 320] as const;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** Builds the site with its own toolchain (site/node_modules) into outDir. */
export async function buildSite(outDir: string, base = SITE_BASE): Promise<void> {
  const vite = path.join(siteDir, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error('site/node_modules is missing: run "npm ci" in site/ first');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
      cwd: siteDir,
      env: { ...process.env, SITE_BASE: base },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`the site build exited with ${code}`))));
  });
}

export interface StaticServer {
  origin: string;
  close(): Promise<void>;
}

/** Serves `dir` at `base` on 127.0.0.1, like a static host: a folder path serves its index.html. */
export async function serveStatic(dir: string, base = SITE_BASE): Promise<StaticServer> {
  const root = path.resolve(dir);
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (!pathname.startsWith(base)) {
      response.writeHead(404).end('not found');
      return;
    }
    let file = path.resolve(root, `.${pathname.slice(base.length - 1)}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('the static server did not report a port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** The suite's checks (src/checks) as one script that defines window.FirstEditChecks. */
export async function bundleChecks(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: harnessDir,
    build: {
      write: false,
      minify: false,
      emptyOutDir: false,
      lib: {
        entry: path.join(harnessDir, 'src', 'checks', 'index.ts'),
        name: 'FirstEditChecks',
        formats: ['iife'],
        fileName: () => 'checks.js',
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as { output: { type: string; code?: string }[] }[];
  const chunk = outputs.flatMap((output) => output.output).find((item) => item.type === 'chunk' && item.code);
  if (!chunk?.code) throw new Error('bundling the checks produced no script');
  return chunk.code;
}

export interface PageCheck {
  page: string;
  width: number;
  /** findings as the page opens */
  findings: Finding[];
  /** findings with every disclosure on the page opened */
  openFindings: Finding[];
  /** disclosures opened for openFindings */
  opened: number;
  /** responses of the site with a status of 400 or more */
  failed: string[];
  /** requests outside the site, which were blocked */
  blocked: string[];
  /** uncaught errors in the page */
  pageErrors: string[];
}

/** Loads one page at `width` x 800, waits for its data, and runs every check on the whole page. */
export async function checkPage(browser: Browser, origin: string, checks: string, page: string, width: number,
  screenshot?: string): Promise<PageCheck> {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  const result: PageCheck = { page, width, findings: [], openFindings: [], opened: 0, failed: [], blocked: [],
    pageErrors: [] };

  try {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`)) return route.continue();
      result.blocked.push(url);
      return route.abort('blockedbyclient');
    });
    const tab = await context.newPage();
    const run = () => tab.evaluate(() => {
      const api = (window as unknown as { FirstEditChecks: { runChecks(root: Element): Finding[] } }).FirstEditChecks;
      return api.runChecks(document.getElementById('root') ?? document.body);
    });
    tab.on('response', (response) => {
      if (response.status() >= 400) result.failed.push(`${response.status()} ${response.url()}`);
    });
    tab.on('pageerror', (error) => result.pageErrors.push(error.message));
    await tab.goto(`${origin}${SITE_BASE}${page}`, { waitUntil: 'load' });
    await tab.waitForFunction(() => document.body.dataset.ready === 'true', undefined, { timeout: 30_000 });
    await tab.evaluate(() => document.fonts.ready);
    await tab.addScriptTag({ content: checks });
    result.findings = await run();
    if (screenshot) {
      // Lazy pictures below the fold would still be loading when a full-page shot is taken.
      await tab.evaluate(async () => {
        const images = [...document.images];
        for (const image of images) image.loading = 'eager';
        await Promise.all(images.map((image) => image.decode().catch(() => undefined)));
      });
      await tab.screenshot({ path: screenshot, fullPage: true });
    }
    // Then again with every disclosure (annotated screenshots, findings, props) opened.
    result.opened = await tab.evaluate(() => {
      const closed = [...document.querySelectorAll<HTMLButtonElement>('button[data-disclosure][aria-expanded="false"]')];
      for (const button of closed) button.click();
      return closed.length;
    });
    if (result.opened) {
      await tab.waitForFunction(() => !document.querySelector('button[data-disclosure][aria-expanded="false"]'));
      await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      result.openFindings = await run();
    }
  } finally {
    await context.close();
  }
  return result;
}
