# First Edit

Benchmarks for AI-generated UI score how the output looks at the moment
it is generated. First Edit scores what happens next: whether the layout
survives when the content changes.

Status: early development

## Results site

The results are published at **https://oleh-dev99.github.io/First-Edit/**.
They are preliminary: every page says how many of the run's models have
finished, until all have (D-054).

Every model in the run is a free-tier variant (an OpenRouter model id
ending in `:free`), and no frontier model was tested (D-057). Which models
ran, where, with which parameters and when is in the run record,
[docs/RUNS.md](docs/RUNS.md), written from the generation records.

All product, company and person names in the briefs and fixtures were
invented for this benchmark. Any match with a real name is coincidental,
and no real organisation or person is described.

The site in `site/` is built only from
the committed data in `site/public/data`. The workflow
`.github/workflows/pages.yml` builds it and deploys it to GitHub Pages
whenever `main` is pushed, so pushing `main` publishes.

Once, in the repository on GitHub, open Settings, then Pages, and under
"Build and deployment" choose **GitHub Actions** as the source. Until
then the workflow cannot deploy.

To refresh the record and the data once `run-next` has moved the run on
(it rewrites `results/run2`), from the repo root (on Windows; use
`.venv/bin/python` elsewhere). None of these steps calls a model; the
whole routine is in [docs/SPEC.md](docs/SPEC.md), Daily routine:

```sh
.venv\Scripts\python -m first_edit run-record --out docs/RUNS.md
cd harness && npm run briefs:check && cd ..
.venv\Scripts\python -m first_edit calibrate --set labels/set-01.json --runs results/runs-run2 --out results/calibration
.venv\Scripts\python -m first_edit export-site --run results/run2 --runs results/runs-run2 --calibration results/calibration --out site/public/data
cd harness && npm run site:check && cd ..
```

`briefs:check` stresses the references, whose baseline screenshots the
Briefs page shows. `export-site` refuses to write anything that holds an
API key, an email address outside the fixtures' example domains or an
absolute local path. `npm run site:check` builds the site and runs the
suite's checks on every page at 1280 and 320 px. Then commit
`docs/RUNS.md` and `site/public/data` and push `main`. Before the first push, work through
[docs/PUBLISH-CHECKLIST.md](docs/PUBLISH-CHECKLIST.md).

To look at the site locally:

```sh
cd site
npm ci
npm run dev
```

`npm run build` writes `site/dist`. Set `SITE_BASE=First-Edit` to build
it under the GitHub Pages path `/First-Edit/`, as the workflow does
(leave out the slashes in Git Bash, which would otherwise turn
`/First-Edit/` into a Windows path).

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
