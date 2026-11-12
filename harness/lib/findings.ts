import { CHECK_NAMES, type CheckName, type Finding } from '../src/checks/finding.ts';

export type Counts = Record<CheckName, { error: number; info: number }>;

export function emptyCounts(): Counts {
  return Object.fromEntries(CHECK_NAMES.map((name) => [name, { error: 0, info: 0 }])) as Counts;
}

export function countFindings(findings: Finding[]): Counts {
  const counts = emptyCounts();
  for (const finding of findings) counts[finding.check][finding.severity]++;
  return counts;
}

/** Fills in zeros for every check and severity left out. */
export function expectedCounts(
  partial: Partial<Record<CheckName, { error?: number; info?: number }>>,
): Counts {
  const counts = emptyCounts();
  for (const name of CHECK_NAMES) {
    counts[name] = { error: partial[name]?.error ?? 0, info: partial[name]?.info ?? 0 };
  }
  return counts;
}

/** "text-clipped 1/0, content-spill 2/0" (error/info), only non-zero checks. */
export function formatCounts(counts: Counts): string {
  const parts = CHECK_NAMES.filter((name) => counts[name].error + counts[name].info > 0).map(
    (name) => `${name} ${counts[name].error}/${counts[name].info}`,
  );
  return parts.length > 0 ? parts.join(', ') : 'none';
}
