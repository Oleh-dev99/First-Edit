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
| 1 | broken | content is cut off, spills out of its box, overlaps other content, is pushed off the screen, or the page scrolls sideways | a 30-letter word runs out of its card and over the price next to it |
| 2 | fine | none of that; awkward wrapping and words broken across lines are fine | a long name now wraps onto three lines, and its card grows to hold it |
| 3 | other | something else looks wrong (a squeezed column, missing content, a collapsed element), but not the kinds above | a table column squeezed so narrow that every word is split across several lines, with nothing overflowing |
| 4 | unsure | cannot tell | a list ten times longer makes the picture 19,000 px tall, and the change cannot be found even when zoomed in |

Each item can also carry a free-text note. "other" is a label of its own
(D-051), so problems that the suite does not try to catch are counted
instead of being forced into broken or fine.

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
  that the picture does not.

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
stressed candidates of two free models (38 with a clean baseline):

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

Limits: a set has one labeller; the cases of one candidate are not
independent, while a Wilson interval assumes they are; and the case
descriptions are shown, so a labeller may learn that some changes (a
60-letter word) mostly come with failures in a set, by its composition.
Calibration changes nothing by itself: a fix to the suite is a bug fix with
its own lab case and patch number (D-044).
