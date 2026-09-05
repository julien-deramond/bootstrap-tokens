# Plan: getting this right

> Written 2026-09-05 against Bootstrap `6.0.0-alpha1` and commit `d73f782`.
> Companion to [`ROADMAP.md`](./ROADMAP.md), which records what is done. This records what
> is wrong, what is missing, and the order to fix it in.

## What "right" means here

Not "feature complete" — three testable properties. Everything below serves one of them.

| | Property | How we know |
| --- | --- | --- |
| **1** | The token document is a **complete and faithful** description of Bootstrap v6 | `sync --check` finds no drift *and* no unmodelled surface; `verify` is byte-identical |
| **2** | Export is **lossless in both directions** | `verify` and `eject --verify` pass; a theme survives export → import → export unchanged |
| **3** | The chooser makes the **right thing easy** and the wrong thing visible | A first-time user reaches a coherent, accessible theme without reading docs |

Property 1 is currently **false** — measurably. That is why Track A comes first.

---

## Track A — The token document

### A1. Coverage cannot silently drop things · **do first**

`tools/lib/sass-targets.mjs` lists the maps we model. The extractor warns when a listed map
is *missing* from the checkout, but never when the checkout has a map we do not list. So a
gap is invisible by construction.

It already bit us: upstream declares **64** `$*-tokens` maps and we model **62**.
`$fade-tokens` and `$collapse-tokens` (`scss/_transitions.scss`) have never been in the
document, and no test, no warning and no CI run noticed.

1. Add a **discovery check** to `sync`: scan every `.scss` file for `$*-tokens` declarations
   and for `!default` scalars, and fail on anything not in `sass-targets.mjs` or an explicit
   `IGNORED` list with a stated reason. Turn the existing warnings into errors under
   `--check`.
2. Add the two missing maps.
3. Work through the other uncovered surfaces, deciding for each whether it is a *token* or
   *configuration* (see A2):

   | Surface | Where | Verdict |
   | --- | --- | --- |
   | `$validation-states` | `forms/_validation.scss` | configuration |
   | `$button-variants`, `$badge-variants`, `$btn-variant-selectors` | buttons, badge | configuration |
   | `$button-sizes`, `$avatar-sizes`, `$dialog-sizes`, `$form-control-sizes`, `$input-group-sizes`, `$otp-sizes`, `$pagination-sizes` | assorted | configuration |
   | `$enable-*` (12 flags) | `_config.scss` | configuration |
   | `$shadow-opacities`, `$strength-levels` | utilities, strength | tokens |
   | `$caret-width`, `$caret-spacing`, `$caret-vertical-align` | `_config.scss` | tokens |
   | `$navbar-breakpoints`, `$gutters`, `$transition-base` | assorted | tokens |
   | `$color-contrast-dark/light`, `$min-contrast-ratio`, `$color-mode-type` | `_config.scss` | configuration |
   | `$utilities` | `_utilities.scss` | out of scope, stated explicitly |

**Why first:** every other correctness claim in this repository is conditional on coverage
being complete. Right now that condition is unverified.

### A2. Separate *tokens* from *configuration*

`$enable-rounded: false` is a one-line change with enormous visual impact, and
`$button-sizes: ("xs", "sm", "lg")` decides which classes exist. Neither is a design value,
so neither belongs in a DTCG document — but both belong in an exported theme.

Introduce a sibling surface, `config/`, with its own schema, its own section in the chooser
and its own emission into `@use … with ()`. Keeping it *out* of `tokens/` is what stops the
DTCG document turning into a Sass config dump.

### A3. Every token carries a resolvable `$type`

**308 of 1197 tokens (25.7%) have no `$type`**, which is invalid DTCG — the type must
resolve, from the token or an ancestor group.

Three groups, three different answers:

* **Typeable, just not typed yet** — extend `hints.mjs` and set them.
* **CSS keywords** (`inherit`, `nowrap`, `transparent`) — these need a stated convention.
  Propose a group-level `$type` plus `$extensions…cssKeyword: true`, and record the decision
  in `dtcg-conventions.md` rather than leaving it implicit.
* **Not actually design tokens** — `--btn-white-space: nowrap` and
  `--btn-transition-property: "color, background-color…"` are CSS property defaults that
  leaked into a token map. Flag them upstream; model them as configuration here.

Then **validate against the published DTCG JSON Schema in CI**, so "we follow DTCG" stops
being a claim and becomes a test.

### A4. Descriptions — the document has to be readable

**4 tokens out of 1197 have a `$description` (0.3%).** A token document nobody can read is a
config file with extra syntax. This is the largest single gap in the document's usefulness
and it is pure authoring work, not engineering.

1. Generate a first pass from upstream's own comments and each component's selector.
2. Hand-write the **semantic layer** (168 tokens) — that is where meaning lives, and where
   the difference between `fg-emphasis` and `fg` has to be explained or the layer is useless.
3. Add `$description` coverage to `validate`, failing under `--strict` below a threshold.

### A5. Generalise modes

`dark` is a bespoke extension holding one alternate value. Generalise to
`$extensions…modes: { dark: …, "high-contrast": … }`. Bootstrap will want `prefers-contrast`
and `forced-colors` eventually, and retrofitting a second one-off extension will be worse
than doing this once.

### A6. Composite types

**Zero tokens use DTCG's composite types** (`shadow`, `typography`, `border`, `transition`) —
everything is a string. That is why a design tool receiving this document gets an opaque
blob where a shadow should be.

Model `$shadows` as `$type: shadow` with structured layers, and `type.body.*` as
`$type: typography`, wherever the value permits. Bootstrap's shadows use
`oklch(from … l c h / calc(…))`, which has no structural form — those stay strings, marked
`css`, and `dtcg-conventions.md` states which and why.

### A7. Survive upstream renames

Upstream is alpha; names *will* move. `sync --check` reports drift but cannot tell a rename
from a delete-plus-add, so a `theme.json` saved today silently loses values tomorrow.

Add a migration map (`old.path → new.path`, versioned) and DTCG `$deprecated` support, and
apply migrations on import.

---

## Track B — Export

### B1. Verify the path people actually use

`verify` compiles a **full** `@use … with ()` config. Since exports switched to carrying only
changed keys, the default path is covered by unit tests but never by an end-to-end compile.
That is a gap introduced by an improvement.

Extend `verify` to compile a **partial** export and assert it produces the CSS the chooser
previewed. Same for `eject` on a theme that adds a key rather than changing one.

### B2. Say when a change cannot be expressed

`--shadow-strength` in dark mode is pinned by a media query no token map can reach. The
chooser knows this (`fixedDark`); the export silently drops it.

Every export should carry an explicit note for any override it cannot express, rather than
producing a file that quietly does less than the preview showed.

### B3. Expose the configuration surface

Once A2 exists: `$enable-*`, the size maps and `$validation-states` become editable in the
chooser and emitted in the export. `$enable-rounded: false` alone is a whole visual identity.

### B4. More consumer shapes

Today there is exactly one: `@use … with ()`. Add, in this order:

1. **npm package** — `exports` map over `tokens/`, `build/scss/`, `build/json/`. Without this
   nobody can consume any of it without cloning.
2. **Typed JS/TS** — `tokens.ts` for people theming React or JS-in-CSS.
3. **Style Dictionary config** — plugs into pipelines that already exist.
4. **Figma / Tokens Studio JSON** — closes the designer loop.

Each needs a fixture test asserting the third-party tool actually consumes it.

### B5. Import an existing `custom.scss`

Parse a consumer's existing overrides and pre-fill the chooser. We already have the Sass
parser and the locator; this is mostly mapping declarations back to token paths. It is what
turns the tool from "start a theme" into "continue mine".

---

## Track C — The chooser

### C1. Create tokens, not just edit them · **highest value in this track**

The override model replaces values on existing tokens. It cannot add one. So a custom brand
colour has to overwrite `color.blue.base` — the UI admits this in a note, which is honest but
is not the right answer.

Support creation, and three things become possible at once: **add a hue** (`color.brand.*`,
scale generated, `--brand-500` emitted), **add a theme colour role**, **add a component
token**. `expandColorScales` and `eject`'s insertion path already handle new keys; the work is
in the override model and the UI.

### C2. Themes as objects

One implicit theme in `localStorage` today. Needed: name it, keep several, duplicate,
compare two side by side, share by URL (compressed state in the fragment). "Show me A next to
B" is the core design-tool affordance we do not have.

### C3. A preview that proves the theme works

The sample is a component gallery. It cannot answer "does my theme survive a real page?"

* **Every state, systematically** — hover, focus, active, disabled, loading, error, empty.
  Today they appear only incidentally, and shadows had *no* home at all until the redesign.
* **Real layouts** — a dashboard, a form page, a marketing page.
* **Your own markup**, pasted in.
* **Component isolation** — selecting a component in All tokens previews just that component.

### C4. Accessibility as an output, not a warning

* **APCA alongside WCAG 2.** WCAG 2's ratio is known to misjudge exactly our case — light
  text on saturated fills. APCA is what WCAG 3 is built on and would give better advice.
* **A repair action.** "Fails AA" should offer "use `green-700` → 4.8:1" as one click.
* **Colour-vision simulation** over the preview.
* **An exportable report** to attach to a pull request.

### C5. Show what changed

A readable diff — which tokens, which values, before and after — and a visual before/after
against stock Bootstrap. Right now the only answer to "what have I done?" is the export tab.

### C6. First run and delight

First-run guidance; "surprise me" generating a coherent accessible palette; keyboard
shortcuts beyond undo.

---

## Sequencing

| Order | Work | Why here |
| --- | --- | --- |
| 1 | **A1** coverage guard + the two missing maps | Everything else's correctness depends on it |
| 2 | **B1** verify the partial-export path | Closes a gap we introduced; cheap |
| 3 | **A4** descriptions | Largest usability gap; unblocks adoption; parallelisable |
| 4 | **C1** create tokens | Unblocks the most-wanted chooser features |
| 5 | **A2 + B3** configuration surface | High visual impact per unit of work |
| 6 | **A3** types + schema validation in CI | Makes the DTCG claim testable |
| 7 | **C2, C3** themes and preview | The chooser becomes a design tool |
| 8 | **A6, A5, B4** composites, modes, more targets | Interop, once the foundation is right |
| 9 | **C4, C5, B5, A7** a11y output, diff, import, migrations | Depth |

## Tensions worth stating

**Portability pulls against fidelity.** Composite types and pure aliases would travel better,
but cannot express `light-dark()` or `oklch(from …)`. Every step toward portability risks
the round-trip. `verify` is the referee: no change lands that breaks byte-identity.

**More coverage means more drift.** Each upstream variable modelled is another thing to track
against a moving alpha. A1's guard is what makes that affordable rather than a liability.

**"Perfect" is the wrong target.** The three properties at the top are the target. Perfection
claims are how projects stop being honest about their gaps — this document exists because
measuring found two missing maps and 1193 missing descriptions in a repository whose README
says the token document is faithful.
