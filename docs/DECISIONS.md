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
