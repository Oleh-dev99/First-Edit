// Page status, shared with the Playwright runner through window globals.

export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Records the first error for the runner and shows it on the page. */
export function fail(message: string): void {
  if (window.__FE_ERROR__ !== undefined) return;
  window.__FE_ERROR__ = message;
  const box = document.getElementById('fe-error');
  if (box) {
    box.textContent = message;
    box.hidden = false;
  }
}

/** Tells the runner the page is ready, unless an error came first. */
export function markReady(): void {
  if (window.__FE_ERROR__ === undefined) window.__FE_READY__ = true;
}
