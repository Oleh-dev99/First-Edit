// text-overlap (error): the visible rect of an in-flow text line box
// intersects another in-flow content box that belongs to a different
// element, where neither element contains the other. The intersection must
// be wider than 2px and taller than 0.3 x the smaller font size. Line boxes
// of the same element never count against each other, and two non-text
// boxes never count. One finding per pair of elements.

import {
  type Box,
  type ContentBox,
  intersect,
  round,
  scan,
  matchKeyFor,
  selectorFor,
  textOf,
  toPageRect,
  union,
} from './dom.ts';
import type { Check, Finding } from './finding.ts';

const MIN_OVERLAP_WIDTH_PX = 2;
const MIN_OVERLAP_HEIGHT_EM = 0.3;

type VisibleBox = ContentBox & { visible: Box };

interface Pair {
  primary: Element;
  other: Element;
  rect: Box;
  width: number;
  height: number;
  primaryTexts: Text[];
  otherTexts: Text[];
}

const precedes = (a: Element, b: Element): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

export const textOverlap: Check = (root) => {
  const view = root.ownerDocument.defaultView ?? window;
  const boxes = scan(root).boxes.filter(
    (box): box is VisibleBox => box.inFlow && box.visible !== null,
  );
  const pairs = new Map<Element, Map<Element, Pair>>();

  for (const a of boxes) {
    if (a.kind !== 'text') continue;
    for (const b of boxes) {
      if (b.element === a.element) continue;
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;

      const overlap = intersect(a.visible, b.visible);
      if (!overlap) continue;
      const width = overlap.right - overlap.left;
      const height = overlap.bottom - overlap.top;
      const fontSize = b.kind === 'text' ? Math.min(a.fontSize, b.fontSize) : a.fontSize;
      if (width <= MIN_OVERLAP_WIDTH_PX || height <= MIN_OVERLAP_HEIGHT_EM * fontSize) continue;

      // The primary side is text; between two texts, the earlier in document order.
      const [primary, other] = b.kind === 'text' && precedes(b.element, a.element) ? [b, a] : [a, b];
      const byOther = pairs.get(primary.element) ?? new Map<Element, Pair>();
      pairs.set(primary.element, byOther);
      const pair = byOther.get(other.element);
      if (pair) {
        pair.rect = union(pair.rect, overlap);
        pair.width = Math.max(pair.width, width);
        pair.height = Math.max(pair.height, height);
        if (primary.textNode) pair.primaryTexts.push(primary.textNode);
        if (other.textNode) pair.otherTexts.push(other.textNode);
      } else {
        byOther.set(other.element, {
          primary: primary.element,
          other: other.element,
          rect: overlap,
          width,
          height,
          primaryTexts: primary.textNode ? [primary.textNode] : [],
          otherTexts: other.textNode ? [other.textNode] : [],
        });
      }
    }
  }

  return [...pairs.values()].flatMap((byOther) =>
    [...byOther.values()].map(
      (pair): Finding => ({
        check: 'text-overlap',
        severity: 'error',
        selector: selectorFor(pair.primary, root),
        matchKey: matchKeyFor(pair.primary, root),
        rect: toPageRect(pair.rect, view),
        text: textOf(pair.primaryTexts),
        detail: {
          otherSelector: selectorFor(pair.other, root),
          otherText: textOf(pair.otherTexts),
          overlapWidthPx: round(pair.width),
          overlapHeightPx: round(pair.height),
        },
      }),
    ),
  );
};
