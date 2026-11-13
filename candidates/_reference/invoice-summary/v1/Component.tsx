// Reference implementation for the invoice-summary brief: a self-sized
// invoice document. Line items are a table from 640px up and one block per
// item below it; the table scrolls sideways inside the invoice if it ever
// needs more room than it has.

interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

interface Party {
  name: string;
  address: Address;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface Props {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  seller: Party;
  buyer: Party;
  lineItems: LineItem[];
  subtotal: number;
  taxLabel: string;
  tax: number;
  total: number;
  note: string;
  payLabel: string;
}

function PartyBlock({ heading, party }: { heading: string; party: Party }) {
  const { street, city, postalCode, country } = party.address;
  const cityLine = [city, postalCode].filter((part) => part !== '').join(' ');
  return (
    <div className="min-w-0">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{heading}</h2>
      <p className="mt-2 text-sm font-semibold text-slate-900 wrap-anywhere">{party.name}</p>
      <address className="mt-1 text-sm leading-6 text-slate-600 not-italic wrap-anywhere">
        {street ? <span className="block">{street}</span> : null}
        {cityLine ? <span className="block">{cityLine}</span> : null}
        {country ? <span className="block">{country}</span> : null}
      </address>
    </div>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 ${
        strong ? 'border-t border-slate-200 pt-3 text-base font-semibold text-slate-900' : 'text-sm'
      }`}
    >
      <dt className={`min-w-0 wrap-anywhere ${strong ? '' : 'text-slate-600'}`}>{label}</dt>
      <dd className={`ms-auto min-w-0 tabular-nums wrap-anywhere ${strong ? '' : 'font-medium text-slate-900'}`}>{value}</dd>
    </div>
  );
}

export default function Invoice({
  invoiceNumber,
  issueDate,
  dueDate,
  currency,
  seller,
  buyer,
  lineItems,
  subtotal,
  taxLabel,
  tax,
  total,
  note,
  payLabel,
}: Props) {
  const money = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const count = new Intl.NumberFormat('en-GB');

  return (
    <article className="w-full max-w-3xl rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-slate-200 px-5 py-6 sm:px-8">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">Invoice</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 wrap-anywhere">{invoiceNumber}</h1>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Issued</dt>
          <dd className="font-medium text-slate-900">{issueDate}</dd>
          <dt className="text-slate-500">Due</dt>
          <dd className="font-medium text-slate-900">{dueDate}</dd>
        </dl>
      </header>

      <div className="grid gap-6 px-5 py-6 sm:grid-cols-2 sm:px-8">
        <PartyBlock heading="From" party={seller} />
        <PartyBlock heading="Billed to" party={buyer} />
      </div>

      {/* Below 640px: one block per line item. */}
      <ul role="list" className="divide-y divide-slate-100 border-y border-slate-200 sm:hidden">
        {lineItems.map((item) => (
          <li key={item.id} className="px-5 py-4">
            <p className="text-sm font-medium text-slate-900 wrap-anywhere">{item.description}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm tabular-nums">
              <p className="min-w-0 text-slate-500 wrap-anywhere">
                {count.format(item.quantity)} × {money.format(item.unitPrice)}
              </p>
              <p className="ms-auto min-w-0 font-medium text-slate-900 wrap-anywhere">{money.format(item.amount)}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* From 640px: a table. */}
      <div className="hidden overflow-x-auto border-y border-slate-200 sm:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="py-3 ps-8 pe-4 text-start font-medium">
                Description
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                Qty
              </th>
              <th scope="col" className="px-4 py-3 text-end font-medium">
                Unit price
              </th>
              <th scope="col" className="py-3 ps-4 pe-8 text-end font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lineItems.map((item) => (
              <tr key={item.id}>
                <td className="min-w-48 py-4 ps-8 pe-4 text-slate-900 wrap-anywhere">{item.description}</td>
                <td className="px-4 py-4 text-end whitespace-nowrap text-slate-600 tabular-nums">
                  {count.format(item.quantity)}
                </td>
                <td className="px-4 py-4 text-end whitespace-nowrap text-slate-600 tabular-nums">
                  {money.format(item.unitPrice)}
                </td>
                <td className="py-4 ps-4 pe-8 text-end font-medium whitespace-nowrap text-slate-900 tabular-nums">
                  {money.format(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-5 py-6 sm:px-8">
        <dl className="w-full space-y-2 sm:max-w-xs">
          <TotalRow label="Subtotal" value={money.format(subtotal)} />
          <TotalRow label={taxLabel} value={money.format(tax)} />
          <TotalRow label="Total due" value={money.format(total)} strong />
        </dl>
      </div>

      <footer className="flex flex-col gap-4 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        {note ? <p className="min-w-0 flex-1 text-sm leading-6 text-slate-600 wrap-anywhere">{note}</p> : null}
        <button
          type="button"
          className="min-w-0 self-start rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 wrap-anywhere sm:ms-auto sm:max-w-sm sm:self-auto"
        >
          {payLabel}
        </button>
      </footer>
    </article>
  );
}
