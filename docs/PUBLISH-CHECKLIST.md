# Pre-publication checklist

Work through this before any results, briefs or write-up leave the
repository.

## 1. Invented names
Search every invented product and company name (web search and a
trademark database search, for example EUIPO and USPTO). Replace any name
that belongs to a real brand or company; then re-run `npm run briefs:check`
and the affected stress runs.

| Name | Where |
|---|---|
| Tasklume | pricing-table (brief) |
| Ledgerloom | nav-header (brief, fixture) |
| Brindlewave | settings-form (brief, fixture) |
| Fernhollow Goods | stat-tiles (brief) |
| Hearthcove | product-grid (brief) |
| Pinecall | chat-thread (brief) |
| Larkspan | kanban-board (brief) |
| Quillpost | inbox-list (brief) |
| Brookfield Supplies | inbox-list (fixture, sender) |
| Wrenfield Analytics | inbox-list (fixture, sender) |
| Inklane | hero-section (brief, fixture) |
| Quarrystone, Hollowmere, Copperline, Velvet Finch, Saltmarsh, Tessellate | hero-section (fixture, customers) |

Also check that no person named in a fixture is a recognisable real
person, and add any name introduced by later briefs to this table.

## 2. Re-check prior work
- `npm run typecheck`, `npm test` and `npm run briefs:check` in harness/,
  and `python -m pytest runner` from the repo root, all pass.
- Every reference still survives every applicable mutation and still
  shows all of its fixture content (D-019); look at the baseline,
  viewport-320, text-unbroken and list-many screenshots again.
- Briefs and props.ts comments still follow rules 1 to 10 (brief format),
  including a human read for hints the banned-word check cannot see.
- docs/SPEC.md, docs/DECISIONS.md and the README describe the code as it
  is; Known gaps is current.
- No secrets in the repository: only .env.example, never .env.

## 3. Record every run
For every generation and stress run that feeds published numbers, record:
- the model id from runner/models.toml and the provider's model id,
  base URL and params (generation.json holds them per candidate)
- the dates of the calls (receivedAt in generation.json) and of the
  stress runs
- the prompt variant and the number of samples
- the Playwright and Chromium versions (summary.json) and the repository
  commit the runs used
- any sample that failed with an API error or was skipped by the budget

Models so far (all through OpenRouter, https://openrouter.ai/api/v1):

| Model id | Provider model id | Date | Runs |
|---|---|---|---|
| claude-haiku-5.5 | anthropic/claude-haiku-5.5 | 2026-11-13 | not run (the spike ran on free variants, D-030) |
| deepseek-v4.1-flash | deepseek/deepseek-v4.1-flash-1017 | 2026-11-13 | not run (the spike ran on free variants, D-030) |
| gpt-6.1-terra | openai/gpt-6.1-terra | 2026-11-13 | not run (the spike ran on free variants, D-030) |
| gemini-4-carbon | google/gemini-4-carbon | 2026-11-13 | not run (the spike ran on free variants, D-030) |
| ernie-5.5-flash-free | baidu/ernie-5.5-flash-preview:free | 2026-11-13 | step 8 spike: plain and hinted, 1 sample, 10 briefs; params { max_tokens = 32000 }; spike only, not for publication (D-030) |
| nemotron-3.5-free | nvidia/nemotron-3.5-super-vl:free | 2026-11-13 | step 8 spike: plain and hinted, 1 sample, 10 briefs; params { max_tokens = 32000 }; spike only, not for publication (D-030) |
| inkling-2-small-free | thinkingmachines/inkling-2-small:free | 2026-11-13 | step 8 spike: dropped after 2 API errors (HTTP 403, not available in this region); no candidates |

Free variants (ids ending in ":free") are not the published comparison
(D-030). A published run uses the paid endpoints and records the above
for every model.
