import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './paths.ts';

/**
 * The labelling tool's example pairs (docs/LABELLING.md): check-lab cases
 * shown on the tool's first screen, a "-" case on the left and a "+" case on
 * the right, one pair per kind of breakage. The tool lives in the Python
 * runner; `npm run label:examples` screenshots the cases into its folder.
 */
export const labelUiDir = path.join(repoRoot, 'runner', 'first_edit', 'label_ui');
export const examplesDir = path.join(labelUiDir, 'examples');

export interface ExamplePicture {
  /** A check-lab case id. */
  lab: string;
  /** The width of the screen the case renders at (its lab viewport). */
  screen: number;
}

export interface ExamplePair {
  kind: string;
  caption: string;
  left: ExamplePicture;
  right: ExamplePicture;
}

export function readExamples(): ExamplePair[] {
  return JSON.parse(readFileSync(path.join(labelUiDir, 'examples.json'), 'utf8')) as ExamplePair[];
}
