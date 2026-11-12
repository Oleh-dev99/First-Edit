// The candidate gate: is a generated component valid for its brief?

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { contractReasons, type Reason } from './candidate-rules.ts';
import { briefsDir } from './paths.ts';
import { typeProblems } from './typecheck.ts';

export interface CandidateResult {
  valid: boolean;
  reasons: Reason[];
}

/**
 * A candidate is valid if it parses, has a default export that accepts the
 * brief's Props (type-level), imports nothing but react, uses no network,
 * timers, randomness, browser storage or dynamic import, and hard-codes no
 * http(s) URL in src, href, srcSet or CSS url(). Throws only if the check
 * itself cannot run.
 */
export function checkCandidateFile(briefId: string, componentFile: string): CandidateResult {
  if (!existsSync(path.join(briefsDir, briefId, 'props.ts'))) throw new Error(`unknown brief "${briefId}"`);
  if (!existsSync(componentFile)) throw new Error(`no file at ${componentFile}`);

  const reasons = contractReasons(readFileSync(componentFile, 'utf8').replace(/^﻿/, ''));
  const skipTypes = reasons.some((reason) => reason.rule === 'parse' || reason.rule === 'default-export');
  if (!skipTypes) {
    const name = `candidate-check/${createHash('sha1').update(path.resolve(componentFile)).digest('hex').slice(0, 12)}`;
    const problems = typeProblems({ name, briefId, componentFile, checkFileOnly: true });
    for (const problem of problems) {
      reasons.push({ rule: 'props', message: `the default export does not accept Props: ${problem.replace(/^type: /, '')}` });
    }
  }
  return { valid: reasons.length === 0, reasons };
}
