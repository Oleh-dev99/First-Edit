// content-spill (error): an in-flow content box's visible rect extends past
// the border box of its nearest visibly boxed ancestor inside the root.
// Out-of-flow content is exempt.

import {
  type Box,
  type ContentBox,
  TOLERANCE_X,
  boxOf,
  isVisiblyBoxed,
  overflowPast,
  round,
  scan,
  selectorFor,
  textOf,
  toPageRect,
  union,
  verticalTolerance,
} from './dom.ts';
import type { Check, Finding } from './finding.ts';

/** The nearest visibly boxed ancestor of a content box, below the root. */
function nearestBoxedAncestor(box: ContentBox, root: Element): Element | null {
  // A text line box sits inside its own element; a replaced element's box is that element.
  let el: Element | null = box.kind === 'text' ? box.element : box.element.parentElement;
  for (; el && el !== root; el = el.parentElement) {
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
  const spills = new Map<Element, Spill>();

  for (const box of scan(root).boxes) {
    if (!box.inFlow || !box.visible) continue;
    const boxed = nearestBoxedAncestor(box, root);
    if (!boxed) continue;

    const border = boxOf(boxed.getBoundingClientRect());
    const overX = overflowPast(box.visible, border, 'x');
    const overY = overflowPast(box.visible, border, 'y');
    const axes: string[] = [];
    let overflowPx = 0;
    if (overX > TOLERANCE_X) {
      axes.push('x');
      overflowPx = Math.max(overflowPx, overX);
    }
    if (overY > verticalTolerance(box)) {
      axes.push('y');
      overflowPx = Math.max(overflowPx, overY);
    }
    if (axes.length === 0) continue;

    const spill = spills.get(box.element);
    if (spill) {
      spill.rect = union(spill.rect, box.visible);
      axes.forEach((axis) => spill.axes.add(axis));
      spill.overflowPx = Math.max(spill.overflowPx, overflowPx);
      if (box.textNode) spill.texts.push(box.textNode);
    } else {
      spills.set(box.element, {
        rect: box.visible,
        axes: new Set(axes),
        overflowPx,
        boxed,
        texts: box.textNode ? [box.textNode] : [],
      });
    }
  }

  return Array.from(spills, ([element, spill]): Finding => ({
    check: 'content-spill',
    severity: 'error',
    selector: selectorFor(element, root),
    rect: toPageRect(spill.rect, view),
    text: textOf(spill.texts),
    detail: {
      axis: [...spill.axes].sort().join(''),
      overflowPx: round(spill.overflowPx),
      boxedSelector: selectorFor(spill.boxed, root),
    },
  }));
};
