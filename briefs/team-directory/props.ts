/** The team directory of a company intranet. */
export interface Props {
  heading: string;
  /** The number of members in the whole directory. */
  memberCount: number;
  people: Person[];
  /** Label of the button that adds a member. */
  addMemberLabel: string;
}

export type PresenceStatus = 'available' | 'busy' | 'away' | 'offline';

export interface Person {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  email: string;
  status: PresenceStatus;
}
