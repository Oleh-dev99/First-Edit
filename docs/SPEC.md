# First Edit - specification (v0.1)

## Thesis
Benchmarks for AI-generated UI score how the output looks at the moment
it is generated. First Edit scores what happens next: whether the layout
survives when the content changes.

## Terms
- Brief: a UI task. A prompt, a TypeScript props interface (the data
  contract) and a baseline fixture (JSON matching the interface).
- Candidate: one React component implementing a brief. Hand-written or
  model-generated.
- Mutation: a deterministic change to the fixture (content) or to the
  render environment (viewport width, text size, direction).
- Check: a deterministic in-page function that returns findings of the
  form { check, severity, selector, rect, text, detail }. See Checks (v0).
- Case: one candidate rendered under one mutation. A screenshot plus
  findings.
- Baseline: the candidate rendered with the unmodified fixture at
  1280x800.

## Candidate contract
- One self-contained .tsx file with a default export. It declares its own
  props type, matching the brief's interface.
- Imports allowed: react only.
- Styling: Tailwind utility classes and inline styles. No other CSS, no
  external assets, no network.
- No randomness, no timers, no data fetching.

## Scoring
- A finding counts against a mutation only if it is new relative to the
  baseline. Findings already present in the baseline are reported
  separately as "born broken".
- Survival rate = mutations with no new findings / mutations run.
- Reported per candidate, per mutation type and per model.

## Pipeline
1. generate (Python runner): brief -> model API -> candidate file.
   Cached, retried and cost-capped.
2. render (Node harness): candidate x mutation -> Vite + Playwright
   (Chromium) -> screenshot + findings JSON.
3. score (Python): findings -> survival rates and tables.
4. calibrate (Python): compare checks against a hand-labelled set and
   report precision and recall per check.
5. publish: a static results site and a CLI usable on any component.

## Rendering rules
- Chromium only, headless, fixed viewport per case.
- Inter is bundled and first in the font stack, so text metrics are the
  same on every machine.
- The render stage is #fe-root: 16px padding, a neutral light background
  (#f1f5f9), min-height 100vh and box-sizing border-box. Body margin is 0.
  Candidates start at the top-left of the stage and choose their own
  width.
- The fixture is chosen with the query parameter `fixture=<name>`, which
  loads briefs/<brief>/fixture.<name>.json. The default is `baseline`.

## Layout
- briefs/<brief-id>/ : brief.md, props.ts, fixture.baseline.json and
  optional fixture.<name>.json
- candidates/<source>/<brief-id>/<variant>/Component.tsx
  (source is _samples or a model id)
- harness/ : Node. Vite app, Playwright runner, mutations, checks
- runner/ : Python. Generation, scoring, calibration (added later)
- results/ : run output, git-ignored
- docs/ : spec, methodology, decisions

## Initial mutation set
text-long (1.4x length), text-unbroken (60-character token), text-empty,
list-0, list-1, list-many (10x), viewport-320, text-200pct, dir-rtl,
image-missing

## Checks (v0)
A check is a plain DOM function `(root: Element) => Finding[]` with no
imports from the app. The page exposes `window.__FE_RUN_CHECKS__()`, which
runs every check on #fe-root and returns the findings.

Finding: { check, severity, selector, rect, text, detail }
- severity: "error" counts against survival; "info" is recorded only
- selector: a structural path from #fe-root (tag and nth-child), stable
  for the same DOM
- rect: { x, y, width, height } in page coordinates
- text: the first 80 characters of the affected text, if any
- detail: check-specific numbers, e.g. axis, overflowPx, otherSelector

One finding per element per check (per pair for text-overlap). Line boxes
that belong to the same element are merged.

### Shared definitions
- Content box: a text line box (from Range.getClientRects on a text node)
  or the border box of a replaced element or form control (img, svg,
  video, canvas, input, button, select, textarea).
- Ignore: anything outside #fe-root, elements with display none or
  visibility hidden, whitespace-only text, and screen-reader-only
  elements (the 1px clip pattern).
- Visible rect: a content box intersected with every ancestor whose
  overflow is not visible. text-clipped uses raw boxes; content-spill and
  text-overlap use visible rects.
- Out of flow: a content box is out of flow if it, or an ancestor inside
  #fe-root, is position absolute or fixed.
- Geometry tolerance: 1px horizontally. Vertically for text: 0.3 x the
  text's font size, because glyph boxes can exceed tight line heights.

### The four checks
1. page-overflow-x (error)
   documentElement.scrollWidth exceeds clientWidth by more than 1px.
   One finding for the page. detail lists up to three deepest elements
   whose right edge passes the viewport.
2. text-clipped
   A text line box extends past the padding box of its nearest ancestor
   with overflow hidden or clip on that axis.
   - error: no ellipsis (x axis) and no line clamp (y axis)
   - info: text-overflow ellipsis or line clamp is set. Truncation is a
     deliberate way to handle long content.
   Ancestors with overflow auto or scroll never produce a finding.
   Replaced elements are exempt: cropping an image is normal.
3. content-spill (error)
   An in-flow content box's visible rect extends past the border box of
   its nearest visibly boxed ancestor. Visibly boxed means any of: a
   non-transparent background color, a background image, a border with
   width and color, a box shadow, or an outline.
   Out-of-flow content is exempt.
4. text-overlap (error)
   The visible rect of an in-flow text line box intersects another
   in-flow content box that belongs to a different element, where neither
   element contains the other. The intersection must be wider than 2px
   and taller than 0.3 x the smaller font size. Line boxes of the same
   element never count against each other. Two non-text boxes never
   count (overlapping avatars are a design choice).

Deferred until a real failure needs them: off-canvas, element-collapsed

### Implementation notes (v0)
- Clipping follows the containing-block chain: an absolutely positioned
  box is clipped only by positioned (or transformed) ancestors, a fixed
  box only by transformed ones.
- text-clipped looks at the nearest ancestor whose overflow on that axis
  is not visible. If that ancestor scrolls (auto or scroll) there is no
  finding. Clipping by a second, further-out hidden ancestor is not
  reported.
- Line clamp means -webkit-line-clamp or line-clamp on the clipping
  ancestor or between it and the text.
- content-spill looks for boxed ancestors below #fe-root only. The
  stage's background does not count; overflow past the viewport is
  page-overflow-x's job.
- text-overlap: when the other box is not text, the height threshold uses
  the text's font size.
- rect: page-overflow-x reports the strip past the viewport. text-clipped
  reports where the cut is visible: the part of the clipped lines inside
  the clipping box, or the clipping box when they are hidden entirely.
  The other checks report the merged (visible) boxes.
- The check lab (harness/src/lab/cases.ts, route /?lab=<id>) pins the
  behaviour of every check with minimal positive and negative cases.

## Roadmap
1. Attribution setup (done)
2. Repo foundation and harness walking skeleton (done)
3. Checks v0 on hand-written robust and brittle samples
4. Mutation engine
5. Brief format and first 10 briefs
6. Generation runner, one model
7. End-to-end spike and go/no-go review
8. Full brief corpus (about 40)
9. Multi-model runs
10. Labelling tool and calibration
11. Scoring and report tables
12. Results site
13. CLI packaging
14. Write-up and README
