// The labelling tool's example pairs (lib/label-examples.ts): every pair
// shows a "-" check-lab case on the left and a "+" case on the right, at the
// case's own screen width, one pair per check, with a screenshot on disk.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { examplesDir, readExamples } from '../lib/label-examples.ts';
import { CHECK_NAMES, type CheckName } from '../src/checks/finding.ts';
import { DEFAULT_VIEWPORT, LAB_CASES, type LabCase } from '../src/lab/cases.ts';

const pairs = readExamples();

function labCase(id: string): LabCase {
  const found = LAB_CASES.find((candidate) => candidate.id === id);
  assert.ok(found, `unknown lab case "${id}"`);
  assert.equal(found.knownFailure, undefined, `${id} is a known failure`);
  return found;
}

const errorChecks = (found: LabCase): CheckName[] =>
  CHECK_NAMES.filter((check) => (found.expected[check]?.error ?? 0) > 0);

test('every example pair is a clean lab case next to a broken one', () => {
  for (const pair of pairs) {
    const left = labCase(pair.left.lab);
    const right = labCase(pair.right.lab);
    assert.deepStrictEqual(errorChecks(left), [], `${pair.kind}: the left case has errors`);
    assert.equal(errorChecks(right).length, 1, `${pair.kind}: the right case fails exactly one check`);
    for (const [picture, found] of [[pair.left, left], [pair.right, right]] as const) {
      assert.equal(picture.screen, (found.viewport ?? DEFAULT_VIEWPORT).width, `${picture.lab}: screen width`);
    }
  }
});

test('one example pair per check', () => {
  const checks = pairs.map((pair) => errorChecks(labCase(pair.right.lab))[0]);
  assert.deepStrictEqual([...checks].sort(), [...CHECK_NAMES].sort());
});

test('every example has a screenshot (npm run label:examples)', () => {
  for (const pair of pairs) {
    for (const id of [pair.left.lab, pair.right.lab]) {
      assert.ok(existsSync(path.join(examplesDir, `${id}.png`)), `missing ${id}.png`);
    }
  }
});
