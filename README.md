# bootstrap-tokens

Design tokens for [Bootstrap v6](https://github.com/twbs/bootstrap/tree/v6-dev) in the
[DTCG format](https://tr.designtokens.org/format/), layered raw → semantic → component, and
exportable back to Sass.

```
tokens/  (DTCG, source of truth)  ──build──▶  Sass maps · CSS custom properties · resolved JSON
    ▲                                                        │
    └────────────sync────── twbs/bootstrap@v6-dev ◀──────verify
```

**Status:** tracks Bootstrap `6.0.0-alpha1`. 1197 tokens. `bstokens verify` compiles upstream
`bootstrap.scss` and the exported configuration and asserts the CSS is byte-identical — today
it is, across all 17021 lines.

## Why

Bootstrap v6 already has a real token system: `oklch()` colour scales generated with
`color-mix()`, semantic `$theme-colors`, and a per-component `$*-tokens` map emitted as CSS
custom properties. What it does not have is that system in a portable form. This repository
lifts it into DTCG so it can be read by design tools, diffed, validated, and re-emitted — and
so a theme can be built by editing values rather than by reading Sass.

## Use it in a project

```bash
npx bstokens init my-theme --theme theme.json
cd my-theme && npm install && npm run watch
```

That writes a project that compiles: the entry stylesheet, a `package.json` with the right
dependencies and scripts, a page that uses the result, and the `theme.json` so you can reopen
it in the chooser later. Verified end to end — clean directory, `npm install`, `npm run
build`, a 355 KB themed stylesheet.

> Bootstrap 6 is not on npm yet — the registry has nothing above 5.x — so the scaffold depends
> on the `v6-dev` branch, which installs cleanly because upstream ships `scss/**` and defines
> no prepare script. Pass `--bootstrap` to pin a release once one exists.

As a dependency:

```js
import { loadTokens, themeScss, createHue } from 'bootstrap-tokens'
```
```scss
@use "bootstrap-tokens/scss";   // every Sass map, !default-flagged
```
```css
@import "bootstrap-tokens/css"; /* the flat custom-property surface */
```

## Quick start

```bash
npm install
git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap
npm run build
```

`build/` then contains:

| file | what it is |
| --- | --- |
| `scss/_tokens.scss` | every Sass map, `!default`-flagged — a drop-in starting point for `v6-dev` |
| `scss/bootstrap-custom.scss` | a ready-to-compile `@use "bootstrap" with (…)` configuration |
| `css/tokens.css` | the flat custom-property surface, no Sass required |
| `json/tokens.resolved.json` | every token with its `$value` resolved to CSS |
| `json/chooser.json` | the data the web chooser loads |

## The token chooser

```bash
npm run vendor   # compile upstream Bootstrap into web/vendor/bootstrap.css (once)
npm run web      # http://localhost:4000
```

Watch real Bootstrap components re-theme in the panel beside you, then export. There is no
Sass in the browser and no compile step in the loop: v6 drives everything through CSS custom
properties, so re-declaring them is the whole mechanism.

### Two modes over one model

**Design** (the default) is eight controls that each move a lot of the system — brand and
accent colour, corner radius, density, border weight, typeface, text size, shadow depth —
plus four presets to start from. Most themes are a few of these and nothing else.

**All tokens** is the browser: all 1197 tokens, grouped, searchable, with a light and a dark
field each.

They are two *views*, not two models. Every control writes ordinary token overrides into the
same state the browser edits, so switching is lossless and the export comes from one source
of truth. A control reads its position back out of those overrides and says **Custom** when
the tokens hold something it cannot represent, rather than snapping your work back to a
preset.

### How it behaves

* **Options look like what they do.** Corner radius is five rounded shapes, density is
  spacing diagrams, typefaces are set in themselves, shadow depths cast their own shadow. A
  row of words would make you click, look elsewhere, and infer.
* **Light and dark, side by side.** `light-dark()` means a v6 theme is always two themes, so
  comparing them should not require flipping a switch. Side by side is the default on a wide
  screen. Each scheme renders as a framed, labelled artboard on a neutral canvas that belongs
  to neither theme — otherwise, in a dark chooser, the dark preview reads as one more panel of
  the tool.
* **Touching a control shows you what it changed.** The preview scrolls to the affected
  section and flashes it, so you never have to hunt for the difference.
* **Undo, always.** ⌘Z / ⇧⌘Z, and Reset is just another undoable step — no confirmation
  dialog guarding a reversible action.
* **Themes are things you keep.** Name them, hold several, duplicate one to try a variation.
  *Copy share link* packs the whole theme into the URL fragment — 571 characters for a
  22-token theme, compressed in the browser, uploaded nowhere.
* **A theme-level contrast readout**, which separates issues you introduced from ones
  Bootstrap's defaults already have. A warning you didn't cause teaches you to ignore
  warnings.

Two decisions inside Design mode are worth knowing about:

* **Changing the brand colour repoints the role, it doesn't recolour a scale.** Bootstrap
  builds `primary` out of the blue scale, so picking green rewrites all nine sub-keys to
  `{color.green.*}` — which is exactly what a handwritten `$theme-colors` override looks like.
  The custom colour picker is the other path, and it says plainly that it redefines that
  scale and so also recolours `--blue-*` elsewhere.
* **`contrast` is chosen, not substituted.** That sub-key is the text placed *on* the fill.
  Substituting it would give white-on-yellow; Simple mode measures the contrast and picks
  white or `gray-900`, then shows the resulting ratios and warns when a choice fails WCAG AA.

### Other things worth knowing

* **Editing a hue moves everything downstream.** `color.blue.base` regenerates 13 scale
  steps, which move `theme-color.primary.*`, which move every component that uses them.
* **Swatches are resolved by the browser, inside the preview.** A value like
  `color-mix(in oklch, var(--blue-500) 50%, var(--bg-body))` or a `light-dark()` pair shows
  its real colour in both schemes, because the page asks the previewed document rather than
  reimplementing CSS colour maths.
* **Colour conversion is gamut-mapped, not clamped.** Bootstrap authors hues outside sRGB
  (`oklch(60% 0.24 240)` is), and clamping each channel independently moves them sideways in
  hue — that blue came back 14° towards violet. Chroma is reduced instead, so lightness and
  hue survive, which also made the contrast readings accurate.
* **Contrast is checked where it matters.** Each theme role's `contrast` is scored against
  its own fill, and its `fg` against the page, per scheme. Upstream's stock `primary`
  already sits at 3.6:1 for white on `blue-500` — worth knowing before you re-tint it.
* **An export carries only the keys you changed.** `defaults()` merges key by key, so
  editing one shadow gives you a three-line `$root-tokens`, not all 67 entries. Nested maps
  merge one level deep, so a changed sub-key carries its whole role — but only that role.
* **A field takes any CSS.** A literal (`1.25rem`), a token reference (`{radius.9}`), or a
  raw custom property (`var(--radius-9)`) all work; references keep the link, literals break
  it.

The page imports the same modules the CLI does, so the export is produced by the pipeline
`bstokens verify` checks — not by a second implementation that could drift.

## For Bootstrap maintainers

The consumer export is a `custom.scss` that layers over Bootstrap. Maintainers want the
opposite — Bootstrap's *own* files, changed, so the result is a normal pull request:

```bash
npx bstokens eject --theme theme.json --src ../bootstrap --in-place
npx bstokens eject --theme theme.json --src ../bootstrap --verify
```

It patches values in place rather than regenerating files, so four token edits give four
changed lines:

```diff
 // scss-docs-start spacer-variables-maps
-$spacer: 1rem !default;
+$spacer: 1.25rem !default;
 $spacers: () !default;
```

`!default` survives, `$spacer * .25` stays symbolic, `escape-svg(…)` and every comment and
`scss-docs` marker are untouched. `--verify` compiles the patched checkout and the same theme
applied the consumer way and asserts the CSS matches — the two routes get there by different
means, so agreeing is real evidence. See
[`docs/maintainer-export.md`](docs/maintainer-export.md).

## Commands

```bash
npx bstokens sync       # re-extract from a v6-dev checkout into tokens/
npx bstokens sync --check   # report upstream drift, exit 1 if any   (CI)
npx bstokens validate   # references, cycles, layer direction, DTCG shape
npx bstokens validate --strict   # also flag component→primitive shortcuts
npx bstokens build      # emit Sass, CSS and JSON into build/
npx bstokens verify     # compile upstream vs. our export, diff the CSS
npx bstokens vendor     # compile upstream Bootstrap for the chooser preview
npx bstokens eject      # write the tokens into v6-dev's own Sass sources (maintainers)
                        #   --theme <f> --src <path> [--in-place | --out <dir>] [--verify]
npm test                # unit tests
```

Point them at a checkout with `--src <path>`, `$BOOTSTRAP_SRC`, or `bootstrap-tokens.config.json`.

## Using the exported Sass

```scss
// custom.scss
@use "../node_modules/bootstrap/scss/bootstrap" with (
  $colors: (
    "blue": oklch(58% 0.22 255)
  ),
  $spacers: (
    4: 1.25rem
  ),
  $alert-tokens: (
    --alert-border-radius: 1rem
  )
);
```

Bootstrap's `defaults()` merges these on top of its own, key by key, so a partial map is
enough. One rule to know: token names that Bootstrap generates in a loop — `--spacer-4`,
`--radius-8`, `--font-size-lg`, `--primary-bg` — **cannot** be overridden through
`$root-tokens`; they are re-set after the merge. Change them through their owning map
(`$spacers`, `$radii`, `$font-sizes`, `$theme-colors`). The exporter already routes them
correctly; `tools/lib/sass-targets.mjs` is where that knowledge lives.

## Repository layout

```
docs/          architecture, layering, DTCG conventions, roadmap, generated inventory
tokens/        the token document — primitive/, semantic/, component/
tools/         extractor, resolver, validator, exporters, CLI
build/         generated output (committed, so it is browsable)
web/           the token chooser
```

Start with [`docs/PLAN.md`](docs/PLAN.md) for what is missing and what comes next,
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what is done, then
[`docs/bootstrap-v6-architecture.md`](docs/bootstrap-v6-architecture.md) for what upstream
actually does and [`docs/dtcg-conventions.md`](docs/dtcg-conventions.md) for the four places
we deviate from the DTCG spec and why.

## A note on the deviations

Bootstrap v6 is built on `color-mix()`, `light-dark()` and `calc()`. DTCG has no way to say
"this colour is 50% of that one mixed into the page background", and no concept of modes. So:

* a `$value` may embed `{token.path}` references inside a CSS expression;
* the dark half of a `light-dark()` pair lives in `$extensions["dev.bootstrap.tokens"].dark`,
  which means a consumer that ignores extensions still gets a complete, valid light theme;
* values that are neither — raw keywords, font stacks — are marked `css: true` and passed
  through untouched.

Every deviation is confined to the `dev.bootstrap.tokens` extension namespace. Nothing
invents a top-level key.

## Licence

MIT, matching Bootstrap.
