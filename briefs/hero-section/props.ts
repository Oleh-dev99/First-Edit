/** The hero section at the top of a product landing page. */
export interface Props {
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  benefits: string[];
  /** Number of customers, e.g. 12400. */
  customerCount: number;
  /** Names of customer companies. */
  customers: string[];
}
