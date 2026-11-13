import { normalizeText } from '../measures/visible-values.ts';
import { settle } from '../settle.ts';
import { LAB_CASES } from './cases.ts';
import { HIDDEN_LAB_CASES } from './hidden-cases.ts';

/** Renders lab case `id` (a check case or a content-hidden case) into the stage and resolves once it is on screen. */
export async function renderLab(root: HTMLElement, id: string): Promise<void> {
  const labCase = LAB_CASES.find((candidate) => candidate.id === id);
  const hiddenCase = HIDDEN_LAB_CASES.find((candidate) => candidate.id === id);
  if (!labCase && !hiddenCase) throw new Error(`Unknown lab case: "${id}"`);
  if (labCase?.dir) document.documentElement.dir = labCase.dir;
  if (hiddenCase) window.__FE_CONTENT_VALUES__ = hiddenCase.values.map(normalizeText);
  root.innerHTML = (labCase ?? hiddenCase)!.html;
  await settle(root);
}
