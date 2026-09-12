# What comes out, and who it is for

> Companion to [`maintainer-export.md`](./maintainer-export.md), which covers writing tokens
> back into Bootstrap's own Sass sources. This covers exports *out*, for people consuming
> the tokens.

`bstokens build` writes five shapes. They are not the same data renamed five times — each
one answers a different question, and collapsing them would make most of them worse.

| Shape | Question it answers | References | Values |
| --- | --- | --- | --- |
| `build/scss/` | "How do I compile Bootstrap with my values?" | Sass variables | authored |
| `build/css/tokens.css` | "What custom properties exist?" | `var()` | CSS, runtime |
| `build/json/` | "How do I read the document programmatically?" | both forms | CSS, runtime |
| `build/ts/` | "How do I theme React or CSS-in-JS?" | `var()` + typed paths | CSS, plus literals |
| `build/style-dictionary/` | "How do I plug this into a pipeline I already have?" | DTCG `{aliases}` | CSS |
| `build/figma/` | "What does this actually look like?" | none | flat sRGB |

## `build/scss/` — compiling Bootstrap with your values

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
enough. `build/scss/_tokens.scss` is every map with `!default` flags intact — a drop-in
starting point — and `build/scss/bootstrap-custom.scss` is a ready-to-compile configuration
of exactly the values that differ from upstream.

One rule to know: token names that Bootstrap generates in a loop — `--spacer-4`, `--radius-8`,
`--font-size-lg`, `--primary-bg` — **cannot** be overridden through `$root-tokens`; they are
re-set after the merge. Change them through their owning map (`$spacers`, `$radii`,
`$font-sizes`, `$theme-colors`). The exporter already routes them correctly;
[`tools/lib/sass-targets.mjs`](../tools/lib/sass-targets.mjs) is where that knowledge lives.

### One `@use`, not a list of partials

Upstream's own Vite example writes the *split* form: `@use "bootstrap/scss/config" with (…)`,
then `functions`, then `theme`, then a hand-picked list of component partials with the unused
ones commented out. This exporter writes the single form —
`@use "bootstrap/scss/bootstrap" with (…)` — everywhere: the `custom.scss` tab, the
`bstokens init` scaffold, and the project Open in StackBlitz sends. That is a decision, not an
oversight, so it is written down here.

Both compile, and to the same thing: `bstokens verify` proves our configuration reproduces
upstream's own entrypoint byte for byte. The split form's advantage is size — you ship only the
components you use. Its cost is that the file becomes a manifest you have to maintain, with
ordering rules in it (`drawer` requires `transitions`, `navbar` requires `nav`), and getting it
wrong fails at build time in a way that reads like a Bootstrap bug.

The single form is the honest default here because of what this tool produces: a *theme*, whose
values reach across the whole system. Someone who has changed `$radius` and `$theme-colors` has
changed every component, and handing them a file that silently omits half of those components
would make the export narrower than the preview they approved. A theme that compiles everything
and a preview that shows everything are the same claim.

Emitting the split form — with the components a theme does not touch commented out — is a
reasonable later feature. It is a different one: it needs to know which components a theme
actually reaches, and it has to get the ordering right on its own.

## The dividing line: runtime or resolved

Bootstrap v6 computes its palette in the browser. `color.blue.100` is not a hex value, it is
`color-mix(in oklch, var(--white) 80%, var(--blue-500))`, evaluated on every paint. That is
what makes a theme a runtime object rather than a build artifact: change `--blue-500` and
thirteen steps follow, in the page, with no rebuild.

Every export either **preserves** that or **resolves** it, and which one is right depends
entirely on where the tokens are going.

Preserve it when the consumer is CSS. `tokens.css`, the Sass export, the `value` field in
the TypeScript export and everything Style Dictionary emits all keep `var()` and
`color-mix()` intact, so overriding one token still moves everything downstream of it.

Resolve it when the consumer has no cascade. Figma has no `var()`. A chart library wants
`#00a2ee`. An email client understands neither. For those, `flattenValues` computes what a
browser would have computed — described below.

## Flattening, and how far to trust it

[`tools/lib/flatten.mjs`](../tools/lib/flatten.mjs) inlines every `var()`, picks a side of
every `light-dark()`, and evaluates every `color-mix()` in the same colour space the browser
uses. Colours come out as `#rrggbb` or `#rrggbbaa`; everything else keeps its CSS text,
because `1.25rem` means the same thing everywhere.

This is the one part of the pipeline that reimplements a browser, so it is checked against
one. `bstokens probe` writes a self-contained page that declares every custom property, reads
back `getComputedStyle`, and compares. Against Chrome 148 it reports **1084 of 1092 values
matching exactly**. The remaining eight are `.navbar-nav` tokens that read custom properties
`.navbar` supplies, which an isolated element cannot provide — not disagreements.
[`tools/test/fixtures/chrome-colors.json`](../tools/test/fixtures/chrome-colors.json) records
the browser's answers so CI holds the line without one.

Two things the maths had to get right, both found by measuring rather than reasoning:

* **Mix in OKLCH, gamut-map once.** Bootstrap's base hues sit outside sRGB deliberately.
  Parsing them into sRGB before mixing throws away the chroma the mix was meant to keep —
  worth 82 levels on a channel for `blue.400`, a visibly different blue.
* **A missing interpolation method means `oklab`, not `oklch`.** It is optional in CSS
  Color 5 and Bootstrap's `$gradient` relies on that. Rectangular and polar interpolation
  are genuinely different; assuming the wrong one is invisible until a gradient looks muddy.

### What flattening cannot do, and says so

* **39 custom properties are declared by more than one component.** `--nav-link-color` comes
  from `.nav` or from `.navbar-nav` depending on where the element sits, and in CSS the
  nearest ancestor wins. A flat file has no ancestors, so those tokens carry a `contextual`
  marker naming the property, and the value is the default one.
* **Some values have no static answer at all.** `inherit`, `currentcolor`, an embedded
  `url()`, or a reference to a property nothing declares. Those are left out of the palette
  and listed in `build/figma/not-exported.json` with a reason each. A palette that quietly
  invented eight swatches is worse than one that says what it does not know.

## `build/ts/` — TypeScript and JavaScript

A runtime module and its declarations, rather than a `.ts` source: the pair works from plain
JavaScript, from TypeScript and from a bundler with no build step, which is what published
packages ship.

```ts
import { ref, literal, tokens } from 'bootstrap-tokens/ts'

<button style={{ background: ref('theme-color.primary.bg') }} />   // var(--primary-bg)
chart.setSeriesColor(literal('color.blue.500'))                    // '#0089c9'
tokens['bg.body'].dark                                             // '#080a0c'
```

`TokenPath` is a union of all 1206 paths, so a typo is a compile error rather than a `var()`
that silently does nothing. `ref()` throws on an unknown path for the same reason, in the
JavaScript case where there is no compiler to catch it.

Prefer `ref()` over `literal()` unless you genuinely cannot use the cascade — `literal()`
freezes a value that Bootstrap intended to stay live.

## `build/style-dictionary/`

DTCG with `{aliases}` intact, because a pipeline that can see `theme.primary` pointing at
`color.blue.500` can re-skin, and one handed 1206 literals can only re-print.

```bash
npx style-dictionary build --config config.json        # :root
npx style-dictionary build --config config.dark.mjs    # [data-bs-theme=dark]
```

Two configs, not two platforms: a Style Dictionary config has one source set. The dark one
uses `include` so its tokens can still reference the light ones, plus an `isSource` filter so
only the values that actually change reach the file — otherwise `[data-bs-theme=dark]`
becomes a second copy of the whole document and wins every cascade it should not. That filter
is a function, which is why one config is JSON and the other is JavaScript.

Both use `transforms: ['name/kebab']` rather than `transformGroup: 'css'`. The values are
already valid CSS, and Style Dictionary's colour transforms do not understand `color-mix()`,
`light-dark()` or `oklch()`: left on, `rgb(0 0 0 / 50%)` comes back as `#000000` with the
alpha silently gone.

Arithmetic is the one thing resolved on the way out. `{spacing.base} * .25` is Sass, not
something a downstream tool can evaluate, so those tokens ship as the literal they compute
to. Losing the link is the lesser harm.

## `build/figma/` — Tokens Studio

Two sets, `light` and `dark`, plus the `$themes` and `$metadata` blocks Tokens Studio expects.
Everything flat, everything hex.

DTCG types are mapped to Tokens Studio's own vocabulary, because that is what decides which
Figma property a token can be bound to — a dimension that should be a `borderRadius` is not
useful filed under `sizing`.

Anything Figma cannot hold is in `not-exported.json` beside it, with the reason.

## `bstokens report` — the contrast audit

Not a token export, but the other thing a consumer needs before trusting a theme: evidence
that it is readable.

```bash
npx bstokens report --theme theme.json --out contrast.md
npx bstokens report --theme theme.json --fail-on introduced   # a CI gate
```

Every pair a reader actually has to see — text on a role's fill, a role's text on the page —
in both colour schemes, measured by WCAG 2 and by APCA. Both, because they disagree: `fg.4`
on a dark page clears WCAG's 3:1 large-text bar and scores Lc -22 under APCA, which is nearly
invisible. WCAG 2 is the rule conformance is measured against; APCA is the model WCAG 3 is
built on and judges light-on-saturated text, the case WCAG 2 handles worst.

The distinction that makes it usable is **inherited versus introduced**, decided by comparing
the colours rather than the verdicts. Bootstrap's own defaults fail eleven of these pairs;
reporting those as the theme's problem is how a report loses its reader. `--fail-on
introduced` therefore gates on what the theme changed, and `--fail-on regression` on pairs
that were fine before and are not now — the case where a token you did not touch was dragged
down by one you did.

The report has a second half that contrast cannot give you. Luminance barely moves under
colour blindness, so it lists the semantic roles that stop being distinguishable under
simulated protanopia, deuteranopia, tritanopia and achromatopsia — and separates *status*
roles, which carry meaning by colour, from branding, which does not. `--fail-on vision` gates
on the former. The simulation matrices are applied in linear light, matching both the
Viénot derivation and what the preview's SVG filter draws (verified against Chrome, 28 of 28
exact).

The chooser's *contrast report* tab produces the identical document in the browser, from the
same library.

## Checking the exports

`node --test tools/test/consumers.test.mjs` runs the actual tools: `tsc` over a consumer file
and over one with a deliberate typo, and Style Dictionary over both configs as emitted.
Asserting the shape of our own output would only prove we emitted what we meant to; the
question a consumer has is whether their tool accepts it.
