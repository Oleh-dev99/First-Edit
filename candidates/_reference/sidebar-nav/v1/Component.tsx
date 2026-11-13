// Reference implementation for the sidebar-nav brief: a self-sized sidebar
// panel with the workspace at the top, the sections in the middle and the
// signed-in user at the bottom. Labels move onto further lines rather than
// pushing the counts out of the panel.

interface NavLink {
  label: string;
  href: string;
  count: number | null;
  active: boolean;
}

interface NavSection {
  title: string;
  links: NavLink[];
}

interface SidebarUser {
  name: string;
  role: string;
}

interface Props {
  workspaceName: string;
  sections: NavSection[];
  user: SidebarUser;
}

const firstLetter = (word: string | undefined): string => (word ? (Array.from(word)[0] ?? '') : '').toUpperCase();

/** "Ines Carvalho" -> "IC". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return '?';
  return firstLetter(words[0]) + (words.length > 1 ? firstLetter(words[words.length - 1]) : '');
}

export default function Sidebar({ workspaceName, sections, user }: Props) {
  const number = new Intl.NumberFormat('en-US');

  return (
    <aside className="flex w-full max-w-72 flex-col rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white"
        >
          {firstLetter(workspaceName.trim()) || '?'}
        </span>
        <span className="min-w-0 text-sm font-semibold text-slate-900 wrap-anywhere">{workspaceName}</span>
      </div>

      <nav aria-label="Sidebar" className="flex-1 space-y-6 px-3 py-4">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            {section.title ? (
              <h3 className="px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase wrap-anywhere">
                {section.title}
              </h3>
            ) : null}
            <ul role="list" className={`${section.title ? 'mt-2' : ''} space-y-0.5`}>
              {section.links.map((link, linkIndex) => (
                <li key={linkIndex}>
                  <a
                    href={link.href}
                    aria-current={link.active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm font-medium ${
                      link.active
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1 wrap-anywhere">{link.label}</span>
                    {link.count !== null ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          link.active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {number.format(link.count)}
                      </span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-4">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
        >
          {initialsOf(user.name)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 wrap-anywhere">{user.name}</p>
          {user.role ? <p className="text-xs text-slate-500 wrap-anywhere">{user.role}</p> : null}
        </div>
      </div>
    </aside>
  );
}
