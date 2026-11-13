// Reference implementation for the site-footer brief: a full-width dark
// footer. From 1024px the company and the newsletter sign-up take one
// column and the link columns the other two; the link columns share the
// width in as many columns as fit (two on a phone).

import { useId } from 'react';

interface FooterLink {
  label: string;
  href: string;
}

interface LinkColumn {
  title: string;
  links: FooterLink[];
}

interface Newsletter {
  prompt: string;
  label: string;
  placeholder: string;
  buttonLabel: string;
}

interface Props {
  companyName: string;
  tagline: string;
  columns: LinkColumn[];
  newsletter: Newsletter;
  legal: string;
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="size-8 shrink-0">
      <rect width="32" height="32" rx="8" className="fill-indigo-500" />
      <path d="M9 11l3.5 11L16 13l3.5 9L23 11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function SiteFooter({ companyName, tagline, columns, newsletter, legal }: Props) {
  const emailId = useId();

  return (
    <footer className="w-full bg-slate-900 text-slate-300">
      <div className="mx-auto max-w-7xl px-6 pt-14 pb-8 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="min-w-0 space-y-8">
            <div>
              <p className="flex items-center gap-3 text-lg font-semibold text-white">
                <LogoMark />
                <span className="min-w-0 wrap-anywhere">{companyName}</span>
              </p>
              {tagline ? <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400 wrap-anywhere">{tagline}</p> : null}
            </div>

            <form className="max-w-sm" onSubmit={(event) => event.preventDefault()}>
              {newsletter.prompt ? (
                <p className="text-sm font-semibold text-white wrap-anywhere">{newsletter.prompt}</p>
              ) : null}
              <label
                htmlFor={emailId}
                className={`${newsletter.prompt ? 'mt-4' : ''} block text-sm text-slate-400 wrap-anywhere`}
              >
                {newsletter.label}
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  placeholder={newsletter.placeholder}
                  className="min-w-0 flex-[1_1_12rem] rounded-lg bg-white/5 px-3 py-2 text-sm text-ellipsis text-white ring-1 ring-white/15 ring-inset placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="max-w-full min-w-0 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 wrap-anywhere"
                >
                  {newsletter.buttonLabel}
                </button>
              </div>
            </form>
          </div>

          {columns.length > 0 ? (
            <nav
              aria-label="Footer"
              className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-x-6 gap-y-10"
            >
              {columns.map((column, columnIndex) => (
                <div key={columnIndex} className="min-w-0">
                  <h3 className="text-sm font-semibold text-white wrap-anywhere">{column.title}</h3>
                  <ul role="list" className="mt-4 space-y-3">
                    {column.links.map((link, linkIndex) => (
                      <li key={linkIndex} className="text-sm wrap-anywhere">
                        <a href={link.href} className="text-slate-400 hover:text-white">
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          ) : null}
        </div>

        {legal ? (
          <p className="mt-12 border-t border-white/10 pt-8 text-xs leading-5 text-slate-500 wrap-anywhere">{legal}</p>
        ) : null}
      </div>
    </footer>
  );
}
