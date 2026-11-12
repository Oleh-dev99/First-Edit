// Reference implementation for the data-table brief.

type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';

interface Order {
  id: string;
  customerName: string;
  email: string;
  status: OrderStatus;
  amount: number;
  date: string;
}

interface Props {
  title: string;
  summary: string;
  currency: string;
  orders: Order[];
}

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-600/25' },
  refunded: { label: 'Refunded', className: 'bg-slate-100 text-slate-700 ring-slate-500/20' },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700 ring-red-600/20' },
};

function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, className } = STATUS[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}>
      {label}
    </span>
  );
}

export default function RecentOrders({ title, summary, currency, orders }: Props) {
  const money = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <section className="w-full rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="border-b border-slate-200 px-4 py-5 sm:px-6">
        <h2 className="text-base font-semibold text-slate-900 wrap-anywhere">{title}</h2>
        {summary ? <p className="mt-1 text-sm text-slate-600 wrap-anywhere">{summary}</p> : null}
      </header>

      {/* Narrow screens: one block per order. */}
      <ul className="divide-y divide-slate-100 sm:hidden">
        {orders.map((order) => (
          <li key={order.id} className="px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 text-sm font-medium text-slate-900 wrap-anywhere">{order.customerName}</p>
              <p className="ms-auto min-w-0 text-sm font-medium text-slate-900 tabular-nums wrap-anywhere">
                {money.format(order.amount)}
              </p>
            </div>
            <p className="text-sm text-slate-500 wrap-anywhere">{order.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700 wrap-anywhere">{order.id}</span>
              <span>{order.date}</span>
              <StatusBadge status={order.status} />
            </div>
          </li>
        ))}
      </ul>

      {/* Wider screens: a table that scrolls sideways when it needs more room than it has. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-6 py-3 text-start font-medium">Order</th>
              <th scope="col" className="px-6 py-3 text-start font-medium">Customer</th>
              <th scope="col" className="px-6 py-3 text-start font-medium">Status</th>
              <th scope="col" className="px-6 py-3 text-start font-medium">Date</th>
              <th scope="col" className="px-6 py-3 text-end font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id}>
                <td className="px-6 py-4 font-medium whitespace-nowrap text-slate-900">{order.id}</td>
                <td className="min-w-48 px-6 py-4">
                  <div className="font-medium text-slate-900 wrap-anywhere">{order.customerName}</div>
                  <div className="text-slate-500 wrap-anywhere">{order.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={order.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-slate-500">{order.date}</td>
                <td className="px-6 py-4 text-end font-medium whitespace-nowrap text-slate-900 tabular-nums">
                  {money.format(order.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
