// Reference implementation for the team-directory brief: a full-width
// section with a header and a card per person. The cards fill as many
// columns as fit at a readable width, so larger text gets fewer columns;
// below 640px the avatar sits above the details to leave them the width.

type PresenceStatus = 'available' | 'busy' | 'away' | 'offline';

interface Person {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  email: string;
  status: PresenceStatus;
}

interface Props {
  heading: string;
  memberCount: number;
  people: Person[];
  addMemberLabel: string;
}

const STATUS: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
  available: { label: 'Available', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  busy: { label: 'Busy', dot: 'bg-rose-500', text: 'text-rose-700' },
  away: { label: 'Away', dot: 'bg-amber-400', text: 'text-amber-700' },
  offline: { label: 'Offline', dot: 'bg-slate-300', text: 'text-slate-500' },
};

const firstLetter = (word: string | undefined): string => (word ? (Array.from(word)[0] ?? '') : '').toUpperCase();

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

function BuildingIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400">
      <path
        fillRule="evenodd"
        d="M4 2a1.5 1.5 0 0 0-1.5 1.5v9.5H2a.5.5 0 0 0 0 1h12a.5.5 0 0 0 0-1h-.5V6.5A1.5 1.5 0 0 0 12 5h-2V3.5A1.5 1.5 0 0 0 8.5 2H4Zm1 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1H5Zm0 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1H5Zm0 3a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1H5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

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

export default function TeamDirectory({ heading, memberCount, people, addMemberLabel }: Props) {
  const number = new Intl.NumberFormat('en-US');

  return (
    <section className="w-full rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-slate-200 px-4 py-5 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="min-w-0 text-lg font-semibold text-slate-900 wrap-anywhere">{heading}</h2>
          <span className="max-w-full rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 tabular-nums wrap-anywhere">
            {number.format(memberCount)} {memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          <span className="min-w-0 wrap-anywhere">{addMemberLabel}</span>
        </button>
      </header>

      {people.length > 0 ? (
        <ul role="list" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4 p-4 sm:p-6">
          {people.map((person) => {
            const status = STATUS[person.status];
            return (
              <li
                key={person.id}
                className="flex min-w-0 flex-col gap-3 rounded-lg p-4 ring-1 ring-slate-200 sm:flex-row sm:gap-4"
              >
                <div className="relative size-12 shrink-0">
                  <span
                    aria-hidden="true"
                    className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700"
                  >
                    {initialsOf(person.name)}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute end-0 bottom-0 size-3.5 rounded-full ring-2 ring-white ${status.dot}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900 wrap-anywhere">{person.name}</p>
                  {person.role ? <p className="text-sm text-slate-600 wrap-anywhere">{person.role}</p> : null}
                  <p className={`mt-1 text-xs font-medium ${status.text}`}>{status.label}</p>
                  {person.department || person.location ? (
                    <ul role="list" className="mt-3 space-y-1 text-sm text-slate-600">
                      {person.department ? (
                        <li className="flex gap-2">
                          <BuildingIcon />
                          <span className="min-w-0 wrap-anywhere">{person.department}</span>
                        </li>
                      ) : null}
                      {person.location ? (
                        <li className="flex gap-2">
                          <PinIcon />
                          <span className="min-w-0 wrap-anywhere">{person.location}</span>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                  <a
                    href={`mailto:${person.email}`}
                    className="mt-2 block text-sm font-medium text-indigo-600 hover:text-indigo-500 wrap-anywhere"
                  >
                    {person.email}
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
