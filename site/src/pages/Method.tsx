import type { ReactNode } from 'react';
import {
  DECISIONS, FREE_TIER, NAMES_NOTICE, PageHead, Prose, REPOSITORY, Section, TableFrame, pageUrl, repoFile,
} from '../components/Layout.tsx';
import { RateCells, RateHeads } from '../components/Rates.tsx';
import { exact, pct, range, type Briefs, type Calibration, type RateSet, type Run, type Share } from '../data.ts';

/** How each change is made, as docs/SPEC.md defines it. */
const CHANGES: [string, string][] = [
  ['text-long', 'Every label and prose value grows by the lower bound of IBM’s translation expansion table: up to 10 characters +100%, 11 to 20 +80%, 21 to 30 +60%, 31 to 50 +40%, 51 to 70 +31%, over 70 +30%. Values with spaces grow by whole words; a single word grows by repeating its own letters, cut at the target length.'],
  ['text-longword', 'In every label and prose value, the longest word is replaced by one 30-letter word, the length of a long compound word, surname or identifier.'],
  ['text-unbroken', 'The same with a 60-letter word, a hard limit that few real values reach: the extreme tier.'],
  ['text-empty', 'Every label and prose value that is not required becomes empty.'],
  ['list-0', 'Every list that may be empty becomes empty.'],
  ['list-1', 'Every list keeps only its first item.'],
  ['list-many', 'Every list is repeated to ten times its length, within its maximum.'],
  ['number-large', 'Whole numbers become 1234567890, others 1234567.89.'],
  ['viewport-320', 'The screen is 320 px wide instead of 1280.'],
  ['text-200pct', 'The root font size is 32 px, as when a browser’s text size is set to 200%.'],
  ['dir-rtl', 'The page is right to left.'],
];

const CHECKS: [string, ReactNode][] = [
  ['page-overflow-x', 'The page becomes wider than the screen by more than 1 px, so it scrolls sideways.'],
  ['text-clipped', <>Text runs past the edge of a box that hides its overflow. Cut with an ellipsis or a line clamp, it is recorded as info, not an error: truncation is a deliberate way to handle long content. A box that scrolls never counts.</>],
  ['content-spill', 'Text, an image or a control, or a box with a visible background, border, shadow or outline, extends past the nearest box around it that has one, by more than 2 px sideways or 1 px vertically. Content positioned absolutely or fixed is exempt.'],
  ['text-overlap', 'A line of text overlaps text, an image or a control of another element, by more than 2 px wide and 0.3 times the font size tall.'],
  ['off-screen', 'Content is cut off by the edge of the screen where it cannot be scrolled to: past the left edge (the right one in a right-to-left page), or out of a fixed header.'],
];

function Pre({ label, children }: { label: string; children: string }) {
  return (
    <figure className="mt-4">
      <figcaption className="text-sm font-semibold text-ink-2">{label}</figcaption>
      <pre className="ids mt-1 max-h-[28rem] overflow-auto whitespace-pre-wrap border border-rule bg-card p-4 text-[0.82rem] leading-relaxed text-ink"
        tabIndex={0} aria-label={label}>
        {children}
      </pre>
    </figure>
  );
}

function RateRow({ name, every, unguided }: { name: string; every: Share; unguided?: Share }) {
  return (
    <tr>
      <th scope="row" className="font-normal">{name}</th>
      <RateCells count={every.count} of={every.of} />
      {unguided ? <RateCells count={unguided.count} of={unguided.of} tone="neutral" /> : <td colSpan={4} />}
    </tr>
  );
}

function CalibrationTable({ label, precision, miss, unguidedPrecision, unguidedMiss }: {
  label: string;
  precision: RateSet;
  miss: { all: Share } & Record<string, Share>;
  unguidedPrecision: RateSet;
  unguidedMiss: { all: Share } & Record<string, Share>;
}) {
  return (
    <TableFrame caption={<>{label}: the share labelled broken, over all items and over the unguided items, with 95% Wilson intervals.</>}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">items</th>
            <RateHeads label="all items: broken" />
            <RateHeads label="unguided: broken" />
          </tr>
        </thead>
        <tbody>
          <RateRow name="precision: failed by the suite" every={precision.all} unguided={unguidedPrecision.all} />
          <RateRow name="precision: failed, core cases" every={precision.core} unguided={unguidedPrecision.core} />
          <RateRow name="precision: failed, extreme cases" every={precision.extreme} unguided={unguidedPrecision.extreme} />
          <RateRow name="miss rate: passed by the suite" every={miss.all} unguided={unguidedMiss.all} />
        </tbody>
      </table>
    </TableFrame>
  );
}

function CalibrationSection({ calibration }: { calibration: Calibration }) {
  const { precision, missRate, unguided, guided, adjudication, selfConsistency } = calibration;
  const disagreements = calibration.disagreements.failedNotBroken.length + calibration.disagreements.passedBroken.length;
  const consistency = exact(selfConsistency.count, selfConsistency.of);
  return (
    <>
      <Prose>
        <p>
          Do the checks find what a person would call broken? One labeller, the project&rsquo;s owner, labelled a
          stratified random sample of the cases blind: two clean screenshots per item, the brief and the change in
          plain words, and nothing of what the suite found. Labellers: {calibration.labellers}. Set {calibration.set}{' '}
          has {calibration.items.total} items, {calibration.items.primary} cases and {calibration.items.repeats}{' '}
          repeats to measure consistency. The full procedure is in{' '}
          <a href={repoFile('docs/LABELLING.md')}>docs/LABELLING.md</a>.
        </p>
        <p>
          {guided.items.length} items were {guided.reason ?? 'discussed with someone before labelling'}; the unguided
          figures leave out their {guided.cases.length} cases. Precision is the share of the cases the
          suite failed that were labelled broken; the miss rate is the share of the cases it passed that were labelled
          broken.
        </p>
      </Prose>
      <h3 className="mt-8 font-sans text-lg font-semibold">1. Blind labels</h3>
      <CalibrationTable label="Blind labels" precision={precision} miss={missRate}
        unguidedPrecision={unguided.precision} unguidedMiss={unguided.missRate} />
      <ul className="mt-4 max-w-[46rem] list-disc space-y-1 pl-5 text-sm text-ink-2">
        <li>
          Estimated recall, the share of all broken cases that the suite fails: {pct(calibration.recall.estimate)} over
          all items, {pct(unguided.recall.estimate)} over the unguided items. It is an estimate from a stratified
          sample, weighting each stratum by its size, so no interval is given.
        </li>
        <li>
          Self-consistency: the repeated items were labelled the same both times in {selfConsistency.count} of{' '}
          {selfConsistency.of}, {pct(consistency.share)} (95% interval {range(consistency.ci95)}).
        </li>
        <li>
          Labelled &ldquo;other&rdquo; (something wrong that the suite does not check for): {calibration.other.count};
          &ldquo;unsure&rdquo;: {calibration.unsure}. Neither counts as broken.
        </li>
      </ul>
      <h3 className="mt-8 font-sans text-lg font-semibold">2. After adjudication</h3>
      {adjudication ? (
        <>
          <Prose>
            <p>
              Not blind. The labeller saw each of the {adjudication.disagreements} disagreements again with the
              suite&rsquo;s findings and answered: the suite is right ({adjudication.answers['suite-right']}), my label is
              right ({adjudication.answers['label-right']}), or we define it differently (
              {adjudication.answers['defined-differently']}). Each &ldquo;the suite is right&rdquo; replaces the blind
              label; answered so far: {adjudication.answered} of {adjudication.disagreements}.
            </p>
          </Prose>
          <CalibrationTable label="After adjudication" precision={adjudication.all.precision}
            miss={adjudication.all.missRate} unguidedPrecision={adjudication.unguided.precision}
            unguidedMiss={adjudication.unguided.missRate} />
        </>
      ) : (
        <p className="mt-3 max-w-[46rem] text-ink-2">
          Not yet. The labeller has not adjudicated the {disagreements} disagreements between the blind labels and the
          suite, so only the blind result is shown. Adjudication is not blind, and it will always be shown second.
        </p>
      )}
      <p className="mt-4 max-w-[46rem] text-sm text-muted">
        The suite&rsquo;s author has also read every disagreement, not blind and with an author&rsquo;s interest in the
        suite: <a href={repoFile('docs/CALIBRATION-set-01.md')}>docs/CALIBRATION-set-01.md</a>. That reading changes
        none of the numbers above.
      </p>
    </>
  );
}

export function Method({ run, briefs, calibration }: { run: Run; briefs: Briefs; calibration: Calibration }) {
  const cases = run.cases;
  return (
    <>
      <PageHead title="Method">
        <p>
          A model writes a component from a brief. The component is rendered, changed in {cases.length} ways, and
          checked after each change. Everything here is defined in <a href={repoFile('docs/SPEC.md')}>docs/SPEC.md</a>,
          and every decision, with its reason, in <a href={DECISIONS}>docs/DECISIONS.md</a>.
        </p>
      </PageHead>

      <Section id="measure" title="What is measured">
        <Prose>
          <p>
            The headline is the share of components that broke at least once in a core case, with a 95% Wilson
            interval. A component counts only if its baseline, the brief&rsquo;s example props at 1280 px, renders
            without an error: a component that is broken before any change is counted as born broken, one that does not
            render as a baseline crash, and neither is scored. The same measure over every case, the extreme ones
            included, always stands beside the headline.
          </p>
          <p>
            Each model answers each brief queued for it twice, once with the plain prompt and once with the hint
            appended, one sample each; the plain and hinted answers to one brief form a pair for the paired test.
          </p>
        </Prose>
      </Section>

      <Section id="run-record" title="The run record">
        <Prose>
          <p>
            {FREE_TIER} Which models ran, through which provider and under which model id, the model the provider
            reported, when the first and last calls were made, the prompt variants and samples, the request parameters,
            how many calls gave a valid, an invalid or no component, and the suite version and harness commit of the
            stress runs are in the run record,{' '}
            <a href={repoFile('docs/RUNS.md')}>docs/RUNS.md</a>. It is written from the generation records and
            regenerated whenever the run advances.
          </p>
        </Prose>
      </Section>

      <Section id="prompt" title="The briefs and the prompt, word for word">
        <Prose>
          <p>
            Every model receives the same system message and a user message built from one brief: its text, its
            TypeScript props interface and its example props replace {'{brief}'}, {'{props}'} and {'{fixture}'}. The{' '}
            <a href={pageUrl('briefs')}>briefs</a> page shows all {briefs.briefs.length}. With the hinted prompt, the hint
            is appended to the user message after a blank line.
          </p>
          <p>{NAMES_NOTICE}</p>
        </Prose>
        <Pre label="System message">{briefs.prompt.system}</Pre>
        <Pre label="User message (template)">{briefs.prompt.user}</Pre>
        <Pre label="Hint (hinted prompt only)">{briefs.prompt.hint}</Pre>
      </Section>

      <Section id="cases" title="Cases and tiers">
        <Prose>
          <p>
            Each change is a case: eight changes of the content at 1280 px, three of the environment, and the eight
            content changes again at 320 px, judged against the 320 px render. A change applies only where the brief&rsquo;s
            data allows it: there is no empty-list case when every list must have items, and no large-number case
            without numbers. The 60-letter word, at both widths, is the
            extreme tier; every other case is core.
          </p>
        </Prose>
        <TableFrame caption={<>The {cases.length} cases of suite {run.suite.version}, in run order.</>}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">case</th>
                <th scope="col">the change</th>
                <th scope="col">tier</th>
                <th scope="col" className="num">screen</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((info) => (
                <tr key={info.id}>
                  <th scope="row" className="font-mono text-[0.8rem] font-normal">{info.id}</th>
                  <td>{info.description}</td>
                  <td>{info.tier}</td>
                  <td className="num">{info.id.endsWith('@320') || info.id === 'viewport-320' ? '320 px' : '1280 px'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
        <dl className="mt-6 max-w-[46rem] space-y-3 text-[0.95rem]">
          {CHANGES.map(([id, text]) => (
            <div key={id}>
              <dt className="font-mono text-[0.82rem] font-semibold">{id}</dt>
              <dd className="text-ink-2">{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="checks" title="The checks">
        <Prose>
          <p>
            Five geometric checks run in the browser on each render. They look only at boxes and text lines, never at
            the code, and they are frozen as suite {run.suite.version}: from now on only bug fixes change them, each
            recorded with its own test case.
          </p>
        </Prose>
        <dl className="mt-4 max-w-[46rem] space-y-3 text-[0.95rem]">
          {CHECKS.map(([id, text]) => (
            <div key={id}>
              <dt className="font-mono text-[0.82rem] font-semibold">{id}</dt>
              <dd className="text-ink-2">{text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="new-finding" title="The new-finding rule">
        <Prose>
          <p>
            A case fails only on errors that its reference render does not already have: the baseline for most cases,
            and the 320 px render for a content change at 320 px, so that a phone-width case counts only what the
            change adds to what the narrow screen already did. Findings are matched by an element&rsquo;s tags and
            classes rather than its position, so a list that grows does not make an old flaw look new, and only errors
            in the reference cancel errors in a case.
          </p>
        </Prose>
      </Section>

      <Section id="references" title="Reference implementations">
        <Prose>
          <p>
            Every brief has a reference component written by hand. It renders a clean baseline, survives every case of
            both tiers and hides none of its content at any width, which shows that a full score is possible for each
            brief, the extreme tier included. The <a href={pageUrl('briefs')}>briefs</a> page shows each
            reference&rsquo;s baseline.
          </p>
        </Prose>
      </Section>

      <Section id="calibration" title="Calibration">
        <CalibrationSection calibration={calibration} />
      </Section>

      <Section id="self-check" title="This site passes its own suite">
        <Prose>
          <p>
            The pages you are reading are checked the way the components are. A test in the harness (
            <a href={repoFile('harness/test/site.test.ts')}>harness/test/site.test.ts</a>) builds this site, serves it,
            and runs the suite&rsquo;s five checks on every page, the gallery with all its cases too, at 1280 px and at
            320 px wide: once as the page opens, and once with everything that can be opened open. It fails on any error
            finding, and it passes: no page has one at either width.
          </p>
        </Prose>
      </Section>

      <Section id="limits" title="Limitations and known gaps">
        <ul className="max-w-[46rem] list-disc space-y-2 pl-5 text-ink-2">
          <li>
            The results are preliminary: {run.status.finished.length} of {run.status.models} models have finished
            their queued jobs. {FREE_TIER} Free variants can be previews, are rate limited and are served apart from
            the providers&rsquo; paid endpoints.
          </li>
          <li>
            One sample per brief and prompt, and few components per model so far. The intervals assume independent
            components; cases of one component are not independent.
          </li>
          <li>
            Calibration has one labeller, who answered quickly (a median of 2.4 seconds per item), and nine of its items
            were discussed before labelling. The labelling tool marks a picture wider than its screen but not content
            pushed past the left edge.
          </li>
          <li>
            Some breakage passes every check: a column squeezed so narrow that its words split mid-word while nothing
            overflows; text cut off at the edge of a region that scrolls, even when its scroll bar is hidden; text that
            runs past a rounded shape; positioned content that collides with text.
          </li>
          <li>
            Hidden content (fixture text that a phone-width, 200% or right-to-left render does not show) is measured
            but never fails a case.
          </li>
          <li>
            The full list, with when each gap was found, is the Known gaps section of{' '}
            <a href={repoFile('docs/SPEC.md')}>docs/SPEC.md</a>.
          </li>
        </ul>
      </Section>

      <Section id="built" title="How it was built">
        <Prose>
          <p>
            First Edit was built with AI assistance: Claude for planning and Claude Code for implementation. The code,
            the briefs, the run plan and the label sets are in <a href={REPOSITORY}>the repository</a>; each design
            decision and its reason is in <a href={DECISIONS}>docs/DECISIONS.md</a>. This site is generated from the
            run&rsquo;s exported data ({run.source.run}), and it loads nothing from other servers.
          </p>
        </Prose>
      </Section>
    </>
  );
}
