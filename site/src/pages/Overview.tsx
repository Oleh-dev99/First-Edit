import { pageUrl } from '../components/Layout.tsx';
import { Pair } from '../components/Pair.tsx';
import { Figure } from '../components/Rates.tsx';
import type { Cases, CaseEntry, Group, Run, Variant } from '../data.ts';

/**
 * The pair shown on this page: chosen by hand because it reads at a glance, not because it is typical. Labelled
 * broken in the blind calibration (set-01). The earlier choice, from hero-section, was superseded (D-059).
 */
const FEATURED = 'nemotron-3.5-free/pricing-table/hinted-s1/text-longword@320';

function pooled(run: Run, variant: Variant): Group | undefined {
  const groups = run.groups.filter((group) => group.variant === variant);
  return groups.find((group) => group.pooled) ?? (groups.length === 1 ? groups[0] : undefined);
}

/** The chosen pair; if the data no longer holds it, the first failed core case, and the caption says so. */
function featured(cases: Cases): { entry: CaseEntry | undefined; chosen: boolean } {
  const chosen = cases.cases.find((entry) => entry.id === FEATURED);
  if (chosen) return { entry: chosen, chosen: true };
  return { entry: cases.cases.find((entry) => entry.outcome === 'failed' && entry.tier === 'core'), chosen: false };
}

export function Overview({ run, cases }: { run: Run; cases: Cases }) {
  const { entry: shown, chosen } = featured(cases);
  const withCandidates = new Set(run.groups.filter((group) => !group.pooled).map((group) => group.model));
  const clean = run.groups.filter((group) => !group.pooled).reduce((sum, group) => sum + group.cleanBaseline, 0);
  return (
    <>
      <div className="max-w-[46rem]">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent-deep">A benchmark for UI code</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-[3.4rem] sm:leading-[1.08]">
          Does the layout survive the next edit?
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-ink-2">
          Benchmarks for AI-generated interfaces judge a component as it looks the moment it is generated. First Edit
          asks what happens next: when the content changes the way real content does, with longer text, a 30-letter
          word, an empty list or a phone-sized screen, does the layout still hold?
        </p>
      </div>

      <section aria-labelledby="headline-title" className="mt-14">
        <h2 id="headline-title" className="text-2xl font-semibold">
          How often a component broke
        </h2>
        <p className="mt-2 max-w-[42rem] text-ink-2">
          The share of components that broke at least once in a core case, pooled over the models with candidates so
          far ({withCandidates.size} of {run.models.length}), out of {clean} components that rendered cleanly before
          any change. Beside it, the same measure over every case, the extreme 60-letter words included.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {(['plain', 'hinted'] as const).map((variant) => {
            const group = pooled(run, variant);
            if (!group) return null;
            return (
              <article key={variant} className="border border-rule bg-card p-5 sm:p-6">
                <h3 className="font-sans text-lg font-semibold">
                  {variant === 'plain' ? 'Plain prompt' : 'Hinted prompt'}
                </h3>
                <p className="mt-1 text-sm text-muted md:min-h-[2.9em]">
                  {variant === 'plain'
                    ? 'The brief as it is.'
                    : 'The brief plus a short note that content varies and nothing may overflow, be cut off or overlap.'}
                </p>
                <div className="mt-5">
                  <Figure label="Broke at least once, core cases" count={group.brokeOnce.core.count}
                    of={group.brokeOnce.core.of} note="components" />
                </div>
                <div className="mt-5 border-t border-rule pt-4">
                  <Figure label="Broke at least once, all cases" count={group.brokeOnce.all.count}
                    of={group.brokeOnce.all.of} note="components" tone="neutral" size="small" />
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-4 max-w-[42rem] text-sm text-muted">
          Intervals are 95% Wilson intervals. With so few components they are wide; the{' '}
          <a href={pageUrl('results')}>results</a> give every model, the paired test of the hint and the decision
          lines, which are not evaluated until a model has finished its queued jobs.
        </p>
      </section>

      {shown && (
        <section aria-labelledby="pair-title" className="mt-16">
          <h2 id="pair-title" className="text-2xl font-semibold">
            What breaking looks like
          </h2>
          <p className="mt-2 max-w-[42rem] text-ink-2">
            One failed case,{' '}
            {chosen ? 'picked because it reads at a glance, not because it is typical' : 'the first in the gallery'}
            : {shown.description}{' '}
            ({shown.case}) in the {shown.brief} brief, by {shown.model} with the {shown.variant} prompt. The suite
            found: {shown.checks.join(', ')}.
          </p>
          <div className="mt-6">
            <Pair entry={shown} beforeLabel={shown.case.endsWith('@320') ? 'Before: phone width' : 'Before'}
              afterLabel={`After: ${shown.description}`} />
          </div>
          <p className="mt-4 text-sm text-muted">
            Every failed case is in the <a href={pageUrl('gallery')}>gallery</a>, beside a random sample of cases that
            passed.
          </p>
        </section>
      )}

      <section aria-labelledby="more-title" className="mt-16">
        <h2 id="more-title" className="text-2xl font-semibold">
          Read on
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            ['results', 'Results', 'Every model and prompt, per case and tier, with intervals.'],
            ['gallery', 'Gallery', 'Each failed case before and after, with what the suite found.'],
            ['method', 'Method', 'The prompt word for word, the cases, the checks, calibration and limits.'],
            ['briefs', 'Briefs', `The ${run.briefs.length} briefs and their hand-written reference components.`],
          ].map(([id, title, text]) => (
            <li key={id} className="border-t border-rule pt-3">
              <a href={pageUrl(id as 'results')} className="font-semibold">
                {title}
              </a>
              <p className="text-sm text-ink-2">{text}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
