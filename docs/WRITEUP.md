# First Edit: does AI-generated UI survive the next edit?

*Preliminary. Written on 2026-11-18, while the run is going: two of the
five models have components so far (ernie-5.5-flash-free has finished, and
nemotron-3.5-free has 33 of its 40), and the other three have none yet.
Every number below will change as the run goes on; the
[results site](https://oleh-dev99.github.io/First-Edit/) always shows the
current ones, and docs/RUNS.md records every call.*

Benchmarks for AI-generated user interfaces judge a component as it looks
the moment it is generated. First Edit asks what happens next. Real content
is longer, shorter, emptier and more numerous than the example a component
was built from, and real screens are narrow. When the content changes the
way real content does, does the layout still hold?

## In short

- **Most components broke under realistic content.** With the plain
  prompt, 23 of 34 components that rendered cleanly (67.6%, 95% interval
  50.8% to 80.9%) broke at least once in a core case; counting the extreme
  60-letter word too, 33 of 34 did.
- **A one-sentence hint helps a lot.** With a sentence saying that content
  varies and nothing may overflow, 6 of 27 broke (22.2%, 10.6% to 40.8%).
  On the 26 briefs where both versions rendered cleanly, 12 broke only
  without the hint and none only with it (exact McNemar test, p = 0.0005).
  The hint has a cost: one model spent its whole output budget reasoning on
  8 of 20 hinted briefs and returned no code.
- **One long word on a phone does most of the damage.** A 30-letter word at
  320 px broke 20 of 34 plain components. Without that family of cases the
  plain headline falls from 67.6% to 38.2%. Empty, single and long lists,
  empty text and right-to-left never broke a component in this run.
- **The suite is mostly right when it says "broken".** Against blind human
  labels, 89.3% of the cases it failed were labelled broken, and it missed
  about 5% of the cases it passed.
- **Only free-tier models so far, and few components.** No frontier model
  was tested, and the intervals are wide.

## Why measure the next edit

A component that looks right with the example content can still break the
first time someone types a longer name, adds a tenth item or opens it on a
phone. Those breaks are geometric: text that runs out of its box, boxes
that spill out of their card, text that lands on other text, a page that
scrolls sideways, content cut off by the screen's edge. They can be found
by measuring the rendered page, without a human or a model judging how it
looks, which makes them cheap to test at scale and repeatable.

## How it works

**Briefs.** Twenty UI tasks, each a short product request (80 to 150
words), a TypeScript props interface and example props, written the way a
product team would ask for a component: pricing tables, navigation
headers, settings forms, chat threads, kanban boards, data tables, invoice
summaries and more (ten categories). The requests contain no hints about
robustness: nothing about long text, small screens or empty lists, because
the benchmark measures what models do unprompted. Every name in them was
invented. Each brief has a hand-written reference component that survives
every case and hides no content, so a full score is attainable.

**Models and prompts.** Every model in the run is a free-tier variant served
through OpenRouter: Baidu's ernie-5.5-flash (a preview), Nvidia's
nemotron-3.5-super-vl and nemotron-3-ultra, Google's gemma-4-31b-it and
Cohere's north-mini-code, with particle-1 as a fallback if one of the last
three cannot be reached. No frontier model was tested. Each model gets the
same system message and, per brief, the brief, its props interface and the
example props, with only `max_tokens` set (32,000). Each brief is asked
twice: plainly, and with a hint that adds one sentence: content can be of
any length, lists of any size, numbers of any size and screens from 320 px
wide, and nothing may overflow, be cut off or overlap. One sample per brief
and prompt. Every call, its parameters and its date are in the run record,
[docs/RUNS.md](RUNS.md).

**The gate.** A reply counts as a component only if it is one TypeScript
file with a default export that accepts the props, imports React only and
uses no network, timers, randomness or storage. A reply that fails is an
invalid component: counted, not scored, and never asked for again.

**The changes.** Each component is rendered with the example props at 1280
by 800 px (the baseline) and then under 19 cases: eight content changes
(longer text, the longest word replaced by a 30-letter word, by a 60-letter
word, empty optional text, empty lists, one item, ten times the items,
large numbers), each at 1280 and again at 320 px wide, plus a 320 px
screen, text at 200% and right-to-left. Which values a change may touch
comes from a fields map written for each brief. The 60-letter word, at
both widths, is the extreme tier: a hard limit few real values reach. The
other 17 cases are the core tier, and the headline counts only those.

**The checks.** Five geometric checks run on every render: the page scrolls
sideways (page-overflow-x), text cut off by a box without an ellipsis
(text-clipped), content running out of a visible box (content-spill), text
overlapping other content (text-overlap), and content cut off by the screen
where it cannot be scrolled to (off-screen). Text shortened with an
ellipsis is deliberate and never fails a case. A case fails only on an
error that its reference render does not have (the baseline, or the 320 px
render for a content change at 320 px), so a component is judged on what
the change broke, not on what was already there. A component whose
baseline already has errors is "born broken": counted, not scored.

**The score.** The headline is the share of components with a clean
baseline that broke at least once in a core case, with a 95% Wilson
interval. The same measure over all 19 cases always stands beside it.

**Calibration.** The suite's verdicts were compared with blind human
labels: 215 cases drawn from the run by stratum (every failed core case, a
sample of failed extreme cases and of passed cases, 20 shown twice), each
labelled broken, fine or other from the before and after screenshots, the
brief and the change in plain words, without the suite's result.

## Results

Two models so far: ernie-5.5-flash-free (finished) and nemotron-3.5-free
(33 of 40 samples). Every number covers components whose baseline rendered
cleanly; one nemotron component was born broken and 11 replies failed the
gate (counted, not scored).

**Broke at least once.**

| model | prompt | clean | broke, core cases | 95% interval | broke, all cases |
|---|---|---|---|---|---|
| ernie-5.5-flash-free | plain | 19 | 13 (68.4%) | 46.0% to 84.6% | 18 (94.7%) |
| ernie-5.5-flash-free | hinted | 12 | 2 (16.7%) | 4.7% to 44.8% | 3 (25.0%) |
| nemotron-3.5-free | plain | 15 | 10 (66.7%) | 41.7% to 84.8% | 15 (100%) |
| nemotron-3.5-free | hinted | 15 | 4 (26.7%) | 10.9% to 52.0% | 14 (93.3%) |
| both | plain | 34 | 23 (67.6%) | 50.8% to 80.9% | 33 (97.1%) |
| both | hinted | 27 | 6 (22.2%) | 10.6% to 40.8% | 17 (63.0%) |

**The hint, pair by pair.** The same brief with and without the hint: of
the 26 pairs where both rendered cleanly, 5 broke both times, 9 never, 12
only without the hint and 0 only with it (p = 0.0005 pooled; 0.031 for each
model alone). The hint also changed what came back: ernie-5.5-flash-free
returned no code for 8 of its 20 hinted briefs, having spent all 32,000
output tokens on reasoning, against 1 of 20 plain. Those replies are invalid
and not scored, so the hinted figures cover the briefs where the model did
answer.

**What breaks components.** Failed / applicable cases, plain prompt, both
models: the 30-letter word at 320 px 20/34, longer text at 320 px 5/34, the
30-letter word at 1280 5/34, a 320 px screen 5/34, text at 200% 5/34, large
numbers at 320 px 5/20. The 60-letter word (extreme) failed 33 of 34 at 320
px. Empty text, empty lists, one item, ten times the items and right-to-left
failed no case. The checks that fired most were content spilling out of a
box (84 failed cases) and the page scrolling sideways (64). Removing one
family of cases at a time, only the 30-letter word moves the headline by
more than a few points (plain 67.6% to 38.2%, hinted 22.2% to 11.1%).

**The decision lines.** Three lines were fixed before any of this run's
numbers existed (D-049), and they cover only models that have finished
their queue, so far ernie-5.5-flash-free alone: coverage, at least 15 clean
components per model and prompt, is not met (12 hinted); the hint effect,
p below 0.05, is met (p = 0.031); a difference between models cannot be
judged with one model. No comparison between models is claimed.

## How far the suite can be trusted

On the 215 blind labels (one labeller, set-01):
- **Precision**: when the suite said a case broke, the label agreed in
  67 of 75 rated cases, 89.3% (95% interval 80.3% to 94.5%): 28 of 35 core
  cases (80.0%) and 39 of 40 extreme ones (97.5%).
- **Miss rate**: of the cases the suite passed, 6 of 119 were labelled
  broken, 5.0% (2.3% to 10.6%). Weighting each stratum by its size, the suite
  catches an estimated 80.8% of all broken cases.
- **Consistency**: the labeller gave the same label to 18 of the 20 cases
  shown twice.
- Nine items were discussed with an adviser before labelling; without them,
  precision is 58 of 66 (87.9%). After the owner went through every
  disagreement with the suite's evidence in view (not blind), precision is
  68 of 75 (90.7%); eight of the 14 disagreements were differences of
  definition rather than errors on either side.

The disagreements point at what the suite does not look for: a scroll
container shrunk below one item or with a hidden scrollbar, a box edge
barely visible against its background, a pill running under neighbouring
text, a column squeezed until its words split. The full procedure is in
[docs/LABELLING.md](LABELLING.md).

## Limitations

- **Free-tier models only.** Every model is a free variant: some are
  previews, all are rate limited and served apart from the providers' paid
  endpoints. No frontier model was tested, so nothing here says how the
  best models do.
- **Few components.** One sample per brief and prompt. The intervals are
  wide, and they assume independent components, while components of one
  brief share its design and cases of one component share its code.
- **Geometric breakage only.** The suite measures overflow, clipping,
  spill, overlap and content cut off by the screen. A layout can be broken
  to a reader without any of these (a column squeezed until words split),
  and empty states are out of scope. Hidden content is measured but never
  fails a case.
- **One labeller.** The calibration rests on one person's labels, given
  quickly (a median of 2.4 seconds per item), and the adjudication of the
  disagreements was not blind.
- **A changed corpus.** Five invented names that matched real businesses
  were replaced in three briefs during the run (corpus v1.1). The samples
  generated from the earlier text are archived, listed in the run record
  and not counted; the two models that had them were asked again.

## Use it, check it

- The results site shows every number with its count and interval, every
  failed case before and after, and the prompt word for word:
  https://oleh-dev99.github.io/First-Edit/.
- The same suite runs on your own component: `npm run first-edit --
  Component.tsx --props props.json` in harness/ (README, Check your own
  component).
- Everything needed to run it again is in the repository: the briefs, the
  prompt, the harness, the runner and the queue (runner/plan.toml). Every
  design decision, and why, is in [docs/DECISIONS.md](DECISIONS.md); the
  full specification is [docs/SPEC.md](SPEC.md).
