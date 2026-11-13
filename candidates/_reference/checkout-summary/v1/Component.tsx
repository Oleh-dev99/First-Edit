// Reference implementation for the checkout-summary brief: a self-sized
// order summary panel with the items, the promo code field, the totals and
// the pay button.

import { useId } from 'react';

interface ItemImage {
  src: string;
  alt: string;
}

interface OrderItem {
  id: string;
  image: ItemImage;
  name: string;
  variant: string;
  quantity: number;
  price: number;
}

interface PromoField {
  label: string;
  placeholder: string;
  applyLabel: string;
}

interface Props {
  title: string;
  currency: string;
  items: OrderItem[];
  promo: PromoField;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  note: string;
  payLabel: string;
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${
        strong ? 'border-t border-slate-200 pt-3 text-base font-semibold text-slate-900' : 'text-sm'
      }`}
    >
      <dt className={strong ? '' : 'text-slate-600'}>{label}</dt>
      <dd className={`ms-auto min-w-0 tabular-nums wrap-anywhere ${strong ? '' : 'font-medium text-slate-900'}`}>{value}</dd>
    </div>
  );
}

export default function OrderSummary({
  title,
  currency,
  items,
  promo,
  subtotal,
  shipping,
  tax,
  total,
  note,
  payLabel,
}: Props) {
  const titleId = useId();
  const promoId = useId();
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const count = new Intl.NumberFormat('en-US');

  return (
    <section aria-labelledby={titleId} className="w-full max-w-md rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <h2
        id={titleId}
        className="border-b border-slate-200 px-5 py-4 text-lg font-semibold text-slate-900 wrap-anywhere sm:px-6"
      >
        {title}
      </h2>

      <ul role="list" className="divide-y divide-slate-100 px-5 sm:px-6">
        {items.map((item) => (
          <li key={item.id} className="flex gap-4 py-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
              <img src={item.image.src} alt={item.image.alt} className="size-full object-cover" />
            </div>
            <div className="flex min-w-0 flex-1 gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 wrap-anywhere">{item.name}</p>
                {item.variant ? <p className="mt-0.5 text-sm text-slate-500 wrap-anywhere">{item.variant}</p> : null}
                <p className="mt-1 text-sm text-slate-500 tabular-nums wrap-anywhere">Qty {count.format(item.quantity)}</p>
              </div>
              {/* The price keeps the top end of the row; a very large amount wraps within 45% of it. */}
              <p className="max-w-[45%] min-w-0 text-end text-sm font-medium text-slate-900 tabular-nums wrap-anywhere">
                {money.format(item.price)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
        <label htmlFor={promoId} className="block text-sm font-medium text-slate-900 wrap-anywhere">
          {promo.label}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={promoId}
            type="text"
            autoComplete="off"
            placeholder={promo.placeholder}
            className="min-w-0 flex-[1_1_10rem] rounded-lg bg-white px-3 py-2 text-sm text-ellipsis text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
          />
          <button
            type="button"
            className="max-w-full min-w-0 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 ring-inset hover:bg-slate-50 wrap-anywhere"
          >
            {promo.applyLabel}
          </button>
        </div>
      </div>

      <dl className="space-y-2 border-t border-slate-200 px-5 py-4 sm:px-6">
        <TotalRow label="Subtotal" value={money.format(subtotal)} />
        <TotalRow label="Shipping" value={money.format(shipping)} />
        <TotalRow label="Tax" value={money.format(tax)} />
        <TotalRow label="Total" value={money.format(total)} strong />
      </dl>

      <div className="space-y-4 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-5 sm:px-6">
        {note ? <p className="text-sm leading-6 text-slate-600 wrap-anywhere">{note}</p> : null}
        <button
          type="button"
          className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 wrap-anywhere"
        >
          {payLabel}
        </button>
      </div>
    </section>
  );
}
