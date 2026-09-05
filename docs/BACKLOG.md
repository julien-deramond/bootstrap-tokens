# Backlog

Things noticed while working, that were not worth stopping for. Companion to
[`PLAN.md`](./PLAN.md), which holds the deliberate plan; this holds what fell out of doing it.

Each entry says what it is, why it matters, and what it would take. An entry with no
consequence stated is a note, not a task, and should be deleted rather than carried.

---

## U — Upstream (`twbs/bootstrap`)

### U1 · `scss/mixins/` variables are `!default` but unreachable

`$caret-width`, `$caret-spacing`, `$caret-vertical-align` (`scss/mixins/_caret.scss`) and
`$transition-base` (`scss/mixins/_transition.scss`) all carry `!default`, which advertises
them as configurable. But `scss/bootstrap.scss` forwards `config`, `colors`, `theme`, `root`
and the component directories — never `mixins`. So no consumer can reach them through the
documented entrypoint; `@use "bootstrap" with ($caret-width: …)` is an error.

**Why it matters.** Four configuration points that look public and are not. We had to add
them to `NOT_TOKENS` rather than model them, because modelling them would emit an export
that fails to compile.

**Fix:** either `@forward "mixins/caret"` and `@forward "mixins/transition"` from
`bootstrap.scss`, or drop the `!default` flags so they stop advertising configurability.
Worth raising as an upstream issue.

### U2 · Tokens that are CSS defaults, not design values

`--btn-white-space: nowrap` and `--btn-transition-property: "color, background-color,
border-color, box-shadow"` sit in `$button-tokens` alongside real design values. They are
property defaults, not decisions anyone themes. Same for `--alert-transition-property`.

**Why it matters.** They inflate the token count, they are untypeable in DTCG (part of the
25.7% with no `$type`), and a chooser has to render a control nobody wants.

**Fix:** upstream could move them into the rule body. Here, they are candidates for the
configuration surface in PLAN.md A2.

### U3 · `--spacer` does not follow `$spacer`

`$root-tokens` hardcodes `--spacer: 1rem` rather than `#{$spacer}`, so changing the base
spacer moves the whole scale but leaves `--spacer` behind. Documented in the token
document's `$description` for `spacing.root`; probably an upstream oversight.

### U4 · `--shadow-strength` is effectively unthemeable

`scss/_root.scss` declares it four times: on `:root`, in a `prefers-color-scheme: dark`
media query, on `[data-bs-theme="dark"]` and on `[data-bs-theme="light"]` — all after the
`:root` block.

The last one is the problem. A token override lands on `:root`, and `:root` loses to a rule
on the element that actually carries the attribute. So on any page with an explicit
`data-bs-theme` — which is most pages, and every preview this tool renders — overriding the
token does **nothing**. The dial appeared to work only because the value was never checked
at the selector the preview uses.

Modelled here as `pinnedModes`, so the runtime `theme.css` re-asserts the value at every
selector upstream pins, and the Sass export names what it cannot express. Neither is a fix:
upstream should either make the strength a `light-dark()`-friendly pair or stop re-declaring
it for the explicit-light case, where it is already the default.

---

### U5 · `defaults()` cannot merge a list override

`scss/_config.scss` converts its **defaults** argument from a list into a map, then merges:

```scss
@if meta.type-of($defaults) == "list" { … convert … }
$merged: map.merge($defaults, $overrides);
```

The override is never converted. So `$button-sizes`, documented as accepting "a simple list
of size names", cannot be overridden with a list — `@use … with ($button-sizes: ("sm", "lg"))`
reaches `map.merge(map, list)` and fails to compile.

**Workaround here:** emit the map form `defaults()` would have produced, `("sm": true)`.
Removing a size additionally needs an explicit `null`, since the merge is additive.

**Fix:** convert `$overrides` as well when it is a list. Two lines, and it would make the
documented usage work.

---

### U6 · `.navbar-dark` link colours are silently dropped

Four declarations in `scss/_navbar.scss` (lines 54–60) weight `color-mix()` with a bare
number instead of a percentage:

```scss
--navbar-color: color-mix(in oklch, var(--white) .55, transparent),
--navbar-hover-color: color-mix(in oklch, var(--white) .75, transparent),
--navbar-disabled-color: color-mix(in oklch, var(--white) .25, transparent),
--navbar-toggler-border-color: color-mix(in oklch, var(--white) .1, transparent),
```

CSS Color 5 requires `<percentage>` there. A bare number parses fine *as a custom property* —
any token sequence does — and fails at substitution time, so `color: var(--navbar-color)`
becomes invalid at computed-value time and the element **inherits** its colour instead.

Measured in Chrome 148: with `.55` the probe inherits its parent's `rgb(255, 0, 0)`; with
`55%` it computes `oklch(0.999994 0.0000497986 none / 0.55)`. No console warning either way.

These are the only four bare weights in the whole stylesheet — the other 28 `color-mix()`
calls all use percentages — so it reads as a typo rather than a choice.

**Fix:** `.55` → `55%`, `.75` → `75%`, `.25` → `25%`, `.1` → `10%`.

**Here:** the document keeps upstream's text, because fidelity is the point and `verify`
would fail otherwise. `bstokens validate` reports the four as *upstream findings* — the
document is valid, the value it mirrors is not. The rule lives in
[`tools/lib/css-lint.mjs`](../tools/lib/css-lint.mjs), which is where any further "faithful
but broken in a browser" check goes.

---

### U7 · Three tokens read custom properties that do not exist

`--btn-font-weight: var(--btn-input-font-weight)` in `scss/buttons/_button.scss`, and
`--nav-tabs-link-active-color` / `--nav-underline-link-active-color`, both
`var(--fg-color)`. None of those three properties is declared anywhere in the compiled
stylesheet — measured by compiling `bootstrap.scss` and diffing every `var()` reference
against every declaration.

This is not the same as Bootstrap's deliberate opt-in hooks. `var(--accordion-radius,
var(--radius-7))` is undeclared on purpose so a consumer can fill it in, and it carries a
fallback. These three have none, so the declaration is dropped: `.btn` inherits its font
weight rather than taking one, and an active tab inherits its colour rather than the
emphasised foreground.

`--btn-input-font-weight` stands out because every one of its siblings —
`--btn-input-gap`, `--btn-input-min-height`, `--btn-input-padding-x/y`,
`--btn-input-font-size`, `--btn-input-line-height`, `--btn-input-border-radius` — is
declared. `--fg-color` looks like `--fg-body` with a word missing; Bootstrap's foreground
tokens are `--fg-body`, `--fg-1` and `--fg-2`.

Eleven properties in total are referenced without a fallback and never declared. The other
eight are the "unset by default" pattern (`text-align: var(--body-text-align)`), where a
dropped declaration is the intended no-op.

**Fix:** declare `--btn-input-font-weight` alongside its siblings; point the two tab tokens
at a foreground token that exists.

**Here:** `bstokens validate` reports all three. The check needs to know what Bootstrap
declares, which only a compile can answer, so `sync` records the full list in
`tokens/meta.json` and `validate` reads it from there — that way the deliberate hooks are
never reported as bugs.

## P — This project

### P6 · The tool's own controls still borrow Bootstrap's shapes

Reduced, not eliminated. The hue grid is sixteen rounded colour chips and the contrast
readouts are small tinted labels — both of which have Bootstrap counterparts a few hundred
pixels away. They earn their shape (a colour picker has to show colour), but if the
"which of these is the interface?" confusion returns, this is where the remaining overlap is.
Denser, more instrument-like treatments are the next lever.

### ~~P1 · `sync --check` cannot tell a rename from a delete-plus-add~~ · done

`sync` now proposes rename candidates by matching on the custom property or the Sass map
slot, `tokens/migrations.json` records the decisions, and every path a theme takes into the
system resolves through them. An override with nowhere to go is reported rather than
dropped.

### ~~P2 · The chooser's `title` tooltips are not keyboard reachable~~ · done

The theme-health chip is now a disclosure, and each failing pair is a link that opens the
token that causes it. The remaining `title` attributes are all supplementary to visible
text, so they add rather than carry.

### ~~P3 · No test asserts the preview and the export agree~~ · done

`verify` now compiles a partial theme export and compares every previewed custom property
against the compiled value, selector by selector. It found the U4 pin on its first run.

### P4 · `build/` is committed and can go stale

CI catches it, but only on push. A pre-commit hook or a `--check` in `validate` would catch
it earlier.

### P5 · Components with no preview · mostly done

Worse than first logged: **40 of 62** components had no markup at all, not just the variant
maps. The sample now covers 49, and the panel warns for the rest — detected by asking the
preview whether it renders the component's selector, rather than from a list here that would
go stale the first time the sample changed.

Two of the "missing" turned out to be wrong metadata rather than missing markup:
`button-styled` was recorded as `.btn-primary, …` (a v5 habit; v6 uses `.btn-styled`) and
`radio` as `.form-radio-input` (it is `.radio`). Both are fixed.

The 13 that remain — `dialog`, `drawer`, `menu`, `popover`, `tooltip`, `carousel`,
`datepicker`, `calendar`, `chip-input`, `otp`, `strength`, `navbar-dark`, `drawer-backdrop` —
need JavaScript or an interaction to appear. Rendering them statically is possible but each
needs its own scaffolding; worth doing when C3 rebuilds the preview.
