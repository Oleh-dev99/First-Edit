# Decisions

One short entry per decision. Newest last.

## D-001 Exact version pins (2026-11-12)
Every dependency in harness/package.json is pinned to an exact version and
the lockfile is committed. The Playwright version decides which Chromium
build renders every case, so an unnoticed upgrade would change text
metrics and screenshots between runs.

## D-002 Render on the Vite dev server for now (2026-11-12)
Cases are rendered from the Vite dev server, not a production build. It
is simpler and fast enough while the harness takes shape. Revisit at step
8 (end-to-end spike), when run time and dev-only React behaviour can be
measured on real candidates. Measured in step 9: a full stress run
(baseline and up to 17 cases, server and browser start included) took
9.7 s per candidate on average over 36 real candidates (6.8 to 13.1 s),
so run time is no reason to switch. Dev-only React behaviour was not
measured.

## D-003 The render stage (2026-11-12)
#fe-root is the stage: 16px padding, background #f1f5f9, min-height
100vh, box-sizing border-box, and body margin 0. Candidates start at the
top-left of the stage and choose their own width. A visible, padded stage
makes screenshots readable and gives every candidate the same frame.

## D-004 Check set v0: four text-focused checks (2026-11-12)
v0 ships page-overflow-x, text-clipped, content-spill and text-overlap.
Content mutations mostly break layouts through text, so these cover the
expected failures. off-canvas and element-collapsed are deferred until a
real failure needs them.

## D-005 Ellipsis and line clamp are info, not error (2026-11-12)
Text clipped with text-overflow ellipsis or a line clamp is recorded as
info. Truncation is a deliberate way to handle long content, not a broken
layout, so it does not count against survival.

## D-006 Out-of-flow content is exempt from spill and overlap in v0 (2026-11-12)
Absolutely and fixed positioned content is skipped by content-spill and
text-overlap, because badges, overlays and captions overhang or cover
other content on purpose. This is a known blind spot: a positioned label
that collides with text after a mutation is not caught.

## D-007 Display-derived values are computed by the component (2026-11-12)
Values derived for display, such as avatar initials, are computed by the
component from real props (initials from `name`) and are not fixture
fields. Every fixture field is then real content a mutation can change,
and a candidate's derivation logic is part of what is tested.

## D-008 text-long uses the lower bounds of IBM's expansion table (2026-11-12)
text-long grows each label and prose value by the lower bound of its
length bracket in IBM's guidance on text expansion in translation (up to
10 chars +100%, ..., over 70 +30%). The lower bound is a realistic floor:
growth any shipped UI should survive, not a worst case. Source:
https://www.ibm.com/support/knowledgecenter/en/ssw_ibm_i_72/nls/rbagstextdatatransdesign.htm

## D-009 Every eligible field is mutated at once (2026-11-12)
A mutation changes every eligible field in a single case, as a
translation or a data change would. One render per mutation keeps runs
small. The cost is attribution: a failure is not tied to one field, but
the findings' selectors show where it happened.

## D-010 A finding is new if its check and selector are absent at baseline (2026-11-12)
An error in a mutation case counts only when no baseline finding has the
same check and selector. Problems that exist at baseline are reported
once as "born broken" instead of failing every mutation. Selectors are
structural, so a mutation that adds or removes elements can shift them
and make an old problem look new (see Known gaps).

## D-011 A crash or timeout is a failed case (2026-11-12)
A candidate that throws during render (render-error) or never becomes
ready within 30 s (timeout) fails that case: a component that breaks on
realistic content has not survived it. The run continues; only a failure
of the harness itself stops it.

## D-012 text-200pct is a 32px root font size (2026-11-12)
A 32px root font size is what a browser's default font size set to 200%
does: every rem-based size doubles and px sizes stay. It is not page
zoom, which would scale px sizes too.

## D-013 number-large added; image-missing deferred (2026-11-12)
number-large (integers to 1234567890, other numbers to 1234567.89)
covers counts and prices that outgrow their boxes. image-missing is
deferred until a check can see its effect: the v0 checks look at text
and box geometry, which a missing image does not change in a way they
report.

## D-014 content-spill treats visibly boxed elements as content (2026-11-12)
A visibly boxed element (a pill, a panel, a badge) is compared with its
own nearest visibly boxed ancestor, under the same in-flow and
visible-rect rules as text. Before this, a pill that ran out of a card
went unnoticed because its own text stayed inside the pill.

## D-015 Headline survival uses clean-baseline candidates only (2026-11-12)
The headline survival rate is computed over candidates whose baseline
has no error findings; the share of born-broken candidates is reported
as its own number. Structural selectors stay: selector drift under
list mutations can only affect candidates that are already left out of
the headline.

## D-016 v0 judges geometric breakage only (2026-11-12)
The benchmark judges overflow, clipping, spill, overlap and crashes.
Empty states, such as a blank avatar or an empty fixed-height box, are
out of scope for v0: whether they look acceptable is a design judgement
that no geometric check can make reliably.

## D-017 Every corpus brief ships a surviving reference candidate (2026-11-12)
Each corpus brief has a hand-written reference that survives every
applicable mutation, checked by briefs:check. It shows that a full score
is attainable, so a model's failures are its own and not the brief's.

## D-018 Briefs carry no robustness hints (2026-11-12)
A brief describes the product need only: nothing about long text,
wrapping, truncation, small screens, many items or empty data, and no
implementation hints. The benchmark measures what models do unprompted;
a hint would measure whether they follow instructions instead.
briefs:check rejects the common hint words.

## D-019 References never hide fixture content; ellipsis is allowed (2026-11-12)
A reference shows all of its fixture content at every viewport and under
every mutation. Truncation with an ellipsis or a line clamp is allowed,
because the reader can see that text continues. Display none, visually
hidden text and icon-only replacements are not: a reference that wins by
hiding content would show an unfair full score, since no check measures
what is not shown.

## D-020 Briefs avoid size words and file names (2026-11-12)
Briefs and props.ts comments do not describe content as one-line, short,
long, brief, small or few, and do not mention file names or imports.
Size words steer models towards fixed sizes the mutations then break; a
brief should describe the product, not the shape of its data.

## D-021 Truncations are counted per case as a secondary measure (2026-11-12)
summary.json counts text-clipped info findings (ellipsis or line clamp)
per case as truncations. They never fail a case (D-005), but a candidate
that survives by truncating everything is different from one that lays
content out in full, and the count lets the report show it.

## D-022 Images are local placeholders referenced from props (2026-11-12)
Fixtures reference images only by a /fe-assets/ path to one of six
harness-served placeholder SVGs with different aspect ratios, declared
fixed. Renders stay offline and deterministic, and candidates must cope
with images of any ratio because the image comes from props, never from
the component.

## D-023 One provider type: OpenAI-compatible chat completions (2026-11-12)
The runner speaks one protocol: POST {base_url}/chat/completions with a
Bearer key. A configurable base URL reaches most vendors directly or
through a router, so one code path covers every model and behaves the
same for all of them. A mock provider stands in for tests.

## D-024 Provider default sampling; samples are repeated calls (2026-11-12)
No temperature or seed is sent unless a model's params says so: models
are measured as their vendors ship them. Several samples of one prompt
are repeated calls, numbered s1, s2, and cached separately.

## D-025 Invalid output is a model failure; API errors are retried (2026-11-12)
A reply that fails the gate or is cut off by the token limit counts
against the model and is never re-rolled: re-rolling until valid would
hide how often a model fails the contract. Transient API errors
(timeouts, 429, 5xx) are retried, up to four attempts; other API errors
fail the sample, are recorded and are not cached.

## D-026 Two prompt variants, plain and hinted (2026-11-12)
The plain prompt carries no robustness hints and measures what models do
unprompted. The hinted variant adds one paragraph naming real content,
any list size, any number size and 320px screens, to measure how much an
explicit instruction helps. The two share the rest of the prompt word for
word.

## D-027 The prompt names Tailwind v4; removed v3 layout utilities still work (2026-11-12)
The prompt says Tailwind CSS v4 because the harness runs v4. Models still
write v3 class names, so the harness keeps the removed v3 utilities that
affect layout, sizing or text overflow (flex-shrink, flex-grow,
overflow-ellipsis, decoration-slice/clone) working. A candidate is then
judged on its layout, not on a renamed class. Visual renames are left
alone.

## D-028 The prompt includes the baseline fixture as example props (2026-11-12)
The user message shows the baseline fixture as example props, as a
designer hands over mock data with a design. Models see realistic values
and shapes; the mutations then change them, which is what the benchmark
measures.

## D-029 Model outputs stay out of git until the published run (2026-11-13)
Every folder under candidates/ except _samples and _reference is
git-ignored, and so are the cache and run results. Spike and trial runs
can then be repeated, compared and thrown away without filling the
history with unreviewed model output, and nothing is published by
accident. Outputs are committed deliberately at the step that publishes a
run, together with the record the publish checklist asks for.

## D-030 The step 8 spike ran on free model variants (2026-11-13)
The first end-to-end run used OpenRouter's free variants of two models
(ernie-5.5-flash-free and nemotron-3.5-free; inkling-2-small-free was
dropped after two geo-restriction errors) instead of four paid models. It
establishes whether the pipeline and the checks work on real model
output. It is not the published comparison: free variants can be
previews and are rate limited and served apart from the paid endpoints,
two models are no cross-vendor sample, and one sample per brief and
variant is no estimate of a model's rate.

## D-031 Spike outcome: pipeline and trust met, signal not met (2026-11-13)
The step 8 spike (two free models, plain and hinted, one sample of each
brief) met the pipeline criterion (90% valid for both models) and,
narrowly, the trust criterion (22 of 24 reviewed failed cases real, 2 of
40 reviewed survived cases broken). It did not meet the signal
criterion: mean survival ranged from 91.8% to 97.5%, and six of the ten
mutations (text-long, text-empty, list-0, list-1, list-many, dir-rtl)
never failed a clean candidate. Decision: continue, with the changes of
step 9, and settle the comparison in step 10.

## D-032 Content mutations also run at 320px (2026-11-13)
Every content mutation runs a second time at 320x800 as <mutation>@320,
and those cases are judged against the viewport-320 render instead of
the baseline, so they count only breakage that the narrow screen alone
did not already cause. Real content changes reach phones too, and the
spike showed that 1280 hides most content-driven breakage. This was
added after seeing the spike's results and is recorded as a post-hoc
design change: numbers from before and after it are not comparable.

## D-033 The headline is "broke at least once" (2026-11-13)
The headline is the share of clean-baseline candidates that broke at
least once (one or more failed cases), with a 95% Wilson interval. One
broken case is a broken component for the person who meets it, and a
share of candidates reads directly as a risk. The failure rate per case,
also with a Wilson interval, and the mean survival rate are secondary.

## D-034 A border makes a box only on all four sides (2026-11-13)
For content-spill, an element is visibly boxed by its border only when
all four sides have width, style and colour. In the spike a divider (a
top border alone) counted as a box, and text that ran past the end of a
divider line, still inside its card, was the cause of both false
positives. Background, background image, box shadow and outline count as
before.

## D-035 off-screen: content cut off by the viewport edge (2026-11-13)
A new error check flags content that the viewport cuts off and that
cannot be scrolled into view: boxes inside a fixed subtree past either
edge, and boxes past the edge the page cannot scroll to (left in a
left-to-right page). It covers out-of-flow content, which D-006 exempts
from content-spill and text-overlap, because the spike's two missed
failures were a fixed header running off the screen. It replaces the
deferred off-canvas check. Boxes parked more than a viewport width away
are ignored.

## D-036 content-hidden is an info-level measure (2026-11-13)
content-hidden counts fixture values that the same data shows at 1280
and a render at 320, at 200% text or in RTL does not. It is reported per
case like truncations and never fails a case: hiding secondary content
on a phone can be a deliberate design, and no check can tell a lost
value from a summarised one. It makes hiding visible, and it holds
references to D-019 (content-hidden 0).

## D-037 text-long grows by whole words (2026-11-13)
Values with spaces grow by appending whole words until they reach at
least the target length, instead of being cut at the target. In the
spike, values such as "Contact sales Contact sa" looked like clipping
to a reviewer although they were fully shown. Single words still grow
by letters.

## D-038 States before stress (2026-11-13)
Every candidate is in one of four states before it is scored: invalid
(it failed the gate), baseline crash (the baseline threw or timed out),
born broken (the baseline has error findings) or clean. Each is reported
separately everywhere, and only clean candidates are scored. In the
spike a crashing baseline was counted as clean by the stress command and
as born broken by summarize.

## D-039 Two tiers of cases; the headline uses core cases (2026-11-13)
Every case is core or extreme. text-unbroken and text-unbroken@320, the
60-letter word with no break opportunity, are extreme; every other case
is core. The headline, "broke at least once", is computed on core cases
only, and the same measure over all cases is always reported beside it,
with the failure rate and mean survival per tier. The core long word is
a new mutation, text-longword: the longest word of every label and prose
value becomes one 30-letter token, at 1280 and at 320, so a candidate
runs up to 19 cases. References must survive both tiers. This changed
after step 9, where text-unbroken@320 alone made three of the four
groups reach 100% (15 of 32 broken candidates broke only there), and is
recorded as a post-hoc design change: headline numbers from before and
after it are not comparable.

## D-040 New findings are matched by an index-free key (2026-11-13)
Every finding carries a matchKey: its path from #fe-root as the tag and
sorted classes of each level, with no positions. The new-finding rule
compares check and matchKey; the nth-child selector stays for display.
A list that grows or shrinks no longer turns a flaw the reference
render already has into a new finding, which in step 9 failed a clean
candidate through the viewport-320 reference. The cost is that a key
covers every element with the same structure, so a flaw in one list item
of the reference also covers the same check on its siblings.

## D-041 Only errors in the reference cancel errors in a case (2026-11-13)
A case's error is not new only if the reference render has an error with
the same check and key. An info finding there (a deliberate ellipsis,
for example) cancels nothing, so text that was truncated on purpose and
is now cut off without an ellipsis counts.

## D-042 Horizontal tolerance is 2px for content-spill and off-screen (2026-11-13)
Overflow of up to 2px from centring or rounding cannot be seen; with a
1px tolerance a 1.5px spill failed a case in the step 9 review.
page-overflow-x and text-clipped keep 1px, and vertical tolerances are
unchanged.

## D-043 content-spill clips a box only inside its boxed ancestor (2026-11-13)
Before a content box is compared with its nearest visibly boxed
ancestor, it is clipped only by the overflow ancestors between the two,
the boxed ancestor included. Before, every overflow ancestor clipped it,
so pills running out of a card that itself ran past a sideways-scrolling
board's window were cut at the window and the spill went unmeasured
(the step 9 missed failure).

## D-044 Suite v1 is frozen; later changes are bug fixes only (2026-11-13)
The stress suite (the cases and their tiers, the checks and their
tolerances, and the new-finding rule) is frozen as suite v1: the suite
of step 10, plus the step 11 change to page-overflow-x culprits, which
changes detail only and no outcome. From now on only bug fixes change
it, and each fix is recorded here with its lab case and its effect on
results. Every stress summary and report.md records the suite version.
Numbers from the second run onwards are then comparable with each
other, which steps 9 and 10 (D-032, D-039) did not allow.

## D-045 text-longword stays core; the report shows the headline per family removed (2026-11-13)
text-longword and text-longword@320, the 30-letter word, stay in the
core tier. The report adds a sensitivity table: per variant, pooled
over models, the core headline recomputed with each case family (a
mutation and its @320 case) removed in turn, so a reader can see how
much of the headline one family carries. On the step 10 runs
(results/spike-v3b), removing text-longword moves plain from 12 of 19
(63.2%) to 7 of 19 (36.8%) and hinted from 5 of 16 (31.2%) to 3 of 16
(18.8%); no other family moves either variant by more than one
candidate.

## D-046 Briefs are added before the second run (2026-11-13)
The corpus grows from ten to twenty briefs before the second run. A
new brief adds independent evidence (another component, another layout
problem), while another sample of the same brief and model is
correlated with the first and mostly repeats what it showed. The Wilson
interval treats every candidate as independent, so candidates from more
briefs make it more honest than more samples of the same briefs.

## D-047 Claude models through the Claude Code command line (2026-11-13)
Claude models may run through the Claude Code command line (`claude -p`)
on the owner's subscription instead of the API: provider claude-cli,
with our system prompt replacing Claude Code's own, every built-in and
MCP tool disabled, one turn, effort medium and --safe-mode. This is not
the raw API, and it is disclosed wherever results are shown (report.md
and gallery.html). Before a run, an isolation probe through the same code
path must show no tools and nothing beyond our system prompt. In step 12
it did not: the command line puts an identity line ("You are a Claude
agent, built on Anthropic's Claude Agent SDK.") in front of our system
prompt and adds a reminder with the account's email address and the date,
and no documented setting removes them with a subscription login
(`--bare` would, but it needs an API key). The owner chose to run the
Claude models, but under this rule they were not run: their jobs stay in
runner/plan.toml, commented out, until the owner accepts this context or
it can be removed.

## D-048 The run queue; one sample per brief and variant (2026-11-13)
Runs are driven by runner/plan.toml and `run-next`. A run that spans
several days within the free tier's daily allowance then resumes where it
stopped, never repeats a finished sample and never re-rolls one, and a
model whose first two samples fail with a rate-limit, availability or
region error is set aside for a fallback instead of eating the allowance.
The second run takes one sample per brief and variant: with 20 briefs a
model contributes 20 plain and 20 hinted candidates, and plain and hinted
of the same brief form the pairs of the hint test. Briefs, not repeated
samples, are the unit of evidence (D-046).

## D-049 Three decision lines, fixed before the second run's data (2026-11-13)
The decision on the comparison rests on three lines, reported met or not
met for the models whose queued jobs are all finished:
a. coverage: every model and variant has at least 15 clean-baseline
   candidates;
b. hint effect: an exact two-sided McNemar test on the plain and hinted
   pairs, pooled over models, has p below 0.05;
c. model effect: at least two models whose plain core "broke at least
   once" 95% Wilson intervals do not overlap.
They were fixed before any of the second run's numbers existed, so that
the numbers cannot shape the lines that judge them.
