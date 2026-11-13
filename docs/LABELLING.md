# Labelling and calibration

How the suite's verdicts are checked against blind human labels (D-050,
D-051). The review in docs/REVIEW.md is non-blind: the reviewer knows the
verdict being checked. Labelling is blind: the labeller sees two clean
screenshots and nothing of what the suite found, and calibration then
compares the two.

## The question
Each label item is one case of one clean-baseline candidate, shown as two
pictures side by side: on the left the case's reference render (the
baseline, or the viewport-320 render for a case at 320 px), on the right
the case render. The labeller answers one question:

> Does the right-hand picture show layout breakage that the left-hand one
> does not?

Only what is new on the right counts. A flaw that the left-hand picture
already shows does not.

## The labels
| key | label | meaning | example |
|---|---|---|---|
| 1 | broken | content is cut off (text cut off without an ellipsis included), spills out of its box, overlaps other content, is pushed off the screen, or the page scrolls sideways | a 30-letter word runs out of its card and over the price next to it |
| 2 | fine | none of that; awkward wrapping, words broken across lines and text shortened with an ellipsis are fine | a long name now wraps onto three lines, and its card grows to hold it |
| 3 | other | something else looks wrong (a squeezed column, missing content, a collapsed element), but not the kinds above; also an ellipsis that hides something essential, with a note saying what it hides | a table column squeezed so narrow that every word is split across several lines, with nothing overflowing |
| 4 | unsure | cannot tell | a list ten times longer makes the picture 19,000 px tall, and the change cannot be found even when zoomed in |

Each item can also carry a free-text note. "other" is a label of its own
(D-051), so problems that the suite does not try to catch are counted
instead of being forced into broken or fine.

## Rules the labels follow
These rules settle what the question and the labels leave open. set-01
was labelled under the first two; the two notes after them were added
once it was labelled, and the tool's first screen states them all for
later sets.

- **Ellipsis (D-052).** Text shortened with an ellipsis ("…") counts as
  fine: truncation is a deliberate way to handle long content, and the
  suite records it as info, not as an error (D-005). If the ellipsis hides
  something essential, the label is "other", with a note saying what it
  hides. Text cut off without an ellipsis is broken: only an ellipsis
  marks truncation as deliberate. The tool's first screen states this rule
  from set-02 on; set-01 was labelled under it before it was on that
  screen, and before the sentence on text without an ellipsis was added.
- **Screen-edge marker (D-053).** When a picture is wider than its
  screen, the tool marks the screen's edge (see What the labeller sees).
  The marker is accepted for a blind label: it comes only from the
  picture's width and the case's screen width, and it is drawn by the same
  rule on every item, whatever the suite found.
- **Grown text can end mid-word.** A value made longer by the "longer
  text, as after translation" case can end mid-word on purpose: a single
  word grows by repeating its own letters, cut at the target length, so an
  email address can end in "…@ex" (SPEC, text-long). That is the content,
  not a cut; whether the layout holds it is what counts.
- **"other" is not for removed content.** Content that the case itself
  removed, such as text left empty, an emptied list or a list cut to one
  item, is the change being tested, not something that looks wrong. Judge
  how the layout copes with it: broken, fine, or "other" for a problem
  such as a collapsed element.

## What the labeller sees
- The two clean screenshots, never the annotated ones, at one shared
  scale so their widths compare. Clicking a picture zooms it.
- The brief's name and the case in plain words: "longer text, as after
  translation", "a 30-letter word", "a 60-letter word", "optional text
  left empty", "empty lists", "lists with one item", "lists ten times
  longer", "very large numbers", "phone width", "text at 200% size",
  "right-to-left page", and ", phone width" added for a case at 320 px
  (for example "a 30-letter word, phone width").
- When a picture is wider than its screen (1280 or 320 px), a dashed red
  line marks the screen's edge and the part past it is hatched: that part
  can only be seen by scrolling the page sideways. The line comes from the
  picture's width and the case's screen width alone, so it shows nothing
  that the picture does not (D-053).

The labeller does not see the model, the variant, the sample, the suite's
verdict, its checks or findings, outlines, or the stratum the item was
drawn from. The tool sends the browser only the item's id, the brief, the
case in plain words, the screen widths and picture URLs that name the
item's id and nothing else; a test holds it to that. The set file, the run
report and its gallery do show the verdicts, so do not open them before a
set is finished.

## The tool
```
.venv\Scripts\python -m first_edit label --set labels/set-01.json [--port N]
```
starts a server on 127.0.0.1 only (port 8765 by default) and prints the
address to open. It uses Python's standard library and serves one HTML
page with plain JavaScript (runner/first_edit/label_ui/index.html).

- The first screen gives the question, the labels and five example pairs
  from the check lab, one per kind of breakage: a clean lab case on the
  left and a broken one on the right. The screenshots are in
  runner/first_edit/label_ui/examples/, made with `npm run label:examples`
  in harness/; harness/test/label-examples.test.ts checks the pairs.
- Then one item per screen, with the progress. Keys: 1 broken, 2 fine,
  3 other, 4 unsure (each answers and moves to the next item), N writes a
  note (Enter keeps it), Z undoes the last answer, the arrow keys move
  between items, Esc closes a zoomed picture.
- Every answer is saved at once to labels/<set>.labels.jsonl, one line per
  labelled item: `{"item", "label", "note", "ms"}`, where ms is the time
  from the pictures appearing to the answer. Lines are in the order of the
  last answer: answering an item again replaces its line and moves it to
  the end, and undo removes the last line. Close the tool (Ctrl+C) or the
  tab at any time; started again, it continues where it stopped.

labels/ is committed to git, the labels file included once a set is
labelled. The screenshots stay in results/.

## How sets are built
```
.venv\Scripts\python -m first_edit label-set --runs results/runs-run2 --name set-01 --seed 1
```
writes labels/set-01.json. The population is every applicable case of
every clean-baseline model candidate in the runs directory whose two
screenshots exist. Born-broken and crashed candidates are not scored
(D-038), so they are not labelled either. The cases are split into four
strata by the suite's verdict:

| stratum | cases | drawn |
|---|---|---|
| failed-core | failed core cases | all of them |
| failed-extreme | failed extreme cases | a sample of up to 40 |
| survived-focus | survived cases of text-longword@320, text-long@320, number-large@320, list-many, viewport-320 and text-200pct, where missed failures are most likely | 60 of the 120 survived items, so at least half |
| survived-other | every other survived case | the other 60 |

If one survived stratum has fewer cases than its share, the other fills
the gap. Within a stratum, items are a simple random sample drawn with the
seed, so the share of broken items in a stratum estimates that share over
the whole stratum. Then 20 of the drawn items, again a random sample, are
added a second time to measure self-consistency, and the whole list is
shuffled with the same seed. The shuffle aims to put an item and its
repeat at least 10 items apart, and the set records the smallest gap it
reached. The same seed and the same runs directory give the same file.

For each item the file records its id, the candidate, the brief, the case,
the suite's verdict (tier, status, survived, the checks with new errors),
the stratum and its size, the harness commit of the stress run, the two
screenshot paths and their screen widths, and, for a repeat, the item it
repeats. label-set never overwrites a set: labels refer to its item ids.

set-01 was drawn on 2026-11-13 from results/runs-run2, which then held 39
stressed candidates of two free models (38 with a clean baseline), and
labelled by the owner the same day:

| stratum | size | drawn |
|---|---|---|
| failed-core | 35 | 35 |
| failed-extreme | 51 | 40 |
| survived-focus | 185 | 60 |
| survived-other | 411 | 60 |
| repeats | | 20 |
| items | | 215 |

## What the calibration numbers mean
```
.venv\Scripts\python -m first_edit calibrate --set labels/set-01.json --runs results/runs-run2 --out results/calibration [--partial]
```
writes report.md, summary.json and gallery.html. It refuses to run until
every item of the set has a label; with --partial it runs anyway and says
so at the top of the report. In every rate each case counts once (a
repeat only measures self-consistency), "unsure" is left out, and "other"
counts as not broken.

- **Precision**: of the items the suite failed, the share labelled broken,
  with a 95% Wilson interval, over all of them, for core and extreme cases
  separately, and per check (an item counts for every check with new
  errors in it). It is the blind counterpart of the review's "real" share
  (docs/REVIEW.md); what is not labelled broken is a false positive or out
  of scope.
- **Miss rate**: of the items the suite passed, the share labelled broken,
  with a Wilson interval, over all of them and per survived stratum. The
  focus stratum is over-sampled, so the miss rate over the set is not the
  miss rate over every survived case; the recall estimate below weights
  for that.
- **Estimated recall**: the share of all broken cases that the suite
  fails. Each stratum's broken cases are estimated as its size times the
  share of its rated items labelled broken; recall is the estimate for the
  failed strata over the estimate for all four. It is an estimate from a
  sample, reported without an interval, and holds only for the runs the
  set was drawn from. Because the survived strata are large, a small miss
  rate there moves it a lot.
- **"other"**: how many items were labelled other, and how many of them
  the suite failed. These are problems outside what the checks look for
  (D-016); a recurring kind, such as the squeezed column in Known gaps, is
  a candidate for a later suite version.
- **Self-consistency**: of the repeated items, the share labelled the same
  both times. A low share means the question or the labels need to be
  clearer, and every other number is less certain.
- **The disagreement gallery**: every item where the label and the suite
  differ (failed but labelled fine or other, passed but labelled broken),
  with both pictures, the annotated screenshot, the findings and the note.
  calibrate also warns when a run was stressed again since the set was
  built, because the findings would then not match what was labelled.

Calibration changes nothing by itself: a fix to the suite is a bug fix with
its own lab case and patch number (D-044).

## Guided items
Items that the labeller discussed with someone before or while labelling
are guided (D-056): their labels are not the labeller's own blind
judgement. They are listed in labels/<set>.guided.json:
```
{"set": "set-01", "reason": "discussed with an adviser before labelling", "items": ["i001", ...]}
```
An item and its repeat show one case, so when either is guided, the case
is. calibrate gives every rate twice: over all items, and over the
unguided items only. Without the file, the two are the same and the report
says so. For set-01, the owner discussed nine items with an adviser before
labelling: i001, i013, i018, i068, i069, i076, i083, i084 and i109. All
nine are cases the suite failed, labelled broken; i076 repeats i022, so
the nine guided cases include i022.

## Adjudication
Once every item has a label, the owner answers each disagreement with the
suite's result in view (D-055):
```
.venv\Scripts\python -m first_edit label --set labels/set-01.json --adjudicate [--port N]
```
serves, on 127.0.0.1 like the labelling tool, one disagreement per screen:
both clean pictures, the annotated screenshot, the suite's verdict and
findings, and the blind label with its note. Nothing else about the item
is shown, in particular no one's analysis of it. The answer is one of:

| key | answer | meaning |
|---|---|---|
| 1 | the suite is right | under the labels' own definitions the suite's verdict is right, and the label was a mistake |
| 2 | my label is right | the label stands, and the suite's verdict is wrong |
| 3 | we define it differently | both are right by their own definitions: the labels and the suite count this differently |

with an optional note (N), undo (Z) and the arrow keys, as when labelling.
Answers are saved after every change to labels/<set>.adjudication.jsonl,
one line per answered disagreement: `{"item", "answer", "note", "ms"}`,
with answer `suite-right`, `label-right` or `defined-differently`. The
blind labels are never changed.

calibrate then adds a section below the blind rates, which stay first and
unchanged: "After adjudication", with precision and the miss rate where
every "the suite is right" answer replaces the blind label (a failed item
becomes broken, a passed one fine) and every other answer keeps it, over
all items and over the unguided ones, and the number of "we define it
differently" items. Those are where the labels and the suite need a shared
definition, which is a decision for a later suite version, not a bug fix.
Without the adjudication file, the report says so and leaves the section
out. Adjudication is not blind: it measures how often the labeller, shown
the suite's evidence, agrees with it, and it is always reported second.

docs/CALIBRATION-set-01.md is the suite author's own, non-blind reading of
set-01's disagreements. The adjudication tool does not show it.

## Limitations
- **One labeller.** Each set has one labeller, so the labels carry that
  person's judgement. Self-consistency on the repeats measures how stable
  it is, not whether another person would agree.
- **Cases are not independent.** Items from one candidate share its code,
  and items from one brief share its design, while the Wilson intervals
  assume every item is independent. The intervals are therefore narrower
  than they should be.
- **The case description is visible while labelling.** The labeller reads
  the change in plain words above every pair. It says what to look for,
  and through the set's composition a labeller may learn that some changes
  (a 60-letter word) mostly come with failures.
- **Fast answers.** In set-01 the median answer took 2.4 seconds (the
  mean 3.8 s; 24 of the 215 answers took under a second). At that pace a
  small defect in a large picture can be missed: every label that the
  author's non-blind reading (docs/CALIBRATION-set-01.md) takes to be
  wrong was given in 4 seconds or less.
- **No marker at the left edge.** The tool marks only a picture wider
  than its screen. Content pushed past the left edge of the screen, which
  cannot be scrolled to, has no marker: it shows only as text that starts
  mid-word at the picture's edge.
- **The adjudication was not blind.** The labeller saw the suite's
  findings, and the suite author's reading of these items
  (docs/CALIBRATION-set-01.md) was available beforehand. Either can pull an
  answer towards the suite, so the adjudicated rates always come second
  (D-055).
