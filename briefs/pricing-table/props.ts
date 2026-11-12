/** The pricing section of a marketing page. */
export interface Props {
  heading: string;
  subheading: string;
  /** ISO 4217 code used for every price, e.g. "USD". */
  currency: string;
  plans: Plan[];
}

export interface Plan {
  /** Plan name, e.g. "Team". */
  name: string;
  /** Price per month, in the section's currency. */
  monthlyPrice: number;
  /** Who the plan is for. */
  description: string;
  /** Included features, in display order. */
  features: string[];
  /** Label of the plan's call-to-action button. */
  ctaLabel: string;
  /** Optional badge label, e.g. "Most popular". */
  badge?: string;
  /** True for the plan to recommend. */
  highlighted: boolean;
}
