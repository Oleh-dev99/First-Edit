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
