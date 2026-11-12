// page-overflow-x (error): the page scrolls horizontally.
// documentElement.scrollWidth exceeds clientWidth by more than 1px. One
// finding for the page; detail lists up to three deepest elements whose
// right edge passes the viewport.

import {
  TOLERANCE_X,
  boxOf,
  clipBox,
  depthOf,
  scan,
  selectorFor,
} from './dom.ts';
import type { Check } from './finding.ts';

export const pageOverflowX: Check = (root) => {
  const html = root.ownerDocument.documentElement;
  const view = root.ownerDocument.defaultView ?? window;
  const overflowPx = html.scrollWidth - html.clientWidth;
  if (overflowPx <= TOLERANCE_X) return [];

  const pastViewport = scan(root)
    .elements.filter(({ element, clipChain }) => {
      const visible = clipBox(boxOf(element.getBoundingClientRect()), clipChain);
      return visible !== null && visible.right + view.scrollX > html.clientWidth + TOLERANCE_X;
    })
    .map(({ element }) => element);

  // Deepest first: keep elements with no offending descendant, then sort by depth.
  const culprits = pastViewport
    .filter((el) => !pastViewport.some((other) => other !== el && el.contains(other)))
    .sort((a, b) => depthOf(b, root) - depthOf(a, root))
    .slice(0, 3);

  return [
    {
      check: 'page-overflow-x',
      severity: 'error',
      selector: 'html',
      rect: { x: html.clientWidth, y: 0, width: overflowPx, height: html.scrollHeight },
      text: null,
      detail: {
        axis: 'x',
        overflowPx,
        scrollWidth: html.scrollWidth,
        clientWidth: html.clientWidth,
        culprits: culprits.map((el) => selectorFor(el, root)),
      },
    },
  ];
};
