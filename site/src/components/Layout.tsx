import { useId, useState, type ReactNode } from 'react';
import { briefsWithoutComponent, url, type Run } from '../data.ts';

export type PageId = 'overview' | 'results' | 'gallery' | 'method' | 'briefs';

export const PAGES: { id: PageId; title: string; path: string }[] = [
  { id: 'overview', title: 'Overview', path: '' },
  { id: 'results', title: 'Results', path: 'results/' },
  { id: 'gallery', title: 'Gallery', path: 'gallery/' },
  { id: 'method', title: 'Method', path: 'method/' },
  { id: 'briefs', title: 'Briefs', path: 'briefs/' },
];

export const REPOSITORY = 'https://github.com/Oleh-dev99/First-Edit';
export const DECISIONS = `${REPOSITORY}/blob/main/docs/DECISIONS.md`;

/** What was run (D-057): said on every page, in the banner. */
export const FREE_TIER = 'Every model in the run is a free-tier variant, and no frontier model was tested.';

/** The names in the briefs and fixtures (D-058): on every page, in the footer, and on the Method page. */
export const NAMES_NOTICE =
  'All product, company and person names in the briefs and fixtures were invented for this benchmark. Any match ' +
  'with a real name is coincidental, and no real organisation or person is described.';

export function pageUrl(id: PageId, hash = ''): string {
  const page = PAGES.find((entry) => entry.id === id);
  return url(page ? page.path : '') + hash;
}

export function repoFile(path: string): string {
  return `${REPOSITORY}/blob/main/${path}`;
}

/** The status of the run, from run.json: preliminary until every model has finished its queued jobs. */
export function StatusBanner({ run }: { run: Run }) {
  const { finished, models, preliminary } = run.status;
  const without = briefsWithoutComponent(run).length;
  const coverage = without > 0
    ? ` Components so far cover ${run.briefs.length - without} of the ${run.briefs.length} briefs.`
    : '';
  return (
    <div className="border-b border-rule bg-wash" role="note" aria-label="Status of the results">
      <p className="mx-auto max-w-[72rem] px-4 py-2 text-sm text-ink-2 sm:px-6">
        {preliminary ? (
          <>
            <strong className="font-semibold text-accent-deep">
              Preliminary: {finished.length} of {models} models have finished.
            </strong>{' '}
            The run is not finished, so every number here can still change.{coverage} {FREE_TIER}
          </>
        ) : (
          <>
            <strong className="font-semibold">Complete: all {models} models have finished.</strong>{coverage}{' '}
            {FREE_TIER}
          </>
        )}
      </p>
    </div>
  );
}

export function Layout({ page, run, children }: { page: PageId; run: Run | null; children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded bg-card text-ink focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-baseline gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
          <a href={pageUrl('overview')} className="font-serif text-2xl font-semibold text-ink no-underline">
            First Edit
          </a>
          <nav aria-label="Pages">
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem]">
              {PAGES.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={pageUrl(entry.id)}
                    aria-current={entry.id === page ? 'page' : undefined}
                    className={
                      entry.id === page
                        ? 'font-semibold text-ink decoration-accent decoration-2'
                        : 'text-ink-2 no-underline hover:underline'
                    }
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      {run && <StatusBanner run={run} />}
      <main id="main" tabIndex={-1} className="mx-auto max-w-[72rem] px-4 pb-24 pt-10 sm:px-6">
        {children}
      </main>
      <footer className="border-t border-rule">
        <div className="mx-auto max-w-[72rem] px-4 py-8 text-sm text-muted sm:px-6">
          <p>
            <a href={REPOSITORY}>The repository</a> holds the code, the briefs and every decision (
            <a href={DECISIONS}>docs/DECISIONS.md</a>). Built with AI assistance: Claude for planning and
            Claude Code for implementation. This site loads nothing from other servers and tracks no one.
          </p>
          <p className="mt-2">{NAMES_NOTICE}</p>
        </div>
      </footer>
    </>
  );
}

/** A page heading with its standfirst. */
export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[46rem]">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {children && <div className="mt-4 text-lg text-ink-2">{children}</div>}
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-16 scroll-mt-6">
      <h2 id={`${id}-title`} className="border-t border-rule-strong pt-5 text-2xl font-semibold sm:text-[1.7rem]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A wide table with its caption above it, in a frame that scrolls sideways and can be reached by
 * keyboard. The caption stays outside the frame, so it never scrolls out of view with the table.
 */
export function TableFrame({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <figure className="mt-4">
      <figcaption id={id} className="max-w-[46rem] text-sm text-muted">
        {caption}
      </figcaption>
      <p className="mt-1 text-xs text-muted sm:hidden" aria-hidden="true">
        The table scrolls sideways.
      </p>
      <div className="relative mt-2 overflow-x-auto" role="region" aria-labelledby={id} tabIndex={0}>
        {children}
      </div>
    </figure>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="prose-block max-w-[42rem] text-ink-2">{children}</div>;
}

/**
 * A button that shows or hides more. Closed, its content is not in the page at all: a closed
 * <details> still lays its content out, at no height, where the suite's checks would measure it.
 */
export function Disclosure({ label, children }: { label: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-3">
      <button
        type="button"
        data-disclosure=""
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        className="cursor-pointer text-left text-sm font-semibold text-accent-deep hover:underline"
      >
        <span aria-hidden="true" className="mr-1 inline-block w-3">{open ? '−' : '+'}</span>
        {label}
      </button>
      {open && (
        <div id={id} className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}
