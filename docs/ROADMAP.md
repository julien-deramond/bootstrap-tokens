# Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ not started

## Phase 0 — Knowledge base ✅

* ✅ Read `twbs/bootstrap@v6-dev` Sass source end to end; record the real architecture in
  [`bootstrap-v6-architecture.md`](./bootstrap-v6-architecture.md).
* ✅ Decide the DTCG mapping and write down every deviation
  ([`dtcg-conventions.md`](./dtcg-conventions.md)).
* ✅ Define the three layers and the reference direction ([`layers.md`](./layers.md)).

## Phase 1 — Token document ✅

* ✅ Sass map parser (`tools/lib/sass-parser.mjs`) — paren/quote/interpolation aware,
  handles nested maps.
* ✅ Extractor `bstokens sync` — reads a `v6-dev` checkout, produces the DTCG tree, and
  **diffs** it against `tokens/` so upstream drift is visible.
* ✅ Primitive layer: colours + tint/shade recipe, spacing, radii, borders, typography,
  layout, z-index, opacity, motion.
* ✅ Semantic layer: theme colours, surfaces, type, elevation, focus, control, motion.
* ✅ Component layer: one file per upstream `$*-tokens` map, variants included.
* ✅ Resolver + validator: alias resolution, cycle detection, layer-direction enforcement,
  DTCG type checking.

## Phase 2 — Sass export ✅

* ✅ `bstokens build` emits:
  * `build/scss/_tokens.scss` — every map, drop-in for `v6-dev`.
  * `build/scss/_overrides.scss` — only the tokens that differ from upstream defaults,
    shaped as `@use "bootstrap/scss/bootstrap" with (…)`.
  * `build/css/tokens.css` — the flat custom-property surface.
  * `build/json/tokens.resolved.json` — fully resolved DTCG, for other tools.
* ✅ Correct routing of loop-generated `--*` keys to their owning map instead of
  `$root-tokens` (`tools/lib/sass-targets.mjs`).
* ✅ `bstokens verify` — compile upstream vs. exported, assert identical CSS.

## Phase 3 — Token chooser (web) ✅

A static page with no build step and no dependencies. `npm run web`.

* ✅ Data pipeline: `build/json/tokens.tree.json`, loaded straight into the browser.
* ✅ Shared code, not a second implementation: the page imports `tools/lib/*.mjs`, so
  preview and export run the resolver that `verify` proves correct.
* ✅ UI: layer/group navigation with search, per-token light and dark fields, an OKLCH-aware
  colour picker, and change indicators down the rail.
* ✅ Live preview: real Bootstrap markup in an iframe over vendored `bootstrap.css`;
  overrides are applied as custom properties, so nothing recompiles.
* ✅ Swatches resolved by the browser inside the preview, so `color-mix()` and `light-dark()`
  show their true colours in both schemes.
* ✅ Export: `custom.scss` (only the maps you touched), runtime `theme.css`, and a
  `theme.json` that imports back into the chooser. Edits persist in `localStorage`.
* ⬜ Share-by-URL (compressed state in the fragment).
* ✅ WCAG contrast badges on the pairs that matter: a role's `contrast` against its
  `bg`, and its `fg`/`fg-emphasis` against the page. Shown per scheme, since a palette can
  pass in light and fail in dark.
* ⬜ Import an existing `custom.scss` and pre-fill the chooser.

## Phase 4 — Upstream-facing polish 🚧

* ✅ CI: validate, test, build-is-current and `verify` on every push; a nightly
  `sync --check` against `v6-dev` that opens an issue on drift.
* ⬜ Publish `@bootstrap/tokens`-shaped npm package with the resolved JSON + Sass.
* ⬜ Figma Tokens / Style Dictionary compatibility pass (they read plain DTCG; verify the
  `expression` extension degrades sanely).
* ⬜ Propose the token document upstream as the source for `scss/_colors.scss`,
  `scss/_theme.scss` and `scss/_root.scss`.

## Known gaps

* `$utilities`, mixins and the `@layer` order are out of scope by design.
* `light-dark()` pairs are modelled as a single token with a `dark` extension; a third
  mode (e.g. high-contrast) would need the extension to become a `modes` map.
* Upstream is `6.0.0-alpha1`. Token names *will* move. `sync` is the mitigation.
