/**
 * The candidate gate.
 *
 *   npm run candidate:check -- --brief <id> --candidate <path> [--json]
 *
 * <path> is the candidate's directory under candidates/, e.g.
 * mock-reference/pricing-table/plain-s1. Prints { valid, reasons } as JSON
 * with --json, or one line per reason otherwise. Exits 0 whether or not the
 * candidate is valid; non-zero only when the check itself fails.
 */
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkCandidateFile } from '../lib/candidate-check.ts';
import { candidatesDir } from '../lib/paths.ts';

const USAGE = 'usage: npm run candidate:check -- --brief <id> --candidate <path> [--json]';

function main(): void {
  const { values } = parseArgs({
    options: { brief: { type: 'string' }, candidate: { type: 'string' }, json: { type: 'boolean', default: false } },
    strict: true,
  });
  if (!values.brief || !values.candidate) throw new Error(USAGE);
  const result = checkCandidateFile(values.brief, path.join(candidatesDir, values.candidate, 'Component.tsx'));
  if (values.json) {
    console.log(JSON.stringify(result));
    return;
  }
  console.log(`${values.candidate}: ${result.valid ? 'valid' : 'invalid'}`);
  for (const reason of result.reasons) console.log(`  - [${reason.rule}] ${reason.message}`);
}

try {
  main();
} catch (error) {
  console.error(`candidate:check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
