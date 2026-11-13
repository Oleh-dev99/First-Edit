// off-screen (error): content cut off by the viewport edge that cannot be
// scrolled into view (D-035). A content box is flagged when
//   (a) it is inside a position: fixed subtree and passes the viewport's
//       left or right edge, or
//   (b) it lies past the edge the page cannot scroll to: left of x = 0 in a
//       left-to-right page, right of the viewport in a right-to-left one.
// Boxes that lie entirely more than one viewport width beyond an edge are a
// deliberate parking pattern (left: -9999px) and are ignored. Unlike
// content-spill and text-overlap, this check covers out-of-flow content.
// One finding per element.

import {
  type Box,
  TOLERANCE_X,
  hasArea,
  round,
  scan,
  matchKeyFor,
  selectorFor,
  textOf,
  union,
} from './dom.ts';
import type { Check, Finding } from './finding.ts';

/** Width of the strip drawn at the edge for a box that lies entirely past it. */
const EDGE_STRIP_PX = 4;

interface OffScreen {
  rect: Box;
  side: Set<'left' | 'right'>;
  overflowPx: number;
  fixed: boolean;
  texts: Text[];
}

export const offScreen: Check = (root) => {
  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;
  const width = doc.documentElement.clientWidth;
  const rtl = getComputedStyle(doc.documentElement).direction === 'rtl';
  const found = new Map<Element, OffScreen>();

  for (const box of scan(root).boxes) {
    if (!box.visible) continue;
    // Fixed boxes are placed against the viewport; everything else against the page.
    const shift = box.inFixed ? 0 : view.scrollX;
    const left = box.visible.left + shift;
    const right = box.visible.right + shift;
    if (right < -width || left > 2 * width) continue;

    let side: 'left' | 'right' | null = null;
    let overflowPx = 0;
    const pastLeft = -left;
    const pastRight = right - width;
    if (box.inFixed) {
      if (pastLeft > TOLERANCE_X) [side, overflowPx] = ['left', pastLeft];
      if (pastRight > TOLERANCE_X && pastRight > overflowPx) [side, overflowPx] = ['right', pastRight];
    } else if (!rtl && pastLeft > TOLERANCE_X) {
      [side, overflowPx] = ['left', pastLeft];
    } else if (rtl && pastRight > TOLERANCE_X) {
      [side, overflowPx] = ['right', pastRight];
    }
    if (side === null) continue;

    const entry = found.get(box.element);
    if (entry) {
      entry.rect = union(entry.rect, { ...box.visible, left, right });
      entry.side.add(side);
      entry.overflowPx = Math.max(entry.overflowPx, overflowPx);
      if (box.textNode) entry.texts.push(box.textNode);
    } else {
      found.set(box.element, {
        rect: { ...box.visible, left, right },
        side: new Set([side]),
        overflowPx,
        fixed: box.inFixed,
        texts: box.textNode ? [box.textNode] : [],
      });
    }
  }

  return [...found]
    .sort(([a], [b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(
      ([element, entry]): Finding => ({
        check: 'off-screen',
        severity: 'error',
        selector: selectorFor(element, root),
        matchKey: matchKeyFor(element, root),
        rect: onScreenRect(entry, width, view),
        text: textOf(entry.texts),
        detail: {
          axis: 'x',
          side: [...entry.side].sort().join(','),
          overflowPx: round(entry.overflowPx),
          fixed: entry.fixed,
        },
      }),
    );
};

/**
 * The part of the box that is on screen, in page coordinates, so the
 * annotated screenshot shows where the cut is; a thin strip at the edge
 * when the box lies entirely past it.
 */
function onScreenRect(entry: OffScreen, width: number, view: Window): Finding['rect'] {
  const visible = { ...entry.rect, left: Math.max(entry.rect.left, 0), right: Math.min(entry.rect.right, width) };
  const box: Box = hasArea(visible)
    ? visible
    : entry.rect.left >= width
      ? { ...entry.rect, left: width - EDGE_STRIP_PX, right: width }
      : { ...entry.rect, left: 0, right: EDGE_STRIP_PX };
  return {
    x: round(box.left),
    y: round(box.top + view.scrollY),
    width: round(box.right - box.left),
    height: round(box.bottom - box.top),
  };
}
