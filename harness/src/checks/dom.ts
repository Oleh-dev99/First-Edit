// Shared DOM helpers for the checks: content boxes, visibility rules, clipping
// and geometry. Plain DOM code with no imports from the app.

import type { Rect } from './finding.ts';

/** An axis-aligned box in viewport (client) coordinates. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Horizontal geometry tolerance in px. */
export const TOLERANCE_X = 1;
/** Vertical tolerance for text, as a fraction of its font size. Glyph boxes can exceed tight line heights. */
export const TEXT_TOLERANCE_Y = 0.3;
/** Vertical tolerance in px for everything that is not text. */
export const TOLERANCE_Y = 1;

export function verticalTolerance(box: ContentBox): number {
  return box.kind === 'text' ? TEXT_TOLERANCE_Y * box.fontSize : TOLERANCE_Y;
}

type FlowMode = 'flow' | 'absolute' | 'fixed';

export interface ContentBox {
  kind: 'text' | 'replaced';
  /** The owning element: a text node's parent, or the replaced element itself. */
  element: Element;
  /** The text node, for text line boxes. */
  textNode: Text | null;
  /** The raw box: a text line box or the element's border box. */
  raw: Box;
  /** The raw box intersected with every ancestor whose overflow is not visible; null if fully clipped. */
  visible: Box | null;
  fontSize: number;
  /** False if the box, or an ancestor inside the root, is position absolute or fixed. */
  inFlow: boolean;
  /** True if the box, or an ancestor inside the root, is position fixed. */
  inFixed: boolean;
  /** Ancestors that can clip this box, nearest first: its containing-block chain up to the root. */
  clipChain: Element[];
}

export interface ScannedElement {
  element: Element;
  inFlow: boolean;
  inFixed: boolean;
  clipChain: Element[];
}

export interface Scan {
  boxes: ContentBox[];
  elements: ScannedElement[];
}

/** Replaced elements and form controls: their border box is a content box. */
const REPLACED = new Set(['img', 'svg', 'video', 'canvas', 'input', 'button', 'select', 'textarea']);

/** Elements whose descendants are never walked for content. */
const OPAQUE = new Set([
  'svg', 'video', 'canvas', 'select', 'textarea', 'audio', 'iframe', 'object', 'embed',
  'script', 'style', 'template', 'noscript',
]);

/**
 * Walks `root` and returns every content box and every visible element,
 * skipping display:none, visibility:hidden, whitespace-only text and
 * screen-reader-only elements.
 */
export function scan(root: Element): Scan {
  const boxes: ContentBox[] = [];
  const elements: ScannedElement[] = [];
  const range = root.ownerDocument.createRange();

  const visit = (el: Element, ancestorOutOfFlow: boolean, ancestorFixed: boolean): void => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || isScreenReaderOnly(el, style)) return;

    const mode: FlowMode = el === root ? 'flow' : flowMode(style);
    const outOfFlow = ancestorOutOfFlow || mode !== 'flow';
    const inFixed = ancestorFixed || mode === 'fixed';

    if (el !== root && style.visibility === 'visible') {
      const clipChain = clipChainOf(el.parentElement ?? root, root, mode);
      elements.push({ element: el, inFlow: !outOfFlow, inFixed, clipChain });
      if (REPLACED.has(el.localName)) {
        const raw = boxOf(el.getBoundingClientRect());
        if (hasArea(raw)) {
          boxes.push({
            kind: 'replaced',
            element: el,
            textNode: null,
            raw,
            visible: clipBox(raw, clipChain),
            fontSize: parseFloat(style.fontSize),
            inFlow: !outOfFlow,
            inFixed,
            clipChain,
          });
        }
      }
    }
    if (OPAQUE.has(el.localName)) return;

    let textClipChain: Element[] | null = null;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        visit(child as Element, outOfFlow, inFixed);
        continue;
      }
      if (child.nodeType !== Node.TEXT_NODE) continue;
      const textNode = child as Text;
      if (!/\S/.test(textNode.data) || style.visibility !== 'visible') continue;

      textClipChain ??= clipChainOf(el, root, 'flow');
      range.selectNodeContents(textNode);
      for (const rect of Array.from(range.getClientRects())) {
        const raw = boxOf(rect);
        if (!hasArea(raw)) continue;
        boxes.push({
          kind: 'text',
          element: el,
          textNode,
          raw,
          visible: clipBox(raw, textClipChain),
          fontSize: parseFloat(style.fontSize),
          inFlow: !outOfFlow,
          inFixed,
          clipChain: textClipChain,
        });
      }
    }
  };

  visit(root, false, false);
  return { boxes, elements };
}

/** The 1px clip pattern used for screen-reader-only content. */
function isScreenReaderOnly(el: Element, style: CSSStyleDeclaration): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width > 1 || rect.height > 1) return false;
  const clip = style.getPropertyValue('clip');
  return (
    (style.overflowX !== 'visible' && style.overflowY !== 'visible') ||
    (clip !== '' && clip !== 'auto') ||
    style.clipPath !== 'none'
  );
}

function flowMode(style: CSSStyleDeclaration): FlowMode {
  if (style.position === 'absolute') return 'absolute';
  if (style.position === 'fixed') return 'fixed';
  return 'flow';
}

/** True if the element is a containing block for absolute and fixed descendants. */
function createsContainingBlock(style: CSSStyleDeclaration): boolean {
  const none = (property: string): boolean => {
    const value = style.getPropertyValue(property);
    return value === '' || value === 'none';
  };
  return (
    !none('transform') ||
    !none('translate') ||
    !none('rotate') ||
    !none('scale') ||
    !none('perspective') ||
    !none('filter') ||
    /paint|layout|strict|content/.test(style.contain) ||
    /transform|perspective|filter/.test(style.willChange)
  );
}

/**
 * The ancestors that can clip a box, nearest first. Starts at `from` and
 * follows the containing-block chain up to and including `root`: an
 * absolutely positioned box is only clipped by positioned (or transformed)
 * ancestors, a fixed one only by transformed ancestors.
 */
function clipChainOf(from: Element, root: Element, mode: FlowMode): Element[] {
  const chain: Element[] = [];
  let needs = mode;
  for (let el: Element | null = from; el; el = el === root ? null : el.parentElement) {
    const style = getComputedStyle(el);
    const inChain =
      needs === 'flow' ||
      (needs === 'absolute' && (style.position !== 'static' || createsContainingBlock(style))) ||
      (needs === 'fixed' && createsContainingBlock(style));
    if (inChain) {
      chain.push(el);
      needs = el === root ? 'flow' : flowMode(style);
    }
  }
  return chain;
}

/** Intersects `box` with the padding box of every chain element whose overflow is not visible. */
export function clipBox(box: Box, clipChain: Element[]): Box | null {
  let result = { ...box };
  for (const el of clipChain) {
    const style = getComputedStyle(el);
    const clipX = style.overflowX !== 'visible';
    const clipY = style.overflowY !== 'visible';
    if (!clipX && !clipY) continue;
    const pad = paddingBox(el, style);
    result = {
      left: clipX ? Math.max(result.left, pad.left) : result.left,
      right: clipX ? Math.min(result.right, pad.right) : result.right,
      top: clipY ? Math.max(result.top, pad.top) : result.top,
      bottom: clipY ? Math.min(result.bottom, pad.bottom) : result.bottom,
    };
    if (!hasArea(result)) return null;
  }
  return result;
}

export function paddingBox(el: Element, style: CSSStyleDeclaration = getComputedStyle(el)): Box {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left + parseFloat(style.borderLeftWidth),
    top: rect.top + parseFloat(style.borderTopWidth),
    right: rect.right - parseFloat(style.borderRightWidth),
    bottom: rect.bottom - parseFloat(style.borderBottomWidth),
  };
}

/**
 * Visibly boxed: a non-transparent background colour, a background image,
 * a border on all four sides with width and colour, a box shadow or an
 * outline. A border on some sides only (a divider line) does not make a
 * box (D-034).
 */
export function isVisiblyBoxed(style: CSSStyleDeclaration): boolean {
  if (!isTransparent(style.backgroundColor)) return true;
  if (style.backgroundImage !== 'none') return true;
  const bordered = (side: string): boolean => {
    const width = parseFloat(style.getPropertyValue(`border-${side}-width`));
    const lineStyle = style.getPropertyValue(`border-${side}-style`);
    const color = style.getPropertyValue(`border-${side}-color`);
    return width > 0 && lineStyle !== 'none' && lineStyle !== 'hidden' && !isTransparent(color);
  };
  if (['top', 'right', 'bottom', 'left'].every(bordered)) return true;
  if (hasVisibleShadow(style.boxShadow)) return true;
  return (
    style.outlineStyle !== 'none' &&
    parseFloat(style.outlineWidth) > 0 &&
    !isTransparent(style.outlineColor)
  );
}

/** True for "transparent" and any colour function with zero alpha. */
export function isTransparent(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (value === '' || value === 'transparent') return true;
  const open = value.indexOf('(');
  if (open === -1) return false;
  const inner = value.slice(open + 1, value.lastIndexOf(')'));
  let alpha: string | undefined;
  if (inner.includes('/')) {
    alpha = inner.split('/')[1]?.trim();
  } else {
    const parts = inner.split(',');
    if (parts.length === 4) alpha = parts[3]?.trim();
  }
  if (alpha === undefined) return false;
  const amount = alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha);
  return amount <= 0;
}

function hasVisibleShadow(value: string): boolean {
  if (value === 'none' || value === '') return false;
  return splitTopLevel(value).some((shadow) => {
    const color = /[a-z-]+\([^)]*\)/i.exec(shadow)?.[0] ?? '';
    if (color !== '' && isTransparent(color)) return false;
    if (/\btransparent\b/i.test(shadow)) return false;
    const lengths = shadow.replace(color, '').match(/-?\d*\.?\d+px/g) ?? [];
    return lengths.some((length) => parseFloat(length) !== 0);
  });
}

/** Splits a comma-separated list, ignoring commas inside parentheses. */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim());
}

/** Structural path from the root, e.g. "#fe-root > article:nth-child(1) > p:nth-child(2)". */
export function selectorFor(el: Element, root: Element): string {
  const rootSelector = root.id ? `#${root.id}` : root.localName;
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    const index = parent ? Array.prototype.indexOf.call(parent.children, node) + 1 : 1;
    parts.unshift(`${node.localName}:nth-child(${index})`);
  }
  return [rootSelector, ...parts].join(' > ');
}

/**
 * Index-free path from the root, e.g. "#fe-root > ul.grid > li.card > span.tag":
 * each level is the tag plus its classes, sorted, with no position. The same
 * element of a list that grows or shrinks keeps its key (D-040).
 */
export function matchKeyFor(el: Element, root: Element): string {
  const rootKey = root.id ? `#${root.id}` : root.localName;
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const classes = [...new Set(Array.from(node.classList))].sort();
    parts.unshift([node.localName, ...classes].join('.'));
  }
  return [rootKey, ...parts].join(' > ');
}

export function depthOf(el: Element, root: Element): number {
  let depth = 0;
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) depth++;
  return depth;
}

/** The first 80 characters of the given text nodes, whitespace collapsed; null if empty. */
export function textOf(nodes: Iterable<Text>): string | null {
  const text = Array.from(new Set(nodes), (node) => node.data)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text.slice(0, 80);
}

export function boxOf(rect: DOMRectReadOnly): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

export function hasArea(box: Box): boolean {
  return box.right > box.left && box.bottom > box.top;
}

export function intersect(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return hasArea(box) ? box : null;
}

export function union(a: Box, b: Box): Box {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Converts a viewport box to a page rectangle. */
export function toPageRect(box: Box, view: Window): Rect {
  return {
    x: round(box.left + view.scrollX),
    y: round(box.top + view.scrollY),
    width: round(box.right - box.left),
    height: round(box.bottom - box.top),
  };
}

/** The box's overflow past `limit` on one axis, in px (negative if it fits). */
export function overflowPast(box: Box, limit: Box, axis: 'x' | 'y'): number {
  return axis === 'x'
    ? Math.max(limit.left - box.left, box.right - limit.right)
    : Math.max(limit.top - box.top, box.bottom - limit.bottom);
}
