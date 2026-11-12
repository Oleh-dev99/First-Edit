// Type-level checks with the project's tsc: a fixture against a brief's
// Props, and a component's default export against Props. The generated
// files live in harness/node_modules/.cache, so react resolves normally.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { briefsDir, harnessDir, repoRoot } from './paths.ts';

export interface TypeCheckOptions {
  /** Directory under harness/node_modules/.cache for the generated files. */
  name: string;
  briefId: string;
  /** Checked as a value of type Props, if given. */
  fixture?: unknown;
  /** Its default export is checked against ComponentType<Props>, if given. */
  componentFile?: string;
  /**
   * Report only errors in the generated check file: whether the fixture and
   * the default export fit Props. Errors inside the component itself (an
   * unused variable, say) are then ignored. Used for model candidates.
   */
  checkFileOnly?: boolean;
}

const posix = (file: string): string => file.split(path.sep).join('/');

/** Every tsc error, as "type: <file>(<line>,<col>): error TS...: <message>". Empty if all is well. */
export function typeProblems(options: TypeCheckOptions): string[] {
  const { name, briefId, fixture, componentFile, checkFileOnly = false } = options;
  const dir = path.join(harnessDir, 'node_modules', '.cache', name);
  mkdirSync(dir, { recursive: true });
  const from = (target: string): string => posix(path.relative(dir, target));
  const lines = [
    `import type { Props } from '${from(path.join(briefsDir, briefId, 'props.ts'))}';`,
    ...(componentFile
      ? [`import type { ComponentType } from 'react';`, `import Component from '${from(componentFile)}';`]
      : []),
    ...(fixture === undefined ? [] : [`export const fixture: Props = ${JSON.stringify(fixture, null, 2)};`]),
    ...(componentFile ? ['export const component: ComponentType<Props> = Component;'] : []),
  ];
  writeFileSync(path.join(dir, 'check.ts'), `${lines.join('\n')}\n`);
  const tsconfig = { extends: from(path.join(harnessDir, 'tsconfig.json')), include: [], files: ['check.ts'] };
  writeFileSync(path.join(dir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);

  const tsc = path.join(harnessDir, 'node_modules', 'typescript', 'bin', 'tsc');
  const result = spawnSync(process.execPath, [tsc, '-p', path.join(dir, 'tsconfig.json'), '--pretty', 'false'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status === 0) return [];
  const errors = `${result.stdout}\n${result.stderr}`
    .split('\n')
    .filter((line) => /error TS\d+/.test(line))
    .filter((line) => !checkFileOnly || /check\.ts\(/.test(line));
  if (errors.length > 0) return errors.map((line) => `type: ${line.trim()}`);
  if (checkFileOnly) return [];
  return [`type: tsc exited with ${result.status}: ${result.stderr.trim() || result.stdout.trim()}`];
}
