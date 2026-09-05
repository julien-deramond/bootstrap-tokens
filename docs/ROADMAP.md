# Roadmap

Status legend: ✅ done · 🚧 in progress · ⬜ not started

> This file records what is **done**. [`PLAN.md`](./PLAN.md) records what is wrong, what is
> missing and the order to fix it in — including two upstream token maps this document's
> "✅ Component layer" claim does not actually cover.

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

Two routes out, checked against each other by `verify` and `eject --verify`:
consumer (`@use … with ()`) and maintainer (patched v6-dev sources).


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
* ✅ Two modes over one override model. **Design** (the default) is eight high-leverage
  controls plus presets; **All tokens** is the full browser — grouped navigation with search,
  per-token light and dark fields, an OKLCH-aware colour picker, and change indicators. A
  control reports "Custom" rather than overwriting work it cannot represent.
* ✅ Controls that look like what they do: radius as shapes, density as spacing, typefaces set
  in themselves, shadow depths casting their own shadow.
* ✅ Light and dark side by side, since `light-dark()` makes every v6 theme two themes.
* ✅ Touching a control scrolls the preview to what it changed and flashes it.
* ✅ Undo/redo (⌘Z / ⇧⌘Z); Reset is an undoable step, not a confirm dialog.
* ✅ A theme-level contrast readout that distinguishes issues you introduced from ones
  Bootstrap's defaults already carry.
* ✅ Exports carry only the keys you changed.
* ✅ Accessibility pass: one `:focus-visible` treatment for every control (there had been
  exactly one rule, on text inputs), WCAG 2.2 target sizes, and tablists that actually
  respond to arrow keys rather than only claiming the role.
* ✅ Gamut-mapped OKLCH conversion — see below.
* ✅ Live preview: real Bootstrap markup in an iframe over vendored `bootstrap.css`;
  overrides are applied as custom properties, so nothing recompiles.
* ✅ Swatches resolved by the browser inside the preview, so `color-mix()` and `light-dark()`
  show their true colours in both schemes.
* ✅ Simple mode picks each role's `contrast` sub-key by measured contrast instead of
  substituting it, and warns when a brand choice fails WCAG AA in either scheme.
* ✅ Export: `custom.scss` (only the keys you touched), runtime `theme.css`, and a
  `theme.json` that imports back into the chooser — each with its own "what to do next".
  Edits persist in `localStorage`.
* ✅ Maintainer export: `bstokens eject` patches v6-dev's own Sass sources in place, and the
  chooser's fourth export tab shows exactly which declarations will change.
  See [`maintainer-export.md`](./maintainer-export.md).
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
* ⬜ Propose the token document upstream. `eject` makes this concrete: the proposal is not
  "replace your Sass with generated files" but "here is a tool that edits them for you".

## Known gaps

* `$utilities`, mixins and the `@layer` order are out of scope by design.
* `light-dark()` pairs are modelled as a single token with a `dark` extension; a third
  mode (e.g. high-contrast) would need the extension to become a `modes` map.
* Upstream is `6.0.0-alpha1`. Token names *will* move. `sync` is the mitigation.
