// Content mutations: deterministic changes to a fixture, guided by the
// fields map. Pure functions with no DOM and no randomness, importable from
// Node and from the app. Every eligible field is mutated at once; if nothing
// changed, the mutation is not applicable to the brief.

import { childPath, isPlainObject, itemPath, type FieldSpec, type FieldsMap } from './fields.ts';

export const CONTENT_MUTATION_IDS = [
  'text-long',
  'text-longword',
  'text-unbroken',
  'text-empty',
  'list-0',
  'list-1',
  'list-many',
  'number-large',
] as const;

export type ContentMutationId = (typeof CONTENT_MUTATION_IDS)[number];

export interface MutationResult {
  fixture: unknown;
  /** Concrete paths of every value that changed, e.g. "name", "skills[2]". Empty means not applicable. */
  changed: string[];
}

/** text-longword: one fixed 30-letter token, letters only. */
export const LONGWORD_TOKEN = 'Floccinaucinihilipilifications';

/** text-unbroken: one fixed 60-letter token, letters only. */
export const UNBROKEN_TOKEN = 'Supercalifragilisticexpialidocious' + 'Floccinaucinihilipilification'.slice(0, 26);

/** list-many: lists grow to this many times their length. */
export const LIST_MANY_FACTOR = 10;

export const LARGE_INTEGER = 1234567890;
export const LARGE_DECIMAL = 1234567.89;

/** text-long: the target length, from the lower bounds of IBM's expansion table. */
export function textLongTarget(length: number): number {
  const percent =
    length <= 10 ? 100 : length <= 20 ? 80 : length <= 30 ? 60 : length <= 50 ? 40 : length <= 70 ? 31 : 30;
  return length + Math.ceil((length * percent) / 100);
}

/**
 * text-long for one value, lengths counted in characters. Values with spaces
 * grow by whole words: their own words are appended in order until the value
 * reaches at least the target length (D-037). Single words grow by appending
 * their own letters, cut at the target. Empty values stay empty.
 */
export function lengthen(value: string): string {
  const chars = Array.from(value);
  const words = value.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return value;
  const target = textLongTarget(chars.length);
  let grown = chars;
  if (/\s/.test(value)) {
    for (let i = 0; grown.length < target; i++) {
      grown = [...grown, ' ', ...Array.from(words[i % words.length]!)];
    }
    return grown.join('');
  }
  while (grown.length < target) grown = [...grown, ...chars];
  return grown.slice(0, target).join('');
}

/** The longest word of `value` (the first, on a tie) becomes `token`. Empty values stay empty. */
export function replaceLongestWord(value: string, token: string): string {
  let longest: { index: number; word: string; length: number } | null = null;
  for (const match of value.matchAll(/\S+/g)) {
    const length = Array.from(match[0]).length;
    if (!longest || length > longest.length) longest = { index: match.index, word: match[0], length };
  }
  if (!longest) return value;
  return value.slice(0, longest.index) + token + value.slice(longest.index + longest.word.length);
}

/** text-longword for one value: the longest word becomes the 30-letter token. */
export function longword(value: string): string {
  return replaceLongestWord(value, LONGWORD_TOKEN);
}

/** text-unbroken for one value: the longest word becomes the 60-letter token. */
export function unbreak(value: string): string {
  return replaceLongestWord(value, UNBROKEN_TOKEN);
}

interface ListItem {
  item: unknown;
  /** 1 for the original item, 2 and up for repeated copies (list-many). */
  copy: number;
}

function mutateList(items: unknown[], spec: FieldSpec, id: ContentMutationId): ListItem[] {
  const keep = (list: unknown[]): ListItem[] => list.map((item) => ({ item, copy: 1 }));
  const min = spec.min ?? 0;
  if (id === 'list-0') return min === 0 ? [] : keep(items);
  if (id === 'list-1') return min <= 1 ? keep(items.slice(0, 1)) : keep(items);
  if (id === 'list-many') {
    const length = Math.max(items.length, Math.min(items.length * LIST_MANY_FACTOR, spec.max ?? Infinity));
    return Array.from({ length }, (_, i) => ({
      item: items[i % items.length],
      copy: Math.floor(i / items.length) + 1,
    }));
  }
  return keep(items);
}

/** Keeps ids unique in repeated items: "home" -> "home-2"; 7 -> 702 (two appended digits). */
function suffixId(value: unknown, copies: number[]): unknown {
  if (typeof value === 'string') return value + copies.map((copy) => `-${copy}`).join('');
  if (typeof value === 'number') return copies.reduce((id, copy) => id * 100 + copy, value);
  return value;
}

function mutateLeaf(value: unknown, spec: FieldSpec, id: ContentMutationId, copies: number[]): unknown {
  if (spec.kind === 'id') return copies.length > 0 ? suffixId(value, copies) : value;
  if (typeof value === 'string' && (spec.kind === 'label' || spec.kind === 'prose')) {
    if (id === 'text-long') return lengthen(value);
    if (id === 'text-longword') return longword(value);
    if (id === 'text-unbroken') return unbreak(value);
    if (id === 'text-empty') return spec.required ? value : '';
  }
  if (typeof value === 'number' && spec.kind === 'number' && id === 'number-large') {
    return Number.isInteger(value) ? LARGE_INTEGER : LARGE_DECIMAL;
  }
  return value;
}

interface Walk {
  fields: FieldsMap;
  id: ContentMutationId;
  changed: string[];
}

/** Returns a mutated copy of `value`; never modifies it. */
function mutate(value: unknown, pattern: string, concrete: string, walk: Walk, copies: number[]): unknown {
  const spec = walk.fields[pattern];
  if (Array.isArray(value)) {
    const items =
      spec?.kind === 'list' ? mutateList(value, spec, walk.id) : value.map((item) => ({ item, copy: 1 }));
    if (items.length !== value.length) walk.changed.push(concrete);
    return items.map(({ item, copy }, index) =>
      mutate(item, itemPath(pattern), `${concrete}[${index}]`, walk, copy > 1 ? [...copies, copy] : copies),
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        mutate(child, childPath(pattern, key), childPath(concrete, key), walk, copies),
      ]),
    );
  }
  if (!spec) return value;
  const next = mutateLeaf(value, spec, walk.id, copies);
  if (next !== value) walk.changed.push(concrete);
  return next;
}

/**
 * Applies one content mutation to every eligible field of `fixture` and
 * returns the mutated copy with the paths that changed.
 */
export function applyContentMutation(
  fixture: unknown,
  fields: FieldsMap,
  id: ContentMutationId,
): MutationResult {
  const changed: string[] = [];
  const mutated = mutate(fixture, '', '', { fields, id, changed }, []);
  return { fixture: mutated, changed };
}
