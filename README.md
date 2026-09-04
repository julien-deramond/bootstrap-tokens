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

## Commands

```bash
npx bstokens sync       # re-extract from a v6-dev checkout into tokens/
npx bstokens sync --check   # report upstream drift, exit 1 if any   (CI)
npx bstokens validate   # references, cycles, layer direction, DTCG shape
npx bstokens validate --strict   # also flag component→primitive shortcuts
npx bstokens build      # emit Sass, CSS and JSON into build/
npx bstokens verify     # compile upstream vs. our export, diff the CSS
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

Start with [`docs/ROADMAP.md`](docs/ROADMAP.md), then
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
