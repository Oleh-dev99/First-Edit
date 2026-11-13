/** The order summary on the last step of a checkout. */
export interface Props {
  title: string;
  /** ISO 4217 code used for every amount, e.g. "USD". */
  currency: string;
  items: OrderItem[];
  promo: PromoField;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  /** A note to the customer, e.g. about delivery or returns. */
  note: string;
  /** Label of the pay button. */
  payLabel: string;
}

export interface OrderItem {
  id: string;
  image: ItemImage;
  name: string;
  /** The chosen variant, e.g. "Size M · Olive". */
  variant: string;
  quantity: number;
  /** Price of the line: unit price times quantity. */
  price: number;
}

export interface ItemImage {
  src: string;
  alt: string;
}

export interface PromoField {
  label: string;
  placeholder: string;
  /** Label of the button that applies the code. */
  applyLabel: string;
}
