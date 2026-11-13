// Validates one brief and its reference candidate: the brief format, the
// fields map, the fixture against Props (type-level), and for the
// reference its contract, its types and a full stress run.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import { fieldsProblems, isPlainObject, type FieldsMap } from '../src/mutations/fields.ts';
import { applicableMutations, MUTATION_IDS } from '../src/mutations/index.ts';
import {
  BRIEF_WORDS,
  MIN_APPLICABLE,
  countWords,
  fileProblems,
  hardcodedImageProblems,
  hintProblems,
  imageProblems,
  importProblems,
  listSizeProblems,
  metaProblems,
  propsProblems,
} from './brief-rules.ts';
import { assetsDir, briefsDir, candidatesDir, resultsDir } from './paths.ts';
import { runStress } from './stress.ts';
import { typeProblems } from './typecheck.ts';

export interface BriefCheck {
  id: string;
  sample: boolean;
  /** Applicable mutations, out of MUTATION_IDS.length; null if the brief could not be read. */
  applicable: number | null;
  /** The reference candidate path, e.g. "_reference/pricing-table/v1", or null. */
  reference: string | null;
  /** The reference's stress result, or null if it was not run. */
  survival: { survived: number; applicable: number } | null;
  problems: string[];
}

export function listBriefs(): string[] {
  return readdirSync(briefsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function referencePath(id: string): string {
  return `_reference/${id}/v1`;
}

/** Everything that can be checked without a browser. */
export function checkBriefStatic(id: string): BriefCheck {
  const dir = path.join(briefsDir, id);
  // A leading byte-order mark (common from Windows editors) is not content.
  const read = (file: string): string => readFileSync(path.join(dir, file), 'utf8').replace(/^﻿/, '');
  const result: BriefCheck = { id, sample: false, applicable: null, reference: null, survival: null, problems: [] };
  const readJson = (file: string): unknown => {
    try {
      return JSON.parse(read(file));
    } catch (error) {
      result.problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  };

  const files = readdirSync(dir);
  const meta = files.includes('meta.json') ? readJson('meta.json') : undefined;
  if (meta !== undefined) result.problems.push(...metaProblems(meta, id));
  result.sample = isPlainObject(meta) && meta.sample === true;
  result.problems.push(...fileProblems(files, result.sample));
  if (result.problems.length > 0) return result;

  const fixture = readJson('fixture.baseline.json');
  const fields = readJson('fields.json') as FieldsMap | undefined;
  if (fixture === undefined || fields === undefined) return result;
  const fieldErrors = fieldsProblems(fixture, fields);
  result.problems.push(...fieldErrors.map((problem) => `fields.json: ${problem}`));
  result.problems.push(...propsProblems(read('props.ts')));
  result.problems.push(...imageProblems(fixture, fields, (name) => existsSync(path.join(assetsDir, name))));
  if (fieldErrors.length === 0) result.applicable = applicableMutations(fixture, fields).length;

  if (!result.sample) {
    const words = countWords(read('brief.md'));
    if (words < BRIEF_WORDS.min || words > BRIEF_WORDS.max) {
      result.problems.push(`brief.md has ${words} words; corpus briefs have ${BRIEF_WORDS.min} to ${BRIEF_WORDS.max}`);
    }
    result.problems.push(...hintProblems(read('brief.md'), 'brief.md'));
    result.problems.push(...hintProblems(read('props.ts'), 'props.ts'));
    if (fieldErrors.length === 0) result.problems.push(...listSizeProblems(fixture, fields));
    if (result.applicable !== null && result.applicable < MIN_APPLICABLE) {
      result.problems.push(`${result.applicable} applicable mutations; corpus briefs need at least ${MIN_APPLICABLE}`);
    }
    const reference = referencePath(id);
    const component = path.join(candidatesDir, reference, 'Component.tsx');
    if (existsSync(component)) {
      result.reference = reference;
      const source = readFileSync(component, 'utf8');
      result.problems.push(...importProblems(source).map((p) => `reference ${p}`));
      result.problems.push(...hardcodedImageProblems(source).map((p) => `reference ${p}`));
    } else {
      result.problems.push(`missing reference candidate candidates/${reference}/Component.tsx`);
    }
  }

  // The fixture must be a valid Props value (string-literal unions included)
  // and the reference's default export must accept Props.
  const componentFile = result.reference ? path.join(candidatesDir, result.reference, 'Component.tsx') : undefined;
  result.problems.push(...typeProblems({ name: `briefs-check/${id}`, briefId: id, fixture, componentFile }));
  return result;
}

/**
 * Stress-runs the reference: its baseline must be clean, every applicable
 * case of both tiers (the @320 cases included) must survive, and no case may
 * hide content (content-hidden 0, D-019).
 */
export async function checkReference(check: BriefCheck, browser: Browser, origin: string): Promise<void> {
  if (!check.reference) return;
  const outDir = path.join(resultsDir, 'runs', check.id, check.reference.split('/').join('__'));
  const summary = await runStress({ browser, origin, brief: check.id, candidate: check.reference, outDir });
  check.survival = { survived: summary.totals.survived, applicable: summary.totals.applicable };
  if (summary.baseline.status !== 'ok') {
    check.problems.push(`reference baseline: ${summary.baseline.status}`);
  } else if (summary.baseline.errors > 0) {
    check.problems.push(`reference baseline has ${summary.baseline.errors} error finding(s)`);
  }
  for (const entry of summary.cases) {
    if (entry.applicable && entry.survived !== true) {
      check.problems.push(`reference fails ${entry.id} (${entry.status})`);
    }
    if ((entry.contentHidden ?? 0) > 0) {
      check.problems.push(`reference hides ${entry.contentHidden} value(s) in ${entry.id} (see ${entry.files?.result})`);
    }
  }
}

export const MUTATION_COUNT = MUTATION_IDS.length;
