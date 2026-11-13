// content-spill (error): an in-flow content box's visible rect extends past
// the border box of its nearest visibly boxed ancestor inside the root, by
// more than 2px horizontally (D-042).
// Content boxes here are text line boxes, replaced elements and visibly
// boxed elements themselves (a pill, a panel), each compared with its own
// nearest boxed ancestor. Out-of-flow content is exempt. One finding per
// spilling element.

import {
  type Box,
  EDGE_TOLERANCE_X,
  TOLERANCE_Y,
  boxOf,
  clipBox,
  isVisiblyBoxed,
  overflowPast,
  round,
  scan,
  matchKeyFor,
  selectorFor,
  textOf,
  toPageRect,
  union,
  verticalTolerance,
} from './dom.ts';
import type { Check, Finding } from './finding.ts';

/** The nearest visibly boxed element from `start` upwards (inclusive), below the root. */
function nearestBoxed(start: Element | null, root: Element): Element | null {
  for (let el = start; el && el !== root; el = el.parentElement) {
    if (isVisiblyBoxed(getComputedStyle(el))) return el;
  }
  return null;
}

interface Spill {
  rect: Box;
  axes: Set<string>;
  overflowPx: number;
  boxed: Element;
  texts: Text[];
}

export const contentSpill: Check = (root) => {
  const view = root.ownerDocument.defaultView ?? window;
  const { boxes, elements } = scan(root);
  const spills = new Map<Element, Spill>();

  /** Compares one visible box of `element` with the nearest boxed element from `start` up. */
  const compare = (element: Element, visible: Box, start: Element | null, toleranceY: number, text: Text | null) => {
    const boxed = nearestBoxed(start, root);
    if (!boxed) return;
    const border = boxOf(boxed.getBoundingClientRect());
    const overX = overflowPast(visible, border, 'x');
    const overY = overflowPast(visible, border, 'y');
    const axes: string[] = [];
    let overflowPx = 0;
    if (overX > EDGE_TOLERANCE_X) {
      axes.push('x');
      overflowPx = Math.max(overflowPx, overX);
    }
    if (overY > toleranceY) {
      axes.push('y');
      overflowPx = Math.max(overflowPx, overY);
    }
    if (axes.length === 0) return;

    const spill = spills.get(element);
    if (spill) {
      spill.rect = union(spill.rect, visible);
      axes.forEach((axis) => spill.axes.add(axis));
      spill.overflowPx = Math.max(spill.overflowPx, overflowPx);
      if (text) spill.texts.push(text);
    } else {
      spills.set(element, { rect: visible, axes: new Set(axes), overflowPx, boxed, texts: text ? [text] : [] });
    }
  };

  // Text line boxes sit inside their own element; a replaced element's box is the element.
  for (const box of boxes) {
    if (!box.inFlow || !box.visible) continue;
    const start = box.kind === 'text' ? box.element : box.element.parentElement;
    compare(box.element, box.visible, start, verticalTolerance(box), box.textNode);
  }

  // A visibly boxed element is a content box too, compared with its own nearest boxed ancestor.
  for (const { element, inFlow, clipChain } of elements) {
    if (!inFlow || !isVisiblyBoxed(getComputedStyle(element))) continue;
    const visible = clipBox(boxOf(element.getBoundingClientRect()), clipChain);
    if (visible) compare(element, visible, element.parentElement, TOLERANCE_Y, null);
  }

  return [...spills]
    .sort(([a], [b]) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(
      ([element, spill]): Finding => ({
        check: 'content-spill',
        severity: 'error',
        selector: selectorFor(element, root),
        matchKey: matchKeyFor(element, root),
        rect: toPageRect(spill.rect, view),
        text: textOf(spill.texts),
        detail: {
          axis: [...spill.axes].sort().join(''),
          overflowPx: round(spill.overflowPx),
          boxedSelector: selectorFor(spill.boxed, root),
        },
      }),
    );
};
