// The check lab: minimal inline-styled HTML cases, each rendered into the
// stage at a fixed viewport, with the exact finding counts every check must
// produce. Used by the lab route (/?lab=<id>) and by test/lab.test.ts.

import type { CheckName } from '../checks/finding.ts';

export interface Viewport {
  width: number;
  height: number;
}

export interface LabCase {
  id: string;
  /** The check this case targets. */
  check: CheckName;
  /** "+" cases must be flagged by the target check, "-" cases must not. */
  description: string;
  viewport?: Viewport;
  html: string;
  /** Exact error and info counts per check. A check left out expects zero of both. */
  expected: Partial<Record<CheckName, { error?: number; info?: number }>>;
  /** Set when the case is a known failure; explains why. */
  knownFailure?: string;
  /** Text direction of the page; "rtl" sets dir="rtl" on <html>. */
  dir?: 'rtl';
  /** The expected number of page-overflow-x culprits, when the case pins them. */
  culprits?: number;
}

export const DEFAULT_VIEWPORT: Viewport = { width: 800, height: 600 };

const NARROW: Viewport = { width: 320, height: 600 };

/** A solid-colour SVG as a data URL, so cases need no network or files. */
function image(width: number, height: number, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 60 characters with no break opportunity. */
const TOKEN = 'Unbrokentoken'.repeat(5).slice(0, 60);

const PARAGRAPH =
  'Release notes for the spring update: faster sync, a calmer inbox, ' +
  'offline drafts and a redesigned settings page for every workspace.';

const PILLS = ['Accessibility', 'Design systems', 'Prototyping'];

const PILL =
  'flex:none; padding:2px 10px; border-radius:9999px; background:#e0e7ff; color:#3730a3; ' +
  'font-size:14px; white-space:nowrap';

const FIXED_HEADER =
  'position:fixed; top:0; left:0; right:0; display:flex; gap:16px; padding:8px 16px; ' +
  'background:#fff; border-bottom:1px solid #e2e8f0';

const SR_ONLY =
  'position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; ' +
  'clip:rect(0,0,0,0); white-space:nowrap; border:0';

export const LAB_CASES: LabCase[] = [
  // page-overflow-x
  {
    id: 'overflow-fixed-block',
    check: 'page-overflow-x',
    description: '+ a 600px fixed-width block at a 320px viewport',
    viewport: NARROW,
    html: `<div style="width:600px; padding:12px; background:#e2e8f0">A block with a fixed width of 600px.</div>`,
    expected: { 'page-overflow-x': { error: 1 } },
  },
  {
    id: 'overflow-max-width',
    check: 'page-overflow-x',
    description: '- the same block with max-width 100%',
    viewport: NARROW,
    html: `<div style="width:600px; max-width:100%; padding:12px; background:#e2e8f0">A block with a fixed width of 600px and max-width 100%.</div>`,
    expected: {},
  },
  {
    id: 'overflow-scroll-container',
    check: 'page-overflow-x',
    description: '- wide content inside an overflow-x auto container',
    viewport: NARROW,
    html:
      `<div style="overflow-x:auto; border:1px solid #cbd5e1">` +
      `<div style="width:600px; padding:12px; white-space:nowrap">Wide content that scrolls inside its own container.</div>` +
      `</div>`,
    expected: {},
  },
  {
    id: 'overflow-abs-culprit',
    check: 'page-overflow-x',
    description: '+ an absolutely positioned 600px box widens the page and is named as the culprit',
    viewport: NARROW,
    html:
      `<div style="position:relative; height:40px">` +
      `<div style="position:absolute; top:0; left:0; width:600px; height:20px; background:#e2e8f0"></div>` +
      `</div>`,
    expected: { 'page-overflow-x': { error: 1 } },
    culprits: 1,
  },
  {
    id: 'overflow-fixed-culprit',
    check: 'page-overflow-x',
    description: '+ an in-flow 600px block widens the page; a fixed bar past the edge is named as a culprit too',
    viewport: NARROW,
    html:
      `<div style="width:600px; height:20px; background:#e2e8f0"></div>` +
      `<div style="position:fixed; top:40px; left:0; width:500px; height:20px; background:#fecaca"></div>`,
    expected: { 'page-overflow-x': { error: 1 } },
    culprits: 2,
  },

  // text-clipped
  {
    id: 'clipped-nowrap',
    check: 'text-clipped',
    description: '+ nowrap text in a 120px box, overflow hidden, no ellipsis',
    html: `<div style="width:120px; overflow:hidden; white-space:nowrap">This sentence is far too long for its box.</div>`,
    expected: { 'text-clipped': { error: 1 } },
  },
  {
    id: 'clipped-fixed-height',
    check: 'text-clipped',
    description: '+ several lines in a fixed-height box, overflow hidden, no line clamp',
    html: `<div style="width:200px; height:40px; overflow:hidden; line-height:20px">${PARAGRAPH}</div>`,
    expected: { 'text-clipped': { error: 1 } },
  },
  {
    id: 'clipped-ellipsis',
    check: 'text-clipped',
    description: '- nowrap, overflow hidden, text-overflow ellipsis (1 info)',
    html: `<div style="width:120px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis">This sentence is far too long for its box.</div>`,
    expected: { 'text-clipped': { info: 1 } },
  },
  {
    id: 'clipped-line-clamp',
    check: 'text-clipped',
    description: '- line clamp of 2 lines (1 info)',
    html: `<p style="width:200px; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2">${PARAGRAPH}</p>`,
    expected: { 'text-clipped': { info: 1 } },
  },
  {
    id: 'clipped-scroll-container',
    check: 'text-clipped',
    description: '- long text in an overflow auto container',
    html: `<div style="width:200px; height:60px; overflow:auto; border:1px solid #cbd5e1">${PARAGRAPH}</div>`,
    expected: {},
  },
  {
    id: 'clipped-sr-only',
    check: 'text-clipped',
    description: '- a screen-reader-only element',
    html:
      `<h3 style="font-size:18px; font-weight:600">Notifications</h3>` +
      `<span style="${SR_ONLY}">You have three unread notifications from your team</span>`,
    expected: {},
  },
  {
    id: 'clipped-card-fits',
    check: 'text-clipped',
    description: '- a rounded card with overflow hidden whose text fits',
    html:
      `<div style="width:280px; padding:16px; border-radius:16px; overflow:hidden; background:#fff; border:1px solid #e2e8f0">` +
      `<h3 style="font-size:18px; font-weight:600">Card title</h3>` +
      `<p style="font-size:14px; color:#475569">Short body text that fits comfortably inside the rounded card.</p>` +
      `</div>`,
    expected: {},
  },

  // content-spill
  {
    id: 'spill-nowrap',
    check: 'content-spill',
    description: '+ nowrap long text in a 160px box with a background',
    html: `<div style="width:160px; padding:8px; background:#e2e8f0; white-space:nowrap">This label is much too long for its box</div>`,
    expected: { 'content-spill': { error: 1 } },
  },
  {
    id: 'spill-token',
    check: 'content-spill',
    description: '+ a 60-character unbroken token in a 160px bordered box',
    html: `<div style="width:160px; padding:8px; border:1px solid #94a3b8">${TOKEN}</div>`,
    expected: { 'content-spill': { error: 1 } },
  },
  {
    id: 'spill-image',
    check: 'content-spill',
    description: '+ a 300px-wide image in a 160px bordered box',
    html:
      `<div style="width:160px; padding:8px; border:1px solid #94a3b8">` +
      `<img src="${image(300, 80, '#94a3b8')}" width="300" height="80" alt="" style="max-width:none">` +
      `</div>`,
    expected: { 'content-spill': { error: 1 } },
  },
  {
    id: 'spill-token-wrapped',
    check: 'content-spill',
    description: '- the same token with overflow-wrap anywhere',
    html: `<div style="width:160px; padding:8px; border:1px solid #94a3b8; overflow-wrap:anywhere">${TOKEN}</div>`,
    expected: {},
  },
  {
    id: 'spill-pill-badge',
    check: 'content-spill',
    description: '- a pill badge with line-height 1 and small padding',
    html: `<span style="display:inline-block; padding:0 6px; border-radius:9999px; background:#e0e7ff; color:#3730a3; font-size:12px; line-height:1">Beta</span>`,
    expected: {},
  },
  {
    id: 'spill-abs-badge',
    check: 'content-spill',
    description: "- an absolutely positioned badge overhanging a boxed parent's corner",
    html:
      `<div style="position:relative; width:160px; padding:12px; border:1px solid #cbd5e1; border-radius:8px; background:#fff">Inbox` +
      `<span style="position:absolute; top:-8px; right:-8px; padding:0 6px; border-radius:9999px; background:#dc2626; color:#fff; font-size:12px; line-height:18px">12</span>` +
      `</div>`,
    expected: {},
  },

  // content-spill: visibly boxed elements are content boxes too
  {
    id: 'spill-pill-row',
    check: 'content-spill',
    description: '+ three pills in a row that cannot wrap inside a 200px bordered box; two cross the edge',
    html:
      `<div style="display:flex; gap:6px; width:200px; padding:8px; border:1px solid #94a3b8">` +
      PILLS.map((label) => `<span style="${PILL}">${label}</span>`).join('') +
      `</div>`,
    expected: { 'content-spill': { error: 2 } },
  },
  {
    id: 'spill-wide-panel',
    check: 'content-spill',
    description: '+ a 300px boxed div inside a 200px boxed card',
    html:
      `<div style="width:200px; padding:12px; border:1px solid #94a3b8; background:#fff">` +
      `<div style="width:300px; padding:8px; background:#e2e8f0">Wide panel</div>` +
      `</div>`,
    expected: { 'content-spill': { error: 1 } },
  },
  {
    id: 'spill-pill-row-wraps',
    check: 'content-spill',
    description: '- the same pills with wrapping allowed',
    html:
      `<div style="display:flex; flex-wrap:wrap; gap:6px; width:200px; padding:8px; border:1px solid #94a3b8">` +
      PILLS.map((label) => `<span style="${PILL}">${label}</span>`).join('') +
      `</div>`,
    expected: {},
  },
  {
    id: 'spill-full-bleed-band',
    check: 'content-spill',
    description: "- a full-bleed band with negative margins that stays inside its card's border box",
    html:
      `<div style="width:240px; padding:16px; border:1px solid #cbd5e1; border-radius:12px; background:#fff">` +
      `<p>Card body text.</p>` +
      `<div style="margin:12px -16px; padding:8px 16px; background:#f1f5f9">Full-bleed band</div>` +
      `<p>More card text.</p>` +
      `</div>`,
    expected: {},
  },
  {
    id: 'spill-abs-boxed-badge',
    check: 'content-spill',
    description: '- an absolutely positioned boxed badge overhanging its boxed parent',
    html:
      `<div style="position:relative; width:160px; height:48px; border:1px solid #cbd5e1; border-radius:8px; background:#fff">` +
      `<span style="position:absolute; top:-10px; right:-10px; width:20px; height:20px; border-radius:9999px; background:#dc2626"></span>` +
      `</div>`,
    expected: {},
  },

  // content-spill: a border makes a box only on all four sides (D-034)
  {
    id: 'spill-full-border',
    check: 'content-spill',
    description: '+ nowrap text running out of a box with a border on all four sides',
    html: `<div style="width:160px; padding:8px; border:1px solid #94a3b8; white-space:nowrap">This label is much too long for its box</div>`,
    expected: { 'content-spill': { error: 1 } },
  },
  {
    id: 'spill-border-top-only',
    check: 'content-spill',
    description: '- nowrap text running past a block that has only a top border (a divider)',
    html: `<div style="width:160px; padding:8px 0; border-top:1px solid #94a3b8; white-space:nowrap">This label runs past the divider line</div>`,
    expected: {},
  },
  {
    id: 'spill-border-top-bottom',
    check: 'content-spill',
    description: '- nowrap text running past a block with top and bottom borders only',
    html: `<div style="width:160px; padding:8px 0; border-top:1px solid #94a3b8; border-bottom:1px solid #94a3b8; white-space:nowrap">This label runs past both rules</div>`,
    expected: {},
  },

  // readiness: images that fail or are lazy must never hang __FE_READY__
  {
    id: 'ready-broken-and-lazy-images',
    check: 'content-spill',
    description: '- a failed image and a lazy image below the fold neither hang readiness nor produce findings',
    html:
      `<img src="/fe-assets/does-not-exist.svg" width="120" height="80" alt="">` +
      // Far beyond Chromium's lazy-load distance threshold, so it would never start loading on its own.
      `<img src="/fe-assets/placeholder-4x3.svg" loading="lazy" width="160" height="120" alt="" style="margin-top:5000px">`,
    expected: {},
  },

  // Tailwind v3 compatibility: removed v3 class names still work (styles.css)
  {
    id: 'compat-overflow-ellipsis',
    check: 'text-clipped',
    description: '- the v3 class overflow-ellipsis still truncates with an ellipsis (1 info, not an error)',
    html:
      `<div class="overflow-ellipsis" style="width:120px; overflow:hidden; white-space:nowrap">` +
      `This sentence is far too long for its box.</div>`,
    expected: { 'text-clipped': { info: 1 } },
  },
  {
    id: 'compat-flex-shrink-0',
    check: 'content-spill',
    description: '+ the v3 class flex-shrink-0 still stops a 300px panel from shrinking in a 200px row',
    html:
      `<div style="display:flex; width:200px; padding:8px; border:1px solid #94a3b8">` +
      `<div class="flex-shrink-0" style="width:300px; padding:8px; background:#e2e8f0">Fixed panel</div>` +
      `</div>`,
    expected: { 'content-spill': { error: 1 } },
  },

  // text-overlap
  {
    id: 'overlap-fixed-row',
    check: 'text-overlap',
    description: '+ a 20px fixed-height row holding two lines of text, then a paragraph',
    html:
      `<div style="height:20px; width:140px; line-height:20px">Two lines of text in a short row</div>` +
      `<p>The paragraph that follows the row.</p>`,
    expected: { 'text-overlap': { error: 1 } },
  },
  {
    id: 'overlap-flex-nowrap',
    check: 'text-overlap',
    description: "+ two unboxed flex children; the first has long nowrap text that runs over the second child's text",
    html:
      `<div style="display:flex; gap:8px; width:360px">` +
      // A specified width (not flex-basis) caps the automatic minimum size at
      // 120px, so the nowrap text overflows the item instead of widening it.
      `<div style="width:120px; flex-shrink:0; white-space:nowrap">A long label that does not wrap</div>` +
      `<div>Second column</div>` +
      `</div>`,
    expected: { 'text-overlap': { error: 1 } },
  },
  {
    id: 'overlap-heading-lh1',
    check: 'text-overlap',
    description: '- a heading with line-height 1 directly above a paragraph',
    html:
      `<h2 style="font-size:28px; line-height:1; font-weight:700">Quarterly report</h2>` +
      `<p>Revenue grew in every region this quarter.</p>`,
    expected: {},
  },
  {
    id: 'overlap-paragraph-lh1',
    check: 'text-overlap',
    description: '- a two-line paragraph with line-height 1',
    html: `<p style="width:240px; line-height:1">A paragraph with tight leading that wraps onto a second line.</p>`,
    expected: {},
  },
  {
    id: 'overlap-abs-label',
    check: 'text-overlap',
    description: '- an absolutely positioned label over an image',
    html:
      `<div style="position:relative; width:240px">` +
      `<img src="${image(240, 135, '#64748b')}" width="240" height="135" alt="">` +
      `<span style="position:absolute; left:8px; bottom:8px; padding:2px 6px; background:rgba(15,23,42,0.7); color:#fff; font-size:12px">Photo caption</span>` +
      `</div>`,
    expected: {},
  },
  {
    id: 'overlap-avatar-stack',
    check: 'text-overlap',
    description: '- a stack of overlapping avatars made with negative margins',
    html:
      `<div style="display:flex">` +
      ['#6366f1', '#ec4899', '#f59e0b', '#10b981']
        .map(
          (color, index) =>
            `<img src="${image(40, 40, color)}" width="40" height="40" alt="" ` +
            `style="border-radius:9999px; border:2px solid #fff${index > 0 ? '; margin-left:-12px' : ''}">`,
        )
        .join('') +
      `</div>`,
    expected: {},
  },

  // off-screen (D-035)
  {
    id: 'offscreen-fixed-header-text',
    check: 'off-screen',
    description: "+ a fixed header whose right-hand text passes the viewport's right edge",
    viewport: NARROW,
    html:
      `<header style="${FIXED_HEADER}; white-space:nowrap">` +
      `<span style="flex:none; width:200px">Ledgerloom</span><span style="flex:none">Account settings</span>` +
      `</header>`,
    expected: { 'off-screen': { error: 1 } },
  },
  {
    id: 'offscreen-fixed-button-past-edge',
    check: 'off-screen',
    description: '+ a fixed header whose last button lies entirely past the right edge',
    viewport: NARROW,
    html:
      `<header style="${FIXED_HEADER}">` +
      `<span style="flex:none; width:320px">Ledgerloom</span><button style="flex:none">New invoice</button>` +
      `</header>`,
    expected: { 'off-screen': { error: 1 } },
  },
  {
    id: 'offscreen-negative-margin',
    check: 'off-screen',
    description: "+ an in-flow paragraph pulled left past the page's left edge by a negative margin",
    html: `<p style="margin-left:-60px">This paragraph is pulled left past the edge of the page by a negative margin.</p>`,
    expected: { 'off-screen': { error: 1 } },
  },
  {
    id: 'offscreen-fixed-fits',
    check: 'off-screen',
    description: '- a fixed header that fits the viewport',
    viewport: NARROW,
    html: `<header style="${FIXED_HEADER}"><span>Ledgerloom</span><button>Menu</button></header>`,
    expected: {},
  },
  {
    id: 'offscreen-fixed-scroller',
    check: 'off-screen',
    description: '- a fixed bar whose inner row of tabs scrolls (overflow-x auto)',
    viewport: NARROW,
    html:
      `<nav style="position:fixed; bottom:0; left:0; right:0; padding:8px; background:#fff; border-top:1px solid #e2e8f0">` +
      `<div style="display:flex; gap:16px; overflow-x:auto; white-space:nowrap">` +
      ['Overview', 'Invoices', 'Expenses', 'Reports', 'Settings', 'Integrations'].map((tab) => `<a href="#${tab}">${tab}</a>`).join('') +
      `</div></nav>`,
    expected: {},
  },
  {
    id: 'offscreen-parked',
    check: 'off-screen',
    description: '- a skip link parked at left -9999px',
    html: `<a href="#main" style="position:absolute; left:-9999px">Skip to content</a><p id="main">Main content.</p>`,
    expected: {},
  },
  {
    id: 'offscreen-rtl-left-overflow',
    check: 'off-screen',
    description: '- in a right-to-left page, text past the left edge, where the page can scroll',
    viewport: NARROW,
    dir: 'rtl',
    html: `<div style="width:600px; padding:12px; background:#e2e8f0; white-space:nowrap">A block six hundred pixels wide with a long line of text.</div>`,
    expected: { 'page-overflow-x': { error: 1 } },
  },
];
