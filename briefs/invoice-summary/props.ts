/** An invoice as the customer sees it before paying. */
export interface Props {
  invoiceNumber: string;
  /** Already formatted for display, e.g. "3 Nov 2026". */
  issueDate: string;
  /** Already formatted for display, e.g. "3 Dec 2026". */
  dueDate: string;
  /** ISO 4217 code used for every amount, e.g. "GBP". */
  currency: string;
  /** Who the invoice is from. */
  seller: Party;
  /** Who the invoice is billed to. */
  buyer: Party;
  lineItems: LineItem[];
  subtotal: number;
  /** Names the tax, e.g. "VAT (20%)". */
  taxLabel: string;
  tax: number;
  total: number;
  /** A note to the customer, e.g. payment terms. */
  note: string;
  /** Label of the pay button. */
  payLabel: string;
}

export interface Party {
  name: string;
  address: Address;
}

export interface Address {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Quantity times unit price. */
  amount: number;
}
