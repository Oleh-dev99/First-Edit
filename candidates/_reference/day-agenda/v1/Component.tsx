// Reference implementation for the day-agenda brief: a self-sized agenda
// panel. From 640px the times sit in a column on the start side; below it
// they sit above each event.

type TagColor = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';

interface EventTag {
  label: string;
  color: TagColor;
}

interface AgendaEvent {
  id: string;
  start: string;
  end: string;
  title: string;
  location: string;
  attendees: string[];
  tag: EventTag;
}

interface Props {
  dateLabel: string;
  events: AgendaEvent[];
  addEventLabel: string;
}

const TAG: Record<TagColor, { pill: string; bar: string }> = {
  blue: { pill: 'bg-sky-50 text-sky-700 ring-sky-600/20', bar: 'bg-sky-500' },
  green: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', bar: 'bg-emerald-500' },
  amber: { pill: 'bg-amber-50 text-amber-800 ring-amber-600/25', bar: 'bg-amber-400' },
  red: { pill: 'bg-rose-50 text-rose-700 ring-rose-600/20', bar: 'bg-rose-500' },
  purple: { pill: 'bg-violet-50 text-violet-700 ring-violet-600/20', bar: 'bg-violet-500' },
  gray: { pill: 'bg-slate-100 text-slate-700 ring-slate-500/20', bar: 'bg-slate-400' },
};

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="m7.539 14.841.003.003.002.002a.755.755 0 0 0 .912 0l.002-.002.003-.003.012-.009a5.57 5.57 0 0 0 .19-.153 15.588 15.588 0 0 0 2.046-2.082c1.101-1.362 2.291-3.342 2.291-5.597A5 5 0 0 0 3 7c0 2.255 1.19 4.235 2.292 5.597a15.591 15.591 0 0 0 2.046 2.082 8.916 8.916 0 0 0 .189.153l.012.01ZM8 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400">
      <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.156 11.763c.16-.629.44-1.21.813-1.72a2.5 2.5 0 0 0-2.725 1.377c-.136.287.102.58.418.58h1.449c.01-.08.025-.159.045-.237ZM12.847 11.763c.02.078.036.157.046.237h1.446c.316 0 .554-.293.417-.579a2.5 2.5 0 0 0-2.722-1.378c.374.51.653 1.09.813 1.72ZM14 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM3.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 13c-.552 0-1.013-.455-.876-.99a4.002 4.002 0 0 1 7.753 0c.136.535-.324.99-.877.99H5Z" />
    </svg>
  );
}

export default function DayAgenda({ dateLabel, events, addEventLabel }: Props) {
  return (
    <section className="w-full max-w-2xl rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 className="min-w-0 text-base font-semibold text-slate-900 wrap-anywhere">{dateLabel}</h2>
        <button
          type="button"
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          <span className="min-w-0 wrap-anywhere">{addEventLabel}</span>
        </button>
      </header>

      <ol className="divide-y divide-slate-100">
        {events.map((event) => {
          const tag = TAG[event.tag.color];
          return (
            <li key={event.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:gap-4 sm:px-6">
              <p className="text-sm text-slate-500 tabular-nums sm:w-24 sm:shrink-0">
                <time className="font-semibold text-slate-900 sm:block">{event.start}</time>
                <span className="sm:hidden">{' – '}</span>
                <time className="sm:block">{event.end}</time>
              </p>
              <div className="flex min-w-0 flex-1 gap-3">
                <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${tag.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-sm font-semibold text-slate-900 wrap-anywhere">{event.title}</p>
                    <span
                      className={`max-w-full rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset wrap-anywhere ${tag.pill}`}
                    >
                      {event.tag.label}
                    </span>
                  </div>
                  {event.location ? (
                    <p className="mt-1.5 flex gap-1.5 text-sm text-slate-600">
                      <PinIcon />
                      <span className="min-w-0 wrap-anywhere">{event.location}</span>
                    </p>
                  ) : null}
                  {event.attendees.length > 0 ? (
                    <p className="mt-1 flex gap-1.5 text-sm text-slate-600">
                      <PeopleIcon />
                      <span className="min-w-0 wrap-anywhere">{event.attendees.join(', ')}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
