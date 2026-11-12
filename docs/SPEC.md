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
  form { check, severity, selector, rect, detail }.
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

## Layout
- briefs/<brief-id>/ : brief.md, props.ts, fixture.baseline.json
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

## Initial check set
page-overflow-x, text-clipped, sibling-overlap, out-of-viewport,
element-collapsed

## Roadmap
1. Attribution setup (done)
2. Repo foundation and harness walking skeleton
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
