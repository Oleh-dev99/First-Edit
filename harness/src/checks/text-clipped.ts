// text-clipped: a text line box extends past the padding box of its nearest
// ancestor with overflow hidden or clip on that axis.
// - error: no ellipsis (x axis) and no line clamp (y axis)
// - info: text-overflow ellipsis or a line clamp is set (deliberate truncation)
// A scroll container (overflow auto or scroll) keeps its content reachable
// and never produces a finding. Uses raw boxes. Replaced elements are exempt.

import {
  type Box,
  type ContentBox,
  TOLERANCE_X,
  overflowPast,
  paddingBox,
  round,
  scan,
  selectorFor,
  textOf,
  toPageRect,
  union,
  verticalTolerance,
} from './dom.ts';
import type { Check, Finding } from './finding.ts';

type Axis = 'x' | 'y';
type Truncation = 'ellipsis' | 'line-clamp' | null;

interface Clip {
  axis: Axis;
  overflowPx: number;
  clipper: Element;
  truncation: Truncation;
}

const isSet = (value: string): boolean => value !== '' && value !== 'none';

function truncationOf(axis: Axis, clipper: Element, path: Element[]): Truncation {
  if (axis === 'x') {
    return getComputedStyle(clipper).textOverflow !== 'clip' ? 'ellipsis' : null;
  }
  const clamped = path.some((el) => {
    const style = getComputedStyle(el);
    return isSet(style.getPropertyValue('-webkit-line-clamp')) || isSet(style.getPropertyValue('line-clamp'));
  });
  return clamped ? 'line-clamp' : null;
}

/** How a text line box is clipped on one axis, or null if it is not. */
function clipOn(box: ContentBox, axis: Axis): Clip | null {
  for (const [index, el] of box.clipChain.entries()) {
    const style = getComputedStyle(el);
    const overflow = axis === 'x' ? style.overflowX : style.overflowY;
    if (overflow === 'visible') continue;
    if (overflow === 'auto' || overflow === 'scroll') return null;

    const overflowPx = overflowPast(box.raw, paddingBox(el, style), axis);
    const tolerance = axis === 'x' ? TOLERANCE_X : verticalTolerance(box);
    if (overflowPx <= tolerance) return null;
    const path = box.clipChain.slice(0, index + 1);
    return { axis, overflowPx, clipper: el, truncation: truncationOf(axis, el, path) };
  }
  return null;
}

export const textClipped: Check = (root) => {
  const view = root.ownerDocument.defaultView ?? window;
  const groups = new Map<Element, { rect: Box; clips: Clip[]; texts: Text[] }>();

  for (const box of scan(root).boxes) {
    if (box.kind !== 'text' || !box.textNode) continue;
    const clips = [clipOn(box, 'x'), clipOn(box, 'y')].filter((clip) => clip !== null);
    if (clips.length === 0) continue;
    const group = groups.get(box.element);
    if (group) {
      group.rect = union(group.rect, box.raw);
      group.clips.push(...clips);
      group.texts.push(box.textNode);
    } else {
      groups.set(box.element, { rect: box.raw, clips, texts: [box.textNode] });
    }
  }

  return Array.from(groups, ([element, { rect, clips, texts }]): Finding => {
    const error = clips.some((clip) => clip.truncation === null);
    const worst = clips.reduce((a, b) => (b.overflowPx > a.overflowPx ? b : a));
    const truncations = [...new Set(clips.map((clip) => clip.truncation))].filter((t) => t !== null);
    return {
      check: 'text-clipped',
      severity: error ? 'error' : 'info',
      selector: selectorFor(element, root),
      rect: toPageRect(rect, view),
      text: textOf(texts),
      detail: {
        axis: [...new Set(clips.map((clip) => clip.axis))].sort().join(''),
        overflowPx: round(worst.overflowPx),
        clipSelector: selectorFor(worst.clipper, root),
        truncation: error ? null : truncations.join(','),
      },
    };
  });
};
