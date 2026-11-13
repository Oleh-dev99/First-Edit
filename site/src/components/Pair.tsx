import { useLayoutEffect, useRef } from 'react';
import { url, type CaseEntry, type Picture } from '../data.ts';

/** The width of a picture in page pixels (screenshots wider than 1280 px were scaled down on export). */
function pageWidth(picture: Picture): number {
  return picture.width / (picture.scale || 1);
}

/**
 * One screenshot in a frame that scrolls when the picture is tall. Its width is
 * a share of the widest picture of its pair, so that widths compare, and never
 * more than its own pixels. It opens scrolled to `focusY` (page pixels).
 */
export function Shot({
  picture,
  widest,
  alt,
  caption,
  focusY,
}: {
  picture: Picture;
  widest: number;
  alt: string;
  caption: string;
  focusY?: number | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = frame.current;
    if (!box || !focusY) return;
    const shown = box.clientWidth / pageWidth(picture);
    box.scrollTop = Math.max(0, focusY * shown - 48);
  }, [focusY, picture]);
  const share = (pageWidth(picture) / widest) * 100;
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-sm text-muted">{caption}</figcaption>
      <div
        ref={frame}
        className="max-h-[30rem] overflow-y-auto border border-rule-strong bg-card"
        style={{ width: `${share}%`, maxWidth: `${picture.width + 2}px` }}
        tabIndex={0}
        role="region"
        aria-label={`${caption}: scrolls when the picture is tall`}
      >
        <img
          src={url(`data/${picture.src}`)}
          width={picture.width}
          height={picture.height}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>
    </figure>
  );
}

/** The page y of the first error finding, to open tall pictures where the breakage is. */
export function firstFindingY(entry: CaseEntry): number | null {
  const finding = entry.findings.find((item) => item.severity === 'error' && item.rect);
  return finding?.rect ? finding.rect.y : null;
}

export function describeEntry(entry: CaseEntry): string {
  return `${entry.brief} by ${entry.model}, ${entry.variant} prompt`;
}

/** Before and after side by side (stacked on a narrow screen), at one scale. */
export function Pair({ entry, beforeLabel = 'Before', afterLabel = 'After' }: {
  entry: CaseEntry;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const { before, after } = entry.images;
  const widest = Math.max(...[before, after].filter((p): p is Picture => p !== null).map(pageWidth), 1);
  const focus = firstFindingY(entry);
  const who = describeEntry(entry);
  const width = entry.viewport ? `${entry.viewport.width} px` : '';
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {before ? (
        <Shot picture={before} widest={widest} focusY={focus} caption={beforeLabel}
          alt={`${beforeLabel}: ${who}, its reference render${entry.case.endsWith('@320') ? ' at 320 px' : ''}.`} />
      ) : (
        <p className="text-sm text-muted">No reference: this is the candidate&rsquo;s own baseline.</p>
      )}
      {after ? (
        <Shot picture={after} widest={widest} focusY={focus} caption={afterLabel}
          alt={`${afterLabel}: ${who}, ${entry.description}${width ? ` at ${width}` : ''}.`} />
      ) : (
        <p className="text-sm text-muted">No screenshot: the render failed{entry.error ? ` (${entry.error})` : ''}.</p>
      )}
    </div>
  );
}
