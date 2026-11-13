// content-hidden (info, D-036): fixture text that a render shows and another
// render of the same data does not. The page reports, for every label and
// prose value of the rendered fixture, whether it is visible; the runner
// compares two renders. Plain DOM code plus pure helpers, no app imports.

import { clipBox, scan } from '../checks/dom.ts';
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

/**
 * The text inside `root` that is on screen, normalized. Text counts when one
 * of its line boxes has an area and is not fully clipped by an ancestor with
 * overflow hidden or clip; scroll containers do not hide text (it can be
 * scrolled to), and neither does an ellipsis (part of the text is shown).
 * display none, visibility hidden and screen-reader-only text never count.
 * Form controls contribute their value, placeholder or selected option.
 */
export function visibleText(root: Element): string {
  const pieces: string[] = [];
  let lastNode: Text | null = null;
  for (const box of scan(root).boxes) {
    if (clipBox(box.raw, box.clipChain, false) === null) continue;
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
