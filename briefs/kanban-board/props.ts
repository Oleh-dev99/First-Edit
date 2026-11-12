/** The task board of a project page. */
export interface Props {
  columns: Column[];
}

export interface Column {
  id: string;
  title: string;
  cards: Card[];
}

export interface Card {
  id: string;
  title: string;
  tags: string[];
  /** The assignee's name. */
  assignee: string;
  /** Already formatted, e.g. "Nov 18". */
  dueDate: string;
  commentCount: number;
}
