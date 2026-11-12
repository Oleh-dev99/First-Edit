/** The recent orders panel of a store dashboard. */
export interface Props {
  title: string;
  /** Shown under the title. */
  summary: string;
  /** ISO 4217 code used for every amount, e.g. "USD". */
  currency: string;
  orders: Order[];
}

export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'failed';

export interface Order {
  /** Order number shown to staff, e.g. "#10482". */
  id: string;
  customerName: string;
  email: string;
  status: OrderStatus;
  /** Order total, in the panel's currency. */
  amount: number;
  /** Already formatted for display, e.g. "Nov 11, 2026". */
  date: string;
}
