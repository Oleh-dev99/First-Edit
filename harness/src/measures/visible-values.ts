// content-hidden (info, D-036): fixture text that a render shows and another
// render of the same data does not. The page reports, for every label and
// prose value of the rendered fixture, whether it is visible; the runner
// compares two renders. Plain DOM code plus pure helpers, no app imports.

import { type Box, hasArea, paddingBox, scan } from '../checks/dom.ts';
import { forEachValue, type FieldsMap } from '../mutations/fields.ts';

export interface VisibleValue {
  /** The value, whitespace-normalized and lower-cased. */
  value: string;
  visible: boolean;
}

/** Whitespace collapsed and trimmed, lower-cased: values and page text are matched in this form. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The label and prose values of a fixture, normalized, without empties or duplicates, in fixture order. */
export function contentValues(fixture: unknown, fields: FieldsMap): string[] {
  const values = new Set<string>();
  forEachValue(fixture, (path, value) => {
    const spec = fields[path];
    if (typeof value !== 'string' || (spec?.kind !== 'label' && spec?.kind !== 'prose')) return;
    const normalized = normalizeText(value);
    if (normalized !== '') values.add(normalized);
  });
  return [...values];
}

/** The text a form control shows: its value or placeholder, or the selected option. */
function controlText(element: Element): string {
  if (element instanceof HTMLSelectElement) return element.selectedOptions[0]?.text ?? '';
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return [element.value, element.placeholder].join(' ');
  }
  return '';
}

const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';
const clips = (overflow: string): boolean => overflow === 'hidden' || overflow === 'clip';

/**
 * True if `box` can be seen, perhaps after scrolling: walking up its clip
 * chain, an ancestor with overflow hidden or clip cuts the box on that axis,
 * and a scroll container makes the box reachable on that axis as long as the
 * container's own window is seen, so from there on its padding box is what
 * must stay visible. A message list that scrolls inside a fixed-height card
 * with overflow hidden therefore shows every message.
 */
export function reachable(box: Box, clipChain: Element[]): boolean {
  let current: Box = { ...box };
  for (const el of clipChain) {
    const style = getComputedStyle(el);
    const [overflowX, overflowY] = [style.overflowX, style.overflowY];
    if (overflowX === 'visible' && overflowY === 'visible') continue;
    const pad = paddingBox(el, style);
    if (scrolls(overflowX)) current = { ...current, left: pad.left, right: pad.right };
    else if (clips(overflowX)) current = { ...current, left: Math.max(current.left, pad.left), right: Math.min(current.right, pad.right) };
    if (scrolls(overflowY)) current = { ...current, top: pad.top, bottom: pad.bottom };
    else if (clips(overflowY)) current = { ...current, top: Math.max(current.top, pad.top), bottom: Math.min(current.bottom, pad.bottom) };
    if (!hasArea(current)) return false;
  }
  return true;
}

/**
 * The text inside `root` that is on screen, normalized. Text counts when one
 * of its line boxes has an area and is reachable: not fully clipped by an
 * ancestor with overflow hidden or clip, where text inside a scroll
 * container counts as long as the container itself is seen. An ellipsis
 * does not hide text (part of it is shown). display none, visibility hidden
 * and screen-reader-only text never count. Form controls contribute their
 * value, placeholder or selected option.
 */
export function visibleText(root: Element): string {
  const pieces: string[] = [];
  let lastNode: Text | null = null;
  for (const box of scan(root).boxes) {
    if (!reachable(box.raw, box.clipChain)) continue;
    if (box.kind === 'text' && box.textNode) {
      if (box.textNode !== lastNode) pieces.push(box.textNode.data);
      lastNode = box.textNode;
    } else if (box.kind === 'replaced') {
      pieces.push(controlText(box.element));
    }
  }
  return normalizeText(pieces.join(' '));
}

/** For every value: is it part of the visible text? */
export function visibleValues(root: Element, values: readonly string[]): VisibleValue[] {
  const text = visibleText(root);
  return values.map((value) => ({ value, visible: text.includes(value) }));
}

/** Values visible in the reference render and not visible in the current one. */
export function hiddenValues(reference: readonly VisibleValue[], current: readonly VisibleValue[]): string[] {
  const shown = new Set(current.filter((entry) => entry.visible).map((entry) => entry.value));
  return reference.filter((entry) => entry.visible && !shown.has(entry.value)).map((entry) => entry.value);
}
