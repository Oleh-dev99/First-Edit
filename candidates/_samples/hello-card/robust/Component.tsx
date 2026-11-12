// Hand-written sample for the hello-card brief, built to survive content
// changes: the text column can shrink (min-w-0), long words wrap
// (wrap-anywhere), the avatar never shrinks, the tags wrap, the follower
// count has a minimum width but no maximum, and the button spans the card.

interface HelloCardProps {
  name: string;
  jobTitle: string;
  bio: string;
  followers: number;
  skills: string[];
}

/** First letter of the first and last word, e.g. "Maya Okafor" -> "MO". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? '') : '';
  return (first + last).toUpperCase();
}

const standard = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "2,418" below 100,000, compact above: "12.3M". */
function formatCount(count: number): string {
  return Math.abs(count) < 100_000 ? standard.format(count) : compact.format(count);
}

export default function HelloCard({ name, jobTitle, bio, followers, skills }: HelloCardProps) {
  const initials = initialsOf(name);
  return (
    <article className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-700"
        >
          {initials === '' ? '?' : initials}
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 wrap-anywhere">{name}</h2>
          <p className="text-sm text-slate-600 wrap-anywhere">{jobTitle}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700 wrap-anywhere">{bio}</p>
      {skills.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {skills.map((skill, index) => (
            <li
              key={index}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 wrap-anywhere"
            >
              {skill}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex flex-wrap items-baseline gap-x-1 text-sm text-slate-600">
        <span className="min-w-12 font-semibold text-slate-900 tabular-nums">{formatCount(followers)}</span>
        <span>followers</span>
      </p>
      <button
        type="button"
        className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        Follow
      </button>
    </article>
  );
}
