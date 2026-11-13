import type { ReactNode } from 'react';
import { Disclosure, PageHead, pageUrl } from '../components/Layout.tsx';
import { url, type Brief, type Briefs as BriefsData } from '../data.ts';

/** Inline `code` in a line of brief text. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part,
  );
}

/** The brief's Markdown as paragraphs and lists; its own title is the card's heading. */
function BriefText({ text }: { text: string }) {
  const blocks = text.replace(/^# .*\n+/, '').trim().split(/\n\s*\n/);
  return (
    <div className="prose-block space-y-3 text-ink-2">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-*] /.test(line))) {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {lines.map((line, item) => <li key={item}>{inline(line.replace(/^\s*[-*] /, ''))}</li>)}
            </ul>
          );
        }
        if (/^#{2,} /.test(lines[0])) {
          return <h4 key={index} className="font-sans font-semibold text-ink">{inline(lines[0].replace(/^#+ /, ''))}</h4>;
        }
        return <p key={index}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}

function Code({ summary, children }: { summary: string; children: string }) {
  return (
    <Disclosure label={summary}>
      <pre className="idsmax-h-[24rem] overflow-auto whitespace-pre-wrap border border-rule bg-card p-3 text-[0.8rem] leading-relaxed"
        tabIndex={0} aria-label={summary}>
        {children}
      </pre>
    </Disclosure>
  );
}

function BriefCard({ brief }: { brief: Brief }) {
  const reference = brief.reference;
  return (
    <article id={brief.id} aria-labelledby={`${brief.id}-title`} className="scroll-mt-6 border-t border-rule-strong pt-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <h2 id={`${brief.id}-title`} className="text-2xl font-semibold">{brief.title}</h2>
          <p className="mt-1 text-sm text-muted">
            <code>{brief.id}</code> &middot; {brief.category}
          </p>
          <div className="mt-4">
            <BriefText text={brief.brief} />
          </div>
          <Code summary="Props interface (props.ts)">{brief.props}</Code>
          <Code summary="Example props (the baseline fixture)">{brief.fixture}</Code>
        </div>
        {reference && (
          <figure className="min-w-0">
            <figcaption className="mb-1 text-sm text-muted">The reference component&rsquo;s baseline at 1280 px</figcaption>
            <div className="max-h-[32rem] overflow-y-auto border border-rule-strong bg-card" tabIndex={0} role="region"
              aria-label={`${brief.title}: reference baseline, scrolls when tall`}>
              <img src={url(`data/${reference.src}`)} width={reference.width} height={reference.height} loading="lazy"
                decoding="async" className="block h-auto w-full"
                alt={`The hand-written reference for ${brief.title}, rendered with the example props at 1280 px.`} />
            </div>
          </figure>
        )}
      </div>
    </article>
  );
}

export function Briefs({ briefs }: { briefs: BriefsData }) {
  return (
    <>
      <PageHead title="Briefs">
        <p>
          The {briefs.briefs.length} briefs of the benchmark, each with its props interface and example props, and the
          hand-written reference component that survives every case. The prompt around a brief is on the{' '}
          <a href={pageUrl('method', '#prompt')}>method</a> page.
        </p>
      </PageHead>
      <nav aria-label="Briefs on this page" className="mt-8">
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.95rem] sm:grid-cols-3 lg:grid-cols-4">
          {briefs.briefs.map((brief) => (
            <li key={brief.id}>
              <a href={`#${brief.id}`}>{brief.title}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-12 space-y-14">
        {briefs.briefs.map((brief) => (
          <BriefCard key={brief.id} brief={brief} />
        ))}
      </div>
    </>
  );
}
