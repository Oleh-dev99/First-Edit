import type { Browser } from 'playwright';
import type { Finding, Severity } from '../src/checks/finding.ts';

const COLORS: Record<Severity, string> = { error: '#dc2626', info: '#d97706' };
const LABEL_HEIGHT = 16;

function pngSize(png: Buffer): { width: number; height: number } {
  // The IHDR chunk always starts at byte 8; width and height follow its type.
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}

function mark(finding: Finding, imageWidth: number): string {
  const color = COLORS[finding.severity];
  const { x, y, width, height } = finding.rect;
  // Label above the box, or inside its top edge when there is no room above.
  const labelTop = y >= LABEL_HEIGHT ? y - LABEL_HEIGHT : y;
  // Near the right edge, align the label's right side with the box instead.
  const labelSide =
    x > imageWidth - 160 ? `right:${Math.max(0, imageWidth - (x + width))}px` : `left:${x}px`;
  return (
    `<div class="box" style="left:${x}px; top:${y}px; width:${width}px; height:${height}px; border-color:${color}"></div>` +
    `<div class="label" style="${labelSide}; top:${labelTop}px; background:${color}">${escapeHtml(finding.check)}</div>`
  );
}

/**
 * Draws every finding on top of a clean screenshot: a red outline and the
 * check name for each error, amber for each info finding. Drawn in a
 * separate blank page, so the page under test is never modified.
 */
export async function annotate(browser: Browser, png: Buffer, findings: Finding[]): Promise<Buffer> {
  const { width, height } = pngSize(png);
  // Info first, so error outlines are drawn on top.
  const ordered = [...findings.filter((f) => f.severity === 'info'), ...findings.filter((f) => f.severity === 'error')];
  const html =
    `<!doctype html><html><head><style>` +
    `html, body { margin: 0; } body { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }` +
    `img { display: block; }` +
    `.box { position: absolute; box-sizing: border-box; border: 2px solid; }` +
    `.label { position: absolute; padding: 0 4px; font: 600 11px/${LABEL_HEIGHT}px system-ui, sans-serif; color: #fff; white-space: nowrap; }` +
    `</style></head><body>` +
    `<img src="data:image/png;base64,${png.toString('base64')}" width="${width}" height="${height}" alt="">` +
    ordered.map((finding) => mark(finding, width)).join('') +
    `</body></html>`;

  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  } finally {
    await context.close();
  }
}
