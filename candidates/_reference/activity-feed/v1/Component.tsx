// Reference implementation for the activity-feed brief: a full-width feed
// with the filters in the header and one row per event. Each event reads as
// a sentence; a comment sits under it in a quote box.

interface Filter {
  id: string;
  label: string;
  active: boolean;
}

interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
  comment: string | null;
}

interface Props {
  title: string;
  filters: Filter[];
  events: ActivityEvent[];
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
];

const firstLetter = (word: string | undefined): string => (word ? (Array.from(word)[0] ?? '') : '').toUpperCase();

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

/** A stable colour per name, so the same person always looks the same. */
function avatarColor(name: string): string {
  let sum = 0;
  for (const char of name) sum += char.codePointAt(0) ?? 0;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? 'bg-slate-100 text-slate-700';
}

export default function ActivityFeed({ title, filters, events }: Props) {
  return (
    <section className="w-full rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="min-w-0 text-base font-semibold text-slate-900 wrap-anywhere">{title}</h2>
        <div role="group" aria-label="Filter activity" className="flex min-w-0 flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={filter.active}
              className={`max-w-full min-w-0 rounded-full px-3 py-1 text-sm font-medium wrap-anywhere ${
                filter.active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-300 ring-inset hover:bg-slate-50'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      <ol className="divide-y divide-slate-100">
        {events.map((event) => (
          <li key={event.id} className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-6">
            <span
              aria-hidden="true"
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(event.actor)}`}
            >
              {initialsOf(event.actor)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="min-w-0 text-sm leading-6 text-slate-600 wrap-anywhere">
                  <span className="font-semibold text-slate-900">{event.actor}</span> {event.action}{' '}
                  <span className="font-medium text-slate-900">{event.target}</span>
                </p>
                <p className="shrink-0 text-xs text-slate-500">{event.time}</p>
              </div>
              {event.comment ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 ring-1 ring-slate-200 ring-inset wrap-anywhere">
                  {event.comment}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
