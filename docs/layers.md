# Token layers

Three layers, one direction of reference. A token may only reference the layer below it or
its own layer. Never upward.

```
component   .alert  --alert-bg, --alert-padding-x            tokens/component/*.json
    ↓ references
semantic    :root   --primary-bg, --bg-body, --link-color    tokens/semantic/*.json
    ↓ references
primitive   :root   --blue-500, --spacer-4, --radius-8       tokens/primitive/*.json
```

The rule is enforced by `node tools/cli.mjs validate` (`tools/lib/validate.mjs`).

## 1. Primitive (raw)

**Question it answers:** *what values exist in this system?*

Context-free. No opinion about usage. Named after what they are, never after what they are for.
`blue.500`, not `brand`. `spacing.4`, not `card-padding`.

| file | contents | upstream owner |
| --- | --- | --- |
| `primitive/color.json` | 16 base hues in `oklch()`, `white`, `black`, the tint/shade recipe | `$colors`, `$color-tints`, `$color-shades` |
| `primitive/dimension.json` | spacing scale, negative spacers, sizes, radii, border widths | `$spacers`, `$negative-spacers`, `$sizes`, `$radii`, `$border-widths` |
| `primitive/typography.json` | font stacks, font sizes + line heights, font weights | `$font-sizes`, `$font-weights`, `--body-font-family`, `--font-mono` |
| `primitive/layout.json` | breakpoints, container max-widths, grid gutters, aspect ratios, position values | `$breakpoints`, `$container-max-widths`, `$grid-gutter-*`, `$aspect-ratios`, `$position-values` |
| `primitive/z-index.json` | the z-index ladder | `$zindex-levels` |
| `primitive/opacity.json` | utility opacity steps | `$util-opacity` |
| `primitive/motion.json` | durations and easing curves | assorted `--*-transition-*` |

The 208 colour steps (`blue.500`, `gray.975`, …) are **generated** from the 16 hues and the
tint/shade recipe rather than stored. They are addressable as aliases
(`{color.blue.500}`) and appear in the resolved output — they simply are not hand-written.
See `tools/lib/color-scale.mjs`.

## 2. Semantic

**Question it answers:** *what does this value mean?*

Names describe intent and survive a re-skin. Every value is an alias or an expression over
primitives — a semantic token must never contain a literal colour or a magic number.

| file | contents | upstream owner |
| --- | --- | --- |
| `semantic/theme-color.json` | the 8 roles × 9 sub-keys | `$theme-colors` |
| `semantic/surface.json` | `bg.*`, `fg.*`, `border.*` neutral ramps | `$theme-bgs`, `$theme-fgs`, `$theme-borders` |
| `semantic/typography.json` | body/heading/code/link type tokens | `$root-tokens` |
| `semantic/border.json` | default border width/style/colour, translucent border | `$root-tokens` |
| `semantic/elevation.json` | shadow scale, shadow colour and strength | `$shadows`, `$root-tokens` |
| `semantic/focus.json` | focus ring width/offset/colour | `$root-tokens` |
| `semantic/control.json` | the shared `--btn-input-*` metrics and `--control-*` states | `$root-tokens` |
| `semantic/motion.json` | overlay easing, control transition | `$root-tokens` |

## 3. Component

**Question it answers:** *what does this part use?*

One file per upstream token map. Values alias semantic tokens; reaching past semantic into a
primitive is allowed but flagged by `validate --strict` because it usually means a semantic
token is missing.

`tokens/component/<name>.json` ↔ `$<name>-tokens`. Variant maps live in the file of the
component they belong to, under a `$extensions` marker naming their selector — e.g.
`nav-tabs` sits inside `component/nav.json`.

## Naming

* Path segments are lowercase kebab-case: `theme-color.primary.bg-subtle`.
* Numeric scales keep upstream's keys verbatim, including the zero-padded colour stops
  (`025`, `050`) — the exporter has to reproduce `--gray-025`, so the token path is `gray.025`.
* The component layer keeps upstream's custom-property names exactly. `--alert-padding-x`
  becomes `alert.padding-x`, and the exporter reverses that mechanically. Renaming would break
  the "drop into v6-dev" goal for no gain.
