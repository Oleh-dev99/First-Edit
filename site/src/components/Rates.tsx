import { exact, pct, range, type Interval } from '../data.ts';

const WIDTH = 100;
const HEIGHT = 20;
const PAD = 6;

/**
 * A share and its 95% interval on a 0 to 100% track: a 2px whisker and a dot
 * with a ring in the surface colour. Decorative: the same numbers are always
 * printed beside it, so it is hidden from assistive technology.
 */
export function IntervalMark({
  share,
  ci,
  tone = 'accent',
}: {
  share: number | null;
  ci: Interval | null;
  tone?: 'accent' | 'neutral';
}) {
  const x = (value: number) => PAD + value * (WIDTH - 2 * PAD);
  const colour = tone === 'accent' ? 'var(--color-accent)' : 'var(--color-muted)';
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
      className="inline-block align-middle"
    >
      <line x1={x(0)} x2={x(1)} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="var(--color-rule-strong)" strokeWidth={1} />
      {[0, 0.5, 1].map((tick) => (
        <line key={tick} x1={x(tick)} x2={x(tick)} y1={HEIGHT / 2 - 4} y2={HEIGHT / 2 + 4}
          stroke="var(--color-rule-strong)" strokeWidth={1} />
      ))}
      {ci && (
        <line x1={x(ci[0])} x2={x(ci[1])} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke={colour} strokeWidth={2}
          strokeLinecap="round" />
      )}
      {share !== null && (
        <circle cx={x(share)} cy={HEIGHT / 2} r={4.5} fill={colour} stroke="var(--color-paper)" strokeWidth={2} />
      )}
    </svg>
  );
}

/** Table cells for a share: count, share, interval and the mark. */
export function RateCells({ count, of, tone = 'accent' }: { count: number; of: number; tone?: 'accent' | 'neutral' }) {
  const share = exact(count, of);
  return (
    <>
      <td className="num">{count}/{of}</td>
      <td className="num">{pct(share.share)}</td>
      <td>{range(share.ci95)}</td>
      <td className="w-[104px]">
        <IntervalMark share={share.share} ci={share.ci95} tone={tone} />
      </td>
    </>
  );
}

/** The headers matching RateCells. */
export function RateHeads({ label }: { label: string }) {
  return (
    <>
      <th scope="col" className="num">{label}</th>
      <th scope="col" className="num">share</th>
      <th scope="col">95% interval</th>
      <th scope="col">
        <span className="sr-only">interval chart</span>
        <span aria-hidden="true" className="font-normal text-muted">0 &middot; 50 &middot; 100%</span>
      </th>
    </>
  );
}

/** A large figure for one share, with its count and interval in words. */
export function Figure({
  label,
  count,
  of,
  note,
  tone = 'accent',
  size = 'large',
}: {
  label: string;
  count: number;
  of: number;
  note?: string;
  tone?: 'accent' | 'neutral';
  size?: 'large' | 'small';
}) {
  const share = exact(count, of);
  return (
    <div>
      <p className="text-sm font-semibold text-ink-2">{label}</p>
      <p className={size === 'large' ? 'mt-1 text-5xl font-semibold leading-none' : 'mt-1 text-2xl font-semibold'}>
        {pct(share.share)}
      </p>
      <p className="mt-2 text-sm text-ink-2">
        {count} of {of}
        {note ? ` ${note}` : ''}; 95% interval {range(share.ci95)}
      </p>
      <div className="mt-1">
        <IntervalMark share={share.share} ci={share.ci95} tone={tone} />
      </div>
    </div>
  );
}
