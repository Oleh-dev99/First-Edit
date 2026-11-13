// The case registry: every mutation, then every content mutation at 320 px,
// with the renders each case is judged and measured against.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, CASE_IDS, caseSpec } from '../src/mutations/cases.ts';
import { CONTENT_MUTATION_IDS } from '../src/mutations/content.ts';
import { MUTATION_IDS } from '../src/mutations/index.ts';

test('the cases are the ten mutations in run order, then the seven content mutations at 320', () => {
  assert.deepStrictEqual(CASE_IDS, [...MUTATION_IDS, ...CONTENT_MUTATION_IDS.map((id) => `${id}@320`)]);
  assert.equal(CASES.length, 17);
});

test('content cases at 1280 are judged against the baseline and not measured for content-hidden', () => {
  const spec = caseSpec('text-long');
  assert.deepStrictEqual(
    [spec.mutation, spec.kind, spec.viewport.width, spec.reference, spec.hiddenReference],
    ['text-long', 'content', 1280, 'baseline', null],
  );
});

test('environment cases are judged against the baseline and measured against it', () => {
  for (const [id, width] of [['viewport-320', 320], ['text-200pct', 1280], ['dir-rtl', 1280]] as const) {
    const spec = caseSpec(id);
    assert.deepStrictEqual([spec.kind, spec.viewport.width, spec.reference, spec.hiddenReference], ['environment', width, 'baseline', 'baseline']);
  }
});

test('content@320 cases are judged against viewport-320 and measured against the same mutation at 1280', () => {
  for (const id of CONTENT_MUTATION_IDS) {
    const spec = caseSpec(`${id}@320`);
    assert.deepStrictEqual(
      [spec.mutation, spec.kind, spec.viewport, spec.reference, spec.hiddenReference],
      [id, 'content@320', { width: 320, height: 800 }, 'viewport-320', id],
    );
  }
  // Each @320 case runs after both of its references.
  const order = (id: string): number => CASE_IDS.indexOf(id as never);
  for (const id of CONTENT_MUTATION_IDS) {
    assert.ok(order(`${id}@320`) > order('viewport-320') && order(`${id}@320`) > order(id));
  }
});

test('an unknown case id is an error', () => {
  assert.throws(() => caseSpec('text-long@640' as never), /Unknown case/);
});
