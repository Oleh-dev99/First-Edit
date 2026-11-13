// page-overflow-x (error): the page scrolls horizontally.
// documentElement.scrollWidth exceeds clientWidth by more than 1px. One
// finding for the page; detail names up to three culprits: elements whose
// border box, text line boxes or replaced content pass the viewport's right
// edge, the ones that reach furthest first. The culprits are detail only;
// they never decide whether the check fires.

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

  // The furthest right edge, in page coordinates, that each element reaches
  // with its own box or with its content: a word that does not fit runs past
  // its element's box, so the element's box alone would not name it.
  const reach = new Map<Element, number>();
  const note = (element: Element, right: number): void => {
    reach.set(element, Math.max(reach.get(element) ?? -Infinity, right + view.scrollX));
  };
  const { boxes, elements } = scan(root);
  for (const { element, clipChain } of elements) {
    const visible = clipBox(boxOf(element.getBoundingClientRect()), clipChain);
    if (visible) note(element, visible.right);
  }
  for (const box of boxes) {
    if (box.visible) note(box.element, box.visible.right);
  }

  const past = [...reach].filter(([, right]) => right > html.clientWidth + TOLERANCE_X);
  // Keep elements with no listed descendant, then the furthest first (the
  // deepest on a tie).
  const culprits = past
    .filter(([el]) => !past.some(([other]) => other !== el && el.contains(other)))
    .sort(([a, reachA], [b, reachB]) => reachB - reachA || depthOf(b, root) - depthOf(a, root))
    .slice(0, 3)
    .map(([el]) => el);

  return [
    {
      check: 'page-overflow-x',
      severity: 'error',
      selector: 'html',
      matchKey: 'html',
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
