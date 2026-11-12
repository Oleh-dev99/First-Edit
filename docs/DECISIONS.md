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
7 (end-to-end spike), when run time and dev-only React behaviour can be
measured on real candidates.

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
