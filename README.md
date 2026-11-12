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

`npm test` renders every check-lab case and the sample matrix (robust and
brittle hello-card, baseline and stress fixtures, 1280 and 320 wide) and
asserts the findings. Lab cases can be viewed at `/?lab=<case-id>`.

`npm run check` renders one case and writes the findings JSON, a clean
full-page screenshot and an annotated screenshot (red outlines on errors,
amber on info findings) to `results/checks/`. `--fixture` defaults to
`baseline` and `--width` to 1280; the height is always 800.
