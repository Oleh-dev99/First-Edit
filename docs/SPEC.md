# First Edit - specification (v0.1)

## Thesis
Benchmarks for AI-generated UI score how the output looks at the moment
it is generated. First Edit scores what happens next: whether the layout
survives when the content changes.

## Terms
- Brief: a UI task. A prompt, a TypeScript props interface (the data
  contract), a baseline fixture (JSON matching the interface) and a
  fields map. See Brief format.
- Candidate: one React component implementing a brief. Hand-written or
  model-generated.
- Reference candidate: a hand-written candidate for a corpus brief that
  survives every applicable case of both tiers and hides no content. See
  Reference candidates.
- Mutation: a deterministic change to the fixture (content) or to the
  render environment (viewport width, text size, direction).
- Check: a deterministic in-page function that returns findings of the
  form { check, severity, selector, rect, text, detail }. See Checks (v0).
- Case: one candidate rendered under one mutation at one viewport (a
  content mutation runs at 1280 and at 320; see Cases). A screenshot
  plus findings. Every case is in the core or the extreme tier (D-039).
- Baseline: the candidate rendered with the unmodified fixture at
  1280x800.
- Suite: the cases with their tiers, the checks with their tolerances,
  and the new-finding rule. The current suite is v1, and it is frozen
  (D-044; see Suite v1).

## Candidate contract
- One self-contained .tsx file with a default export. It declares its own
  props type, matching the brief's interface.
- Imports allowed: react only.
- Styling: Tailwind utility classes and inline styles. No other CSS, no
  external assets, no network.
- Images come from props only: an image's src is taken from the fixture,
  never hard-coded. Inline SVG icons drawn in the component are allowed.
- No randomness, no timers, no data fetching.

## Scoring
- A finding counts against a case only if it is new relative to the
  case's reference render: the baseline, or viewport-320 for a content
  case at 320 px (see Cases, and the new-finding rule in Case results).
  Findings already present in the baseline are reported separately as
  "born broken".
- Before scoring, every candidate is in one of four states (D-038):
  invalid (it failed the gate), baseline crash (the baseline threw or
  timed out), born broken (the baseline has error findings) or clean.
  Each is reported as its own number; a sample whose API call failed has
  no candidate and is counted as an API error.
- Only clean candidates are scored. The headline is the share of clean
  candidates that broke at least once in a core case, that is with one
  or more failed core cases, with a 95% Wilson interval (D-033, D-039).
  The same measure over all cases, the extreme ones included, is always
  reported beside it. The failure rate per case (failed / applicable
  cases, also with a Wilson interval) and the mean survival rate
  (survived / applicable cases, per candidate) are secondary; both are
  reported per tier and over all cases.
- Reported per model and variant, pooled across models per variant, per
  case and per check.
- v0 judges geometric breakage only: overflow, clipping, spill, overlap,
  content cut off by the viewport and crashes. Empty states (blank
  placeholders, collapsed boxes) are out of scope. Hidden content is
  measured (content-hidden) but never fails a case.

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
- briefs/<brief-id>/ : meta.json, brief.md, props.ts,
  fixture.baseline.json, fields.json. See Brief format.
- candidates/<source>/<brief-id>/<variant>/Component.tsx
  (source is _samples, _reference or a model id; model outputs are
  git-ignored, D-029)
- harness/ : Node. Vite app, Playwright runner, mutations, checks
- runner/ : Python. Generation (see Generation); scoring and calibration
  later
- results/ : run output, git-ignored
- docs/ : spec, methodology, decisions

## Brief format
briefs/<id>/ contains exactly:
- meta.json: { id, title, category, sample }. id equals the directory
  name. category is one of: card, list, table, form, navigation,
  dashboard, page-section, messaging, board, dialog, feed. sample is
  true for hello-card and false for corpus briefs.
- brief.md: the request a model will receive
- props.ts: `export interface Props`, plus helper types if needed
- fixture.baseline.json
- fields.json (see Fields map)

A sample brief may also carry extra fixtures (fixture.<name>.json, e.g.
hello-card's fixture.stress.json) for the harness's own tests. Corpus
briefs carry none.

Rules for writing a corpus brief:
1. brief.md is sent to models word for word, together with props.ts and
   the baseline fixture. Write it as a product request in 80 to 150
   words: what the component is for, what it shows, and whether it is a
   full-width page section or a self-sized widget.
2. No implementation hints: no CSS, no layout techniques, no pixel sizes.
3. No robustness hints: nothing about long text, wrapping, truncation,
   small screens, many items or empty data. This matters more than any
   other rule, because the benchmark measures what models do unprompted.
4. Static render only. No behaviour is required.
5. Props are plain data: strings, numbers, booleans, arrays, nested
   objects and string-literal unions. No functions, no React nodes, no
   display-derived values (D-007). Images are referenced only by a
   /fe-assets/ path in a field declared fixed (see Images).
6. The fixture is realistic mock data, as a designer would put in a
   mockup: plausible names and amounts, 3 to 8 items per list, English.
7. At least 9 of the 11 mutations must be applicable.
8. No file names and no mention of imports.
9. No size words about content: one-line, short, long, brief, small,
   few. They are hints in the wrong direction.
10. Invented product and company names only. No real brands or people.

props.ts is sent to models too, so rules 2, 3, 8 and 9 apply to its
comments as well.

`npm run briefs:check [-- --brief <id>]` (in harness/, separate from
`npm test`) validates every brief: the files and meta.json, the fields
map against the baseline fixture, the baseline fixture against Props
with tsc (string-literal unions included), image references and the
number of applicable mutations. For corpus briefs it also enforces
rule 1 (word count), rules 2, 3, 8 and 9 on brief.md and props.ts (a
list of banned words, which catches the common cases but not every
phrasing), rule 5 (plain data, images), 6 (list sizes) and 7. Rule 10
needs a human review. It prints one row per brief and exits non-zero if
any brief fails.

## Reference candidates
Every corpus brief ships a reference candidate at
candidates/_reference/<brief-id>/v1/Component.tsx. It follows the
candidate contract, is written the way a careful senior front-end
engineer would (it must look good at baseline, not merely survive), and
never special-cases mutation values. briefs:check verifies that its
default export accepts Props (type-level), that it imports nothing but
react (found with a parser, so comments and strings never count), that
its baseline is clean, that every applicable case of both tiers
survives (the @320 cases included) and that no case hides content
(content-hidden 0). A reference therefore shows that a full score is
attainable for its brief, in the extreme tier too (D-017).

A reference never hides fixture content, at any viewport or under any
mutation (D-019). Truncation with an ellipsis (or a line clamp) is
allowed; display none, visually hidden text and icon-only replacements
are not. Content inside a scroll container that is reachable by
scrolling counts as shown. Showing the same content in a different
arrangement at another width (for example a table on wide screens and a
stacked list on narrow ones) is not hiding.

If a reference fails because a check is wrong, the reference is not bent
around the check: a lab case reproduces the false positive and the check
is fixed.

## Images
The harness serves six abstract placeholder SVGs, without text, under
/fe-assets/ (from harness/public/fe-assets/): placeholder-1x1,
placeholder-4x3, placeholder-3x2, placeholder-16x9, placeholder-3x4 and
placeholder-2x3 (.svg), each with its own aspect ratio. A fixture
references images only by a /fe-assets/ path, in a field declared fixed;
briefs:check fails on any other image reference, on a missing asset and
on an image field that is not fixed. A reference that hard-codes an
image src fails too.

A failed image load never hangs readiness: the page waits for every
image to decode or fail, lazy images are switched to eager first (below
the fold they would never load), and the wait is capped at 5 s.

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
  (rounded up, lengths in characters). Values with spaces grow by whole
  words: their own words are appended in order until the value reaches
  at least the target length, so a grown value never ends in a cut word
  (D-037). Single words grow by appending their own letters, with no
  space, cut at the target. Empty values stay empty.
- text-longword: in every label and prose value, the longest word (the
  first one on a tie) is replaced by one fixed 30-letter token (letters
  only), the length of a long compound word, surname or identifier
  (D-039).
- text-unbroken: the same with one fixed 60-letter token (letters
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
text-long, text-longword, text-unbroken, text-empty, list-0, list-1,
list-many, number-large, viewport-320, text-200pct, dir-rtl.

### Cases
A case is one render that is scored. The stress suite has 19
(harness/src/mutations/cases.ts), in run order:
- the 8 content mutations at 1280x800 (kind "content")
- the 3 environment mutations (kind "environment")
- the 8 content mutations again at 320x800, named <mutation>@320 (kind
  "content@320"), applicable whenever the mutation is (D-032)

Every case has a tier (D-039):
- extreme: text-unbroken and text-unbroken@320. A 60-letter word with no
  break opportunity is a hard limit that few real values reach.
- core: every other case, text-longword and text-longword@320 (a
  30-letter word) included.

The headline counts core cases only, and the extreme ones are always
reported beside it. A reference must survive both tiers.

Each case has a reference render for the new-finding rule: the baseline
for every case except the content@320 cases, which are judged against
the viewport-320 render. A phone-width content case then counts only
breakage that the narrow screen alone did not already cause. A
content@320 case is opened with the same query as its mutation
(`mutation=text-long`) at a 320px viewport.

The app applies `mutation=<id>`: a content mutation to the fixture before
rendering, text-200pct and dir-rtl to <html>. The viewport is set by the
runner. Every case records its query string, so it can be reproduced by
opening that URL with `npm run dev` at the case's viewport.

Deferred until a check can see its effect: image-missing.

### Suite v1
The cases and their tiers (above), the checks and their tolerances
(Checks (v0)) and the new-finding rule (Case results) together are the
stress suite. Suite v1 is the suite as of step 10, plus the step 11
change to page-overflow-x culprits, which changes detail only. It is
frozen (D-044): from step 11 on, only bug fixes change it, and each fix
is recorded in docs/DECISIONS.md with its lab case and its effect on
results. A fix keeps the version; a change of design would start suite
v2. Every stress summary records the suite it ran (`"suite": "v1"`),
and so does report.md.

## Checks (v0)
A check is a plain DOM function `(root: Element) => Finding[]` with no
imports from the app. The page exposes `window.__FE_RUN_CHECKS__()`, which
runs every check on #fe-root and returns the findings.

Finding: { check, severity, selector, matchKey, rect, text, detail }
- severity: "error" counts against survival; "info" is recorded only
- selector: a structural path from #fe-root (tag and nth-child), stable
  for the same DOM; for display
- matchKey: the path from #fe-root with the tag and the classes (sorted)
  of each level and no positions, for example
  "#fe-root > ul.grid > li.card > span.tag"; "html" for page-level
  findings. The new-finding rule matches on it (D-040).
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
  overflow is not visible. text-clipped uses raw boxes; text-overlap and
  off-screen use visible rects; content-spill clips a box only by the
  ancestors between it and its boxed ancestor (D-043).
- Out of flow: a content box is out of flow if it, or an ancestor inside
  #fe-root, is position absolute or fixed.
- Geometry tolerance: horizontally 1px for page-overflow-x and
  text-clipped, and 2px for content-spill and off-screen, where overflow
  of up to 2px from centring or rounding cannot be seen (D-042).
  Vertically for text: 0.3 x the text's font size, because glyph boxes
  can exceed tight line heights; 1px for other boxes.

### The checks
1. page-overflow-x (error)
   documentElement.scrollWidth exceeds clientWidth by more than 1px.
   One finding for the page. detail names up to three culprits: elements
   whose border box, text line boxes or replaced elements pass the
   viewport's right edge (visible rects, elements in fixed or absolute
   subtrees included), leaving out an element when one of its
   descendants is a culprit too, the ones that reach furthest first and
   the deepest on a tie. A word that runs out of its element passes the
   viewport while the element's box does not, so the element is named by
   its text. The culprits are detail only; they never decide whether the
   check fires.
2. text-clipped
   A text line box extends past the padding box of its nearest ancestor
   with overflow hidden or clip on that axis.
   - error: no ellipsis (x axis) and no line clamp (y axis)
   - info: text-overflow ellipsis or line clamp is set. Truncation is a
     deliberate way to handle long content.
   Ancestors with overflow auto or scroll never produce a finding.
   Replaced elements are exempt: cropping an image is normal.
3. content-spill (error)
   An in-flow content box extends past the border box of its nearest
   visibly boxed ancestor. The content box is first clipped by the
   ancestors with overflow other than visible that lie between it and
   that boxed ancestor, the boxed ancestor included, and by no others
   (D-043): a scroll container further out, such as a sideways-scrolling
   board around a card, does not hide a spill from the card. Visibly
   boxed means any of: a
   non-transparent background color, a background image, a border with
   width and color on all four sides, a box shadow, or an outline. A
   border on some sides only, such as a divider line, does not make a box
   (D-034).
   A visibly boxed element is itself a content box for this check: its
   border box is compared with the border box of its own nearest visibly
   boxed ancestor, under the same in-flow and clipping rules, with a 2px
   tolerance horizontally and 1px vertically. One finding per spilling
   element.
   Out-of-flow content is exempt.
4. text-overlap (error)
   The visible rect of an in-flow text line box intersects another
   in-flow content box that belongs to a different element, where neither
   element contains the other. The intersection must be wider than 2px
   and taller than 0.3 x the smaller font size. Line boxes of the same
   element never count against each other. Two non-text boxes never
   count (overlapping avatars are a design choice).
5. off-screen (error, D-035)
   A content box is cut off by the viewport edge and cannot be scrolled
   into view:
   (a) it is inside a position: fixed subtree and its visible rect passes
       the viewport's left or right edge by more than 2px, or
   (b) its page x-coordinate is below -2 (left of the page, which cannot
       be scrolled to). In a right-to-left page the unreachable side is
       the right: a box past the viewport's right edge by more than 2px.
   Boxes that lie entirely more than one viewport width beyond an edge
   are a deliberate parking pattern (a skip link at left -9999px) and are
   ignored. Unlike content-spill and text-overlap, off-screen covers
   out-of-flow content; D-006 still exempts it from those two. One
   finding per element; rect is the part on screen, or a 4px strip at the
   edge when the box lies entirely past it.

Deferred until a real failure needs it: element-collapsed. off-screen
replaces the deferred off-canvas check.

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
  page-overflow-x's job. Because it clips a box only inside its boxed
  ancestor (D-043), a spill is measured even where the card itself lies
  outside a scroll container's window.
- text-overlap: when the other box is not text, the height threshold uses
  the text's font size.
- rect: page-overflow-x reports the strip past the viewport. text-clipped
  reports where the cut is visible: the part of the clipped lines inside
  the clipping box, or the clipping box when they are hidden entirely.
  The other checks report the merged (visible) boxes.
- The check lab (harness/src/lab/cases.ts, route /?lab=<id>) pins the
  behaviour of every check with minimal positive and negative cases.

## Case results
`npm run stress -- --brief <id> --candidate <path> [--runs-dir <dir>]`
renders the baseline and then every applicable case (see Cases), and runs
the checks on each.
- Baseline: fixture "baseline", no mutation, 1280x800. Its error findings
  are "born broken"; they are reported once and never count against a
  case.
- New-finding rule: a finding is new if it is an error and no error of
  the case's reference render has the same check and matchKey (D-040).
  An info finding in the reference cancels nothing (D-041). The
  reference is the baseline, or the viewport-320 render for a
  content@320 case (D-032).
- Survived: the case rendered (status ok) and has no new findings.
- Not applicable: a content mutation that changes nothing for the brief
  is not rendered and is left out of the survival rate; so is its @320
  case.
- render-error: the candidate threw during render or the page crashed.
  window.__FE_ERROR__ holds the message, which the page also shows.
  timeout: the page did not become ready within 30 s. Both are failed
  cases; the run continues with the next case. The page's console is
  not forwarded to the terminal; the error message is kept in the case
  JSON.
- Survival rate = survived / applicable.
- Truncations: the text-clipped info findings of a case (text cut with an
  ellipsis or a line clamp) are counted as `truncations`, a secondary
  measure (D-021). They never fail a case.
- Content hidden: see below. Info only; it never fails a case.
- Statuses: ok, render-error, timeout, not-applicable.

### Content hidden (D-036)
content-hidden counts fixture text that a narrow, enlarged or mirrored
render does not show although the same data shows it at 1280 with
default settings. It is measured for viewport-320, text-200pct and
dir-rtl against the baseline, and for every <mutation>@320 case against
<mutation> at 1280. The values compared are the label and prose values
of the rendered fixture (after the mutation), whitespace-normalized and
lower-cased, each counted once. A value is visible when it is part of
the visible text of the page: text whose line box has an area and is
not fully clipped by an ancestor with overflow hidden or clip, plus the
value, placeholder or selected option of a visible form control. Text
reachable by scrolling inside a scroll container counts as visible, and
so does text cut with an ellipsis; display none, visibility hidden and
screen-reader-only text do not. The count is the number of values
visible in the reference render and not visible in the case. Each case
records the hidden values. The page exposes
`window.__FE_VISIBLE_VALUES__()` for this; the lab cases in
harness/src/lab/hidden-cases.ts pin it.

Output in <runs-dir>/<brief>/<candidate with / replaced by __>/ (the
runs directory defaults to results/runs; the candidate's directory is
replaced on every run):
- baseline.json: case, brief, candidate, fixture, query, viewport,
  status, error, bornBroken, truncations, findings
- <case>.json for every rendered case: case, kind, tier, brief, candidate,
  fixture, mutation { id, kind }, changed (content mutations; null
  otherwise), query, viewport, reference, status, error, survived,
  newErrors, truncations, contentHidden, hiddenReference, hiddenValues,
  newFindings, findings
- <case>.png and <case>.annotated.png when a screenshot could be taken
  (not after a timeout)
- summary.json, below

### summary.json (schemaVersion 3)
The contract with the Python side. File names are relative to the run
directory. There is no timestamp, so two runs of the same code diff
cleanly. Bump schemaVersion on any incompatible change.

```
{
  "schemaVersion": 3,
  "suite": "v1",                       // the stress suite (D-044)
  "brief": "hello-card",
  "candidate": "_samples/hello-card/brittle",
  "fixture": "baseline",
  "versions": { "playwright": "<npm version>", "chromium": "<browser version>" },
  "baseline": {
    "status": "ok" | "render-error" | "timeout",
    "errors": <born-broken error count>,
    "truncations": <text-clipped info findings> | null, // null when not rendered
    "viewport": { "width": 1280, "height": 800 },
    "files": { "result": "baseline.json", "screenshot": <name> | null, "annotated": <name> | null }
  },
  "cases": [                           // every case, in run order
    {
      "id": "<case id>",               // "text-long", "viewport-320", "text-long@320"
      "mutation": "<mutation id>",
      "kind": "content" | "environment" | "content@320",
      "tier": "core" | "extreme",
      "viewport": { "width": 1280 | 320, "height": 800 },
      "reference": "baseline" | "viewport-320",
      "applicable": true | false,
      "status": "ok" | "render-error" | "timeout" | "not-applicable",
      "survived": true | false | null, // null when not applicable
      "newErrors": { "page-overflow-x": n, "text-clipped": n, "content-spill": n,
                     "text-overlap": n, "off-screen": n } | null,
                                       // null when not applicable or not rendered
      "truncations": n | null,         // null when not applicable or not rendered
      "contentHidden": n | null,       // null when not measured or a render failed
      "files": { "result": "<id>.json", "screenshot": <name> | null,
                 "annotated": <name> | null } | null
    }
  ],
  "totals": {
    "cases": 19, "applicable": n, "survived": n, "failed": n,
    "survivalRate": <survived / applicable, 4 decimals> | null,
    "contentHidden": <sum over measured cases>
  }
}
```

## Generation
The Python runner (runner/, package first_edit, Python 3.13) prompts
models for candidates and stress-tests them:

```
python -m first_edit generate --model <id> [--brief <id> | --all]
  [--variant plain|hinted] [--samples N] [--max-requests N] [--max-cost USD]
python -m first_edit stress --model <id> [--brief <id> | --all]
  [--variant plain|hinted]
python -m first_edit doctor
python -m first_edit summarize --out <dir> [--model <id> ...]
```

--all means every corpus brief (sample: false). The default variant is
plain for generate and every variant found for stress. Setup: a virtual
environment at .venv in the repo root, then
`python -m pip install -r runner/requirements.lock -e runner`.
Dependencies are httpx and python-dotenv, plus pytest for tests.

### Models file
runner/models.toml lists the models the runner may call:

```
[[model]]
id = "mock-reference"        # used in paths and reports
provider = "mock"

[[model]]                    # a real entry
id = "example-model"
provider = "openai-compatible"
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"
model = "<provider model id>"
params = { max_tokens = 16000 }        # merged into the request body
price = { input = 0.0, output = 0.0 }  # USD per million tokens, optional
```

- openai-compatible: POST {base_url}/chat/completions with a Bearer key
  read from the variable named by api_key_env. It is the only real
  provider type (D-023). Keys live in .env; .env.example lists the names.
- mock: replies with the brief's reference candidate inside one tsx code
  fence, with no network.
- A model id matches [a-z0-9][a-z0-9._-]* and is used in paths.

### Prompt
The prompt is part of the method; its text is fixed and stored under
runner/first_edit/prompts/, used verbatim.

System message (system.md):

```
Write one React component in TypeScript, styled with Tailwind CSS v4
utility classes.

Rules:
- Reply with one fenced code block that contains the complete file, and
  nothing else.
- The file has a default export: a function component that takes the
  props described by the Props interface in the request.
- Declare the Props types inside the file. Do not import them.
- Import from "react" only. No other imports.
- Style with Tailwind utility classes and inline styles only. There is
  no custom Tailwind configuration.
- Images come only from URLs in the props. No other assets and no
  network requests.
- No timers, no randomness, no data fetching and no browser storage.
- The component is rendered once with the given props. It does not need
  to be interactive.
```

User message, variant plain (user.md; {brief}, {props} and {fixture} are
brief.md, props.ts and fixture.baseline.json, each trimmed):

````
{brief}

## Props interface

```ts
{props}
```

## Example props

```json
{fixture}
```
````

User message, variant hinted: the plain message, a blank line, then
(hint.md):

```
The component will be used with real content: text of any length, lists
of any size including empty ones, numbers of any size, and screens from
320px wide. Nothing may overflow, be cut off or overlap.
```

The example props are the baseline fixture (D-028). The plain variant
carries no robustness hints, like the briefs; the hinted one measures how
much an explicit instruction helps (D-026).

### Sampling
The request body is the provider model id, the two messages and the
entry's params, nothing else: no temperature or seed unless params sets
them (D-024). Samples are repeated calls with the same prompt, numbered
s1, s2 and so on.

### Cache
Every raw reply is stored in results/cache/<key>.json, where the key is
the SHA-256 of the model entry's identity (id, provider, base URL,
provider model id), its params, both messages and the sample number. A
cached reply is reused as is, so a sample is never re-rolled; price and
key name are not part of the key.

### Calls, retries and budget
- Timeouts, HTTP 429 and 5xx are retried with exponential backoff (2, 4
  and 8 s), at most four attempts (two for a free model variant, below).
  Any other API error fails the sample at once; it is recorded and, since
  nothing is cached, called again on the next run (D-025).
- --max-requests: stop before the provider call that would exceed this
  count. A call and its retries count once; cache hits are free.
- --max-cost: when the entry has prices, stop before a call whose upper
  estimate would exceed the limit. The estimate is the prompt (4
  characters per token) at the input price plus the params' max_tokens
  (16,000 if unset) at the output price. Spend counts the cost the
  response reports (OpenRouter's usage.cost), or the configured prices
  times the reported usage when it reports none.
- The read timeout is 600 s: a long reply with reasoning can take
  minutes, and a timed-out call that is retried may be billed twice.
- Skipped samples are printed and get no files.

### Free model variants
A model whose provider model id ends in ":free" (OpenRouter's free
variants) costs nothing but is limited per account: 20 requests a minute
and 50 a day, where every request counts, retries and failures included.
For such a model the runner:
- counts every HTTP request it sends, retries included, per UTC day in
  results/cache/free-requests.json (one count for all free models), and
  refuses to send the 46th request of a day, a margin below the
  provider's 50. A request is counted before it is sent.
- makes at most two attempts per sample instead of four.
- sends requests at least 4 s apart, across commands too: the ledger
  keeps the time of the last request.
- prints the day's requests sent and left after every generate command.

A sample whose call, or retry, is refused by the ledger is skipped like a
budget skip: it gets no files and is called on a later run, and every
call after it in the same command is skipped too. Replies already
received are cached, so a run resumes another day at no cost. The
doctor's listing requests are not counted; they are not model requests.

### Candidate files and validity
Each sample is written to
candidates/<model-id>/<brief-id>/<variant>-s<n>/:
- Component.tsx: exactly one fenced block is used as is; with several,
  the largest, with a warning; with none, the whole reply.
- generation.json: schemaVersion, brief, candidate, model entry (the key's
  variable name, never the key), variant, sample, cacheKey, promptHash,
  cached, generatedAt, receivedAt, status (generated or api-error),
  reportedModel and reportedProvider (as the response names them), usage
  (inputTokens, cachedInputTokens, outputTokens, and reasoningTokens,
  which are part of outputTokens; null where not reported),
  estimatedCostUsd (configured prices times usage), actualCostUsd (the
  cost the response reports, else null), latencyMs, attempts,
  finishReason, extraction, warnings, valid and reasons.

A candidate is valid only if the reply has content, the gate passes and
the reply was not cut off by the token limit (finish reason "length",
reason "truncated"). A reply with no content gets the reason "empty",
plus "reasoning-exhausted" when it was cut off by the token limit and
the provider reports reasoning tokens (the model spent the output budget
thinking); the gate is not run on it. The gate is
`npm run candidate:check -- --brief <id> --candidate <path> --json`,
which prints { valid, reasons: [{ rule, message }] } and exits 0 either
way. Its rules:
- parse: the file parses
- default-export: it has a default export
- props: the default export accepts the brief's Props (tsc; type errors
  inside the component itself do not count)
- imports: it imports nothing but react (no require either)
- network, timers, randomness, storage: no fetch, XMLHttpRequest,
  WebSocket, EventSource or sendBeacon; no setTimeout, setInterval,
  setImmediate, requestAnimationFrame or requestIdleCallback; no
  Math.random, crypto.getRandomValues or crypto.randomUUID; no
  localStorage, sessionStorage, indexedDB or document.cookie
- dynamic-import: no import()
- hardcoded-url: no http(s) or protocol-relative URL in src, href,
  srcSet, or in any string containing CSS url()

Invalid output is a model failure: it is recorded, never re-rolled, and
not stressed (D-025). Every folder under candidates/ except _samples and
_reference is git-ignored: model outputs stay out of git until a run is
published (D-029). Tailwind skips git-ignored files unless a source
points into the ignored folder, so harness/src/styles.css names them all
with `@source "../../candidates/*"`; the test tailwind-sources.test.ts
guards it. The harness typecheck (`npm run typecheck`) covers only
candidates/_samples and candidates/_reference: model outputs are judged
by the gate, which does not apply the harness's strict settings.

### Doctor
`python -m first_edit doctor` checks every configured model without
spending tokens: it validates runner/models.toml and, for each real
model, reports whether its key variable is set (by name; the key is never
printed), whether its model is listed at {base_url}/models (with context
length and maximum output), and the listed prices next to the configured
ones, flagging any difference. Listed prices are USD per token and are
shown per million. A model is unusable if its key is not set, it is not
listed, the listing cannot be fetched, or a listed price is higher than
the configured one (the budget would undercount). Exit 0 when every
model is usable, 1 when one is not, 2 on an invalid models file. The
doctor cannot detect region blocking: a model can be listed and usable
here and still answer every call with HTTP 403 ("not available in your
region"), as inkling-2-small-free did in step 8. Only a call shows it.

### Stress
`python -m first_edit stress [--runs-dir <dir>]` runs `npm run stress`
on every valid candidate, writing to the runs directory (default
results/runs), and reads its summary.json. It prints one row per
candidate (brief, variant, sample, valid, baseline state, survived /
applicable, truncations and content hidden over all cases, and the
seconds the stress run took) and totals: clean baseline, born broken
and baseline crash counted as summarize counts them (D-038), survival of
clean-baseline candidates, and the stress time per candidate. Invalid
candidates appear as rows and are not stressed.

### Summarize and the gallery
`python -m first_edit summarize --out <dir> [--model <id> ...]
[--runs-dir <dir>]` reads every generation.json and stress summary of
the given models (default: every non-mock model in runner/models.toml)
for the corpus briefs and writes three files to <dir> (results/spike for
the step 8 spike, results/spike-v2 and results/spike-v3 for its
re-stresses in steps 9 and 10, results/spike-v3b for the step 11
summarize of the step 10 runs). It reads stress summaries of
schemaVersion 3 only and stops with an error on any other, so a runs
directory from an older harness must be stressed again. It also stops on
a summary of another suite; a schema 3 summary without the suite field
was written by the step 10 harness, which is suite v1, and the report
says how many summaries predate the field. Numbers are computed exact
and rounded once, when summary.json is written (4 decimals; costs and
per-case counts keep their own precision), so the report formats exact
values:
- summary.json (schemaVersion 3, no timestamp): per model the provider
  model id, the reported model ids and the first and last call; per model
  and variant, and pooled across models per variant when there are
  several, the numbers below; survival by brief; totals.
- report.md: the same as tables.
- gallery.html: a static page, opened from disk.

Per model and variant:
- the headline: clean-baseline candidates that broke at least once in
  a core case, as a count, a share and a 95% Wilson interval (D-033,
  D-039), and beside it the same measure over all cases
- the failure rate per case (failed / applicable cases, the @320 cases
  included) with a 95% Wilson interval, per tier and over all cases
- candidates (generated samples), valid, invalid and invalid by rule (a
  candidate counts once per rule), API errors, briefs with no candidate,
  valid candidates with no stress results
- clean baseline, born broken and baseline crash (D-038)
- mean, min and max survival rate over clean-baseline candidates
  (secondary), per tier and over all cases
- failed cases per case (failed / applicable, with the case's tier) and
  per check (cases with
  at least one new error from that check), render errors and timeouts
- truncations per rendered case (baseline and cases with status ok), and
  content hidden per measured case with the number of cases that hide
  content
- tokens (input, cached input, output, of which reasoning) and cost: the
  reported cost where there is one, else the estimate

Per variant, pooled over every model in the report, the headline
sensitivity (D-045): the core headline recomputed with one case family
removed at a time, where a family is a mutation together with its @320
case (an environment mutation is a family of one case). The first row
removes nothing and equals the pooled headline; each row gives the
count, share, 95% interval and the change in percentage points.
text-unbroken is extreme only and is left out, since removing it never
changes the headline.

Every scored number covers clean-baseline candidates only; born-broken
and crashed candidates are counted, not scored.

The gallery has one card per failed case of a clean-baseline candidate
and per born-broken or crashed baseline, then one card per survived
case. A card shows model, brief, variant and sample, the case and its
tier, status,
viewport, the checks with new errors, truncations, content hidden and
the hidden values, the clean and annotated screenshots side by side
(linked relative to the output directory), the new (or born-broken)
findings and the query that reproduces the case. Cards can be filtered
by model, variant, brief, case, tier, check and whether content is
hidden.

### Tailwind v3 compatibility
The prompt names Tailwind v4, but models often write v3 class names. The
harness keeps the v3 utilities that the v4 upgrade guide
(https://tailwindcss.com/docs/upgrade-guide, "Removed deprecated
utilities") removed and that affect layout, sizing or text overflow
(D-027): flex-shrink, flex-shrink-*, flex-grow, flex-grow-*,
overflow-ellipsis, decoration-slice and decoration-clone. Purely visual
removals and renames (the *-opacity-* utilities, shadow, drop-shadow,
blur, backdrop-blur, rounded, outline-none, ring) are left alone.

## Known gaps
Accepted in step 3:
- text-clipped does not report clipping by a second, further-out hidden
  ancestor.
- Out-of-flow content is exempt from content-spill and text-overlap
  (D-006): a positioned label that collides with text after a mutation is
  not caught. Out-of-flow content cut off by the viewport is caught by
  off-screen (D-035).
- Boxes are rectangles: text that overflows a rounded shape (for example
  initials past the curve of a round avatar) is not caught.

Found in step 4:
- page-overflow-x culprits only look past the right edge. With dir-rtl,
  overflow goes to the left, so culprits would be empty and the rect
  strip is drawn on the wrong side. Not yet observed.

Found in step 6:
- Hiding is measured but never fails a case. content-hidden (D-036)
  counts fixture text that a render at 320, at 200% text or in RTL does
  not show although the same data at 1280 does; hiding at 1280 itself has
  no reference and is not measured. Text cut off inside form controls
  (inputs, selects) still escapes every check, and the no-hiding rule for
  references is enforced by content-hidden 0 plus review.
- list-many copies fixed flags along with the items, so two links can be
  active or two plans highlighted. It also leaves counters in the fixture
  ("3 unread messages", "Showing 6 of 48") unchanged.
- page-overflow-x can fire with an empty culprits list when the overflow
  comes from a screen-reader-only element, which the scan skips. Seen
  when visually hidden text inside a horizontal scroller had no
  positioned ancestor and widened the page.

Found in step 8 and step 9:
- text-clipped never reports clipping by a scroll container. Note that
  overflow-y: auto also makes overflow-x auto, so a chat list with
  overflow-y-auto clips sideways overflow without a finding.
- Content pushed past a scroll container's start edge (left in a
  left-to-right page) cannot be scrolled to and is not reported. Not yet
  observed as a missed failure: the step 9 review saw it only in cases
  that other checks failed.
- One cause often produces many findings (one per element): in the
  step 10 review, one case with two problems had 14 findings. Scores use
  failed cases, not finding counts, so this only makes findings harder
  to read.
- off-screen treats an off-canvas drawer parked at exactly one viewport
  width (translateX(-100%)) as cut off. Not yet observed.
- content-hidden matches values as substrings of the visible text: a
  value that also appears inside another visible value counts as
  visible, and a value the component transforms (sliced, reformatted) is
  invisible in both renders and so never counted.
- The gate passes a file that throws when it runs (a stray identifier
  left by a reply without code-fence backticks); it is reported as a
  baseline crash.
- The doctor cannot detect region blocking (see Doctor).
- Vite's dependency scan logs parse errors for unparseable model outputs
  under candidates/ whenever the dev server starts; rendering is
  unaffected.

Found in step 10:
- A scroll container counts as reachable even when its scrollbar is
  hidden, so content cut off at its edge with no sign that it scrolls
  (a nav row with a hidden scrollbar, seen in the step 10 review) is
  neither an error nor content hidden.
- The match key has no positions (D-040), so an error that the reference
  render has in one item of a list also covers the same check on every
  other element with the same tags and classes. A mutation that makes
  other items of that list break the same way is not new. Elements
  without classes share keys more easily.

Closed in step 5: a visibly boxed element spilling out of its boxed
parent (for example a tag pill out of a card) is now caught by
content-spill (D-014). Empty states are out of scope rather than a gap
(D-016). Closed in step 9: divider lines no longer count as boxes
(D-034), and content cut off by the viewport, fixed headers included, is
caught by off-screen (D-035). Closed in step 10: selector drift (a list
that grows or shrinks shifting nth-child indices, so an existing flaw
looked new) by the match key (D-040); an info finding in the reference
cancelling an error (D-041); invisible 1 to 2px spills (D-042); and
spills hidden by a scroll container outside the card (D-043). Closed in
step 11: page-overflow-x named no culprit, or the wrong elements, when
a word ran out of its element; its culprits now include text line boxes
and replaced elements.

## Roadmap
1. Attribution setup (done)
2. Repo foundation and harness walking skeleton (done)
3. Checks v0 on hand-written robust and brittle samples (done)
4. Mutation engine (done)
5. Spill gap, brief format, first three briefs (done)
6. Seven more briefs (done)
7. Generation runner, one model (done)
8. Spike on free models (done)
9. Post-spike changes and re-stress (done)
10. Tiers and check refinements; re-stress (done)
11. Suite v1 frozen; ten more briefs (20 in total)
12. Second run on 20 briefs with more models; decide on the comparison
13. Published multi-model run, with more briefs if step 12 calls for
    them
14. Labelling tool and calibration
15. Scoring and report tables
16. Results site
17. CLI packaging
18. Write-up and README
