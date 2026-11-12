import { errors, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Finding } from '../src/checks/finding.ts';

export interface Viewport {
  width: number;
  height: number;
}

export const TIMEOUT_MS = 30_000;

/** The query string of a candidate case; open it with `npm run dev` to reproduce the case. */
export function candidateQuery(
  brief: string,
  candidate: string,
  fixture = 'baseline',
  mutation: string | null = null,
): string {
  const query = `?brief=${brief}&candidate=${candidate}&fixture=${fixture}`;
  return mutation === null ? query : `${query}&mutation=${mutation}`;
}

/** How a page load ended. */
export type LoadStatus = 'ok' | 'render-error' | 'timeout';

export interface LoadedPage {
  context: BrowserContext;
  page: Page;
  status: LoadStatus;
  /** What went wrong, for render-error and timeout. */
  error: string | null;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Opens a harness page in a fresh browser context and waits for
 * __FE_READY__ or __FE_ERROR__. A page that reports an error or crashes is
 * "render-error"; one that never becomes ready is "timeout". Only the
 * harness server may be reached: every other request is blocked. The caller
 * closes the context. Throws only when the harness itself fails.
 */
export async function loadPage(
  browser: Browser,
  origin: string,
  query: string,
  viewport: Viewport,
): Promise<LoadedPage> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  try {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(`${origin}/`)) return route.continue();
      console.warn(`blocked request: ${url}`);
      return route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    const result = (status: LoadStatus, error: string | null): LoadedPage => ({ context, page, status, error });
    try {
      await page.goto(`${origin}/${query}`, { timeout: TIMEOUT_MS });
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return result('timeout', `navigation timed out after ${TIMEOUT_MS} ms`);
      }
      throw error;
    }
    try {
      await page.waitForFunction(
        () => window.__FE_READY__ === true || window.__FE_ERROR__ !== undefined,
        undefined,
        { timeout: TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return result('timeout', `timed out after ${TIMEOUT_MS} ms waiting for __FE_READY__`);
      }
      return result('render-error', `page failed: ${messageOf(error)}`);
    }
    const pageError = await page.evaluate(() => window.__FE_ERROR__);
    return pageError === undefined ? result('ok', null) : result('render-error', pageError);
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Like loadPage, but throws unless the page rendered. */
export async function openPage(
  browser: Browser,
  origin: string,
  query: string,
  viewport: Viewport,
): Promise<{ context: BrowserContext; page: Page }> {
  const loaded = await loadPage(browser, origin, query, viewport);
  if (loaded.status === 'ok') return { context: loaded.context, page: loaded.page };
  await loaded.context.close();
  throw new Error(`${loaded.status} at ${viewport.width}px: ${loaded.error}`);
}

/** Runs every check in the page. */
export function collectFindings(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    if (!window.__FE_RUN_CHECKS__) throw new Error('window.__FE_RUN_CHECKS__ is missing');
    return window.__FE_RUN_CHECKS__();
  });
}
