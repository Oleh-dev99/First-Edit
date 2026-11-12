// Tailwind must generate the classes of every candidate, including model
// outputs in git-ignored folders under candidates/ (D-029). Tailwind skips
// git-ignored files unless a source points into the ignored folder, so this
// test compiles src/styles.css and scans its sources the way
// @tailwindcss/vite does, with a probe candidate in a fresh ignored folder.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, test } from 'node:test';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';
import { candidatesDir, harnessDir, repoRoot } from '../lib/paths.ts';

// A dot in the folder name, like real model ids (claude-haiku-5.5).
const probeRoot = path.join(candidatesDir, 'zz-tailwind-probe.test');
const probeFile = path.join(probeRoot, 'hello-card', 'plain-s1', 'Component.tsx');
// Built at run time: written out literally, this file (also scanned, under
// harness/) would supply the class itself and the test could never fail.
const PROBE_CLASS = `w-[${4000 + 321}px]`;

after(() => rmSync(probeRoot, { recursive: true, force: true }));

/** The class candidates Tailwind finds for src/styles.css. */
async function scannedCandidates(): Promise<Set<string>> {
  const cssFile = path.join(harnessDir, 'src', 'styles.css');
  const compiler = await compile(readFileSync(cssFile, 'utf8'), {
    base: path.dirname(cssFile),
    onDependency: () => {},
  });
  // Same source list as @tailwindcss/vite: the root (the Vite root when
  // not set), then every @source.
  const root =
    compiler.root === 'none'
      ? []
      : compiler.root === null
        ? [{ base: harnessDir, pattern: '**/*', negated: false }]
        : [{ ...compiler.root, negated: false }];
  const scanner = new Scanner({ sources: [...root, ...compiler.sources] });
  return new Set(scanner.scan());
}

test('classes in a git-ignored candidates folder are generated', async () => {
  mkdirSync(path.dirname(probeFile), { recursive: true });
  writeFileSync(probeFile, `export default function Probe() {\n  return <div className="${PROBE_CLASS}">probe</div>;\n}\n`);

  // The probe only proves something if git really ignores it.
  const relative = path.relative(repoRoot, probeFile).split(path.sep).join('/');
  assert.doesNotThrow(
    () => execFileSync('git', ['check-ignore', '-q', relative], { cwd: repoRoot }),
    `${relative} should be git-ignored`,
  );

  const candidates = await scannedCandidates();
  assert.ok(candidates.has(PROBE_CLASS), `${PROBE_CLASS} from the git-ignored probe was not scanned`);
});

test('classes in tracked candidates are generated', async () => {
  // A sanity check that the tracked folders are still scanned: every class
  // of the robust hello-card sample is found.
  const sample = readFileSync(path.join(candidatesDir, '_samples', 'hello-card', 'robust', 'Component.tsx'), 'utf8');
  const classes = [...sample.matchAll(/className="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
  assert.ok(classes.length > 0);
  const candidates = await scannedCandidates();
  for (const name of classes) assert.ok(candidates.has(name), `${name} was not scanned`);
});
