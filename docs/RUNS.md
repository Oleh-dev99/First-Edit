# Run record

Written by `python -m first_edit run-record --out docs/RUNS.md` from the
generation records of the models queued in runner/plan.toml and from their
stress summaries in results/runs-run2; the run's report is results/run2.
Do not edit it by hand: run the command again whenever the run advances
(docs/SPEC.md, Daily routine). It covers every generated sample of these
models, the samples of earlier steps that the run reuses included, as the
run report does.

Every model in this run is a free-tier variant: its provider model id ends in ":free". No frontier model was tested (D-057).

## Models

Times are UTC, as recorded: a reply's receivedAt, or for a failed call the
time its record was written.

| model id | provider | base URL | provider model id | reported model | served by | first call | last call |
|---|---|---|---|---|---|---|---|
| ernie-5.5-flash-free | openai-compatible | https://openrouter.ai/api/v1 | baidu/ernie-5.5-flash-preview:free | baidu/ernie-5.5-flash-preview:free | Baidu | 2026-11-13T00:45:50+00:00 | 2026-11-13T12:03:14+00:00 |
| nemotron-3.5-free | openai-compatible | https://openrouter.ai/api/v1 | nvidia/nemotron-3.5-super-vl:free | nvidia/nemotron-3.5-super-vl:free | Nvidia | 2026-11-13T01:04:55+00:00 | 2026-11-13T01:23:49+00:00 |
| gemma-4-31b-free | openai-compatible | https://openrouter.ai/api/v1 | google/gemma-4-31b-it:free | - | - | no calls yet | - |
| nemotron-3-ultra-free | openai-compatible | https://openrouter.ai/api/v1 | nvidia/nemotron-3-ultra-550b-a55b:free | - | - | no calls yet | - |
| north-mini-code-free | openai-compatible | https://openrouter.ai/api/v1 | cohere/north-mini-code:free | - | - | no calls yet | - |

## Samples and calls

Each sample is one call; its retries are part of it. Valid: a reply that
passed the gate. Invalid: a reply that failed it (D-025). Failed: no reply
(an API error).

| model id | variant | samples | sample numbers | briefs | valid | invalid | failed |
|---|---|---|---|---|---|---|---|
| ernie-5.5-flash-free | plain | 12 | s1 | 12 | 12 | 0 | 0 |
| ernie-5.5-flash-free | hinted | 11 | s1 | 11 | 9 | 2 | 0 |
| nemotron-3.5-free | plain | 10 | s1 | 10 | 9 | 1 | 0 |
| nemotron-3.5-free | hinted | 10 | s1 | 10 | 9 | 1 | 0 |
| gemma-4-31b-free | - | 0 | - | 0 | 0 | 0 | 0 |
| nemotron-3-ultra-free | - | 0 | - | 0 | 0 | 0 | 0 |
| north-mini-code-free | - | 0 | - | 0 | 0 | 0 | 0 |

In all: 43 samples, 39 valid, 4 invalid, 0 failed.

## Request parameters

The request body is the provider model id, the two messages and these
parameters, nothing else (D-024), as each generation record names them.

| model id | parameters |
|---|---|
| ernie-5.5-flash-free | `{"max_tokens": 32000}` |
| nemotron-3.5-free | `{"max_tokens": 32000}` |
| gemma-4-31b-free | no calls yet |
| nemotron-3-ultra-free | no calls yet |
| north-mini-code-free | no calls yet |

## Stress runs

From the stress summaries in results/runs-run2, one per valid candidate, with
the number of summaries for each value.

| model id | stressed | valid, not stressed | suite | harness commit | Playwright | Chromium |
|---|---|---|---|---|---|---|
| ernie-5.5-flash-free | 21 | 0 | v1 (21) | ba2bb3b (21) | 1.65.0 (21) | 158.0.8127.18 (21) |
| nemotron-3.5-free | 18 | 0 | v1 (18) | ba2bb3b (18) | 1.65.0 (18) | 158.0.8127.18 (18) |
| gemma-4-31b-free | 0 | 0 | - | - | - | - |
| nemotron-3-ultra-free | 0 | 0 | - | - | - | - |
| north-mini-code-free | 0 | 0 | - | - | - | - |

## Queue

- Blocked models: none.
- Not active: particle-1-free, a fallback that runs only if one of gemma-4-31b-free, nemotron-3-ultra-free, north-mini-code-free is blocked.
