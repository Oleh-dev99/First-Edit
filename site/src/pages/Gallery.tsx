import { useEffect, useMemo, useState } from 'react';
import { Disclosure, PageHead, pageUrl } from '../components/Layout.tsx';
import { Pair, Shot, describeEntry, firstFindingY } from '../components/Pair.tsx';
import { url, type CaseEntry, type Cases, type Finding, type Outcome, type Run } from '../data.ts';

const OUTCOME_TEXT: Record<Outcome | 'all', string> = {
  failed: 'failed',
  survived: 'passed (random sample)',
  'born-broken': 'born broken (baseline)',
  'baseline-crash': 'baseline crash',
  all: 'all shown cases',
};

type Filters = Record<'outcome' | 'model' | 'variant' | 'brief' | 'case' | 'tier' | 'check', string>;
const EMPTY: Filters = { outcome: 'failed', model: '', variant: '', brief: '', case: '', tier: '', check: '' };
const LABELS: Record<keyof Filters, string> = {
  outcome: 'Outcome', model: 'Model', variant: 'Prompt', brief: 'Brief', case: 'Case', tier: 'Tier', check: 'Check',
};

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof Filters)[]) {
    const value = params.get(key);
    if (value !== null) filters[key] = value;
  }
  return filters;
}

function writeFilters(filters: Filters): void {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== EMPTY[key as keyof Filters]) params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function matches(entry: CaseEntry, filters: Filters): boolean {
  return (
    (filters.outcome === 'all' || entry.outcome === filters.outcome) &&
    (!filters.model || entry.model === filters.model) &&
    (!filters.variant || entry.variant === filters.variant) &&
    (!filters.brief || entry.brief === filters.brief) &&
    (!filters.case || entry.case === filters.case) &&
    (!filters.tier || entry.tier === filters.tier) &&
    (!filters.check || entry.checks.includes(filters.check))
  );
}

function describeDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return '';
  const parts: string[] = [];
  if (typeof detail.axis === 'string') parts.push(`${detail.axis} axis`);
  if (typeof detail.overflowPx === 'number') parts.push(`${detail.overflowPx} px over`);
  if (typeof detail.side === 'string') parts.push(`${detail.side} edge`);
  if (typeof detail.overlapWidthPx === 'number') parts.push(`overlap ${detail.overlapWidthPx} px wide`);
  if (typeof detail.otherText === 'string') parts.push(`with "${detail.otherText.slice(0, 60)}"`);
  return parts.join(', ');
}

function FindingItem({ finding }: { finding: Finding }) {
  const detail = describeDetail(finding.detail);
  return (
    <li className="border-t border-rule py-2 first:border-t-0">
      <span className="font-semibold">{finding.check}</span>{' '}
      <span className="text-muted">({finding.severity})</span>
      {finding.text ? <span className="ids"> &ldquo;{finding.text.slice(0, 140)}&rdquo;</span> : null}
      {detail ? <span className="text-ink-2"> &middot; {detail}</span> : null}
      {finding.selector ? (
        <code className="ids mt-1 block text-[0.75rem] leading-snug text-muted">{finding.selector}</code>
      ) : null}
    </li>
  );
}

function CaseCard({ entry }: { entry: CaseEntry }) {
  const errors = entry.findings.filter((finding) => finding.severity === 'error');
  const annotated = entry.images.annotated;
  const after = entry.images.after;
  const title = entry.case === 'baseline' ? `${entry.brief}: the baseline` : `${entry.brief}: ${entry.description}`;
  return (
    <article className="border-t border-rule-strong pt-5" aria-label={title}>
      <h2 className="ids font-sans text-lg font-semibold">{title}</h2>
      <p className="ids mt-1 text-sm text-ink-2">
        {entry.model}, {entry.variant} prompt &middot; case <code>{entry.case}</code>
        {entry.tier ? <> &middot; {entry.tier} tier</> : null} &middot;{' '}
        <strong className={entry.outcome === 'survived' ? 'font-semibold' : 'font-semibold text-accent-deep'}>
          {OUTCOME_TEXT[entry.outcome]}
        </strong>
        {entry.checks.length ? <> &middot; checks: {entry.checks.join(', ')}</> : null}
      </p>
      <div className="mt-4">
        <Pair entry={entry} />
      </div>
      {(annotated || entry.findings.length > 0 || entry.error) && (
        <Disclosure
          label={`Annotated screenshot and ${errors.length} error finding${errors.length === 1 ? '' : 's'}` +
            (entry.findings.length > errors.length ? ` (${entry.findings.length - errors.length} info)` : '')}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {annotated && after ? (
              <Shot picture={annotated} widest={after.width / (after.scale || 1)} focusY={firstFindingY(entry)}
                caption="After, annotated: red outlines are errors, amber info"
                alt={`Annotated: ${describeEntry(entry)}, ${entry.description}, with the findings outlined.`} />
            ) : null}
            <div className="min-w-0">
              {entry.error ? <p className="ids text-sm">Render error: {entry.error}</p> : null}
              {entry.findings.length ? (
                <ul className="text-sm">
                  {entry.findings.map((finding, index) => (
                    <FindingItem key={index} finding={finding} />
                  ))}
                </ul>
              ) : (
                !entry.error && <p className="text-sm text-muted">No new finding.</p>
              )}
            </div>
          </div>
        </Disclosure>
      )}
      {entry.source && (
        <p className="mt-3 text-sm">
          <a href={url(`data/${entry.source}`)}>Source of this component</a>{' '}
          <span className="text-muted">(TypeScript, as the model wrote it)</span>
        </p>
      )}
    </article>
  );
}

export function Gallery({ run, cases }: { run: Run; cases: Cases }) {
  const [filters, setFilters] = useState<Filters>(readFilters);
  useEffect(() => writeFilters(filters), [filters]);
  const options = useMemo(() => {
    const values = (pick: (entry: CaseEntry) => string | null | string[]) =>
      [...new Set(cases.cases.flatMap((entry) => pick(entry) ?? []))].sort();
    const order = new Map(run.cases.map((info, index) => [info.id, index]));
    return {
      outcome: (['failed', 'survived', 'baseline-crash', 'born-broken', 'all'] as const).filter(
        (outcome) => outcome === 'all' || cases.cases.some((entry) => entry.outcome === outcome),
      ),
      model: values((entry) => entry.model),
      variant: values((entry) => entry.variant),
      brief: values((entry) => entry.brief),
      case: values((entry) => entry.case).sort((a, b) => (order.get(a) ?? -1) - (order.get(b) ?? -1)),
      tier: values((entry) => entry.tier),
      check: values((entry) => entry.checks),
    };
  }, [cases, run]);
  const shown = cases.cases.filter((entry) => matches(entry, filters));
  const { counts, survivedSample } = cases;
  const set = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <>
      <PageHead title="Gallery">
        <p>
          Every failed case of the clean-baseline components ({counts.failed}), every born-broken or crashed baseline (
          {counts['born-broken'] + counts['baseline-crash']}), and a random sample of {survivedSample.size} of the{' '}
          {survivedSample.of} cases that passed (seed {survivedSample.seed}), so that passing can be seen too. Before is
          the reference render the case is judged against; tall pictures scroll and open at the first finding.
        </p>
      </PageHead>

      <form className="mt-8 grid grid-cols-2 gap-3 border-y border-rule py-4 sm:grid-cols-4 lg:grid-cols-7"
        aria-label="Filter the cases" onSubmit={(event) => event.preventDefault()}>
        {(Object.keys(EMPTY) as (keyof Filters)[]).map((key) => (
          <div key={key} className="min-w-0">
            <label htmlFor={`filter-${key}`} className="block text-xs font-semibold uppercase tracking-wide text-ink-2">
              {LABELS[key]}
            </label>
            <select id={`filter-${key}`} value={filters[key]} onChange={(event) => set(key, event.target.value)}
              className="mt-1 w-full min-w-0 rounded border border-rule-strong bg-card px-2 py-1 text-sm">
              {key !== 'outcome' && <option value="">any</option>}
              {(options[key] as readonly string[]).map((value) => (
                <option key={value} value={value}>
                  {key === 'outcome' ? OUTCOME_TEXT[value as Outcome | 'all'] : value}
                </option>
              ))}
            </select>
          </div>
        ))}
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" aria-live="polite">
          Showing {shown.length} of {cases.cases.length} cases.
        </p>
        <button type="button" onClick={() => setFilters({ ...EMPTY })}
          className="rounded border border-rule-strong bg-card px-3 py-1 text-sm hover:border-ink-2">
          Reset filters
        </button>
      </div>

      <div className="mt-6 space-y-12">
        {shown.map((entry) => (
          <CaseCard key={entry.id} entry={entry} />
        ))}
        {shown.length === 0 && (
          <p className="text-ink-2">
            No case matches these filters. The <a href={pageUrl('results', '#cases')}>results</a> count every case.
          </p>
        )}
      </div>
    </>
  );
}
