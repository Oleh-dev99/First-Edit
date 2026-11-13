/** The sidebar navigation of a web app. */
export interface Props {
  workspaceName: string;
  sections: NavSection[];
  /** The signed-in user. */
  user: SidebarUser;
}

export interface NavSection {
  title: string;
  links: NavLink[];
}

export interface NavLink {
  label: string;
  /** Where the link points, e.g. "/tasks". */
  href: string;
  /** A number shown with the label, e.g. open tasks; null when the link has none. */
  count: number | null;
  /** True for the link to the current page. */
  active: boolean;
}

export interface SidebarUser {
  name: string;
  role: string;
}
