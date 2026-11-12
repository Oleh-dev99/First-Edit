import { settle } from '../settle.ts';
import { LAB_CASES } from './cases.ts';

/** Renders lab case `id` into the stage and resolves once it is on screen. */
export async function renderLab(root: HTMLElement, id: string): Promise<void> {
  const labCase = LAB_CASES.find((candidate) => candidate.id === id);
  if (!labCase) throw new Error(`Unknown lab case: "${id}"`);
  root.innerHTML = labCase.html;
  await settle(root);
}
