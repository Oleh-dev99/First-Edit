// A fields map inferred from example props, for a component outside the
// corpus (the first-edit command line, D-060). A brief's fields map is written
// by hand; this is a deterministic guess from the values and their keys. The
// command line writes it out, so it can be corrected and passed back with
// --fields. Pure functions with no DOM.
//
// The guess, per value:
// - null: no declaration (the fields map needs none)
// - boolean: fixed
// - number: id under an id key, else number
// - string: id under an id key; fixed under a key whose last word names an
//   address, image, enum, date or colour (avatarUrl, imageSrc, variant,
//   createdAt, tone), or when the value looks like one: a URL or path, an ISO
//   date, a colour, or a lowercase token such as "in-progress"; prose when it
//   has several words and reads as a sentence (over 60 characters, or 4 words
//   or more with . ! or ?); otherwise label
// - array: list, with its items under "[]"; an empty array declares no items
// - object: its keys, one by one
// Items of a list are merged: one kind wins if all agree; label and prose
// make prose; any other mix makes fixed, which is never mutated. Nothing is
// marked required, and lists get no bounds.

import { childPath, isPlainObject, itemPath, type FieldKind, type FieldsMap } from './fields.ts';

/** Last words of keys whose values are identifiers. */
const ID_WORDS = new Set(['id', 'uuid', 'guid', 'key', 'slug']);

/** Last words of keys whose values are not content: addresses, images, enums, dates, colours. */
const FIXED_WORDS = new Set([
  'href', 'url', 'uri', 'src', 'srcset', 'link', 'image', 'img', 'avatar', 'icon', 'logo', 'photo', 'picture',
  'thumbnail', 'color', 'colour', 'variant', 'type', 'kind', 'tone', 'theme', 'size', 'align', 'alignment',
  'date', 'time', 'at', 'timestamp', 'datetime', 'locale', 'currency', 'format', 'mode', 'layout', 'direction',
  'dir', 'shape', 'style',
]);

const ADDRESS = /^(https?:|mailto:|tel:|data:|\/|#|\.{1,2}\/)/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(.*\))$/i;
const TOKEN = /^[a-z][a-z0-9]*([-_][a-z0-9]+)*$/;
const SENTENCE_END = /[.!?](\s|$)/;

/** The last word of a key, lower-cased: "avatarUrl" gives "url", "created_at" gives "at". */
export function lastWord(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_.-]+/).filter(Boolean);
  return (words.at(-1) ?? '').toLowerCase();
}

/** The kind of one string, number or boolean under `key`. */
export function inferKind(value: string | number | boolean, key: string): FieldKind {
  const word = lastWord(key);
  if (typeof value === 'boolean') return 'fixed';
  if (ID_WORDS.has(word)) return 'id';
  if (typeof value === 'number') return 'number';
  if (FIXED_WORDS.has(word)) return 'fixed';
  if (ADDRESS.test(value) || ISO_DATE.test(value) || COLOUR.test(value) || TOKEN.test(value)) return 'fixed';
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 2 && (value.length > 60 || (words >= 4 && SENTENCE_END.test(value)))) return 'prose';
  return 'label';
}

function merged(kinds: FieldKind[]): FieldKind {
  const distinct = [...new Set(kinds)];
  if (distinct.length === 1) return distinct[0]!;
  if (distinct.includes('list')) return 'list';
  if (distinct.every((kind) => kind === 'label' || kind === 'prose')) return 'prose';
  return 'fixed';
}

/** A fields map for `props`, in the order the values first appear. */
export function inferFields(props: unknown): FieldsMap {
  const seen = new Map<string, FieldKind[]>();
  const note = (path: string, kind: FieldKind): void => {
    seen.set(path, [...(seen.get(path) ?? []), kind]);
  };
  const visit = (value: unknown, path: string, key: string): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      note(path, 'list');
      for (const item of value) visit(item, itemPath(path), key);
    } else if (isPlainObject(value)) {
      for (const [child, childValue] of Object.entries(value)) visit(childValue, childPath(path, child), child);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      note(path, inferKind(value, key));
    }
  };
  visit(props, '', '');
  return Object.fromEntries([...seen].map(([path, kinds]) => [path, { kind: merged(kinds) }]));
}
