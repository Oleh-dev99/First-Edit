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
- Survival rate = mutations survived / mutations applicable. See Case
  results.
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
- The mutation is chosen with the query parameter `mutation=<id>`. See
  Mutations (v0).

## Layout
- briefs/<brief-id>/ : brief.md, props.ts, fields.json,
  fixture.baseline.json and optional fixture.<name>.json
- candidates/<source>/<brief-id>/<variant>/Component.tsx
  (source is _samples or a model id)
- harness/ : Node. Vite app, Playwright runner, mutations, checks
- runner/ : Python. Generation, scoring, calibration (added later)
- results/ : run output, git-ignored
- docs/ : spec, methodology, decisions

## Fields map
Each brief has briefs/<id>/fields.json, which declares what every value
in the fixture is, so mutations only touch real content.
- Keys are paths in dot notation; `[]` means every item of an array.
  Examples: "skills", "skills[]", "links[].label".
- Value: { kind, required?, min?, max? }
- Kinds:
  - label: short UI text: names, titles, button labels, tags
  - prose: sentences and paragraphs
  - number: a number shown to the user
  - list: an array whose length can vary
  - id: a unique identifier
  - fixed: never mutated: enums, booleans, dates, URLs
- required (label, prose): never emptied
- min, max (list): length bounds. Default min 0, no max.

Validation: every string, number, boolean and array in the baseline
fixture must match a declared path, and every declared path must exist.
A violation is an error, not a warning. Also errors: a value that does not
fit its kind (label and prose hold strings, number a number, list an
array, id a string or number), a malformed declaration (unknown kind or
property, required outside label and prose, min or max outside list or
not a non-negative integer, min above max) and a list length outside
min and max. null values need no declaration. The app validates the
fixture it renders on every candidate render; the stress runner validates
before it renders anything.

## Mutations (v0)
Content mutations live in harness/src/mutations/: pure functions with no
DOM and no randomness, importable from Node and from the app:
`(fixture, fields, mutationId) => { fixture, changed }`, where `changed`
lists the concrete paths that changed (e.g. "skills[2]"). Every eligible
field is mutated at once. If nothing changed, the mutation is "not
applicable" for that brief.

Content mutations:
- text-long: every label and prose value grows by the lower bound of
  IBM's expansion table, based on its current length: up to 10 chars
  +100%, 11-20 +80%, 21-30 +60%, 31-50 +40%, 51-70 +31%, over 70 +30%
  (rounded up, lengths in characters). Values with spaces grow by
  appending their own words in order, cut at the target length. Single
  words grow by appending their own letters, with no space. Empty values
  stay empty.
- text-unbroken: in every label and prose value, the longest word (the
  first one on a tie) is replaced by one fixed 60-letter token (letters
  only).
- text-empty: every label and prose value that is not required becomes
  "".
- list-0: every list with min 0 becomes empty.
- list-1: every list keeps only its first item (skip if min > 1).
- list-many: every list is repeated in order to 10 times its length,
  capped at max. `id` values inside repeated items get a numeric suffix
  so they stay unique: "home" becomes "home-2", "home-3", ...; a numeric
  id gets two appended digits (7 becomes 702, 703, ...).
- number-large: integers become 1234567890; non-integers become
  1234567.89.

Environment mutations (always applicable):
- viewport-320: viewport 320x800
- text-200pct: root font size 32px, which is what a browser's default
  font size set to 200% does
- dir-rtl: dir="rtl" on <html>

The baseline and all other mutations render at 1280x800. Run order:
text-long, text-unbroken, text-empty, list-0, list-1, list-many,
number-large, viewport-320, text-200pct, dir-rtl.

The app applies `mutation=<id>`: a content mutation to the fixture before
rendering, text-200pct and dir-rtl to <html>. The viewport is set by the
runner. Every case records its query string, so it can be reproduced by
opening that URL with `npm run dev` at the case's viewport.

Deferred until a check can see its effect: image-missing.

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

## Case results
`npm run stress -- --brief <id> --candidate <path>` renders the baseline
and then every applicable mutation, and runs the checks on each.
- Baseline: fixture "baseline", no mutation, 1280x800. Its error findings
  are "born broken"; they are reported once and never count against a
  mutation.
- New-finding rule: a finding is new if it is an error and no baseline
  finding (of any severity) has the same check and selector.
- Survived: the case rendered (status ok) and has no new findings.
- Not applicable: a content mutation that changes nothing for the brief
  is not rendered and is left out of the survival rate.
- render-error: the candidate threw during render or the page crashed.
  window.__FE_ERROR__ holds the message, which the page also shows.
  timeout: the page did not become ready within 30 s. Both are failed
  cases; the run continues with the next case.
- Survival rate = survived / applicable.
- Statuses: ok, render-error, timeout, not-applicable.

Output in results/runs/<brief>/<candidate with / replaced by __>/ (the
directory is replaced on every run):
- baseline.json: case, brief, candidate, fixture, query, viewport,
  status, error, bornBroken, findings
- <mutation>.json for every rendered case: case, brief, candidate,
  fixture, mutation { id, kind }, changed (content mutations; null
  otherwise), query, viewport, status, error, survived, newErrors,
  newFindings, findings
- <case>.png and <case>.annotated.png when a screenshot could be taken
  (not after a timeout)
- summary.json, below

### summary.json (schemaVersion 1)
The contract with the Python side. File names are relative to the run
directory. There is no timestamp, so two runs of the same code diff
cleanly. Bump schemaVersion on any incompatible change.

```
{
  "schemaVersion": 1,
  "brief": "hello-card",
  "candidate": "_samples/hello-card/brittle",
  "fixture": "baseline",
  "versions": { "playwright": "<npm version>", "chromium": "<browser version>" },
  "baseline": {
    "status": "ok" | "render-error" | "timeout",
    "errors": <born-broken error count>,
    "viewport": { "width": 1280, "height": 800 },
    "files": { "result": "baseline.json", "screenshot": <name> | null, "annotated": <name> | null }
  },
  "mutations": [                       // every mutation, in run order
    {
      "id": "<mutation id>",
      "kind": "content" | "environment",
      "applicable": true | false,
      "status": "ok" | "render-error" | "timeout" | "not-applicable",
      "survived": true | false | null, // null when not applicable
      "newErrors": { "page-overflow-x": n, "text-clipped": n,
                     "content-spill": n, "text-overlap": n } | null,
                                       // null when not applicable or not rendered
      "files": { "result": "<id>.json", "screenshot": <name> | null,
                 "annotated": <name> | null } | null
    }
  ],
  "totals": {
    "mutations": 10, "applicable": n, "survived": n, "failed": n,
    "survivalRate": <survived / applicable, 4 decimals> | null
  }
}
```

## Known gaps
Accepted in step 3:
- text-clipped does not report clipping by a second, further-out hidden
  ancestor.
- Out-of-flow content is exempt from content-spill and text-overlap
  (D-006): a positioned label that collides with text after a mutation is
  not caught.
- Boxes are rectangles: text that overflows a rounded shape (for example
  initials past the curve of a round avatar) is not caught.

Found in step 4:
- A visibly boxed element that spills out of its boxed parent is not
  caught while its own text stays inside it. content-spill compares
  content boxes with their nearest boxed ancestor, and a tag pill is that
  ancestor for its own text. Seen with the brittle hello-card: under
  text-long and text-200pct its tag pills run out of the card with no
  finding.
- Selectors are structural, so a mutation that adds or removes elements
  (list-0 removing a list, list-many) can shift nth-child indices. A
  problem that already exists at baseline can then look new.
- Empty states are not judged: text-empty can leave a blank placeholder
  (an avatar with no initials, an empty fixed-height box) that no check
  sees. element-collapsed is deferred.
- page-overflow-x culprits only look past the right edge. With dir-rtl,
  overflow goes to the left, so culprits would be empty and the rect
  strip is drawn on the wrong side. Not yet observed.

## Roadmap
1. Attribution setup (done)
2. Repo foundation and harness walking skeleton (done)
3. Checks v0 on hand-written robust and brittle samples (done)
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
