/** The top navigation bar of a web app. */
export interface Props {
  productName: string;
  links: NavLink[];
  /** Label of the primary call-to-action button. */
  ctaLabel: string;
  /** The signed-in user. */
  user: User;
}

export interface NavLink {
  label: string;
  /** Where the link points, e.g. "/reports". */
  href: string;
  /** True for the link to the current page. */
  active: boolean;
}

export interface User {
  name: string;
  email: string;
}
