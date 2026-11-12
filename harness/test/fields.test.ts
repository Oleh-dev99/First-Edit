// Unit tests for fields-map validation. Plain Node, no browser.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { briefsDir } from '../lib/paths.ts';
import {
  assertValidFields,
  fieldsProblems,
  forEachValue,
  type FieldsMap,
} from '../src/mutations/fields.ts';

const FIELDS: FieldsMap = {
  title: { kind: 'label', required: true },
  body: { kind: 'prose' },
  count: { kind: 'number' },
  published: { kind: 'fixed' },
  tags: { kind: 'list', min: 1, max: 3 },
  'tags[]': { kind: 'label' },
  links: { kind: 'list' },
  'links[].id': { kind: 'id' },
  'links[].label': { kind: 'label' },
  'links[].url': { kind: 'fixed' },
};

const FIXTURE = {
  title: 'Hello',
  body: 'Some text.',
  count: 3,
  published: true,
  tags: ['a', 'b'],
  links: [
    { id: 'home', label: 'Home', url: 'https://example.org/' },
    { id: 'docs', label: 'Docs', url: 'https://example.org/docs' },
  ],
};

const withFixture = (changes: Record<string, unknown>) => ({ ...FIXTURE, ...changes });
const withFields = (changes: Record<string, unknown>) => ({ ...FIELDS, ...changes });

describe('forEachValue', () => {
  test('visits every string, number, boolean and array with its path', () => {
    const paths: string[] = [];
    forEachValue({ ...FIXTURE, note: null }, (p) => paths.push(p));
    assert.deepStrictEqual(paths, [
      'title', 'body', 'count', 'published',
      'tags', 'tags[]', 'tags[]',
      'links', 'links[].id', 'links[].label', 'links[].url', 'links[].id', 'links[].label', 'links[].url',
    ]);
  });
});

describe('fieldsProblems', () => {
  test('a matching map has no problems', () => {
    assert.deepStrictEqual(fieldsProblems(FIXTURE, FIELDS), []);
  });

  test('an undeclared value is a problem, reported once per path', () => {
    const fixture = withFixture({
      author: 'Ana',
      links: FIXTURE.links.map((link) => ({ ...link, target: '_blank' })),
    });
    assert.deepStrictEqual(fieldsProblems(fixture, FIELDS), [
      'links[].target: not declared in the fields map',
      'author: not declared in the fields map',
    ]);
  });

  test('a declared path missing from the fixture is a problem', () => {
    assert.deepStrictEqual(fieldsProblems(FIXTURE, withFields({ subtitle: { kind: 'label' } })), [
      'subtitle: declared but not found in the fixture',
    ]);
  });

  test('a value of the wrong type for its kind is a problem', () => {
    assert.deepStrictEqual(fieldsProblems(withFixture({ count: 'three', title: 7 }), FIELDS), [
      'title: declared as label but holds a number',
      'count: declared as number but holds a string',
    ]);
  });

  test('list lengths must respect min and max', () => {
    assert.deepStrictEqual(fieldsProblems(withFixture({ tags: [] }), FIELDS), [
      'tags: has 0 items, fewer than min 1',
      'tags[]: declared but not found in the fixture',
    ]);
    assert.deepStrictEqual(fieldsProblems(withFixture({ tags: ['a', 'b', 'c', 'd'] }), FIELDS), [
      'tags: has 4 items, more than max 3',
    ]);
  });

  test('invalid declarations are problems', () => {
    const fields = withFields({
      title: { kind: 'headline' },
      count: { kind: 'number', required: true },
      body: { kind: 'prose', min: 1 },
      tags: { kind: 'list', min: 4, max: 2 },
      links: { kind: 'list', min: -1, sort: 'asc' },
    });
    assert.deepStrictEqual(fieldsProblems(FIXTURE, fields), [
      'title: unknown kind "headline"',
      'body: "min" only applies to list',
      'count: "required" only applies to label and prose',
      'tags: min 4 is greater than max 2',
      'links: unknown property "sort"',
      'links: "min" must be a non-negative integer',
    ]);
  });

  test('null values need no declaration', () => {
    assert.deepStrictEqual(fieldsProblems(withFixture({ note: null }), FIELDS), []);
  });

  test('the fixture and the map must be objects', () => {
    assert.deepStrictEqual(fieldsProblems([], FIELDS), ['the fixture must be a JSON object']);
    assert.deepStrictEqual(fieldsProblems(FIXTURE, []), ['the fields map must be a JSON object']);
  });
});

describe('assertValidFields', () => {
  test('passes a valid map', () => {
    assert.doesNotThrow(() => assertValidFields(FIXTURE, FIELDS));
  });

  test('throws one error listing every problem', () => {
    assert.throws(
      () => assertValidFields(withFixture({ author: 'Ana', count: 'three' }), FIELDS, 'fields map for test'),
      {
        message:
          'Invalid fields map for test:\n' +
          '- count: declared as number but holds a string\n' +
          '- author: not declared in the fields map',
      },
    );
  });
});

describe('briefs', () => {
  const briefs = readdirSync(briefsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const brief of briefs) {
    const dir = path.join(briefsDir, brief.name);
    const readJson = (file: string): unknown => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const fixtures = readdirSync(dir).filter((file) => /^fixture\.[\w-]+\.json$/.test(file));

    test(`${brief.name} has a baseline fixture and a fields map`, () => {
      assert.ok(fixtures.includes('fixture.baseline.json'));
      assert.doesNotThrow(() => readJson('fields.json'));
    });

    for (const file of fixtures) {
      test(`${brief.name}/fields.json is valid for ${file}`, () => {
        assert.deepStrictEqual(fieldsProblems(readJson(file), readJson('fields.json')), []);
      });
    }
  }
});
