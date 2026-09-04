# DTCG conventions and deviations

Target: the [Design Tokens Community Group format](https://tr.designtokens.org/format/),
2025 editor's draft. We follow it wherever it can carry Bootstrap v6's meaning, and use
`$extensions` — never invented top-level keys — where it cannot.

Namespace for all extensions: **`dev.bootstrap.tokens`**.

## What we use straight from the spec

| spec feature | usage |
| --- | --- |
| `$value`, `$type`, `$description` | as specified |
| `$extensions` | reverse-DNS namespaced, see below |
| Group-level `$type` | set once per group, inherited by children |
| Alias syntax `{group.token}` | primary way to reference another token |
| `$type: color` | with `colorSpace` object form where the value is a plain colour |
| `$type: dimension` | `{ "value": 1, "unit": "rem" }` |
| `$type: fontWeight`, `fontFamily`, `duration`, `cubicBezier`, `number`, `shadow`, `strokeStyle` | as specified |

## Deviation 1 — aliases inside CSS expressions

**Problem.** DTCG aliases are all-or-nothing: `$value` is *either* `"{a.b}"` *or* a literal.
Bootstrap v6 is built on `color-mix()`, `light-dark()` and `calc()`, so most of its values are
expressions *over* other tokens.

**Rule.** A string `$value` may embed `{...}` references anywhere:

```jsonc
{
  "$type": "color",
  "$value": "color-mix(in oklch, {color.blue.500} 50%, {surface.bg.body})"
}
```

* A value that is *exactly* `"{a.b}"` is a plain DTCG alias and behaves per spec.
* A value containing `{a.b}` among other characters is a **Bootstrap expression**. It is
  marked with `$extensions["dev.bootstrap.tokens"].expression: true` so that a strict DTCG
  consumer can detect and skip it rather than mis-parse it.
* Resolution substitutes each reference with the target's *CSS custom property reference*
  (`var(--blue-500)`), not its computed value — this is what preserves runtime theming.

**Why not model `color-mix` structurally?** A `{ "fn": "color-mix", "stops": [...] }` object
would only cover the cases we thought of. `oklch(from var(--sc) l c h / calc(…))` in the
shadow scale is not expressible that way. Strings with typed references are honest about
the fact that the underlying platform is CSS.

## Deviation 2 — light/dark pairs

**Problem.** `light-dark(a, b)` is a single value with two resolutions. DTCG has no modes.

**Rule.** The light value goes in `$value`. The dark value goes in the extension:

```jsonc
{
  "$type": "color",
  "$value": "{color.blue.600}",
  "$extensions": {
    "dev.bootstrap.tokens": { "dark": "{color.blue.400}" }
  }
}
```

The exporter emits `light-dark(var(--blue-600), var(--blue-400))`. A consumer that ignores
`$extensions` gets a valid, complete **light theme** — which is the correct degradation.

`$value` alone (no `dark`) means the token is mode-independent.

## Deviation 3 — the `css` escape hatch

A few upstream values are neither aliases nor expressions over tokens: raw keywords
(`inherit`, `transparent`, `auto`), font stacks that must survive verbatim, and the
relative-colour shadow strings. These carry `$value` as a literal string plus:

```jsonc
"$extensions": { "dev.bootstrap.tokens": { "css": true } }
```

The exporter passes them through untouched. `validate` skips reference checking on them.

## The full extension schema

```jsonc
"$extensions": {
  "dev.bootstrap.tokens": {
    // --- emission ---
    "cssVar":     "--alert-padding-x",  // custom property name; derived from the path if absent
    "sassMap":    "$alert-tokens",      // which upstream Sass map owns this token
    "sassVar":    "$blue",              // upstream Sass variable, for primitives that have one
    "selector":   ".navbar[data-bs-theme=dark]", // where a variant map is emitted
    "private":    true,                 // participates in resolution, emits no custom property

    // --- semantics ---
    "dark":       "{color.blue.400}",   // Deviation 2
    "expression": true,                 // Deviation 1
    "css":        true,                 // Deviation 3
    "generated":  "color-scale",        // token family produced by a generator
    "deprecated": "Use {x.y} instead.",

    // --- authoring tool ---
    "control": {                        // how the web chooser edits this token
      "kind": "color" | "dimension" | "select" | "number" | "text",
      "min": 0, "max": 4, "step": 0.125,
      "options": ["solid", "dashed"],
      "group": "Colors",                // section in the chooser UI
      "order": 10
    }
  }
}
```

Nothing outside `dev.bootstrap.tokens` is written, and every key above is optional.

## File layout

Tokens are split across files for reviewability. Files are merged into one tree before
resolution, so a reference never mentions a filename:

| file | root group |
| --- | --- |
| `tokens/primitive/color.json` | `color` |
| `tokens/primitive/dimension.json` | `spacing`, `size`, `radius`, `border-width` |
| `tokens/primitive/typography.json` | `font` |
| `tokens/primitive/layout.json` | `breakpoint`, `container`, `grid`, `aspect-ratio`, `position` |
| `tokens/primitive/z-index.json` | `z-index` |
| `tokens/primitive/opacity.json` | `opacity` |
| `tokens/primitive/motion.json` | `duration`, `easing` |
| `tokens/semantic/theme-color.json` | `theme-color` |
| `tokens/semantic/surface.json` | `surface` |
| `tokens/semantic/*.json` | `type`, `border`, `elevation`, `focus`, `control`, `motion` |
| `tokens/component/<name>.json` | `<name>` |

A collision between two files on the same path is a build error.

## Round-trip guarantee

The point of all this is testable in one sentence:

> Compiling upstream `bootstrap.scss` and compiling it again with every token map replaced by
> our exported values must produce byte-identical CSS.

`node tools/cli.mjs verify` runs exactly that. If it fails, the token document is wrong —
not the test.
