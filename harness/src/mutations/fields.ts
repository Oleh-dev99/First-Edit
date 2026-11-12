// The fields map (briefs/<id>/fields.json) declares what every value in a
// fixture is, so mutations only touch real content. Pure functions with no
// DOM, importable from Node and from the app.

export const FIELD_KINDS = ['label', 'prose', 'number', 'list', 'id', 'fixed'] as const;

/**
 * label   short UI text: names, titles, button labels, tags
 * prose   sentences and paragraphs
 * number  a number shown to the user
 * list    an array whose length can vary
 * id      a unique identifier
 * fixed   never mutated: enums, booleans, dates, URLs
 */
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldSpec {
  kind: FieldKind;
  /** label and prose: never emptied. */
  required?: boolean;
  /** list: length bounds. Default min 0, no max. */
  min?: number;
  max?: number;
}

/** Keys are paths in dot notation; "[]" means every item of an array, e.g. "links[].label". */
export type FieldsMap = Record<string, FieldSpec>;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function childPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`;
}

export function itemPath(parent: string): string {
  return `${parent}[]`;
}

/**
 * Calls `visit` with the path of every string, number, boolean and array in
 * `value`. Objects are walked but not visited themselves; null is skipped.
 */
export function forEachValue(
  value: unknown,
  visit: (path: string, value: unknown) => void,
  path = '',
): void {
  if (Array.isArray(value)) {
    visit(path, value);
    for (const item of value) forEachValue(item, visit, itemPath(path));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) forEachValue(child, visit, childPath(path, key));
  } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    visit(path, value);
  }
}

const ACCEPTS: Record<FieldKind, (value: unknown) => boolean> = {
  label: (value) => typeof value === 'string',
  prose: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  list: (value) => Array.isArray(value),
  id: (value) => typeof value === 'string' || typeof value === 'number',
  fixed: () => true,
};

const SPEC_KEYS = new Set(['kind', 'required', 'min', 'max']);

function typeName(value: unknown): string {
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function specProblems(path: string, spec: unknown): string[] {
  if (!isPlainObject(spec)) return [`${path}: the declaration must be an object`];
  const kind = spec.kind;
  if (typeof kind !== 'string' || !(FIELD_KINDS as readonly string[]).includes(kind)) {
    return [`${path}: unknown kind ${JSON.stringify(kind)}`];
  }
  const problems: string[] = [];
  for (const key of Object.keys(spec)) {
    if (!SPEC_KEYS.has(key)) problems.push(`${path}: unknown property "${key}"`);
  }
  if ('required' in spec) {
    if (kind !== 'label' && kind !== 'prose') {
      problems.push(`${path}: "required" only applies to label and prose`);
    } else if (typeof spec.required !== 'boolean') {
      problems.push(`${path}: "required" must be true or false`);
    }
  }
  for (const bound of ['min', 'max'] as const) {
    if (!(bound in spec)) continue;
    const value = spec[bound];
    if (kind !== 'list') problems.push(`${path}: "${bound}" only applies to list`);
    else if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      problems.push(`${path}: "${bound}" must be a non-negative integer`);
    }
  }
  if (typeof spec.min === 'number' && typeof spec.max === 'number' && spec.min > spec.max) {
    problems.push(`${path}: min ${spec.min} is greater than max ${spec.max}`);
  }
  return problems;
}

/**
 * Every problem with `fields` as the fields map of `fixture`; empty if
 * valid. Every string, number, boolean and array in the fixture must match
 * a declared path of a compatible kind, every declared path must exist, and
 * list lengths must be within their bounds.
 */
export function fieldsProblems(fixture: unknown, fields: unknown): string[] {
  if (!isPlainObject(fields)) return ['the fields map must be a JSON object'];
  if (!isPlainObject(fixture)) return ['the fixture must be a JSON object'];
  const specErrors = Object.entries(fields).flatMap(([path, spec]) => specProblems(path, spec));
  if (specErrors.length > 0) return specErrors;

  const specs = fields as FieldsMap;
  const problems = new Set<string>();
  const seen = new Set<string>();
  forEachValue(fixture, (path, value) => {
    seen.add(path);
    const spec = specs[path];
    if (!spec) {
      problems.add(`${path}: not declared in the fields map`);
      return;
    }
    if (!ACCEPTS[spec.kind](value)) {
      problems.add(`${path}: declared as ${spec.kind} but holds ${typeName(value)}`);
    }
    if (spec.kind === 'list' && Array.isArray(value)) {
      const min = spec.min ?? 0;
      if (value.length < min) problems.add(`${path}: has ${value.length} items, fewer than min ${min}`);
      if (spec.max !== undefined && value.length > spec.max) {
        problems.add(`${path}: has ${value.length} items, more than max ${spec.max}`);
      }
    }
  });
  for (const path of Object.keys(specs)) {
    if (!seen.has(path)) problems.add(`${path}: declared but not found in the fixture`);
  }
  return [...problems];
}

/** Throws one error listing every problem, if there are any. */
export function assertValidFields(
  fixture: unknown,
  fields: unknown,
  label = 'fields map',
): asserts fields is FieldsMap {
  const problems = fieldsProblems(fixture, fields);
  if (problems.length > 0) {
    throw new Error(`Invalid ${label}:\n- ${problems.join('\n- ')}`);
  }
}
