// Reference implementation for the pricing-table brief.

interface Plan {
  name: string;
  monthlyPrice: number;
  description: string;
  features: string[];
  ctaLabel: string;
  badge?: string;
  highlighted: boolean;
}

interface Props {
  heading: string;
  subheading: string;
  currency: string;
  plans: Plan[];
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-0.5 size-4 flex-none text-indigo-600">
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlanCard({ plan, currency }: { plan: Plan; currency: string }) {
  const { name, monthlyPrice, description, features, ctaLabel, badge, highlighted } = plan;
  return (
    <li
      className={`flex min-w-0 flex-col rounded-2xl bg-white p-6 sm:p-8 ${
        highlighted ? 'shadow-lg ring-2 ring-indigo-600' : 'ring-1 ring-slate-200'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 className={`min-w-0 text-lg font-semibold wrap-anywhere ${highlighted ? 'text-indigo-700' : 'text-slate-900'}`}>
          {name}
        </h3>
        {badge ? (
          <p className="min-w-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 wrap-anywhere">
            {badge}
          </p>
        ) : null}
      </div>
      {description ? <p className="mt-3 text-sm leading-6 text-slate-600 wrap-anywhere">{description}</p> : null}
      <p className="mt-6 flex flex-wrap items-baseline gap-x-1">
        <span className="min-w-0 text-4xl font-bold tracking-tight text-slate-900 tabular-nums wrap-anywhere">
          {formatPrice(monthlyPrice, currency)}
        </span>
        <span className="text-sm font-medium text-slate-500">/month</span>
      </p>
      {features.length > 0 ? (
        <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-700">
          {features.map((feature, index) => (
            <li key={index} className="flex gap-3">
              <CheckIcon />
              <span className="min-w-0 wrap-anywhere">{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-auto pt-8">
        <button
          type="button"
          className={`w-full rounded-lg px-3 py-2.5 text-center text-sm font-semibold wrap-anywhere ${
            highlighted
              ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500'
              : 'text-indigo-700 ring-1 ring-indigo-200 ring-inset hover:ring-indigo-300'
          }`}
        >
          {ctaLabel}
        </button>
      </div>
    </li>
  );
}

export default function PricingTable({ heading, subheading, currency, plans }: Props) {
  return (
    <section className="w-full bg-white px-4 py-16 sm:px-8 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-balance text-slate-900 wrap-anywhere sm:text-4xl">
          {heading}
        </h2>
        {subheading ? (
          <p className="mt-4 text-lg leading-8 text-pretty text-slate-600 wrap-anywhere">{subheading}</p>
        ) : null}
      </div>
      <ul className="mx-auto mt-12 grid max-w-6xl grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-6">
        {plans.map((plan, index) => (
          <PlanCard key={index} plan={plan} currency={currency} />
        ))}
      </ul>
    </section>
  );
}
