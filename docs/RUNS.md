# Run record

Written on 2026-11-18 (UTC).

Written by `python -m first_edit run-next` after every pass, or by
`python -m first_edit run-record --out docs/RUNS.md`, from the generation
records of the models queued in runner/plan.toml and from their stress
summaries in results/runs-run2; the run's report is results/run2. Do not
edit it by hand (docs/SPEC.md, Run record). It covers every generated
sample of these models, the samples of earlier steps that the run reuses
included, as the run report does.

Every model in this run is a free-tier variant: its provider model id ends in ":free". No frontier model was tested (D-057).

## Models

Times are UTC, as recorded: a reply's receivedAt, or for a failed call the
time its record was written.

| model id | provider | base URL | provider model id | reported model | served by | first call | last call |
|---|---|---|---|---|---|---|---|
| ernie-5.5-flash-free | openai-compatible | https://openrouter.ai/api/v1 | baidu/ernie-5.5-flash-preview:free | baidu/ernie-5.5-flash-preview:free | Baidu | 2026-11-13T00:46:10+00:00 | 2026-11-18T11:54:55+00:00 |
| nemotron-3.5-free | openai-compatible | https://openrouter.ai/api/v1 | nvidia/nemotron-3.5-super-vl:free | nvidia/nemotron-3.5-super-vl:free | Nvidia | 2026-11-13T01:05:28+00:00 | 2026-11-18T12:05:31+00:00 |
| gemma-4-31b-free | openai-compatible | https://openrouter.ai/api/v1 | google/gemma-4-31b-it:free | - | - | no calls yet | - |
| nemotron-3-ultra-free | openai-compatible | https://openrouter.ai/api/v1 | nvidia/nemotron-3-ultra-550b-a55b:free | - | - | no calls yet | - |
| north-mini-code-free | openai-compatible | https://openrouter.ai/api/v1 | cohere/north-mini-code:free | - | - | no calls yet | - |

## Samples and calls

Each sample is one call; its retries are part of it. Valid: a reply that
passed the gate. Invalid: a reply that failed it (D-025). Failed: no reply
(an API error).

| model id | variant | samples | sample numbers | briefs | valid | invalid | failed |
|---|---|---|---|---|---|---|---|
| ernie-5.5-flash-free | plain | 20 | s1 | 20 | 19 | 1 | 0 |
| ernie-5.5-flash-free | hinted | 20 | s1 | 20 | 12 | 8 | 0 |
| nemotron-3.5-free | plain | 17 | s1 | 17 | 16 | 1 | 0 |
| nemotron-3.5-free | hinted | 16 | s1 | 16 | 15 | 1 | 0 |
| gemma-4-31b-free | - | 0 | - | 0 | 0 | 0 | 0 |
| nemotron-3-ultra-free | - | 0 | - | 0 | 0 | 0 | 0 |
| north-mini-code-free | - | 0 | - | 0 | 0 | 0 | 0 |

In all: 73 samples, 62 valid, 11 invalid, 0 failed.

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
| ernie-5.5-flash-free | 31 | 0 | v1 (31) | a100edf (16), ba2bb3b (15) | 1.65.0 (31) | 158.0.8127.18 (31) |
| nemotron-3.5-free | 31 | 0 | v1 (31) | a100edf (19), ba2bb3b (12) | 1.65.0 (31) | 158.0.8127.18 (31) |
| gemma-4-31b-free | 0 | 0 | - | - | - | - |
| nemotron-3-ultra-free | 0 | 0 | - | - | - | - |
| north-mini-code-free | 0 | 0 | - | - | - | - |

## Superseded samples

Samples generated from an earlier text of a brief that has since changed
(D-059). They are kept, with their stress runs, in the archive folder named
here, and never counted in the run. State as in D-038; survival is survived
/ applicable cases of the archived stress run; "broke in a core case" is the
headline's measure, which counts clean candidates only.

| archive | model id | brief | variant | state | core survived | all survived | broke in a core case |
|---|---|---|---|---|---|---|---|
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | chat-thread | hinted-s1 | clean | 15/15 | 16/17 | no |
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | chat-thread | plain-s1 | clean | 15/15 | 16/17 | no |
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | hero-section | hinted-s1 | clean | 16/17 | 17/19 | yes |
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | hero-section | plain-s1 | clean | 16/17 | 16/19 | yes |
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | nav-header | hinted-s1 | clean | 11/13 | 12/15 | yes |
| results/archive/corpus-v1.0 | ernie-5.5-flash-free | nav-header | plain-s1 | clean | 12/13 | 13/15 | yes |
| results/archive/corpus-v1.0 | nemotron-3.5-free | chat-thread | hinted-s1 | baseline-crash | 0/15 | 0/17 | - |
| results/archive/corpus-v1.0 | nemotron-3.5-free | chat-thread | plain-s1 | clean | 15/15 | 15/17 | no |
| results/archive/corpus-v1.0 | nemotron-3.5-free | hero-section | hinted-s1 | clean | 17/17 | 18/19 | no |
| results/archive/corpus-v1.0 | nemotron-3.5-free | hero-section | plain-s1 | clean | 14/17 | 14/19 | yes |
| results/archive/corpus-v1.0 | nemotron-3.5-free | nav-header | hinted-s1 | clean | 13/13 | 13/15 | no |
| results/archive/corpus-v1.0 | nemotron-3.5-free | nav-header | plain-s1 | clean | 7/13 | 7/15 | yes |

## Queue

- Blocked models: none.
- Not active: particle-1-free, a fallback that runs only if one of gemma-4-31b-free, nemotron-3-ultra-free, north-mini-code-free is blocked.
