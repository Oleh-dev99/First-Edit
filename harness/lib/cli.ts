// The first-edit command line (docs/SPEC.md, Command line; D-060): the stress
// suite on any component. The component, its example props and a fields map
// (given, or inferred from the props) are copied into the workspace
// candidates/_cli/<name>/, where the harness app and Tailwind can see them,
// and the component is stressed exactly like a candidate: the same 19 cases,
// checks and new-finding rule (suite v1).

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser } from 'playwright';
import { fieldsProblems, forEachValue, isPlainObject, type FieldsMap } from '../src/mutations/fields.ts';
import { inferFields } from '../src/mutations/infer-fields.ts';
import { contractReasons } from './candidate-rules.ts';
import { candidatesDir, repoRoot, resultsDir } from './paths.ts';
import { cliQuery } from './render.ts';
import { startServer, type HarnessServer } from './server.ts';
import { formatStressTable, runStress, type StressSummary } from './stress.ts';

export const USAGE = [
  'usage: npm run first-edit -- <Component.tsx> --props <props.json> [--fields <fields.json>]',
  '         [--name <name>] [--out <dir>] [--fail-on core|all|none]',
].join('\n');

/** 0 survived, 1 broke (by --fail-on), 2 the input cannot be used, 3 the harness failed. */
export const EXIT = { survived: 0, broke: 1, input: 2, harness: 3 } as const;

export type FailOn = 'core' | 'all' | 'none';

export interface CliOptions {
  /** Absolute paths. */
  component: string;
  props: string;
  fields: string | null;
  /** The workspace name, candidates/_cli/<name>/. */
  name: string;
  out: string;
  failOn: FailOn;
}

/** The input cannot be used; the message says why. */
export class InputError extends Error {}

const NAME = /^[a-z0-9][a-z0-9-]{0,59}$/;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Repo-relative with forward slashes when inside the repository, else absolute. */
function display(file: string): string {
  const relative = path.relative(repoRoot, file);
  return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative.split(path.sep).join('/');
}

/** A workspace name from the file: its folder for Component.tsx, else its name; "PricingTable" gives "pricing-table". */
export function workspaceName(componentFile: string): string {
  const base = path.basename(componentFile).replace(/\.[^.]+$/, '');
  const raw = base.toLowerCase() === 'component' ? path.basename(path.dirname(componentFile)) : base;
  const name = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return name || 'component';
}

/** Paths are taken from `cwd`, the folder the command was started in (npm sets INIT_CWD). */
export function parseCliArgs(argv: string[], cwd: string): CliOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        props: { type: 'string' },
        fields: { type: 'string' },
        name: { type: 'string' },
        out: { type: 'string' },
        'fail-on': { type: 'string', default: 'core' },
      },
    });
  } catch (error) {
    throw new InputError(`${messageOf(error)}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1 || !values.props) throw new InputError(USAGE);
  const failOn = values['fail-on'];
  if (failOn !== 'core' && failOn !== 'all' && failOn !== 'none') {
    throw new InputError(`--fail-on must be core, all or none\n${USAGE}`);
  }
  if (values.name !== undefined && !NAME.test(values.name)) {
    throw new InputError('--name must be lower-case letters, digits and dashes, at most 60 characters');
  }
  const component = path.resolve(cwd, positionals[0]!);
  const name = values.name ?? workspaceName(component);
  return {
    component,
    props: path.resolve(cwd, values.props),
    fields: values.fields === undefined ? null : path.resolve(cwd, values.fields),
    name,
    out: values.out === undefined ? path.join(resultsDir, 'cli', name) : path.resolve(cwd, values.out),
    failOn,
  };
}

/** The output folder is replaced, so it must be new, empty or an earlier first-edit output. */
export function checkOutDir(out: string): void {
  if (!existsSync(out)) return;
  const entries = readdirSync(out);
  if (entries.length > 0 && !entries.includes('summary.json')) {
    throw new InputError(
      `--out ${out} holds other files; first-edit replaces its output folder, so give a new or empty folder ` +
        'or an earlier first-edit output',
    );
  }
}

function readJsonFile(file: string, what: string): unknown {
  if (!existsSync(file)) throw new InputError(`${what}: no file at ${file}`);
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (error) {
    throw new InputError(`${what}: ${file} is not valid JSON (${messageOf(error)})`);
  }
}

export interface PreparedInput {
  source: string;
  props: Record<string, unknown>;
  fields: FieldsMap;
  /** True when the fields map was inferred from the props. */
  inferred: boolean;
  warnings: string[];
}

/**
 * Reads and checks the input: the component follows the candidate contract
 * (one file, react only, no network, timers, randomness or storage; the
 * Props type is not checked, as there is no brief), the props are a JSON
 * object, and the fields map, given or inferred, is valid for them.
 */
export function prepareInput(options: CliOptions): PreparedInput {
  if (!existsSync(options.component)) throw new InputError(`no component at ${options.component}`);
  const source = readFileSync(options.component, 'utf8').replace(/^﻿/, '');
  const reasons = contractReasons(source);
  if (reasons.length > 0) {
    throw new InputError(
      [
        `${options.component} does not follow the component contract (docs/SPEC.md, Candidate contract):`,
        ...reasons.map((reason) => `  - [${reason.rule}] ${reason.message}`),
      ].join('\n'),
    );
  }
  const props = readJsonFile(options.props, '--props');
  if (!isPlainObject(props)) throw new InputError(`--props: ${options.props} must hold a JSON object`);
  const inferred = options.fields === null;
  const fields = options.fields === null ? inferFields(props) : readJsonFile(options.fields, '--fields');
  const problems = fieldsProblems(props, fields);
  if (problems.length > 0) {
    throw new InputError(
      [
        `the fields map ${inferred ? 'inferred from' : 'given for'} the example props is not valid:`,
        ...problems.map((problem) => `  - ${problem}`),
        ...(inferred ? ['write one and pass it with --fields (docs/SPEC.md, Fields map)'] : []),
      ].join('\n'),
    );
  }
  const remote: string[] = [];
  forEachValue(props, (_path, value) => {
    if (typeof value === 'string' && /^(https?:)?\/\//i.test(value)) remote.push(value);
  });
  const warnings =
    remote.length === 0
      ? []
      : [
          `${remote.length} prop value(s) point to another server, e.g. ${remote[0]}. The harness blocks every ` +
            'request but its own, so such images never load; use the /fe-assets/ placeholders (docs/SPEC.md, Images).',
        ];
  return { source, props, fields: fields as FieldsMap, inferred, warnings };
}

/** Writes candidates/_cli/<name>/: Component.tsx, props.json and fields.json, replacing the folder. */
export function writeWorkspace(name: string, input: PreparedInput, root = candidatesDir): string {
  const dir = path.join(root, '_cli', name);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'Component.tsx'), input.source);
  writeFileSync(path.join(dir, 'props.json'), json(input.props));
  writeFileSync(path.join(dir, 'fields.json'), json(input.fields));
  return dir;
}

export interface Verdict {
  exitCode: number;
  lines: string[];
}

/**
 * What the run says and the exit code. A baseline that did not render, or
 * that has error findings (born broken), counts as broken; so does a failed
 * core case, and with --fail-on all a failed extreme case. --fail-on none
 * always exits 0.
 */
export function verdict(summary: StressSummary, failOn: FailOn): Verdict {
  const { baseline } = summary;
  const lines: string[] = [];
  const baselineBad = baseline.status !== 'ok' || baseline.errors > 0;
  if (baseline.status !== 'ok') lines.push(`baseline: ${baseline.status}; the component did not render with the example props`);
  else if (baseline.errors > 0) lines.push(`baseline: born broken, ${baseline.errors} error finding(s) with the example props`);
  else lines.push('baseline: clean');

  const failedIn = (tier: 'core' | 'extreme'): string[] => {
    const applicable = summary.cases.filter((entry) => entry.tier === tier && entry.applicable);
    const failed = applicable.filter((entry) => entry.survived !== true).map((entry) => entry.id);
    lines.push(
      `${tier}: ${applicable.length - failed.length}/${applicable.length} cases survived` +
        (failed.length > 0 ? ` (failed: ${failed.join(', ')})` : ''),
    );
    return failed;
  };
  const core = failedIn('core');
  const extreme = failedIn('extreme');
  lines.push(`content hidden: ${summary.totals.contentHidden} value(s), measured but never failing a case`);

  const broke =
    failOn !== 'none' && (baselineBad || core.length > 0 || (failOn === 'all' && extreme.length > 0));
  const what = baselineBad
    ? 'the baseline is not clean'
    : core.length > 0
      ? `broke in ${core.length} core case(s)`
      : extreme.length > 0
        ? `survived every core case, broke in ${extreme.length} extreme case(s)`
        : 'survived every case';
  const exitCode = broke ? EXIT.broke : EXIT.survived;
  lines.push(`result: ${what}; exit ${exitCode} (--fail-on ${failOn})`);
  return { exitCode, lines };
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const consoleIo: CliIo = { out: (line) => console.log(line), err: (line) => console.error(line) };

/** Runs the command line; returns the exit code. */
export async function runCli(argv: string[], cwd: string, io: CliIo = consoleIo): Promise<number> {
  let options: CliOptions;
  let input: PreparedInput;
  try {
    options = parseCliArgs(argv, cwd);
    checkOutDir(options.out);
    input = prepareInput(options);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    io.err(error.message);
    return EXIT.input;
  }
  for (const warning of input.warnings) io.err(`warning: ${warning}`);
  writeWorkspace(options.name, input);

  let server: HarnessServer | undefined;
  let browser: Browser | undefined;
  try {
    server = await startServer();
    browser = await chromium.launch();
    const { name } = options;
    const summary = await runStress({
      browser,
      origin: server.origin,
      brief: name,
      candidate: `_cli/${name}`,
      input: { fixture: input.props, fields: input.fields, query: (mutation) => cliQuery(name, mutation) },
      outDir: options.out,
    });
    writeFileSync(path.join(options.out, 'fields.json'), json(input.fields));
    io.out(formatStressTable(summary));
    io.out('');
    if (input.inferred) {
      io.out(
        `fields map: inferred from the example props, written to ${display(path.join(options.out, 'fields.json'))}; ` +
          'correct it and pass it back with --fields',
      );
    }
    const result = verdict(summary, options.failOn);
    for (const line of result.lines) io.out(line);
    io.out(`results: ${display(options.out)} (open a case with npm run dev and its query, e.g. ${cliQuery(name)})`);
    return result.exitCode;
  } catch (error) {
    io.err(`first-edit: the harness failed: ${messageOf(error)}`);
    return EXIT.harness;
  } finally {
    await browser?.close();
    await server?.close();
  }
}
