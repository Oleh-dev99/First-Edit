# Calibration of set 1: a reading of the disagreements

**Not blind, and by the suite's author.** This is one reading of the 14
items of label set set-01 where the blind label and the suite's verdict
differ. It was written by the suite's author (Claude Code, which
implemented the checks), with the annotated screenshots, the findings and
the candidates' code open. Knowing the verdict can pull a judgement towards
it (D-050), and an author has reason to side with the suite. The blind
numbers in results/calibration/report.md are the calibration; this reading
does not change them. The owner's adjudication (D-055) is a separate,
recorded answer for each item, made in the tool, which does not show this
text.

Written on 2026-11-13, after the owner labelled all 215 items, from
results/runs-run2 at harness commit ba2bb3b (suite v1).

## The blind result it reads

- Precision: 67 of 75 failed cases labelled broken (89.3%, 95% interval
  80.3% to 94.5%).
- Miss rate: 6 of 119 passed cases labelled broken (5.0%, 2.3% to
  10.6%); 6 of 60 in the over-sampled focus stratum, 0 of 59 elsewhere.
- Estimated recall: 80.8%, an estimate from a sample, without an interval.
- Disagreements: 8 failed cases labelled fine or other, and 6 passed
  cases labelled broken.

## Three kinds

- **The label is likely wrong** (8 items): the suite's finding is real
  under the labels' own definitions, or, once, nothing is broken.
- **Definitional** (6 items): the label and the suite use different
  definitions, and both are right by their own.
- **Detection** (none): the suite missed or wrongly flagged something
  under its own definition. No item is a candidate for a suite bug fix.

## The label is likely wrong (8)

### Small defects missed at labelling scale (4)
Text 10 to 15 px tall in a large picture, answered in 1.5 to 4.0 s.

| item | candidate, case | label | what the pictures show |
|---|---|---|---|
| i040 | nemotron-3.5-free/pricing-table/hinted-s1, text-long@320 | fine | "Most popular Most popular" lies over the heading "TeamTeam", and "Recommended" runs out of its badge (content-spill, text-overlap) |
| i063 | ernie-5.5-flash-free/kanban-board/plain-s1, number-large | fine | "1234567890" runs out of the comment bubble and over the word "comments", on every card (content-spill) |
| i174 | the same candidate, number-large@320 | fine | the same at phone width |
| i064 | ernie-5.5-flash-free/pricing-table/hinted-s1, text-longword@320 | fine | the badge text runs about 17 px past its pill; real but minor, since white text on the dark card stays readable |

### A cut at the left edge (1)
| item | candidate, case | label | what the pictures show |
|---|---|---|---|
| i105 | nemotron-3.5-free/settings-form/plain-s1, text-longword@320 | fine | only "fications" of the Save button is on screen; the rest is past the left edge, which cannot be scrolled to (off-screen). The tool marks only a picture wider than its screen, so nothing points at a cut on the left |

### Clipping labelled "other" (2)
The labels' definitions call these broken. Neither item has a note.

| item | candidate, case | label | what the pictures show |
|---|---|---|---|
| i137 | ernie-5.5-flash-free/pricing-table/hinted-s1, text-unbroken@320 | other; its repeat i088 fine | every call-to-action button cuts its text at both ends, with no ellipsis, and so does the "MOST ..." badge (text-clipped, content-spill); most other long words break mid-word, which is fine |
| i173 | ernie-5.5-flash-free/nav-header/plain-s1, text-longword@320 | other | the avatar is pushed about 26 px out of the header, and the page scrolls sideways by 10 px (page-overflow-x, content-spill) |

### Mutated text that looks cut (1)
| item | candidate, case | label | what the pictures show |
|---|---|---|---|
| i155 | nemotron-3.5-free/nav-header/hinted-s1, text-long@320 | broken | nothing is cut. text-long grows a one-word value by appending its own letters, cut at the target length, so the 23-character email becomes "priya.raman@example.compriya.raman@ex" (37 characters). It ends within 1 px of the header's edge, inside the 2 px tolerance, so it looks clipped. The component has no overflow clipping at all |

## Definitional (6)

### Regions that scroll sideways (4)
The labels' definitions say nothing about content that can be reached by
scrolling a region; the suite never flags a scroll container (text-clipped:
ancestors with overflow auto or scroll produce no finding). A screenshot
shows no scroll bar, so the labeller cannot see that a region scrolls.

| item | candidate, case | label | more likely right | why |
|---|---|---|---|---|
| i028 | nemotron-3.5-free/kanban-board/hinted-s1, text-200pct | broken | suite | the board scrolls sideways (overflow-x-auto), and the baseline already cuts the fourth column |
| i077 | nemotron-3.5-free/data-table/hinted-s1, text-long@320 | broken | suite | the table scrolls inside its card, and the reference is cut at the same edge |
| i214 | the same candidate, text-longword@320 | broken | suite | the same |
| i151 | ernie-5.5-flash-free/nav-header/plain-s1, text-200pct | broken | label | the navigation scrolls with its scroll bar hidden; at 200% text it shrinks until only "Dashb" shows |

### A nearly invisible box (1)
| item | candidate, case | label | more likely right | why |
|---|---|---|---|---|
| i100 | nemotron-3.5-free/kanban-board/plain-s1, viewport-320 | fine | label | the columns overhang their section by 8 px; the section's panel (#f8fafc on the #f1f5f9 stage) is barely visible, and the suite counts any non-transparent background as a box (content-spill) |

### A badge running under neighbouring text (1)
| item | candidate, case | label | more likely right | why |
|---|---|---|---|---|
| i200 | ernie-5.5-flash-free/data-table/hinted-s1, text-200pct | broken | label (minor) | the "Refunded" pill runs about 14 px under the date text. text-overlap compares text only with text and replaced elements, and a table cell without a background is not a box, so content-spill compares the pill with the card |

## What it would mean

If this reading is right, the suite was right on 74 of the 75 cases it
failed, against 67 in the blind result, and missed 2 of the 60 focus cases
it passed (i151, i200), against 6. The three cases where the label is more
likely right (i151, i100, i200) would need a change of definition, which
suite v1 does not allow (D-044); each is a candidate for a later suite
version, with its own decision:
- a scrolling region shrunk below one item, or one whose scroll bar is
  hidden;
- a box edge that is nearly invisible against what lies behind it;
- a badge or pill running under neighbouring text.

## Seen on the way

- No answer in the labels file has a note; 28 answers are "other". 12 of
  the 25 primary "other" answers are on cases that remove content (one
  list item, no list items, empty text), where the content is missing
  because the case removed it. The tool's first screen now says that
  "other" is not for that.
- The two fastest "broken" answers (i077 in 0.87 s, i214 in 0.75 s) are
  both disputed above, and every likely label miss took 4 s or less. The
  median answer took 2.4 s.
- Both changed answers in self-consistency were between fine and other;
  none involved broken.
