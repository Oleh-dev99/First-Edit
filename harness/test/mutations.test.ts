// Unit tests for the content mutations and the mutation registry. Plain
// Node, no browser.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { briefsDir } from '../lib/paths.ts';
import {
  CONTENT_MUTATION_IDS,
  LARGE_DECIMAL,
  LARGE_INTEGER,
  UNBROKEN_TOKEN,
  applyContentMutation,
  lengthen,
  textLongTarget,
  unbreak,
  type ContentMutationId,
} from '../src/mutations/content.ts';
import type { FieldsMap } from '../src/mutations/fields.ts';
import { MUTATION_IDS, mutationKind, viewportFor } from '../src/mutations/index.ts';

const FIELDS: FieldsMap = {
  title: { kind: 'label', required: true },
  subtitle: { kind: 'label' },
  body: { kind: 'prose' },
  count: { kind: 'number' },
  price: { kind: 'number' },
  status: { kind: 'fixed' },
  tags: { kind: 'list', max: 25 },
  'tags[]': { kind: 'label' },
  links: { kind: 'list', min: 2 },
  'links[].id': { kind: 'id' },
  'links[].label': { kind: 'label', required: true },
  'links[].url': { kind: 'fixed' },
};

const FIXTURE = {
  title: 'Hello world',
  subtitle: 'Draft',
  body: 'Short notes for the team.',
  count: 42,
  price: 9.5,
  status: 'published',
  tags: ['ux', 'research', 'a11y'],
  links: [
    { id: 'home', label: 'Home', url: 'https://example.org/' },
    { id: 7, label: 'Docs', url: 'https://example.org/docs' },
  ],
};

const apply = (id: ContentMutationId, fixture: unknown = FIXTURE, fields: FieldsMap = FIELDS) =>
  applyContentMutation(fixture, fields, id);

describe('text-long', () => {
  test('target lengths follow the lower bounds of the IBM table', () => {
    const cases: [number, number][] = [
      [1, 2], [10, 20], [11, 20], [20, 36], [21, 34], [30, 48], [31, 44],
      [50, 70], [51, 67], [70, 92], [71, 93], [100, 130],
    ];
    for (const [length, target] of cases) assert.equal(textLongTarget(length), target, `length ${length}`);
  });

  test('values with spaces append whole words until they reach the target; single words their own letters', () => {
    // 11 characters, target 20: two appended words make 23.
    assert.equal(lengthen('Hello world'), 'Hello world Hello world');
    // 25 characters, target 40: three appended words make 41.
    assert.equal(lengthen('Short notes for the team.'), 'Short notes for the team. Short notes for');
    // A value that reaches the target exactly stops there.
    assert.equal(lengthen('ab cd ef gh'), 'ab cd ef gh ab cd ef');
    assert.equal(lengthen('Draft'), 'DraftDraft');
    assert.equal(lengthen('a'), 'aa');
  });

  test('a grown value never ends in a cut word', () => {
    for (const value of ['Hello world', 'Short notes for the team.', 'Write a reply…', 'Contact sales']) {
      const words = new Set(value.split(' '));
      for (const word of lengthen(value).split(' ')) assert.ok(words.has(word), `"${word}" from "${value}"`);
      assert.ok(Array.from(lengthen(value)).length >= textLongTarget(Array.from(value).length));
    }
  });

  test('empty and whitespace-only values stay as they are', () => {
    assert.equal(lengthen(''), '');
    assert.equal(lengthen('   '), '   ');
  });

  test('every label and prose value grows; nothing else changes', () => {
    const { fixture, changed } = apply('text-long');
    assert.deepStrictEqual(fixture, {
      ...FIXTURE,
      title: 'Hello world Hello world',
      subtitle: 'DraftDraft',
      body: 'Short notes for the team. Short notes for',
      tags: ['uxux', 'researchresearch', 'a11ya11y'],
      links: [
        { id: 'home', label: 'HomeHome', url: 'https://example.org/' },
        { id: 7, label: 'DocsDocs', url: 'https://example.org/docs' },
      ],
    });
    assert.deepStrictEqual(changed, [
      'title', 'subtitle', 'body', 'tags[0]', 'tags[1]', 'tags[2]', 'links[0].label', 'links[1].label',
    ]);
  });
});

describe('text-unbroken', () => {
  test('the token is 60 letters', () => {
    assert.match(UNBROKEN_TOKEN, /^[A-Za-z]{60}$/);
  });

  test('the longest word (the first on a tie) becomes the token', () => {
    assert.equal(unbreak('Short notes for the team.'), `${UNBROKEN_TOKEN} notes for the team.`);
    assert.equal(unbreak('a bigger word'), `a ${UNBROKEN_TOKEN} word`);
    assert.equal(unbreak('Draft'), UNBROKEN_TOKEN);
    assert.equal(unbreak(''), '');
  });

  test('applies to every label and prose value, including required ones', () => {
    const { fixture, changed } = apply('text-unbroken');
    assert.deepStrictEqual(fixture, {
      ...FIXTURE,
      title: `${UNBROKEN_TOKEN} world`,
      subtitle: UNBROKEN_TOKEN,
      body: `${UNBROKEN_TOKEN} notes for the team.`,
      tags: [UNBROKEN_TOKEN, UNBROKEN_TOKEN, UNBROKEN_TOKEN],
      links: [
        { id: 'home', label: UNBROKEN_TOKEN, url: 'https://example.org/' },
        { id: 7, label: UNBROKEN_TOKEN, url: 'https://example.org/docs' },
      ],
    });
    assert.equal(changed.length, 8);
  });
});

describe('text-empty', () => {
  test('empties every label and prose value that is not required', () => {
    const { fixture, changed } = apply('text-empty');
    assert.deepStrictEqual(fixture, { ...FIXTURE, subtitle: '', body: '', tags: ['', '', ''] });
    assert.deepStrictEqual(changed, ['subtitle', 'body', 'tags[0]', 'tags[1]', 'tags[2]']);
  });

  test('is not applicable when every text is required or already empty', () => {
    const fixture = { ...FIXTURE, subtitle: '', body: '', tags: [] };
    assert.deepStrictEqual(apply('text-empty', fixture).changed, []);
  });
});

describe('list mutations', () => {
  test('list-0 empties lists with min 0 and keeps lists with a higher min', () => {
    const { fixture, changed } = apply('list-0');
    assert.deepStrictEqual(fixture, { ...FIXTURE, tags: [] });
    assert.deepStrictEqual(changed, ['tags']);
  });

  test('list-1 keeps the first item and skips lists with min above 1', () => {
    const { fixture, changed } = apply('list-1');
    assert.deepStrictEqual(fixture, { ...FIXTURE, tags: ['ux'] });
    assert.deepStrictEqual(changed, ['tags']);
  });

  test('list-many repeats in order to 10 times the length, capped at max', () => {
    const { fixture } = apply('list-many') as { fixture: typeof FIXTURE };
    assert.equal(fixture.tags.length, 25);
    assert.deepStrictEqual(fixture.tags.slice(0, 7), ['ux', 'research', 'a11y', 'ux', 'research', 'a11y', 'ux']);
    assert.equal(fixture.tags[24], 'ux');
    assert.equal(fixture.links.length, 20);
    assert.deepStrictEqual(
      fixture.links.map((link) => link.label),
      Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 'Home' : 'Docs')),
    );
  });

  test('list-many suffixes ids in repeated items so they stay unique', () => {
    const { fixture, changed } = apply('list-many') as { fixture: typeof FIXTURE; changed: string[] };
    const ids = fixture.links.map((link) => link.id);
    assert.deepStrictEqual(ids.slice(0, 6), ['home', 7, 'home-2', 702, 'home-3', 703]);
    assert.deepStrictEqual(ids.slice(-2), ['home-10', 710]);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepStrictEqual(changed.slice(0, 4), ['tags', 'links', 'links[2].id', 'links[3].id']);
    assert.equal(changed.length, 2 + 18);
  });

  test('list mutations are not applicable when lengths cannot change', () => {
    const fixture = { ...FIXTURE, tags: ['only'] };
    const fields = { ...FIELDS, tags: { kind: 'list', max: 1 } } as FieldsMap;
    assert.deepStrictEqual(apply('list-1', fixture, fields).changed, []);
    assert.deepStrictEqual(apply('list-many', fixture, { ...fields, links: { kind: 'list', min: 2, max: 2 } }).changed, []);
    assert.deepStrictEqual(apply('list-0', { ...FIXTURE, tags: [] }).changed, []);
  });
});

describe('number-large', () => {
  test('integers become 1234567890 and other numbers 1234567.89', () => {
    const { fixture, changed } = apply('number-large');
    assert.deepStrictEqual(fixture, { ...FIXTURE, count: LARGE_INTEGER, price: LARGE_DECIMAL });
    assert.deepStrictEqual(changed, ['count', 'price']);
  });

  test('is not applicable without number fields', () => {
    const fields = { ...FIELDS, count: { kind: 'fixed' }, price: { kind: 'fixed' } } as FieldsMap;
    assert.deepStrictEqual(apply('number-large', FIXTURE, fields).changed, []);
  });
});

describe('every content mutation', () => {
  for (const id of CONTENT_MUTATION_IDS) {
    test(`${id} is deterministic, pure and never touches fixed fields`, () => {
      const before = structuredClone(FIXTURE);
      const first = apply(id);
      const second = apply(id);
      assert.deepStrictEqual(first, second);
      assert.deepStrictEqual(FIXTURE, before);
      const mutated = first.fixture as typeof FIXTURE;
      const urls = new Set(FIXTURE.links.map((link) => link.url));
      assert.equal(mutated.status, 'published');
      assert.ok(mutated.links.every((link) => urls.has(link.url)));
    });
  }
});

describe('registry', () => {
  test('ten mutations in run order', () => {
    assert.deepStrictEqual(MUTATION_IDS, [
      'text-long', 'text-unbroken', 'text-empty', 'list-0', 'list-1', 'list-many', 'number-large',
      'viewport-320', 'text-200pct', 'dir-rtl',
    ]);
  });

  test('kinds and viewports', () => {
    assert.equal(mutationKind('list-many'), 'content');
    assert.equal(mutationKind('dir-rtl'), 'environment');
    assert.deepStrictEqual(viewportFor('viewport-320'), { width: 320, height: 800 });
    assert.deepStrictEqual(viewportFor('text-200pct'), { width: 1280, height: 800 });
    assert.deepStrictEqual(viewportFor(null), { width: 1280, height: 800 });
  });
});

describe('hello-card', () => {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(path.join(briefsDir, 'hello-card', file), 'utf8'));

  for (const id of CONTENT_MUTATION_IDS) {
    test(`${id} has something to change in the baseline fixture`, () => {
      const { changed } = applyContentMutation(read('fixture.baseline.json'), read('fields.json') as FieldsMap, id);
      assert.ok(changed.length > 0);
    });
  }
});
