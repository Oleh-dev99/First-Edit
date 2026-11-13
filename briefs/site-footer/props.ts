/** The footer of a company's marketing website. */
export interface Props {
  companyName: string;
  tagline: string;
  columns: LinkColumn[];
  newsletter: Newsletter;
  /** The copyright and legal line, e.g. "© 2026 Example Inc." */
  legal: string;
}

export interface LinkColumn {
  title: string;
  links: FooterLink[];
}

export interface FooterLink {
  label: string;
  /** Where the link points, e.g. "/pricing". */
  href: string;
}

export interface Newsletter {
  /** Invites visitors to sign up. */
  prompt: string;
  /** Label of the email field. */
  label: string;
  placeholder: string;
  buttonLabel: string;
}
