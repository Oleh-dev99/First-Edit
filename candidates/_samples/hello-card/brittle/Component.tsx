// Hand-written sample for the hello-card brief, written carelessly on
// purpose. At the baseline fixture and 1280px it looks the same as the
// robust card, but:
// - the card has a fixed width of 384px
// - the name is nowrap, never truncated, in a flex row (kept "for a badge
//   later") whose item has no min-w-0
// - the job title has a fixed one-line height and overflow visible
// - the bio has a fixed height sized for the baseline text, overflow hidden

interface HelloCardProps {
  name: string;
  jobTitle: string;
  bio: string;
}

export default function HelloCard({ name, jobTitle, bio }: HelloCardProps) {
  const initials = name
    .split(' ')
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
  return (
    <article className="w-[384px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold whitespace-nowrap text-slate-900">{name}</h2>
          </div>
          <p className="h-5 text-sm text-slate-600">{jobTitle}</p>
        </div>
      </div>
      <p className="mt-4 h-[72px] overflow-hidden text-sm leading-6 text-slate-700">{bio}</p>
      <button
        type="button"
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Follow
      </button>
    </article>
  );
}
