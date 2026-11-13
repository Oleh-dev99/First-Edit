# First Edit

Benchmarks for AI-generated UI score how the output looks at the moment
it is generated. First Edit scores what happens next: whether the layout
survives when the content changes.

Status: early development

## Smoke test

The render harness lives in `harness/` and needs Node 26. From the repo
root:

```sh
cd harness
npm ci
npx playwright install chromium
npm run typecheck
npm run smoke
```

`npm run smoke` starts Vite on a free port and renders the sample
candidate `candidates/_samples/hello-card/robust` with the `hello-card`
baseline fixture in headless Chromium at 1280x800 and 320x800. It writes:

- `results/smoke/hello-card__robust__1280.png`
- `results/smoke/hello-card__robust__320.png`

It prints the page's `scrollWidth` and `clientWidth` for each viewport and
exits non-zero if the page reports an error or does not become ready
within 30 seconds.

To view a candidate in your own browser, run `npm run dev` in `harness/`
and open
`http://localhost:5173/?brief=hello-card&candidate=_samples/hello-card/robust`.
Add `&fixture=<name>` to load `briefs/<brief>/fixture.<name>.json`
instead of the baseline fixture.

## Checks

The checks are defined in [docs/SPEC.md](docs/SPEC.md). From `harness/`:

```sh
npm test
npm run check -- --brief hello-card --candidate _samples/hello-card/brittle --fixture stress --width 320
```

`npm test` runs the unit tests for the fields map and the mutations, every
check-lab case, the sample matrix (robust and brittle hello-card,
baseline and stress fixtures, 1280 and 320 wide) and the stress matrix
(both samples through every case), and asserts the results. Lab cases
can be viewed at `/?lab=<case-id>`.

`npm run check` renders one case and writes the findings JSON, a clean
full-page screenshot and an annotated screenshot (red outlines on errors,
amber on info findings) to `results/checks/`. `--fixture` defaults to
`baseline`. `--mutation <id>` applies one mutation; `--width` defaults to
the mutation's viewport (1280, or 320 for viewport-320). The height is
always 800.

## Briefs

Briefs live in `briefs/<id>/` (format in [docs/SPEC.md](docs/SPEC.md));
each corpus brief has a reference candidate in
`candidates/_reference/<id>/v1/`. From `harness/`:

```sh
npm run briefs:check
npm run briefs:check -- --brief pricing-table
```

validates the brief files, the fields map, the fixture against `Props`,
image references, the corpus rules and the reference candidate (types,
imports, a clean baseline, survival of every applicable case in both
tiers, core and extreme, and no hidden content). It prints one row per
brief and exits non-zero if any brief fails.

Fixtures reference images only as `/fe-assets/<name>.svg`; the six
placeholder images live in `harness/public/fe-assets/`.

## Generation runner (Python)

The runner in `runner/` prompts models for candidates and stress-tests
them; see [docs/SPEC.md](docs/SPEC.md), Generation. It needs Python 3.13
and, for the gate and the stress runs, the harness set up as above. From
the repo root (on Windows; use `.venv/bin/python` elsewhere):

```sh
python -m venv .venv
.venv\Scripts\python -m pip install -r runner/requirements.lock -e runner
.venv\Scripts\python -m first_edit generate --model mock-reference --all
.venv\Scripts\python -m first_edit stress --model mock-reference --all
.venv\Scripts\python -m pytest runner
```

Models are listed in `runner/models.toml`; API keys go in `.env` (see
`.env.example`). `mock-reference` replies with each brief's reference
candidate and needs no network. Before a real run,
`.venv\Scripts\python -m first_edit doctor` checks every model (key set,
model listed, prices) without spending tokens. After the stress runs,
`.venv\Scripts\python -m first_edit summarize --out results/spike` writes
`summary.json`, `report.md` and a filterable `gallery.html` of the cases.
Model outputs under `candidates/` are git-ignored until a run is
published. Before publishing anything, work through
[docs/PUBLISH-CHECKLIST.md](docs/PUBLISH-CHECKLIST.md).

## Stress runs

```sh
npm run stress -- --brief hello-card --candidate _samples/hello-card/brittle
```

Renders the baseline and every applicable case: the eleven mutations,
then the eight content mutations again at 320 px, 19 cases at most, each
in the core or the extreme tier (see [docs/SPEC.md](docs/SPEC.md), Cases).
It prints a table of new errors per check and the survival rate, overall
and per tier, and writes per-case results, screenshots and
`summary.json` to `results/runs/<brief>/<candidate>/`. Any case can be
reproduced by opening its `query` (in the case JSON) with `npm run dev`.
