// The first-edit command line (D-060): the fields-map guess, the arguments,
// the verdict, and the suite run on the hello-card samples copied outside the
// corpus, which must give the same cases as through their brief.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import {
  EXIT,
  InputError,
  checkOutDir,
  parseCliArgs,
  runCli,
  verdict,
  workspaceName,
  type FailOn,
} from '../lib/cli.ts';
import { briefsDir, candidatesDir, resultsDir } from '../lib/paths.ts';
import { startServer, type HarnessServer } from '../lib/server.ts';
import { runStress, type CaseEntry, type StressSummary } from '../lib/stress.ts';
import { fieldsProblems } from '../src/mutations/fields.ts';
import { inferFields, inferKind, lastWord } from '../src/mutations/infer-fields.ts';

const HELLO_PROPS = path.join(briefsDir, 'hello-card', 'fixture.baseline.json');
const HELLO_FIELDS = path.join(briefsDir, 'hello-card', 'fields.json');
const sample = (name: string): string => path.join(candidatesDir, '_samples', 'hello-card', name, 'Component.tsx');
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));

describe('inferFields', () => {
  test('infers the hello-card fields map from its example props', () => {
    assert.deepEqual(inferFields(readJson(HELLO_PROPS)), {
      name: { kind: 'label' },
      jobTitle: { kind: 'label' },
      bio: { kind: 'prose' },
      followers: { kind: 'number' },
      skills: { kind: 'list' },
      'skills[]': { kind: 'label' },
    });
  });

  test("every brief's baseline fixture gets a valid inferred fields map", () => {
    const briefs = readdirSync(briefsDir).filter((id) => existsSync(path.join(briefsDir, id, 'fixture.baseline.json')));
    assert.equal(briefs.length, 21);
    for (const id of briefs) {
      const fixture = readJson(path.join(briefsDir, id, 'fixture.baseline.json'));
      assert.deepEqual(fieldsProblems(fixture, inferFields(fixture)), [], id);
    }
  });

  test('keys and values that are not content are fixed or ids', () => {
    assert.deepEqual(
      [lastWord('avatarUrl'), lastWord('created_at'), lastWord('ID'), lastWord('image-src')],
      ['url', 'at', 'id', 'src'],
    );
    const cases: [string | number | boolean, string, string][] = [
      ['https://example.com', 'link', 'fixed'],
      ['/fe-assets/placeholder-1x1.svg', 'picture', 'fixed'],
      ['/team', 'target', 'fixed'],
      ['2026-11-18', 'due', 'fixed'],
      ['2026-11-18T09:30:00Z', 'when', 'fixed'],
      ['#1f2937', 'accent', 'fixed'],
      ['in-progress', 'state', 'fixed'],
      ['Monday', 'dueDate', 'fixed'],
      ['primary', 'variant', 'fixed'],
      [true, 'active', 'fixed'],
      [7, 'id', 'id'],
      ['msg-2041', 'messageId', 'id'],
      [12, 'count', 'number'],
      ['Active now', 'status', 'label'],
      ['Pro', 'plan', 'label'],
      ['ana@example.com', 'email', 'label'],
      ['Thanks, the refund is on its way.', 'text', 'prose'],
      ['Designs calm, accessible tools for clinical teams across three hospitals', 'bio', 'prose'],
      ['Set up in under ten minutes', 'benefit', 'label'],
    ];
    for (const [value, key, kind] of cases) assert.equal(inferKind(value, key), kind, `${key}: ${String(value)}`);
  });

  test('items merge: label and prose give prose, other mixes give fixed; an empty list declares no items', () => {
    const props = {
      notes: ['Hi', 'A longer note that reads as a sentence. It goes on.'],
      mixed: [1, 'two words'],
      empty: [],
      owner: null,
      links: [{ id: 'a', label: 'Home', href: '/' }],
    };
    const fields = inferFields(props);
    assert.deepEqual(fields, {
      notes: { kind: 'list' },
      'notes[]': { kind: 'prose' },
      mixed: { kind: 'list' },
      'mixed[]': { kind: 'fixed' },
      empty: { kind: 'list' },
      links: { kind: 'list' },
      'links[].id': { kind: 'id' },
      'links[].label': { kind: 'label' },
      'links[].href': { kind: 'fixed' },
    });
    assert.deepEqual(fieldsProblems(props, fields), []);
  });
});

describe('arguments', () => {
  test('a workspace name comes from the folder of Component.tsx or from the file name', () => {
    assert.equal(workspaceName(path.join('x', 'my-card', 'Component.tsx')), 'my-card');
    assert.equal(workspaceName(path.join('x', 'PricingTable.tsx')), 'pricing-table');
    assert.equal(workspaceName(path.join('x', '__', 'Component.tsx')), 'component');
  });

  test('paths are taken from the folder the command was started in', () => {
    const cwd = path.join(os.tmpdir(), 'somewhere');
    const options = parseCliArgs(['cards/Card.tsx', '--props', 'card.json'], cwd);
    assert.equal(options.component, path.join(cwd, 'cards', 'Card.tsx'));
    assert.equal(options.props, path.join(cwd, 'card.json'));
    assert.equal(options.fields, null);
    assert.equal(options.name, 'card');
    assert.equal(options.out, path.join(resultsDir, 'cli', 'card'));
    assert.equal(options.failOn, 'core');
    assert.equal(parseCliArgs(['Card.tsx', '--props', 'p.json', '--out', 'o', '--fail-on', 'all'], cwd).out, path.join(cwd, 'o'));
  });

  test('bad arguments are input errors', () => {
    const cwd = os.tmpdir();
    assert.throws(() => parseCliArgs(['Card.tsx'], cwd), InputError);
    assert.throws(() => parseCliArgs(['Card.tsx', '--props', 'p.json', '--fail-on', 'some'], cwd), InputError);
    assert.throws(() => parseCliArgs(['Card.tsx', '--props', 'p.json', '--name', 'Bad Name'], cwd), InputError);
    assert.throws(() => parseCliArgs(['Card.tsx', '--props', 'p.json', '--colour', 'red'], cwd), InputError);
  });

  test('the output folder must be new, empty or an earlier first-edit output', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fe-out-'));
    try {
      checkOutDir(path.join(dir, 'new'));
      checkOutDir(dir);
      writeFileSync(path.join(dir, 'notes.txt'), 'mine');
      assert.throws(() => checkOutDir(dir), InputError);
      writeFileSync(path.join(dir, 'summary.json'), '{}');
      checkOutDir(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('verdict', () => {
  const entry = (id: string, tier: 'core' | 'extreme', survived: boolean): CaseEntry =>
    ({ id, tier, applicable: true, survived }) as unknown as CaseEntry;
  const summary = (cases: CaseEntry[], baseline: { status?: string; errors?: number } = {}): StressSummary =>
    ({
      baseline: { status: baseline.status ?? 'ok', errors: baseline.errors ?? 0 },
      cases,
      totals: { contentHidden: 0 },
    }) as unknown as StressSummary;
  const exit = (s: StressSummary, failOn: FailOn): number => verdict(s, failOn).exitCode;

  test('core failures fail by default, extreme ones only with --fail-on all, nothing with none', () => {
    const clean = summary([entry('text-long', 'core', true), entry('text-unbroken', 'extreme', true)]);
    const core = summary([entry('text-long', 'core', false), entry('text-unbroken', 'extreme', true)]);
    const extreme = summary([entry('text-long', 'core', true), entry('text-unbroken', 'extreme', false)]);
    assert.deepEqual([exit(clean, 'core'), exit(clean, 'all'), exit(clean, 'none')], [0, 0, 0]);
    assert.deepEqual([exit(core, 'core'), exit(core, 'all'), exit(core, 'none')], [1, 1, 0]);
    assert.deepEqual([exit(extreme, 'core'), exit(extreme, 'all'), exit(extreme, 'none')], [0, 1, 0]);
    assert.ok(verdict(core, 'core').lines.includes('core: 0/1 cases survived (failed: text-long)'));
    assert.equal(verdict(extreme, 'core').lines.at(-1), 'result: survived every core case, broke in 1 extreme case(s); exit 0 (--fail-on core)');
  });

  test('a born-broken or crashed baseline counts as broken', () => {
    const cases = [entry('text-long', 'core', true)];
    assert.equal(exit(summary(cases, { errors: 2 }), 'core'), EXIT.broke);
    assert.equal(exit(summary(cases, { status: 'render-error' }), 'core'), EXIT.broke);
    assert.equal(verdict(summary(cases, { errors: 2 }), 'core').lines[0], 'baseline: born broken, 2 error finding(s) with the example props');
  });
});

describe('first-edit on the hello-card samples, from outside the corpus', () => {
  let server: HarnessServer;
  let browser: Browser;
  let tmp: string;
  const names = ['test-cli-brittle', 'test-cli-robust', 'test-cli-refused'];
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };

  before(async () => {
    server = await startServer();
    browser = await chromium.launch();
    tmp = mkdtempSync(path.join(os.tmpdir(), 'fe-cli-'));
  });

  after(async () => {
    await browser?.close();
    await server?.close();
    rmSync(tmp, { recursive: true, force: true });
    for (const name of names) rmSync(path.join(candidatesDir, '_cli', name), { recursive: true, force: true });
  });

  const comparable = (summary: StressSummary) =>
    summary.cases.map(({ id, applicable, status, survived, newErrors, contentHidden }) => ({
      id, applicable, status, survived, newErrors, contentHidden,
    }));

  test('the brittle card gets the same cases as through its brief, and exits 1', async () => {
    const dir = path.join(tmp, 'brittle');
    mkdirSync(dir);
    copyFileSync(sample('brittle'), path.join(dir, 'BrittleCard.tsx'));
    copyFileSync(HELLO_PROPS, path.join(dir, 'props.json'));
    copyFileSync(HELLO_FIELDS, path.join(dir, 'fields.json'));
    const code = await runCli(
      ['BrittleCard.tsx', '--props', 'props.json', '--fields', 'fields.json', '--name', names[0]!, '--out', 'out'],
      dir,
      io,
    );
    assert.equal(code, EXIT.broke, lines.join('\n'));
    const viaCli = readJson(path.join(dir, 'out', 'summary.json')) as StressSummary;
    const viaBrief = await runStress({
      browser, origin: server.origin, brief: 'hello-card', candidate: '_samples/hello-card/brittle',
    });
    assert.deepEqual(comparable(viaCli), comparable(viaBrief));
    assert.equal(viaCli.candidate, `_cli/${names[0]}`);
    assert.ok(lines.some((line) => line.startsWith('result: broke in')), lines.join('\n'));
  });

  test('the robust card survives with an inferred fields map, written beside the results', async () => {
    lines.length = 0;
    const dir = path.join(tmp, 'robust');
    mkdirSync(dir);
    copyFileSync(sample('robust'), path.join(dir, 'Component.tsx'));
    copyFileSync(HELLO_PROPS, path.join(dir, 'props.json'));
    const code = await runCli(['Component.tsx', '--props', 'props.json', '--name', names[1]!, '--out', 'out'], dir, io);
    assert.equal(code, EXIT.survived, lines.join('\n'));
    assert.deepEqual(readJson(path.join(dir, 'out', 'fields.json')), inferFields(readJson(HELLO_PROPS)));
    assert.ok(lines.some((line) => line.startsWith('fields map: inferred')), lines.join('\n'));
  });

  test('a component that imports another module is refused before anything runs', async () => {
    lines.length = 0;
    const dir = path.join(tmp, 'refused');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'Card.tsx'), "import x from 'lodash';\nexport default function Card() { return null; }\n");
    copyFileSync(HELLO_PROPS, path.join(dir, 'props.json'));
    const code = await runCli(['Card.tsx', '--props', 'props.json', '--name', names[2]!, '--out', 'out'], dir, io);
    assert.equal(code, EXIT.input);
    assert.ok(lines.some((line) => line.includes('[imports] imports "lodash"')), lines.join('\n'));
    assert.equal(existsSync(path.join(candidatesDir, '_cli', names[2]!)), false);
    assert.equal(existsSync(path.join(dir, 'out')), false);
  });
});
