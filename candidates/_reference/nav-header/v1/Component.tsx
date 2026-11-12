// Reference implementation for the nav-header brief: a two-tier app header.
// The top row holds the brand, the primary action and the signed-in user;
// the links sit below as tabs that scroll sideways if they ever need to.

interface NavLink {
  label: string;
  href: string;
  active: boolean;
}

interface User {
  name: string;
  email: string;
}

interface Props {
  productName: string;
  links: NavLink[];
  ctaLabel: string;
  user: User;
}

const firstLetter = (text: string): string => (Array.from(text.trim())[0] ?? '').toUpperCase();

/** "Priya Raman" -> "PR"; without a name, the first letter of the email. */
function initialsOf({ name, email }: User): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return firstLetter(email) || '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5 shrink-0">
      <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
    </svg>
  );
}

export default function NavHeader({ productName, links, ctaLabel, user }: Props) {
  const primary = user.name.trim() !== '' ? user.name : user.email;
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="px-4 sm:px-6">
        <div className="flex items-center gap-4 py-3">
          <a href="/" className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white"
            >
              {firstLetter(productName)}
            </span>
            <span className="truncate text-base font-semibold text-slate-900">{productName}</span>
          </a>

          <div className="ms-auto flex shrink-0 items-center gap-3 sm:gap-5">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 p-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:py-2 sm:ps-2.5 sm:pe-3.5"
            >
              <PlusIcon />
              <span className="sr-only sm:not-sr-only sm:max-w-48 sm:truncate">{ctaLabel}</span>
            </button>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
              >
                {initialsOf(user)}
              </span>
              <div className="hidden max-w-48 min-w-0 sm:block">
                <p className="truncate text-sm font-medium text-slate-900">{primary}</p>
                {primary !== user.email ? <p className="truncate text-xs text-slate-500">{user.email}</p> : null}
              </div>
            </div>
          </div>
        </div>

        <nav aria-label="Main" className="-mb-px overflow-x-auto">
          <ul className="flex gap-x-6">
            {links.map((link, index) => (
              <li key={index} className="shrink-0">
                <a
                  href={link.href}
                  aria-current={link.active ? 'page' : undefined}
                  className={`block border-b-2 px-1 pt-1 pb-3 text-sm font-medium whitespace-nowrap ${
                    link.active
                      ? 'border-indigo-600 text-indigo-700'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
