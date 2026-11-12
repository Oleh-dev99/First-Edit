// Unit tests for the brief-format rules and the reference import check.
// Plain Node, no browser.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  countWords,
  fileProblems,
  hintProblems,
  importedModules,
  importProblems,
  listSizeProblems,
  metaProblems,
  propsProblems,
} from '../lib/brief-rules.ts';
import type { FieldsMap } from '../src/mutations/fields.ts';

const FILES = ['meta.json', 'brief.md', 'props.ts', 'fixture.baseline.json', 'fields.json'];

describe('fileProblems', () => {
  test('exactly the five files pass', () => {
    assert.deepStrictEqual(fileProblems(FILES, false), []);
  });

  test('missing and unexpected files are problems', () => {
    assert.deepStrictEqual(fileProblems(['brief.md', 'props.ts', 'notes.txt'], false), [
      'missing meta.json',
      'missing fixture.baseline.json',
      'missing fields.json',
      'unexpected file notes.txt',
    ]);
  });

  test('only sample briefs may carry extra fixtures', () => {
    assert.deepStrictEqual(fileProblems([...FILES, 'fixture.stress.json'], true), []);
    assert.deepStrictEqual(fileProblems([...FILES, 'fixture.stress.json'], false), ['unexpected file fixture.stress.json']);
  });
});

describe('metaProblems', () => {
  test('a valid meta.json passes', () => {
    assert.deepStrictEqual(metaProblems({ id: 'x', title: 'X', category: 'table', sample: false }, 'x'), []);
  });

  test('wrong id, empty title, unknown category, non-boolean sample and extra keys are problems', () => {
    assert.deepStrictEqual(metaProblems({ id: 'y', title: ' ', category: 'chart', sample: 'no', tags: [] }, 'x'), [
      'meta.json: unknown property "tags"',
      'meta.json: id must be "x"',
      'meta.json: title must be a non-empty string',
      'meta.json: category must be one of card, list, table, form, navigation, dashboard, page-section, messaging, board',
      'meta.json: sample must be true or false',
    ]);
  });
});

describe('brief.md', () => {
  test('words are tokens with a letter or digit', () => {
    assert.equal(countWords('# Pricing table\n\nShow the plans - all 3 of them.'), 9);
  });

  test('implementation and robustness hints are reported', () => {
    assert.deepStrictEqual(hintProblems('Use a CSS grid. Names should wrap; handle empty lists on mobile.'), [
      'brief.md: implementation hint "CSS"',
      'brief.md: implementation hint "grid"',
      'brief.md: robustness hint "wrap"',
      'brief.md: robustness hint "empty"',
      'brief.md: robustness hint "mobile"',
    ]);
  });

  test('size words, file names and mentions of imports are reported (rules 8 and 9)', () => {
    const text = 'A short, one-line title and a few longer notes. See props.ts; imports are allowed.';
    assert.deepStrictEqual(hintProblems(text, 'props.ts'), [
      'props.ts: size word "short"',
      'props.ts: size word "one-line"',
      'props.ts: size word "few"',
      'props.ts: size word "longer"',
      'props.ts: file name "props.ts"',
      'props.ts: mention of imports "imports"',
    ]);
  });

  test('a plain product request has no hints', () => {
    assert.deepStrictEqual(
      hintProblems('It is a full-width page section. Show each plan with its name, price and features at shop.example.com.'),
      [],
    );
  });
});

describe('propsProblems', () => {
  test('plain data passes', () => {
    assert.deepStrictEqual(propsProblems("export type Status = 'a' | 'b';\nexport interface Props {\n  status: Status;\n}\n"), []);
  });

  test('Props must be exported and hold no functions or React types', () => {
    assert.deepStrictEqual(propsProblems('export interface CardProps {\n  onClick: () => void;\n  icon: React.ReactNode;\n}\n'), [
      'props.ts must export `interface Props`',
      'props.ts must describe plain data, but contains a function type',
      'props.ts must describe plain data, but contains a React type',
    ]);
  });
});

describe('listSizeProblems', () => {
  const fields: FieldsMap = { items: { kind: 'list' }, 'items[].tags': { kind: 'list' }, 'items[].tags[]': { kind: 'label' } };
  test('corpus lists hold 3 to 8 items', () => {
    const fixture = { items: [{ tags: ['a', 'b', 'c'] }, { tags: ['a'] }] };
    assert.deepStrictEqual(listSizeProblems(fixture, fields), [
      'fixture: items has 2 items; corpus lists hold 3 to 8',
      'fixture: items[].tags has 1 items; corpus lists hold 3 to 8',
    ]);
  });
});

describe('imports', () => {
  test('finds static, type-only, side-effect, re-export, dynamic and require imports', () => {
    const source = [
      "import { useState } from 'react';",
      "import type { ReactNode } from 'react';",
      "import * as Icons from 'lucide-react';",
      "import './styles.css';",
      "export { x } from 'lodash';",
      "const later = import('date-fns');",
      "const legacy = require('clsx');",
    ].join('\n');
    assert.deepStrictEqual(importedModules(source).modules, [
      'react', 'lucide-react', './styles.css', 'lodash', 'date-fns', 'clsx',
    ]);
  });

  test('ignores comments, strings and JSX text that look like imports', () => {
    const source = [
      "// import x from 'commented';",
      "/* import y from 'blocked'; */",
      "const text = \"import z from 'quoted'\";",
      "const url = 'https://example.org/'; import { memo } from 'react';",
      "export default function A() { return <p>Don't import 'jsx-text' here</p>; }",
    ].join('\n');
    assert.deepStrictEqual(importedModules(source), { modules: ['react'], errors: [] });
  });

  test('only react is allowed', () => {
    assert.deepStrictEqual(importProblems("import { memo } from 'react';\nimport clsx from 'clsx';"), [
      'imports "clsx"; only react is allowed',
    ]);
    assert.deepStrictEqual(importProblems('export default function A() { return null; }'), []);
  });
});
