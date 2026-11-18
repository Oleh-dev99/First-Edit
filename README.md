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
Before publication, five invented names that matched real businesses were
replaced in three briefs (corpus v1.1, D-059). The components generated
from those briefs' earlier text are archived, never counted, and listed in
the run record with what they scored.

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

To refresh the data once `run-next` has moved the run on (it rewrites
`results/run2` and the run record, `docs/RUNS.md`), from the repo root in
Windows cmd.exe (in Git Bash write `.venv/Scripts/python`, elsewhere
`.venv/bin/python`). None of these steps calls a model; the whole routine
is in [docs/SPEC.md](docs/SPEC.md), Daily routine. `run-record --out
docs/RUNS.md` writes the run record on demand.

```bat
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

## Check your own component

The suite the benchmark runs on model output also runs on any component
that follows the candidate contract: one `.tsx` file with a default export,
importing `react` only, styled with Tailwind classes and inline styles, with
no network, timers, randomness or storage. Set up the harness as under
Smoke test, write the component's example props as JSON, and from
`harness/`:

```sh
npm run first-edit -- ../path/to/ProfileCard.tsx --props ../path/to/profile.json
```

It renders the component with the example props, then under the 19 cases
(longer text, a 30- and a 60-letter word, empty and long lists, large
numbers, a 320 px screen, 200% text and right-to-left), runs the five checks
and prints which cases survived. Without `--fields`, the fields map (what
each prop is: label, prose, number, list, id or fixed) is guessed from the
example props and written beside the results; correct it and pass it back
with `--fields`. Results, screenshots included, go to `results/cli/<name>/`
unless `--out` says otherwise. The exit code is 0 when no core case failed,
1 when one did (`--fail-on all` counts the extreme cases too, `--fail-on
none` never fails), 2 when the input cannot be used and 3 when the harness
failed, so it can run in CI. Images must come from the `/fe-assets/`
placeholders: the harness blocks every other request. The details are in
[docs/SPEC.md](docs/SPEC.md), Command line.

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
exits non-zero if the page reports an error, does not load within 30
seconds or does not become ready within 30 seconds after loading.

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

`npm test` runs every test in `harness/test`, among them the unit tests
for the fields map and the mutations, every check-lab case and
content-hidden lab case, the sample matrix (robust and brittle
hello-card, baseline and stress fixtures, 1280 and 320 wide), the stress
matrix (both samples through every case), the candidate gate, the brief
rules and the results site's own test, and asserts the results. Lab cases
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
the repo root in Windows cmd.exe (in Git Bash write `.venv/Scripts/python`,
elsewhere `.venv/bin/python`):

```bat
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
`summary.json`, `report.md` and a filterable `gallery.html` of the cases,
for every configured model unless `--model <id>` names them (without it,
report.md also names the unused claude-cli entries as run through the
command line; see docs/SPEC.md, Known gaps). The run itself goes through
`run-next` (docs/SPEC.md, Run queue).
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
`summary.json` to `results/runs/<brief>/<candidate with / replaced by __>/`
(for example `results/runs/hello-card/_samples__hello-card__brittle/`). Any case can be
reproduced by opening its `query` (in the case JSON) with `npm run dev`.
