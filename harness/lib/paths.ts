import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const harnessDir = fileURLToPath(new URL('..', import.meta.url));
export const repoRoot = path.resolve(harnessDir, '..');
export const briefsDir = path.join(repoRoot, 'briefs');
export const candidatesDir = path.join(repoRoot, 'candidates');
export const resultsDir = path.join(repoRoot, 'results');
