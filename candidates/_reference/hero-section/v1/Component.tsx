// Reference implementation for the hero-section brief.

interface Props {
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  benefits: string[];
  customerCount: number;
  customers: string[];
}

const standard = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "12,400", then compact from a million: "1.2B". */
const formatCount = (value: number): string => (Math.abs(value) < 1_000_000 ? standard : compact).format(value);

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5 shrink-0 text-indigo-600">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function HeroSection({
  headline,
  subheadline,
  primaryCtaLabel,
  secondaryCtaLabel,
  benefits,
  customerCount,
  customers,
}: Props) {
  return (
    <section className="w-full bg-white px-4 py-20 sm:px-8 lg:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance text-slate-900 wrap-anywhere sm:text-6xl">
          {headline}
        </h1>
        {subheadline ? (
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-pretty text-slate-600 wrap-anywhere">
            {subheadline}
          </p>
        ) : null}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="max-w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 wrap-anywhere"
          >
            {primaryCtaLabel}
          </button>
          {secondaryCtaLabel ? (
            <button
              type="button"
              className="max-w-full rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 wrap-anywhere"
            >
              {secondaryCtaLabel}
            </button>
          ) : null}
        </div>
        {benefits.length > 0 ? (
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600">
            {benefits.map((benefit, index) => (
              <li key={index} className="flex min-w-0 items-center gap-2">
                <CheckIcon />
                <span className="min-w-0 text-start wrap-anywhere">{benefit}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mx-auto mt-16 max-w-5xl border-t border-slate-200 pt-10 text-center">
        <p className="text-sm font-medium text-slate-500 wrap-anywhere">
          Trusted by <span className="font-semibold text-slate-900 tabular-nums">{formatCount(customerCount)}</span>{' '}
          customers, including
        </p>
        {customers.length > 0 ? (
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {customers.map((customer, index) => (
              <li key={index} className="min-w-0 text-lg font-semibold tracking-tight text-slate-400 wrap-anywhere">
                {customer}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
