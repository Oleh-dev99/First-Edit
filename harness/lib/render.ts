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

/**
 * Opens a harness page in a fresh browser context and waits for
 * __FE_READY__. Throws if the page reports an error or times out. Only the
 * harness server may be reached: every other request is blocked.
 */
export async function openPage(
  browser: Browser,
  origin: string,
  query: string,
  viewport: Viewport,
): Promise<{ context: BrowserContext; page: Page }> {
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
    await page.goto(`${origin}/${query}`, { timeout: TIMEOUT_MS });
    try {
      await page.waitForFunction(
        () => window.__FE_READY__ === true || window.__FE_ERROR__ !== undefined,
        undefined,
        { timeout: TIMEOUT_MS },
      );
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        throw new Error(`timed out after ${TIMEOUT_MS} ms waiting for __FE_READY__ at ${viewport.width}px`);
      }
      throw error;
    }

    const pageError = await page.evaluate(() => window.__FE_ERROR__);
    if (pageError !== undefined) throw new Error(`page error at ${viewport.width}px: ${pageError}`);
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/** Runs every check in the page. */
export function collectFindings(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    if (!window.__FE_RUN_CHECKS__) throw new Error('window.__FE_RUN_CHECKS__ is missing');
    return window.__FE_RUN_CHECKS__();
  });
}
