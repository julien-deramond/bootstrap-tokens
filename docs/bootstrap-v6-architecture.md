# Bootstrap v6 token architecture (upstream knowledge base)

> Source of truth: [`twbs/bootstrap@v6-dev`](https://github.com/twbs/bootstrap/tree/v6-dev),
> version `6.0.0-alpha1`. Docs: <https://v6-dev--twbs-bootstrap.netlify.app/docs/6.0/customize/sass/>.
>
> This file records *what upstream does*, so the token definitions in `tokens/` can be
> checked against it. It is descriptive, not aspirational.

## TL;DR

Bootstrap v6 already ships a layered token system. It is expressed in Sass maps that are
emitted as CSS custom properties. Our job is **not** to invent a token model — it is to
lift the existing one into a portable, tool-readable DTCG document and be able to emit it
back as Sass.

```
┌ Sass compile time ─────────────────────┐   ┌ Browser runtime ────────────┐
│ $colors, $spacers, $radii, $font-sizes │   │ --blue-500, --spacer-4 …    │
│ $theme-colors, $theme-bgs/fgs/borders  │ → │ --primary-bg, --fg-body …   │
│ $root-tokens                           │   │ (on :root, :host)           │
│ $alert-tokens, $card-tokens, …         │   │ (on .alert, .card, …)       │
└────────────────────────────────────────┘   └─────────────────────────────┘
```

## The four upstream layers

Upstream's own wording (`site/src/content/docs/customize/sass.mdx`, "Token architecture"):

1. **Color scales** — `scss/_colors.scss`
2. **Theme colors** — `scss/_theme.scss`
3. **Global tokens** — `scss/_theme.scss` + `scss/_root.scss`
4. **Component tokens** — e.g. `scss/_alert.scss`

We collapse 2 and 3 into a single **semantic** layer, giving the raw / semantic / component
split this project targets. See [`docs/layers.md`](./layers.md).

## Layer 1 — colour scales (`scss/_colors.scss`)

16 base hues, authored in `oklch()`:

```scss
$blue:   oklch(60% 0.24 240) !default;
$indigo: oklch(56% 0.26 288) !default;
$violet: oklch(56% 0.24 300) !default;
$purple: oklch(56% 0.24 320) !default;
$pink:   oklch(60% 0.22 4)   !default;
$red:    oklch(60% 0.22 20)  !default;
$orange: oklch(70% 0.22 52)  !default;
$amber:  oklch(79% 0.2 78)   !default;
$yellow: oklch(88% 0.24 88)  !default;
$lime:   oklch(65% 0.24 135) !default;
$green:  oklch(64% 0.22 160) !default;
$teal:   oklch(68% 0.22 190) !default;
$cyan:   oklch(69% 0.22 220) !default;
$brown:  oklch(60% 0.12 54)  !default;
$gray:   oklch(60% 0.02 245) !default;
$pewter: oklch(65% 0.01 290) !default;
```

Plus `$white: #fff` and `$black: #000`.

Each hue is expanded into a **13-step scale** at *runtime*, not compile time — the steps are
`color-mix()` expressions baked into the custom property:

| stop | formula |
| --- | --- |
| `025` | `color-mix(in oklch, var(--white) 94%, <hue>)` |
| `050` | `color-mix(in oklch, var(--white) 90%, <hue>)` |
| `100` | `color-mix(in oklch, var(--white) 80%, <hue>)` |
| `200` | `color-mix(in oklch, var(--white) 60%, <hue>)` |
| `300` | `color-mix(in oklch, var(--white) 40%, <hue>)` |
| `400` | `color-mix(in oklch, var(--white) 20%, <hue>)` |
| `500` | `<hue>` (the base) |
| `600` | `color-mix(in oklch, var(--black) 16%, <hue>)` |
| `700` | `color-mix(in oklch, var(--black) 32%, <hue>)` |
| `800` | `color-mix(in oklch, var(--black) 48%, <hue>)` |
| `900` | `color-mix(in oklch, var(--black) 64%, <hue>)` |
| `950` | `color-mix(in oklch, var(--black) 70%, <hue>)` |
| `975` | `color-mix(in oklch, var(--black) 76%, <hue>)` |

Driven by `$color-tints` / `$color-shades` (stop → percentage), `$tint-color` (`var(--white)`),
`$shade-color` (`var(--black)`) and `$color-mix-space` (`oklch`). Result: `16 × 13 = 208`
`--<hue>-<stop>` custom properties on `:root, :host`.

**Consequence for us:** the scale is *derived*, so the token document stores the 16 base hues +
the tint/shade recipe, and the 208 steps are generated. Storing 208 hand-written hex values
would immediately drift from upstream and would throw away the `color-mix()` behaviour.

## Layer 2 — theme colours (`scss/_theme.scss`)

`$theme-colors` is a **map of maps**. Eight roles:
`primary`, `accent`, `success`, `danger`, `warning`, `info`, `inverse`, `secondary`.

Each role has nine sub-keys:

| sub-key | role |
| --- | --- |
| `base` | the solid brand colour |
| `fg` | text on a neutral background |
| `fg-emphasis` | higher-contrast text |
| `bg` | solid fill |
| `bg-subtle` | tinted fill |
| `bg-muted` | slightly stronger tinted fill |
| `border` | border on a neutral background |
| `focus-ring` | focus ring colour |
| `contrast` | text/icon colour placed *on* `bg` |

Values reference layer 1 through `var()` and are almost always wrapped in `light-dark()`:

```scss
"primary": (
  "base": var(--blue-500),
  "fg": light-dark(var(--blue-600), var(--blue-400)),
  …
)
```

`$theme-bgs`, `$theme-fgs`, `$theme-borders` provide the neutral surface ramps
(`--bg-body`, `--bg-1`…`--bg-4`, `--fg-body`, `--fg-1`…`--fg-4`, `--border-body`,
`--border-subtle`, `--border-muted`, `--border-emphasized`, …).

`$util-opacity` (10…100) drives opacity utilities.

Theme colours are also projected onto `.theme-*` helper classes (`generate-theme-classes()`),
which re-map each sub-key to a neutral `--theme-<sub-key>` custom property. Components then read
`var(--theme-bg-subtle, var(--bg-1))` so that `.alert.theme-danger` recolours without
per-variant CSS. This is the v6 replacement for v5's `.alert-danger` style modifier explosion.

## Layer 3 — global/root tokens (`scss/_root.scss`)

`$root-tokens` is a flat map of `--custom-property: value`. It is declared with the
`defaults()` pattern, then **extended by loops** that project the other maps into it:

| loop | produces |
| --- | --- |
| `$font-sizes` | `--font-size-*`, `--line-height-*` |
| `$font-weights` | `--font-weight-*` |
| `$theme-colors` | `--<role>-<sub-key>` |
| `$theme-bgs` | `--bg-*` |
| `$theme-fgs` | `--fg-*` |
| `$theme-borders` | `--border-*` |
| `$breakpoints` | `--breakpoint-*` |
| `$spacers` | `--spacer-*` |
| `$radii` | `--radius-*` (+ `--radius-pill: 50rem`) |
| `$shadows` | `--box-shadow`, `--box-shadow-*` |
| `$zindex-levels` | `--z-*` |

> **Important for the exporter.** Those loop-generated keys are `map.set` *after* the
> `defaults()` merge, so passing e.g. `--spacer-4` inside a `$root-tokens` override is silently
> discarded. Such values must be overridden through their **owning map** (`$spacers`) instead.
> Encoded in `tools/lib/sass-targets.mjs`.

Hand-written `$root-tokens` entries cover: body typography, headings, links, code/mono,
border width/style/colour, shadow colour + strength, overlay transition timing, `--spacer`,
focus ring, form control state colours, and the shared `--btn-input-*` control metrics
(default + `xs`/`sm`/`lg`).

`:root, :host` also sets `color-scheme: light dark` and `scrollbar-gutter: stable`.
`--shadow-strength` is bumped to `2.4` in dark mode (a plain number cannot use `light-dark()`).

## Layer 4 — component tokens

Every component partial declares `$<name>-tokens` and emits it onto its own class:

```scss
$alert-tokens: () !default;
$alert-tokens: defaults(( --alert-gap: var(--spacer-3), … ), $alert-tokens);

@layer components {
  .alert {
    @include tokens($alert-tokens);
    padding: var(--alert-padding-y) var(--alert-padding-x);
    …
  }
}
```

There are ~60 such maps (see `docs/token-inventory.md`, generated). A handful are *variant*
maps rather than component maps — `$navbar-dark-tokens`, `$nav-tabs-tokens`, `$nav-pills-tokens`,
`$nav-underline-tokens`, `$button-link-tokens`, `$button-styled-tokens`, `$drawer-backdrop-tokens`,
`$spinner-grow-tokens` — emitted on a modifier class instead of the base class.

## The `defaults()` contract

```scss
@function defaults($defaults, $overrides) { … }
```

* `$overrides` wins, key by key (one level deep — nested maps are **replaced**, not merged).
* A key whose value is `null` is **removed** from the merged map.
* If `$defaults` is a list, it is first converted to a `(key: true)` map — used by size maps
  such as `$button-sizes: ("xs", "sm", "lg")`.

This is what makes partial overrides work and is the contract our Sass export targets:

```scss
@use "bootstrap/scss/bootstrap" with (
  $colors:       ( "blue": oklch(58% 0.2 250) ),
  $spacers:      ( 4: 1.25rem ),
  $theme-colors: ( "brand": ( "base": var(--indigo-500), … ) ),
  $alert-tokens: ( --alert-border-radius: 1rem )
);
```

## CSS features upstream relies on

These have no DTCG equivalent and shape our extension design (`docs/dtcg-conventions.md`):

| feature | used for |
| --- | --- |
| `oklch()` | all base hues |
| `color-mix()` | colour scale steps, focus rings, translucent borders, opacity utilities |
| `light-dark()` | every light/dark pair — v6 has **no** separate dark-mode stylesheet |
| `var()` with fallback | `var(--theme-bg-subtle, var(--bg-1))` theming hooks |
| `calc()` | derived radii, line heights, shadow alphas |
| `clamp()` | fluid font sizes (`lg` and up) |
| `oklch(from … l c h / …)` | relative colour syntax in shadows |
| `@layer` | `colors, config, root, reboot, layout, content, forms, components, custom, helpers, utilities` |

## Things that deliberately stay out of the token document

* Mixins, functions, and the `@layer` order — behaviour, not tokens.
* `$enable-*` feature flags — build options, not design decisions. Mirrored as `options` in
  the chooser's export, but not modelled as DTCG tokens.
* `$utilities` — the utility API definition is a code structure.
* `$escaped-characters`, `$grid-columns`, `$grid-row-columns` — structural constants
  (`$grid-columns` is exposed as a chooser option because people do change it).
