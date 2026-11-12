// Reference implementation for the stat-tiles brief.

type MetricFormat = 'currency' | 'percent' | 'count';

interface Metric {
  id: string;
  label: string;
  value: number;
  format: MetricFormat;
  change: number;
  caption: string;
}

interface Props {
  title: string;
  periodLabel: string;
  currency: string;
  metrics: Metric[];
}

/** Compact notation ("1.2B") once the displayed magnitude reaches a million. */
const COMPACT_FROM = 1_000_000;

function formatValue(value: number, format: MetricFormat, currency: string): string {
  const shown = format === 'percent' ? value * 100 : value;
  const compact = Math.abs(shown) >= COMPACT_FROM;
  const options: Intl.NumberFormatOptions = compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { maximumFractionDigits: format === 'count' ? 0 : Number.isInteger(value) ? 0 : 2 };
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      ...options,
    }).format(value);
  }
  if (format === 'percent') {
    return new Intl.NumberFormat('en-US', { style: 'percent', ...options, maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('en-US', options).format(value);
}

function formatChange(change: number): string {
  const compact = Math.abs(change * 100) >= COMPACT_FROM;
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
    ...(compact ? { notation: 'compact' } : {}),
  }).format(change);
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
      {up ? (
        <path
          fillRule="evenodd"
          d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17Z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fillRule="evenodd"
          d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z"
          clipRule="evenodd"
        />
      )}
    </svg>
  );
}

function ChangeBadge({ change }: { change: number }) {
  const tone =
    change > 0 ? 'bg-emerald-50 text-emerald-700' : change < 0 ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex min-w-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {change !== 0 ? <Arrow up={change > 0} /> : null}
      <span className="tabular-nums wrap-anywhere">{formatChange(change)}</span>
      <span className="sr-only">{change > 0 ? 'increase' : change < 0 ? 'decrease' : 'no change'}</span>
    </span>
  );
}

export default function StatTiles({ title, periodLabel, currency, metrics }: Props) {
  return (
    <section className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 text-lg font-semibold text-slate-900 wrap-anywhere">{title}</h2>
        {periodLabel ? <p className="min-w-0 text-sm text-slate-500 wrap-anywhere">{periodLabel}</p> : null}
      </div>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-4">
        {metrics.map((metric) => (
          <li key={metric.id} className="flex min-w-0 flex-col rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-600 wrap-anywhere">{metric.label}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="min-w-0 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums wrap-anywhere">
                {formatValue(metric.value, metric.format, currency)}
              </p>
              <ChangeBadge change={metric.change} />
            </div>
            {metric.caption ? <p className="mt-2 text-sm text-slate-500 wrap-anywhere">{metric.caption}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
