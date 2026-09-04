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

## Phase 3 — Token chooser (web) 🚧

A static, dependency-free page. Load defaults → edit → export Sass.

* ✅ Data pipeline: `build/json/chooser.json` (tokens + control metadata + defaults).
* ✅ UI: layer navigation, live preview of Bootstrap components, colour/dimension editors.
* ✅ Export panel: `custom.scss` with `@use … with ()`, plus CSS custom-property output and
  a JSON theme file that round-trips back into the chooser.
* ⬜ Share-by-URL (compressed state in the fragment).
* ⬜ Contrast checker on theme-colour pairs (`contrast` vs `bg`).
* ⬜ Import an existing `custom.scss` and pre-fill the chooser.

## Phase 4 — Upstream-facing polish ⬜

* ⬜ CI: run `sync --check` nightly against `v6-dev` and open an issue on drift.
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
