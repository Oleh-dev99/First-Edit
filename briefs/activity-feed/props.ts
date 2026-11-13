/** The activity feed of a team workspace. */
export interface Props {
  title: string;
  filters: Filter[];
  /** Newest first. */
  events: ActivityEvent[];
}

export interface Filter {
  id: string;
  label: string;
  /** True for the selected filter. */
  active: boolean;
}

export interface ActivityEvent {
  id: string;
  /** The name of the person who did something. */
  actor: string;
  /** What they did, e.g. "commented on". */
  action: string;
  /** The name of what they did it to, e.g. a task. */
  target: string;
  /** Already formatted for display, e.g. "2 hours ago". */
  time: string;
  /** What the actor wrote, or null when they left no comment. */
  comment: string | null;
}
