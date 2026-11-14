# Pre-publication checklist

Work through this before any results, briefs or write-up leave the
repository. Each item is marked **done**, **not applicable** or **open**,
with the date and the reason.

## Status on 2026-11-14

No item is open. Every item is done or not applicable, with the reason
given. The three items left open on 2026-11-13 are closed:
- the trademark database search is not applicable (section 1);
- the read of the SPEC and the README against the code is done, and every
  mismatch found was fixed in the documents (section 2);
- the dates of the stress runs are not applicable, and the run record now
  carries the date it was written (section 3).

Five invented names were replaced in corpus v1.1 (D-059), and the samples
generated from the earlier text of the three changed briefs are archived
and listed in docs/RUNS.md. Pushing main publishes the site.

## 1. Invented names
Search every invented product and company name. A name that matches an
established company or product in a related field is replaced (D-059,
an exception to the corpus freeze of D-058); a name that turns out to be a
well-known brand goes to the owner, who decides. The site and the README
carry this notice: "All product, company and person names in the briefs
and fixtures were invented for this benchmark. Any match with a real name
is coincidental, and no real organisation or person is described."

- Web search of every name: **done** 2026-11-13. Each name searched on
  its own, in quotes, and once more with a word for its field, in
  standard and extended mode; the related-field matches were checked a
  second time. Classes: none found; a small or unrelated business; an
  established company or product in a related field; a well-known brand.
  Result on 2026-11-13: 15 none found, 21 a small or unrelated business,
  4 an established company or product in a related field, no well-known
  brand. The table below lists the names as they are in corpus v1.1.
- Trademark database search (EUIPO, USPTO): **not applicable**
  (2026-11-14, the owner's decision). A web search of every name was done,
  the names that matched an established company or product in a related
  field were replaced, and the benchmark makes no commercial use of any
  name.
- Replace the names that match an established company or product in a
  related field, then re-run briefs:check and set the affected samples
  aside: **done** 2026-11-14 (corpus v1.1, D-059). Five names were
  replaced in three briefs (the record below); briefs:check passes for all
  21 briefs, and every reference still survives every applicable case.
  The twelve samples of the run generated from the earlier text are in
  results/archive/corpus-v1.0/ and listed in docs/RUNS.md, and the two
  models' jobs for these briefs are first in the queue.
- Brookfield Supplies: **not applicable**. It was to be replaced only if
  it appeared in a brief that was already changing; it is in inbox-list,
  which does not change. "Brookfield" alone is a well-known brand
  (Brookfield Corporation, finance), but the full name matches only local
  businesses.
- The notice on the site (footer of every page and the Method page) and
  in the README: **done** 2026-11-13.

Replaced in corpus v1.1 (D-059), 2026-11-14. Each new name was searched
on its own, in quotes, once more with a word for its field (standard
mode) and once in extended mode, and kept only when nothing by that name
was found:

| Old name | Where | Old name's search (2026-11-13) | New name | New name's search (2026-11-14) |
|---|---|---|---|---|
| Ledgerloom | nav-header (brief, fixture) | an established company or product in a related field: Ledger Loom (ledgerloom.com.au), a live practice-management product for accounting firms | Sorrelwick | none found; nearest: small software firms named Sorrel (Sorrel Studio, a fitness app; Sorrel HR) and a manor house, Sorrelsykes |
| Pinecall | chat-thread (brief) | an established company or product in a related field: Pinecall (pinecall.io), a voice AI agent platform for customer service calls | Murmelby | none found; nearest: murmeli, an iOS app, and the village of Melmerby |
| Saltmarsh | hero-section (fixture, customers) | an established company or product in a related field: Saltmarsh, Cleaveland & Gund, a CPA and advisory firm | Brinefold | none found; nearest: Brineflow, a UK fertiliser maker, and Brineworks, a climate start-up |
| Tessellate | hero-section (fixture, customers) | an established company or product in a related field: several real companies, none widely known | Gorsewend | none found; nearest: Gorswen Ltd, a Welsh road haulier, and the field name "Gorse wen" |
| Copperline | hero-section (fixture, customers) | a small or unrelated business: several small firms; replaced at the owner's request | Pewterwick | none found; nearest: pewter makers and pewter wick trimmers |

Names tried first and dropped, although nothing was found by the name
itself: Tallyfern (it begins with Tally, an accounting software brand),
Latticewend (Lattice, a people-management software company) and
Thrushbill (close to Truebill, a personal-finance app).

Web search on 2026-11-13 of the names that stay:

| Name | Where | Found | What |
|---|---|---|---|
| Tasklume | pricing-table (brief) | a small or unrelated business | a to-do and habit planner app from a small app studio |
| Brindlewave | settings-form (brief, fixture) | a small or unrelated business | "Brindlewave Data", a small publisher of data-scraping tools |
| Fernhollow Goods | stat-tiles (brief) | none found | only near variants: small craft shops (Fern Hollow Fiber Goods, Ferns Hollow) |
| Hearthcove | product-grid (brief) | a small or unrelated business | hearthcove.com, a small templated online store for home items, some of them kitchen gadgets |
| Larkspan | kanban-board (brief) | none found | used only as a made-up company in demos and fiction |
| Quillpost | inbox-list (brief) | a small or unrelated business | QuillPost, a one-developer open-source email client; "Quill Post", a post-scanning service of the UK firm Quill |
| Brookfield Supplies | inbox-list (fixture, sender) | a small or unrelated business | local supply yards and place-name listings; "Brookfield" alone is a well-known brand (Brookfield Corporation, finance), but not with "Supplies" |
| Wrenfield Analytics | inbox-list (fixture, sender) | none found | nearest: Wrenfield Data, a small vendor of SEO data |
| Inklane | hero-section (brief, fixture) | a small or unrelated business | a one-developer notes app on GitHub, an Etsy shop |
| Quarrystone | hero-section (fixture, customers) | a small or unrelated business | an apartment community in Malden, MA; small stone and surfaces firms |
| Hollowmere | hero-section (fixture, customers) | a small or unrelated business | indie games and a small game studio (Hollow-mere) |
| Velvet Finch | hero-section (fixture, customers) | a small or unrelated business | a vintage shop in Maryland, an event planner in Atlanta |
| Gantrywell | confirm-dialog (brief) | none found | only "Gantry" names |
| Penmoor | tabs-panel (brief) | a small or unrelated business | Penmoor U K Ltd (equipment leasing), a nursery and an accountant, all small |
| Halden Freight | tabs-panel (fixture, document name) | none found | used as a made-up company in other demos |
| Tarnwick | sidebar-nav (brief) | a small or unrelated business | a pre-launch appraisal-software start-up, a small UK engineering company |
| Mossbank Design Co. | sidebar-nav (fixture, workspace) | none found | nearest: Moss Design Co (interiors, British Columbia) |
| Quillby Inn | sidebar-nav (fixture, project name) | none found | nearest: Quimby House Inn (Maine) |
| Fettlebook | invoice-summary (brief) | none found | only unrelated "Fettle" apps |
| Saltgrove Studio | invoice-summary (fixture, seller) | a small or unrelated business | SALT + GROVE, a Pilates studio in Vermont; Salt & Grove, a craft shop in Massachusetts |
| Kettleby Outdoor Ltd | invoice-summary (fixture, buyer) | none found | other "Kettleby" companies in the UK register, none in Kendal or outdoor goods |
| Corbelhouse | activity-feed (brief) | none found | "Corbel House" names private houses only |
| Hollinmere | team-directory (brief) | a small or unrelated business | one dress style name in an online shop; a novel series |
| Kiteward | testimonial-grid (brief, fixture) | a small or unrelated business | one shield product name in a re-enactment shop |
| Quenby Freight | testimonial-grid (fixture, company) | none found | |
| Marrowstone Architects | testimonial-grid (fixture, company) | none found | Marrowstone is a place (Marrowstone Island, Washington) |
| Hatchling Health | testimonial-grid (fixture, company) | none found | nearest: Hatching Health (a nonprofit) |
| Fennick Robotics | testimonial-grid (fixture, company) | none found | Fennick is a robot in a 2015 video game |
| Orrin & Vale | testimonial-grid (fixture, company) | a small or unrelated business | orrinvale.com, a small founder-run lead-generation agency |
| Brackenfold Studios | testimonial-grid (fixture, company) | none found | |
| Thistlecombe | checkout-summary (brief) | a small or unrelated business | one bucket-hat style name of a small label |
| Wickerlight | site-footer (brief, fixture) | a small or unrelated business | an Irish band; a novel |
| Morrowly | day-agenda (brief) | a small or unrelated business | a Korean financial-planning app, an AI writing tool |
| Thornquist | day-agenda (fixture, event title) | a small or unrelated business | a surname; small local firms that include it |
| Fennel & Fig | day-agenda (fixture, restaurant) | a small or unrelated business | a small prepared-food business on Instagram; a closed bakery (Fennel & Figs) |

Also:
- No person named in a fixture is a recognisable real person: **done**
  2026-11-13, by reading, not by a search of every name. The fixtures name
  people with common first names and surnames in ordinary roles
  (customers, team members, attendees, authors of quotes). Some of the
  names are also the names of public figures, for example Marco Rossi (a
  football coach), Lucas Silva (a footballer) and Priya Raman (an actor),
  but no fixture describes any of them, and the notice says that every name
  was invented.
- The street addresses in the invoice-summary fixture are not the address
  of a real business: **done** 2026-11-13. Neither 14 Tanner's Yard,
  Bristol, nor 2 Mill Race Lane, Kendal, was found as a street in its town
  (streets with those names exist elsewhere, in London and Crediton, and in
  Stourbridge and Bradford), and no business was found at either address.
  A search does not prove a small lane does not exist; a postcode lookup
  would settle it.
- Add any name introduced by later briefs to this table: **not
  applicable**. The corpus is frozen (D-058); there are no later briefs,
  and the five names of corpus v1.1 are recorded above.

## 2. Re-check prior work
- `npm run typecheck`, `npm test` and `npm run briefs:check` in harness/,
  and `python -m pytest runner` from the repo root, all pass: **done**
  2026-11-14, one at a time: typecheck passes, `npm test` 219 of 219 (the
  site's own test included: no error finding on any page at 1280 or 320
  px), briefs:check passes for all 21 briefs, pytest 174 passed. A first
  full pytest run had one setup error, a Windows "access denied" when the
  label store replaced its file (an unchanged test); the next full run
  passed.
- Every reference still survives every applicable case of both tiers
  and still shows all of its fixture content (D-019); look at the
  baseline, viewport-320, text-longword@320, text-unbroken@320 and
  list-many screenshots again: **done**. briefs:check on 2026-11-14:
  every reference survives every applicable case of both tiers (15 to 19
  per brief) and hides no content, the three changed briefs included
  (nav-header 15/15, chat-thread 17/17, hero-section 19/19). The
  screenshots of all 20 references were looked at on 2026-11-13 (one sheet
  per brief); on 2026-11-14 those of the three changed briefs were looked
  at again: the new names show, and nothing else changed.
- Briefs and props.ts comments still follow rules 1 to 10 (brief format),
  including a human read for hints the banned-word check cannot see:
  **done**. briefs:check passes its rule checks for every corpus brief;
  all 20 brief.md files and every props.ts comment were read on
  2026-11-13, and the corpus v1.1 change was read on 2026-11-14: it
  replaces five names and nothing else (four lines in four files). Rule 10
  is section 1.
- docs/SPEC.md, docs/DECISIONS.md and the README describe the code as it
  is; Known gaps is current: **done** 2026-11-14. The SPEC and the README
  were read in full against the code, the commands and their behaviour.
  Every mismatch was fixed in the documents, not in the code: the finding
  fields in Terms, what briefs:check checks for every brief and for corpus
  briefs only, the rect each check reports, how a case is judged against
  its reference render, the two 30 s limits of a render, the stress
  command's --runs-dir, the provider types, the claude-cli effort levels,
  network errors other than timeouts, the cost estimate's output limit,
  the blocking-error messages, the suite patches summarize accepts, the
  claude-cli note in report.md, the stress output folder, what `npm test`
  runs, and the shell the README's Windows commands are for. Known gaps
  gained two entries (network errors stop the command; the claude-cli
  note of a summarize without --model), and none was closed. D-059 is
  recorded.
- No secrets in the repository: only .env.example, never .env: **done**
  2026-11-14. .env is git-ignored and not tracked, no tracked file holds
  the value of any key in .env, and the only key-shaped string in the
  repository is the made-up test key in runner/tests/test_site_export.py.
  export-site refuses to write any data that holds one.

## 3. Record every run
For every generation and stress run that feeds published numbers, record
the items below. The published run is the free-model run (D-057), and
docs/RUNS.md is its record. run-next rewrites it after every pass, from
the generation records and the stress summaries, and `python -m first_edit
run-record --out docs/RUNS.md` writes it on demand.
- the model id from runner/models.toml and the provider's model id, base
  URL and params (generation.json holds them per candidate): **done**
  2026-11-13, in docs/RUNS.md, with the model the provider reported.
- the dates of the calls (receivedAt in generation.json) and of the
  stress runs: **done** for the calls: the first and last call of every
  model are in docs/RUNS.md. **Not applicable** for the stress runs
  (2026-11-14, the owner's decision): a stress run is determined by the
  candidate, the suite version and the harness commit, which docs/RUNS.md
  records; a stress summary has no timestamp by design (docs/SPEC.md,
  summary.json). docs/RUNS.md carries the date it was written.
- the prompt variant and the number of samples: **done** 2026-11-13, in
  docs/RUNS.md.
- the Playwright and Chromium versions (summary.json) and the repository
  commit the runs used: **done** 2026-11-13, in docs/RUNS.md (harness
  commit ba2bb3b, Playwright 1.65.0, Chromium 158.0.8127.18 for every
  stress summary so far).
- any sample that failed with an API error or was skipped by the budget:
  **done** 2026-11-13. API errors are counted per model and variant in
  docs/RUNS.md (none in the run so far). A skipped sample leaves no record
  (docs/SPEC.md, Calls, retries and budget); the run report lists the
  briefs with no candidate, and `run-next --dry-run` the samples still to
  generate.
- the superseded samples, with what they scored: **done** 2026-11-14.
  docs/RUNS.md lists each of the twelve with its model, brief, variant,
  state and survival (D-059).

Models so far (all through OpenRouter, https://openrouter.ai/api/v1):

| Model id | Provider model id | Date | Runs |
|---|---|---|---|
| claude-haiku-5.5 | anthropic/claude-haiku-5.5 | 2026-11-13 | not run: the owner chose free models only (D-057) |
| deepseek-v4.1-flash | deepseek/deepseek-v4.1-flash-1017 | 2026-11-13 | not run: the owner chose free models only (D-057) |
| gpt-6.1-terra | openai/gpt-6.1-terra | 2026-11-13 | not run: the owner chose free models only (D-057) |
| gemini-4-carbon | google/gemini-4-carbon | 2026-11-13 | not run: the owner chose free models only (D-057) |
| ernie-5.5-flash-free | baidu/ernie-5.5-flash-preview:free | 2026-11-13 | step 8 spike: plain and hinted, 1 sample, 10 briefs; params { max_tokens = 32000 }; the published run reuses 7 of these briefs; the samples of chat-thread, hero-section and nav-header are superseded (D-059) |
| nemotron-3.5-free | nvidia/nemotron-3.5-super-vl:free | 2026-11-13 | step 8 spike: plain and hinted, 1 sample, 10 briefs; params { max_tokens = 32000 }; the published run reuses 7 of these briefs; the samples of chat-thread, hero-section and nav-header are superseded (D-059) |
| inkling-2-small-free | thinkingmachines/inkling-2-small:free | 2026-11-13 | step 8 spike: dropped after 2 API errors (HTTP 403, not available in this region); no candidates; not part of the published run |
| ernie-5.5-flash-free | baidu/ernie-5.5-flash-preview:free | queued 2026-11-14 | the published run, first in the queue: plain and hinted, 1 sample, chat-thread, hero-section and nav-header of corpus v1.1 (D-059); see docs/RUNS.md |
| nemotron-3.5-free | nvidia/nemotron-3.5-super-vl:free | queued 2026-11-14 | the published run, second in the queue: the same three briefs (D-059); see docs/RUNS.md |
| ernie-5.5-flash-free | baidu/ernie-5.5-flash-preview:free | queued 2026-11-13 | the published run (D-057): plain and hinted, 1 sample, the ten step 11 briefs (runner/plan.toml); see docs/RUNS.md |
| nemotron-3.5-free | nvidia/nemotron-3.5-super-vl:free | queued 2026-11-13 | the published run: plain and hinted, 1 sample, the ten step 11 briefs; see docs/RUNS.md |
| gemma-4-31b-free | google/gemma-4-31b-it:free | queued 2026-11-13 | the published run: plain and hinted, 1 sample, 20 briefs; see docs/RUNS.md |
| nemotron-3-ultra-free | nvidia/nemotron-3-ultra-550b-a55b:free | queued 2026-11-13 | the published run: plain and hinted, 1 sample, 20 briefs; see docs/RUNS.md |
| north-mini-code-free | cohere/north-mini-code:free | queued 2026-11-13 | the published run: plain and hinted, 1 sample, 20 briefs; see docs/RUNS.md |
| particle-1-free | particle-ai/particle-1:free | queued 2026-11-13 | fallback of the published run: runs only if gemma-4-31b-free, nemotron-3-ultra-free or north-mini-code-free is blocked |
| cc-haiku, cc-sonnet, cc-opus | claude-cli aliases haiku, sonnet, opus (Claude Code 2.1.229, effort medium) | 2026-11-13 | step 12: not run; two isolation probe calls of cc-haiku only (D-047). Through the owner's subscription, not the API, if ever run |

Every model in the published run is a free-tier variant (an id ending in
":free"), and no frontier model was tested (D-057). The site (the banner on
every page and the Method page) and the README say so: **done**
2026-11-13. The reasons D-030 gave for not publishing free variants are
now limitations of the results: free variants can be previews, are rate
limited and are served apart from the paid endpoints.
