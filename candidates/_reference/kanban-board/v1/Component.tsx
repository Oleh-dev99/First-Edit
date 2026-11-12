// Reference implementation for the kanban-board brief. Columns keep a
// steady width and the board scrolls sideways when they do not all fit.

interface Card {
  id: string;
  title: string;
  tags: string[];
  assignee: string;
  dueDate: string;
  commentCount: number;
}

interface Column {
  id: string;
  title: string;
  cards: Card[];
}

interface Props {
  columns: Column[];
}

const count = new Intl.NumberFormat('en-US');

const firstLetter = (text: string): string => (Array.from(text.trim())[0] ?? '').toUpperCase();

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902.848.137 1.705.248 2.57.331v3.443a.75.75 0 0 0 1.28.53l3.58-3.579a.78.78 0 0 1 .527-.224 41.202 41.202 0 0 0 5.183-.5c1.437-.232 2.43-1.49 2.43-2.903V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0 0 10 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TaskCard({ card }: { card: Card }) {
  const assigned = card.assignee.trim() !== '';
  return (
    <li className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200">
      {card.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {card.tags.map((tag, index) => (
            <li key={index} className="min-w-0 rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 wrap-anywhere">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-sm font-medium text-slate-900 wrap-anywhere">{card.title}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-500">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold ${
              assigned ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400'
            }`}
          >
            {assigned ? initialsOf(card.assignee) : '?'}
          </span>
          <span className={`min-w-0 wrap-anywhere ${assigned ? 'text-slate-700' : 'italic'}`}>
            {assigned ? card.assignee : 'Unassigned'}
          </span>
        </span>
        <span className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <CalendarIcon />
            <span>{card.dueDate}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <CommentIcon />
            <span className="tabular-nums wrap-anywhere">{count.format(card.commentCount)}</span>
            <span className="sr-only">comments</span>
          </span>
        </span>
      </div>
    </li>
  );
}

export default function KanbanBoard({ columns }: Props) {
  return (
    <section className="w-full rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      {/* relative: the scroller is the containing block of everything inside it, so
          absolutely positioned content (such as screen-reader text) scrolls with it
          instead of widening the page. */}
      <ol className="relative flex items-start gap-4 overflow-x-auto pb-2">
        {columns.map((column) => (
          // At most 85% of the board, so on narrow screens a whole column fits and the next one peeks in.
          <li key={column.id} className="flex w-[min(18rem,85%)] shrink-0 flex-col rounded-xl bg-slate-100 p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="min-w-0 text-sm font-semibold text-slate-900 wrap-anywhere">{column.title}</h3>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 tabular-nums ring-1 ring-slate-200">
                {column.cards.length}
              </span>
            </div>
            {column.cards.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {column.cards.map((card) => (
                  <TaskCard key={card.id} card={card} />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
