/** One day of a person's calendar, as an agenda. */
export interface Props {
  /** Already formatted for display, e.g. "Thursday, 19 November". */
  dateLabel: string;
  /** In order of start time. */
  events: AgendaEvent[];
  /** Label of the button that adds an event. */
  addEventLabel: string;
}

export type TagColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';

export interface EventTag {
  label: string;
  color: TagColor;
}

export interface AgendaEvent {
  id: string;
  /** Already formatted for display, e.g. "9:30 AM". */
  start: string;
  /** Already formatted for display, e.g. "10:00 AM". */
  end: string;
  title: string;
  location: string;
  /** The names of the people attending. */
  attendees: string[];
  tag: EventTag;
}
