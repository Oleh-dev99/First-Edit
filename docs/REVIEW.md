# Review procedure

How a run's results are checked by a person before they are used. The
review compares the checks' verdicts with what a reviewer sees in the
screenshots, and the gate's verdicts with the candidates' code. It is
non-blind unless a step says otherwise: the reviewer knows the verdict
being checked.

## Scope
The candidates generated in the session under review (generation.json
with a receivedAt in that session), stressed into the run's runs
directory. If no candidate was generated, the review is skipped and the
report says so.

## 1. Failed core cases
Take up to 40 failed core cases of clean-baseline candidates.
- Spread them across checks, models and briefs: group the failed cases by
  the first check with new errors, then by model and brief, and take one
  case from each group in turn until 40 are taken or none are left. Within
  a group, pick at random with a fixed seed, and record the seed.
- For each case, open the annotated screenshot (`<case>.annotated.png`)
  next to the clean one and the reference render (the baseline, or
  viewport-320 for a case at 320 px).
- Verdict: **real** (a person would see broken layout: content past the
  page, cut off, spilling out of its box, overlapping or off screen) or
  **false positive** (the flagged difference cannot be seen, or the
  layout is as designed). Write one line on the cause.

## 2. Survived cases
Take up to 40 survived cases, spread the same way, with at least half
from text-longword@320, list-many, viewport-320 and text-200pct, where
missed failures are most likely.
- For each case, look at the clean screenshot (`<case>.png`).
- Verdict: **fine**, or **broken** (a missed failure). Write one line on
  the cause.

## 3. Invalid candidates
Read the reasons of every invalid candidate of the session, with its
Component.tsx (and the raw reply in the cache where the reasons concern
the reply, such as empty or truncated), and say whether the gate was
right.

## 4. Report
- Every false positive and every missed failure, with model, brief,
  variant, case and cause.
- The counts: real / reviewed failed cases, broken / reviewed survived
  cases, and gate verdicts right / reviewed.
- The trust bar used since step 8: at least 90% of reviewed failed cases
  real, and at most 5% of reviewed survived cases broken.
- Do not fix checks during the review. List what should change for a
  later step; a fix to the suite is a bug fix with its own lab case and a
  patch number (D-044).
