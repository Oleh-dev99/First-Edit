// The finding shape shared by every check. No imports from the app, so the
// checks can later be bundled and injected into any page.

export const CHECK_NAMES = ['page-overflow-x', 'text-clipped', 'content-spill', 'text-overlap', 'off-screen'] as const;

export type CheckName = (typeof CHECK_NAMES)[number];

/** "error" counts against survival; "info" is recorded only. */
export type Severity = 'error' | 'info';

/** A rectangle in page coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Finding {
  check: CheckName;
  severity: Severity;
  /** Structural path from #fe-root (tag and nth-child). "html" for page-level findings. */
  selector: string;
  rect: Rect;
  /** First 80 characters of the affected text, or null. */
  text: string | null;
  /** Check-specific numbers, e.g. axis, overflowPx, otherSelector. */
  detail: Record<string, unknown>;
}

export type Check = (root: Element) => Finding[];
