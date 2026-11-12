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
  survives every applicable mutation. See Reference candidates.
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
- Images come from props only: an image's src is taken from the fixture,
  never hard-coded. Inline SVG icons drawn in the component are allowed.
- No randomness, no timers, no data fetching.

## Scoring
- A finding counts against a mutation only if it is new relative to the
  baseline. Findings already present in the baseline are reported
  separately as "born broken".
- Survival rate = mutations survived / mutations applicable. See Case
  results.
- Reported per candidate, per mutation type and per model.
- The headline survival rate is computed only over candidates with a
  clean baseline (no born-broken errors). The share of born-broken
  candidates is reported as its own number. Selector drift (see Known
  gaps) can then only affect candidates already left out of the
  headline.
- v0 judges geometric breakage only: overflow, clipping, spill, overlap
  and crashes. Empty states (blank placeholders, collapsed boxes) are out
  of scope.

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
  dashboard, page-section, messaging, board. sample is true for
  hello-card and false for corpus briefs.
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
7. At least 8 of the 10 mutations must be applicable.
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
its baseline is clean and that every applicable mutation survives. A
reference therefore shows that a full score is attainable for its brief
(D-017).

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
   A visibly boxed element is itself a content box for this check: its
   border box is compared with the border box of its own nearest visibly
   boxed ancestor, under the same in-flow and visible-rect rules, with a
   1px tolerance on both axes. One finding per spilling element.
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
  cases; the run continues with the next case. The page's console is
  not forwarded to the terminal; the error message is kept in the case
  JSON.
- Survival rate = survived / applicable.
- Truncations: the text-clipped info findings of a case (text cut with an
  ellipsis or a line clamp) are counted as `truncations`, a secondary
  measure (D-021). They never fail a case.
- Statuses: ok, render-error, timeout, not-applicable.

Output in results/runs/<brief>/<candidate with / replaced by __>/ (the
directory is replaced on every run):
- baseline.json: case, brief, candidate, fixture, query, viewport,
  status, error, bornBroken, truncations, findings
- <mutation>.json for every rendered case: case, brief, candidate,
  fixture, mutation { id, kind }, changed (content mutations; null
  otherwise), query, viewport, status, error, survived, newErrors,
  truncations, newFindings, findings
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
    "truncations": <text-clipped info findings> | null, // null when not rendered
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
      "truncations": n | null,         // null when not applicable or not rendered
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
  and 8 s), at most four attempts. Any other API error fails the sample
  at once; it is recorded and, since nothing is cached, called again on
  the next run (D-025).
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

A candidate is valid only if the gate passes and the reply was not cut
off by the token limit (finish reason "length"). The gate is
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
guards it.

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
model is usable, 1 when one is not, 2 on an invalid models file.

### Stress
`python -m first_edit stress` runs `npm run stress` on every valid
candidate and reads its summary.json. It prints one row per candidate
(brief, variant, sample, valid, baseline errors, survived/applicable,
truncations over all cases) and totals; invalid candidates appear as
rows and are not stressed.

### Summarize and the gallery
`python -m first_edit summarize --out <dir> [--model <id> ...]` reads
every generation.json and stress summary of the given models (default:
every non-mock model in runner/models.toml) for the corpus briefs and
writes three files to <dir> (results/spike for the step 8 spike):
- summary.json (schemaVersion 1, no timestamp): per model the provider
  model id, the reported model ids and the first and last call; per model
  and variant the numbers below; survival by brief; totals.
- report.md: the same as tables.
- gallery.html: a static page, opened from disk.

Per model and variant:
- candidates (generated samples), valid, invalid and invalid by rule (a
  candidate counts once per rule), API errors, briefs with no candidate,
  valid candidates with no stress results
- clean baseline and born broken (baseline errors, or a baseline that
  did not render)
- mean, min and max survival rate over clean-baseline candidates (D-015)
- failed cases per mutation (failed / applicable) and per check (cases
  with at least one new error from that check), render errors and
  timeouts
- truncations per rendered case (baseline and mutation cases with status
  ok)
- tokens (input, cached input, output, of which reasoning) and cost: the
  reported cost where there is one, else the estimate

Failed cases, survival and truncations cover clean-baseline candidates
only; born-broken candidates are counted, not scored.

The gallery has one card per failed case of a clean-baseline candidate
and per born-broken baseline, then one card per survived case. A card
shows model, brief, variant and sample, the case, status, viewport, the
checks with new errors, truncations, the clean and annotated screenshots
side by side (linked relative to the output directory), the new (or
born-broken) findings and the query that reproduces the case. Cards can
be filtered by model, variant, brief, mutation and check.

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
  not caught.
- Boxes are rectangles: text that overflows a rounded shape (for example
  initials past the curve of a round avatar) is not caught.

Found in step 4:
- Selectors are structural, so a mutation that adds or removes elements
  (list-0 removing a list, list-many) can shift nth-child indices. A
  problem that already exists at baseline can then look new. Accepted:
  the headline survival rate uses clean-baseline candidates only (D-015),
  where there is no old problem to shift.
- page-overflow-x culprits only look past the right edge. With dir-rtl,
  overflow goes to the left, so culprits would be empty and the rect
  strip is drawn on the wrong side. Not yet observed.

Found in step 6:
- Content that is hidden rather than shown is not measured. Display
  none, visually hidden text, icon-only replacements and text cut off
  inside form controls (inputs, selects) escape every check; the
  no-hiding rule for references is enforced by review, not by a check.
- list-many copies fixed flags along with the items, so two links can be
  active or two plans highlighted.
- page-overflow-x can fire with an empty culprits list when the overflow
  comes from a screen-reader-only element, which the scan skips. Seen
  when visually hidden text inside a horizontal scroller had no
  positioned ancestor and widened the page.

Closed in step 5: a visibly boxed element spilling out of its boxed
parent (for example a tag pill out of a card) is now caught by
content-spill (D-014). Empty states are out of scope rather than a gap
(D-016).

## Roadmap
1. Attribution setup (done)
2. Repo foundation and harness walking skeleton (done)
3. Checks v0 on hand-written robust and brittle samples (done)
4. Mutation engine (done)
5. Spill gap, brief format, first three briefs (done)
6. Seven more briefs (done)
7. Generation runner, one model (done)
8. End-to-end spike and go/no-go review
9. Full brief corpus (about 40)
10. Multi-model runs
11. Labelling tool and calibration
12. Scoring and report tables
13. Results site
14. CLI packaging
15. Write-up and README
