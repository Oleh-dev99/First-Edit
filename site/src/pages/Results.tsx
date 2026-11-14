import { useState } from 'react';
import { DECISIONS, PageHead, Prose, Section, TableFrame, pageUrl } from '../components/Layout.tsx';
import { RateCells, RateHeads } from '../components/Rates.tsx';
import { briefsWithoutComponent, exact, points, type Group, type Run, type Variant } from '../data.ts';

const VARIANTS: Variant[] = ['plain', 'hinted'];
const POOLED = 'all models';

function groupName(group: Group): string {
  return group.pooled ? 'all models' : group.model;
}

function HeadlineTable({ run }: { run: Run }) {
  return (
    <TableFrame caption={<>Clean-baseline components that broke at least once, core cases and all cases, with 95% Wilson intervals.</>}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">model</th>
            <th scope="col">prompt</th>
            <th scope="col" className="num">clean baseline</th>
            <RateHeads label="broke, core cases" />
            <RateHeads label="broke, all cases" />
          </tr>
        </thead>
        <tbody>
          {run.groups.map((group) => (
            <tr key={`${group.model}-${group.variant}`} className={group.pooled ? 'pooled' : undefined}>
              <th scope="row" className="font-normal">{groupName(group)}</th>
              <td>{group.variant}</td>
              <td className="num">{group.cleanBaseline}</td>
              <RateCells count={group.brokeOnce.core.count} of={group.brokeOnce.core.of} />
              <RateCells count={group.brokeOnce.all.count} of={group.brokeOnce.all.of} tone="neutral" />
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function HintTable({ run }: { run: Run }) {
  const rows = [...Object.entries(run.hintEffect.perModel), [POOLED, run.hintEffect.pooled] as const];
  return (
    <TableFrame caption={<>Briefs where the plain and the hinted component (the same sample) both rendered cleanly, by whether each broke
          in a core case. p is an exact two-sided McNemar test on the discordant pairs.</>}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">model</th>
            <th scope="col" className="num">pairs</th>
            <th scope="col" className="num">both broke</th>
            <th scope="col" className="num">plain only</th>
            <th scope="col" className="num">hinted only</th>
            <th scope="col" className="num">neither</th>
            <th scope="col" className="num">p</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([model, pairs]) => (
            <tr key={model} className={model === POOLED ? 'pooled' : undefined}>
              <th scope="row" className="font-normal">{model}</th>
              <td className="num">{pairs.pairs}</td>
              <td className="num">{pairs.bothBroke}</td>
              <td className="num">{pairs.plainOnly}</td>
              <td className="num">{pairs.hintedOnly}</td>
              <td className="num">{pairs.neither}</td>
              <td className="num">{pairs.pairs ? pairs.p.toFixed(4) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function PerCaseTable({ run }: { run: Run }) {
  const models = [POOLED, ...new Set(run.groups.filter((group) => !group.pooled).map((group) => group.model))];
  const [model, setModel] = useState(POOLED);
  const groupOf = (variant: Variant) =>
    run.groups.find((group) => group.variant === variant && (model === POOLED ? group.pooled : group.model === model)) ??
    (model === POOLED ? run.groups.find((group) => group.variant === variant) : undefined);
  const groups = VARIANTS.map(groupOf);
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="case-model" className="text-sm font-semibold text-ink-2">
          Components of
        </label>
        <select
          id="case-model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          className="min-w-0 max-w-full rounded border border-rule-strong bg-card px-2 py-1 text-sm"
        >
          {models.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>
      <TableFrame caption={<>Failed / applicable cases of clean-baseline components, with 95% Wilson intervals.</>}>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">case</th>
              <th scope="col">tier</th>
              <th scope="col">the change</th>
              {VARIANTS.map((variant) => (
                <RateHeads key={variant} label={`${variant}: failed`} />
              ))}
            </tr>
          </thead>
          <tbody>
            {run.cases.map((info) => (
              <tr key={info.id}>
                <th scope="row" className="font-mono text-[0.8rem] font-normal">{info.id}</th>
                <td>{info.tier}</td>
                <td className="min-w-[9rem] !whitespace-normal">{info.description}</td>
                {groups.map((group, index) => {
                  const rate = group?.failedByCase[info.id];
                  return rate ? (
                    <RateCells key={VARIANTS[index]} count={rate.failed} of={rate.applicable}
                      tone={index === 0 ? 'accent' : 'neutral'} />
                  ) : (
                    <td key={VARIANTS[index]} colSpan={4} className="text-muted">no components</td>
                  );
                })}
              </tr>
            ))}
            {(['core', 'extreme', 'all'] as const).map((tier) => (
              <tr key={tier} className={tier === 'core' ? 'pooled' : undefined}>
                <th scope="row" colSpan={3}>{tier === 'all' ? 'all cases' : `all ${tier} cases`}</th>
                {groups.map((group, index) => {
                  const rate = group?.failureRate[tier];
                  return rate ? (
                    <RateCells key={VARIANTS[index]} count={rate.failed} of={rate.applicable}
                      tone={index === 0 ? 'accent' : 'neutral'} />
                  ) : (
                    <td key={VARIANTS[index]} colSpan={4} className="text-muted">no components</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </>
  );
}

function SensitivityTable({ run }: { run: Run }) {
  const rows = run.sensitivity.plain.map((row, index) => [row, run.sensitivity.hinted[index]] as const);
  const base = VARIANTS.map((variant) => {
    const first = run.sensitivity[variant][0];
    return first ? exact(first.count, first.of).share : null;
  });
  return (
    <TableFrame caption={<>The core headline per prompt, pooled over the models, recomputed with one case family removed (a change and
          its 320 px case). The change is in percentage points against the first row.</>}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">removed</th>
            {VARIANTS.map((variant) => (
              <RateHeads key={variant} label={`${variant}: broke, core`} />
            ))}
            {VARIANTS.map((variant) => (
              <th key={variant} scope="col" className="num">{variant}: change</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([plain, hinted]) => (
            <tr key={plain.removed} className={plain.removed === 'none' ? 'pooled' : undefined}>
              <th scope="row" className="font-mono text-[0.8rem] font-normal">{plain.removed}</th>
              <RateCells count={plain.count} of={plain.of} />
              {hinted ? <RateCells count={hinted.count} of={hinted.of} tone="neutral" /> : <td colSpan={4} />}
              <td className="num">{plain.removed === 'none' ? '–' : points(exact(plain.count, plain.of).share, base[0])}</td>
              <td className="num">
                {!hinted || hinted.removed === 'none' ? '–' : points(exact(hinted.count, hinted.of).share, base[1])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

const LINES = [
  ['coverage', 'a. Coverage', 'every model and variant has at least 15 clean-baseline components'],
  ['hintEffect', 'b. Hint effect', 'the pooled paired test of the hint has p below 0.05'],
  ['modelEffect', 'c. Model effect', 'at least two models whose plain core intervals do not overlap'],
] as const;

function DecisionLines({ run }: { run: Run }) {
  const { lines, models } = run.decisions;
  return (
    <>
      <Prose>
        <p>
          Three lines decide what the comparison may claim. They were fixed before any of this run&rsquo;s numbers
          existed (D-049, in <a href={DECISIONS}>the decisions</a>), and they cover only the models that have finished
          all their queued jobs.
        </p>
      </Prose>
      <p className="mt-4 font-semibold">
        {lines
          ? `Evaluated over the models that have finished: ${models.join(', ')}.`
          : 'Not evaluated: no model has finished its queued jobs yet.'}
      </p>
      <ul className="mt-3 max-w-[46rem] divide-y divide-rule border-y border-rule">
        {LINES.map(([key, name, text]) => {
          const line = lines?.[key];
          return (
            <li key={key} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <span>
                <strong>{name}:</strong> {text}
                {line ? <span className="block text-sm text-muted">{line.detail}</span> : null}
              </span>
              <span className={line?.met ? 'font-semibold text-accent-deep' : 'font-semibold text-ink-2'}>
                {line ? (line.met ? 'met' : 'not met') : 'not evaluated'}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CandidatesTable({ run }: { run: Run }) {
  return (
    <TableFrame caption={<>Every generated component. Only those with a clean baseline are scored: a born-broken or crashed baseline is
          counted, not scored. Briefs with none have no component from that model and prompt yet: the queue has not
          reached them, or their earlier components were set aside when the brief&rsquo;s text changed (D-059; the run
          record lists them with what they scored).</>}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">model</th>
            <th scope="col">prompt</th>
            <th scope="col" className="num">briefs with none</th>
            <th scope="col" className="num">generated</th>
            <th scope="col" className="num">valid</th>
            <th scope="col" className="num">invalid</th>
            <th scope="col" className="num">API errors</th>
            <th scope="col" className="num">clean baseline</th>
            <th scope="col" className="num">born broken</th>
            <th scope="col" className="num">baseline crash</th>
          </tr>
        </thead>
        <tbody>
          {run.groups.map((group) => (
            <tr key={`${group.model}-${group.variant}`} className={group.pooled ? 'pooled' : undefined}>
              <th scope="row" className="font-normal">{groupName(group)}</th>
              <td>{group.variant}</td>
              <td className="num">{group.missingBriefs.length}</td>
              <td className="num">{group.candidates}</td>
              <td className="num">{group.valid}</td>
              <td className="num">{group.invalid}</td>
              <td className="num">{group.apiErrors}</td>
              <td className="num">{group.cleanBaseline}</td>
              <td className="num">{group.bornBroken}</td>
              <td className="num">{group.baselineCrash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

export function Results({ run }: { run: Run }) {
  const withCandidates = new Set(run.groups.filter((group) => !group.pooled).map((group) => group.model));
  const without = run.models.filter((model) => !withCandidates.has(model.id)).map((model) => model.id);
  const briefsWithout = briefsWithoutComponent(run);
  return (
    <>
      <PageHead title="Results">
        <p>
          Every number covers components whose baseline rendered cleanly. A component <em>broke</em> when at least one
          case failed: a check found an error that its reference render does not have. The headline counts core cases;
          the all-cases figure, the extreme 60-letter words included, always stands beside it.
        </p>
      </PageHead>
      {without.length > 0 && (
        <p className="mt-6 max-w-[46rem] border-l-4 border-accent bg-accent-wash px-4 py-3 text-sm text-ink-2">
          No components yet from {without.join(', ')}: {withCandidates.size} of {run.models.length} models have
          candidates so far.
        </p>
      )}
      {briefsWithout.length > 0 && (
        <p className="mt-4 max-w-[46rem] border-l-4 border-accent bg-accent-wash px-4 py-3 text-sm text-ink-2">
          No component yet for {briefsWithout.length} of the {run.briefs.length} briefs: {briefsWithout.join(', ')}.
          Every number below covers the other {run.briefs.length - briefsWithout.length}.
        </p>
      )}

      <Section id="headline" title="Broke at least once">
        <HeadlineTable run={run} />
      </Section>

      <Section id="hint" title="Hint effect, paired">
        <Prose>
          <p>
            The same brief with and without the hint, compared pair by pair. Only the discordant pairs, where one
            broke and the other did not, carry information.
          </p>
        </Prose>
        <HintTable run={run} />
      </Section>

      <Section id="cases" title="Failure rate per case">
        <Prose>
          <p>
            How often each case failed, with its tier. Core cases make the headline; the extreme cases are the
            60-letter word at both widths. The <a href={pageUrl('method', '#cases')}>method</a> describes each change.
          </p>
        </Prose>
        <PerCaseTable run={run} />
      </Section>

      <Section id="sensitivity" title="Headline sensitivity">
        <Prose>
          <p>
            How much of the headline one family of cases carries. The extreme 60-letter word is never part of the
            core headline, so removing it changes nothing there.
          </p>
        </Prose>
        <SensitivityTable run={run} />
      </Section>

      <Section id="decisions" title="Decision lines">
        <DecisionLines run={run} />
      </Section>

      <Section id="components" title="Components">
        <CandidatesTable run={run} />
      </Section>
    </>
  );
}
