// The candidate gate: one valid file and one file per violated rule, run
// through the full check (including tsc), plus unit tests for the scanner.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { checkCandidateFile } from '../lib/candidate-check.ts';
import { contractReasons } from '../lib/candidate-rules.ts';
import { harnessDir } from '../lib/paths.ts';

const BRIEF = 'pricing-table';

/** A minimal valid pricing-table candidate; `body` replaces the returned JSX. */
const candidate = (extra = '', body = '<h2>{heading}</h2>', props = '{ heading: string; plans: { name: string }[] }') => `
${extra}
interface Props ${props}

export default function Pricing({ heading }: Props) {
  return ${body};
}
`;

function check(name: string, source: string) {
  const dir = path.join(harnessDir, 'node_modules', '.cache', 'candidate-fixtures', name);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'Component.tsx');
  writeFileSync(file, source);
  return checkCandidateFile(BRIEF, file);
}

const rules = (result: { reasons: { rule: string }[] }) => [...new Set(result.reasons.map((reason) => reason.rule))];

describe('candidate:check, one file per rule', () => {
  test('a valid candidate', () => {
    assert.deepStrictEqual(check('valid', candidate("import { memo } from 'react';\nvoid memo;")), { valid: true, reasons: [] });
  });

  const cases: [string, string, string][] = [
    ['parse', 'export default function Pricing( {', 'parse'],
    ['default-export', candidate().replace('export default function', 'export function'), 'default-export'],
    ['props', candidate('', '<h2>{heading}</h2>', '{ heading: number }'), 'props'],
    ['imports', candidate("import clsx from 'clsx';\nvoid clsx;"), 'imports'],
    ['network', candidate('', '<h2 onClick={() => fetch("/api/plans")}>{heading}</h2>'), 'network'],
    ['timers', candidate('', '<h2 ref={() => { setTimeout(() => {}, 100); }}>{heading}</h2>'), 'timers'],
    ['randomness', candidate('', '<h2 data-key={Math.random()}>{heading}</h2>'), 'randomness'],
    ['storage', candidate('', '<h2>{localStorage.getItem("plan") ?? heading}</h2>'), 'storage'],
    ['dynamic-import', candidate('void import("react");'), 'dynamic-import'],
    ['hardcoded-url', candidate('', '<img src="https://cdn.example.com/logo.png" alt={heading} />'), 'hardcoded-url'],
  ];
  for (const [name, source, rule] of cases) {
    test(`${name} makes the candidate invalid`, () => {
      const result = check(name, source);
      assert.equal(result.valid, false);
      assert.deepStrictEqual(rules(result), [rule]);
    });
  }
});

describe('contract scanner', () => {
  test('finds every form of the forbidden APIs', () => {
    const source = candidate(
      [
        'const a = window.fetch;',
        'const b = new XMLHttpRequest();',
        'const c = new WebSocket("wss://x");',
        'const d = requestAnimationFrame;',
        'const e = globalThis.sessionStorage;',
        'const f = document.cookie;',
        'const g = crypto.randomUUID();',
        'const h = require("lodash");',
        'void [a, b, c, d, e, f, g, h];',
      ].join('\n'),
      '<div style={{ backgroundImage: "url(https://cdn.example.com/bg.png)" }}><a href={`//example.com`}>{heading}</a></div>',
    );
    assert.deepStrictEqual(contractReasons(source), [
      { rule: 'network', message: 'uses window.fetch' },
      { rule: 'network', message: 'uses XMLHttpRequest' },
      { rule: 'network', message: 'uses WebSocket' },
      { rule: 'timers', message: 'uses requestAnimationFrame' },
      { rule: 'storage', message: 'uses globalThis.sessionStorage' },
      { rule: 'storage', message: 'uses document.cookie' },
      { rule: 'randomness', message: 'uses crypto.randomUUID' },
      { rule: 'imports', message: 'uses require()' },
      { rule: 'hardcoded-url', message: 'hard-codes a URL in CSS url(): url(https://cdn.example.com/bg.png)' },
      { rule: 'hardcoded-url', message: 'hard-codes a URL in href: //example.com' },
    ]);
  });

  test('property names, object keys, types, strings, comments and relative links do not count', () => {
    const source = candidate(
      [
        "import type { CSSProperties } from 'react';",
        'type Socket = WebSocket;',
        'const api = { fetch: 1, setTimeout: 2 };',
        'const label = "fetch(), Math.random(), localStorage";',
        '// setInterval(() => {}, 1000);',
        'void [api.fetch, api.setTimeout, label];',
        'export type { Socket, CSSProperties };',
      ].join('\n'),
      '<a href="/pricing" className="bg-[url(/fe-assets/placeholder-1x1.svg)]">{heading}</a>',
    );
    assert.deepStrictEqual(contractReasons(source), []);
  });
});
