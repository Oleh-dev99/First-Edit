// Hand-written sample for the hello-card brief, built to survive content
// changes: the text column can shrink (min-w-0), long words wrap
// (wrap-anywhere), the avatar never shrinks and the button spans the card.

interface HelloCardProps {
  initials: string;
  name: string;
  jobTitle: string;
  bio: string;
}

export default function HelloCard({ initials, name, jobTitle, bio }: HelloCardProps) {
  return (
    <article className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 wrap-anywhere">{name}</h2>
          <p className="text-sm text-slate-600 wrap-anywhere">{jobTitle}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700 wrap-anywhere">{bio}</p>
      <button
        type="button"
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Follow
      </button>
    </article>
  );
}
