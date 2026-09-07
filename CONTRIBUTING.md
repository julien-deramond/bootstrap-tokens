# Contributing

Thanks for taking a look. This project tracks a moving target — `twbs/bootstrap@v6-dev` is an
alpha — so bug reports about drift are as useful as pull requests.

## Getting set up

```bash
git clone https://github.com/julien-deramond/bootstrap-tokens.git
cd bootstrap-tokens
npm install
git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap
```

Bootstrap 6 is not on npm yet, so a `v6-dev` checkout is what the tooling reads. Point at one
elsewhere with `--src <path>`, `$BOOTSTRAP_SRC`, or a `bootstrap-tokens.config.json`
containing `{ "bootstrapSource": "<path>" }`.

Then:

```bash
npm run validate   # the token document is well formed
npm test           # unit tests
npm run build      # regenerate build/ and docs/token-inventory.md
npm run verify     # our export compiles to the same CSS as upstream
npm run web        # the Theme Builder, on http://localhost:4000
```

## Before opening a pull request

CI runs `validate`, `sync --check`, `test`, `build`, the contrast audit, `verify` and
`eject --verify`. Running them locally first is much faster than a round trip.

Two things catch people out:

* **`build/` is committed**, so a change to the token document or an exporter means running
  `npm run build` and committing the result. CI fails if `build/` or
  `docs/token-inventory.md` is stale.
* **`tokens/` is generated from upstream.** Don't hand-edit it to fix an extraction bug — fix
  the extractor in `tools/lib/` and re-run `npm run sync`, or the next sync silently reverts
  you. Deliberate deviations belong in the curation layer, not in the output.

## What tends to need doing

* **Upstream drift.** `npm run sync -- --check` reports it; a nightly workflow opens an issue
  when `v6-dev` moves. Re-syncing, reviewing the diff and rebuilding is the routine.
* **Unmodelled surface.** `sync --check` also fails when upstream offers a configurable
  variable the document neither models nor lists in `NOT_TOKENS` with a reason.
* **Findings about upstream.** If the pipeline surfaces a real Bootstrap bug, write it up in
  [`docs/BACKLOG.md`](docs/BACKLOG.md) with the evidence that convinced you — a compile, a
  diff, or a measurement in a browser. Several are worth raising with `twbs/bootstrap`
  directly.

[`docs/PLAN.md`](docs/PLAN.md) records what the maintainer thinks is wrong and what comes
next; it is the honest version of a roadmap and a reasonable place to look for something to
pick up.

## Style

* Node 20+, ES modules, no build step for the tooling or the web app.
* No runtime dependencies. `sass` and `style-dictionary` are dev-only and stay that way.
* Tests use `node --test`. Prefer running the real tool over asserting the shape of our own
  output — `tools/test/consumers.test.mjs` runs `tsc` and Style Dictionary for that reason.
* Commit messages are conventional-ish (`fix:`, `feat:`, `docs:`, `test:`) and say what
  changed for a reader, not what file was touched.

## Licence

By contributing you agree that your work is licensed under the [MIT Licence](LICENSE).
