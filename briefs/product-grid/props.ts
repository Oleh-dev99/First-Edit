/** The product listing of a shop's category page. */
export interface Props {
  heading: string;
  /** e.g. "Showing 6 of 48 products" */
  resultsSummary: string;
  /** ISO 4217 code used for every price, e.g. "USD". */
  currency: string;
  products: Product[];
}

export interface Product {
  id: string;
  name: string;
  image: ProductImage;
  price: number;
  /** The price before the sale, present when the product is on sale. */
  originalPrice?: number;
  /** Average rating from 0 to 5. */
  rating: number;
  reviewCount: number;
  tags: string[];
  /** Label of the add-to-cart button. */
  ctaLabel: string;
}

export interface ProductImage {
  /** Path of the image, e.g. "/fe-assets/placeholder-1x1.svg". */
  src: string;
  /** Text alternative for the image. */
  alt: string;
}
