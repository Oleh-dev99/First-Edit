import { contentSpill } from './content-spill.ts';
import { CHECK_NAMES, type Check, type CheckName, type Finding } from './finding.ts';
import { offScreen } from './off-screen.ts';
import { pageOverflowX } from './page-overflow-x.ts';
import { textClipped } from './text-clipped.ts';
import { textOverlap } from './text-overlap.ts';

export const CHECKS: Record<CheckName, Check> = {
  'page-overflow-x': pageOverflowX,
  'text-clipped': textClipped,
  'content-spill': contentSpill,
  'text-overlap': textOverlap,
  'off-screen': offScreen,
};

/** Runs every check on `root` and returns all findings, in check order. */
export function runChecks(root: Element): Finding[] {
  return CHECK_NAMES.flatMap((name) => CHECKS[name](root));
}
