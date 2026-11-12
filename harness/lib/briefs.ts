import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertValidFields, type FieldsMap } from '../src/mutations/fields.ts';
import { briefsDir } from './paths.ts';

function readJson(brief: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(briefsDir, brief, file), 'utf8'));
}

/** Reads a brief's fixture and fields map from disk and validates them. */
export function loadBrief(brief: string, fixtureName = 'baseline'): { fixture: unknown; fields: FieldsMap } {
  const fixture = readJson(brief, `fixture.${fixtureName}.json`);
  const fields = readJson(brief, 'fields.json');
  assertValidFields(fixture, fields, `fields map of brief "${brief}" for fixture "${fixtureName}"`);
  return { fixture, fields };
}
