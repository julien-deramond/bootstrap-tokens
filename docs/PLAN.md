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

### A1. Coverage cannot silently drop things · ✅ **done**

`tools/lib/sass-targets.mjs` lists the maps we model. The extractor warns when a listed map
is *missing* from the checkout, but never when the checkout has a map we do not list. So a
gap is invisible by construction.

It already bit us: upstream declares **64** `$*-tokens` maps and we model **62**.
`$fade-tokens` and `$collapse-tokens` (`scss/_transitions.scss`) have never been in the
document, and no test, no warning and no CI run noticed.

Done in `tools/lib/discover.mjs`, wired into `sync --check` and CI. It scans every `.scss`
file for variables carrying `!default` — the flag that makes a variable reachable through
`@use … with ()` — and fails on anything that is neither modelled nor listed in `NOT_TOKENS`
with a reason. Coverage is now **64/64** token maps and **0** unaccounted surfaces.

Finding along the way: `$caret-*` and `$transition-base` carry `!default` but live in
`scss/mixins/`, which `bootstrap.scss` does not forward — they are not configurable through
the documented entrypoint at all. See [`BACKLOG.md`](./BACKLOG.md) U1.

The classification that came out of it:

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

### A2. Separate *tokens* from *configuration* · ✅ **done**

`$enable-rounded: false` is a one-line change with enormous visual impact, and
`$button-sizes: ("xs", "sm", "lg")` decides which classes exist. Neither is a design value,
so neither belongs in a DTCG document — but both belong in an exported theme.

Done. `tokens/config/options.json` holds **28** build options — the twelve `$enable-*` flags,
the size and variant lists, the validation states and the colour-mode settings — each with the
Sass source text of its value, its kind and a note on what it does. `sync` extracts them,
`verify` emits all 28 at their defaults and still produces byte-identical CSS, and the chooser
gives them their own section.

Keeping them *out* of `tokens/` is what stops the DTCG document turning into a Sass config
dump, and the coverage guard now counts them as modelled rather than ignored — so the
`NOT_TOKENS` list shrank to the handful of things that genuinely are not configuration.

Values are stored as Sass source text rather than parsed into JS types, which keeps emission
lossless: `"media-query"` keeps its quotes, `4.5` stays a number, a list stays a list.

**Build options cannot be previewed**, and the chooser says so. They change which CSS
Bootstrap generates rather than what values it holds, and no amount of overriding custom
properties can un-write a `border-radius` declaration that was never emitted.

### A3. Every token carries a resolvable `$type` · ✅ **done**

Was 308 untyped. Now **58**, every one of them explicitly marked `css: true` — and `validate`
requires a token to be typed *or* carry that mark, so nothing is unclassified and the escape
hatch cannot quietly become the norm.

Most of the 308 were simply not being asked about. The extractor guessed a type from the
token's name and gave up when the name did not match, so `menu.zindex`, `toast.spacing` and
every key of `$theme-borders` went untyped despite being obvious. The composites came with
them: `shadow`, `border`, `transition` and `gradient` are now used wherever the value permits,
which is what a design tool needs in order to do anything with a shadow beyond echo it.

The 58 that remain have no DTCG type in existence — `nowrap`, a `url()` data URI, a property
list, a percentage, an aspect ratio, a transform. Written up as Deviation 4 in
[`dtcg-conventions.md`](./dtcg-conventions.md). A wrong type would be worse than a missing
one: a tool that trusts `$type: dimension` on `10%` mis-parses it, whereas a tool that sees no
type knows it does not know.

Still to do: validating against the published DTCG JSON Schema in CI, which needs the schema
as a dependency.

### A4. Descriptions — the document has to be readable · ✅ **done**

Was 4 tokens out of 1197. Now **168/168 of the semantic layer**, plus the primitives and
component tokens that behave surprisingly — 195 in total.

The target deliberately is *not* 100%. A description earns its place only by saying something
the name does not, and "the alert's horizontal padding" costs a line to teach nothing. So:

* **Semantic layer: every token, required by `validate`.** This is where the difference
  between `fg` and `fg-emphasis` is a decision rather than a value.
* **Primitive scales: the group carries it.** `spacing.3` needs no line of its own once the
  `spacing` group explains the scale.
* **Component tokens: only the surprising ones.** The twelve that read a `--theme-*` hook
  behave differently from their name — they follow a `.theme-*` class on an ancestor and fall
  back only when there is none — and that is generated automatically from the value.

Two families are templated rather than written out: the nine theme sub-keys mean the same
thing for all eight roles, and the seven control metrics mean the same thing at all four
sizes. Writing 72 and 28 near-identical strings would only invite them to drift.

A test asserts no description merely restates its path. It found seven that did, and one
calibration mistake of my own: at a five-word threshold it began rejecting good short
descriptions and rewarding padding, which is the opposite of the goal. Lowered to four.

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

### A7. Survive upstream renames · ✅ **done**

`tokens/migrations.json` records what became what, and every route a theme takes into the
system — opening a saved one, importing a `theme.json`, importing a `custom.scss` — resolves
paths through it first. Chains collapse in one pass, `to: null` marks a token upstream
removed, and a cycle terminates instead of hanging.

`sync` proposes candidates rather than writing them: a path that vanished while a similar one
appeared is the *shape* of a rename, matched on the custom property it emits or its slot in a
Sass map, but only a person can tell a rename from a coincidence. Anything it cannot pair is
listed as gone with no obvious replacement, so a real removal is not quietly read as a rename.

Nothing is dropped silently. An override with nowhere to go is reported with a reason, because
a theme that comes back a little more like stock Bootstrap than you left it, with no warning,
is the worst failure a theme file can have.

Still to do: DTCG `$deprecated`, once a token is actually deprecated rather than moved.

---

## Track B — Export

### B1. Verify the path people actually use · ✅ **done**

`verify` now compiles a partial theme export and asserts every previewed custom property
matches the compiled value, **at the selector it is declared on**. That last part matters:
comparing by property name alone gives false failures, because upstream re-declares some
properties under `[data-bs-theme]`.

It found a real bug on its first run — see [`BACKLOG.md`](./BACKLOG.md) U4. `--shadow-strength`
is pinned by upstream at `[data-bs-theme="light"]` as well as for dark, so a token override
never reached any page with an explicit theme, including this tool's own preview. The
`fixedDark` extension generalised to `pinnedModes`, the runtime CSS re-asserts at every
selector upstream pins, and the Sass export now names what it cannot express.

Still to do: the same end-to-end check for `eject` on a theme that *adds* a key.

### B2. Say when a change cannot be expressed · ✅ **done**

Built alongside B1. `unexpressible()` finds overrides a `@use … with ()` configuration
cannot reach, and `themeScss` appends the CSS the consumer also needs, rather than producing
a file that quietly does less than the preview showed.

### B3. Expose the configuration surface · ✅ **done**

Delivered with A2 — the two are the same work seen from either end.

### B4. More consumer shapes · 🚧 **npm package done**

Today there is exactly one: `@use … with ()`. Add, in this order:

1. ✅ **npm package** — an explicit `exports` map over `tokens/`, `build/scss/`, `build/css/`
   and `build/json/`, plus a library entry point, so the shape of the package is a decision
   rather than whatever happens to be on disk. `prepublishOnly` validates, rebuilds and
   tests, so nothing ships that has not been regenerated from the document it claims to come
   from.

   Also `bstokens init`, which scaffolds a project that compiles — verified end to end from a
   clean directory through `npm install` to a themed stylesheet. It exposed that Bootstrap 6
   is not on npm at all, so a semver range would have failed on install in the very feature
   meant to prove the export works; the scaffold points at the branch and says why.
2. **Typed JS/TS** — `tokens.ts` for people theming React or JS-in-CSS.
3. **Style Dictionary config** — plugs into pipelines that already exist.
4. **Figma / Tokens Studio JSON** — closes the designer loop.

Each needs a fixture test asserting the third-party tool actually consumes it.

### B5. Import an existing `custom.scss` · ✅ **done**

`bstokens import <custom.scss>` writes a `theme.json`, and the chooser's import button now
accepts either shape — a hand-written stylesheet, formatted any way, not only one we
produced.

Two things make it trustworthy rather than approximate. Custom properties come back as token
references, so an imported theme still follows the scale it came from instead of becoming a
wall of literals. And values that merely restate a default are dropped: a nested map merges
one level deep, so changing one sub-key obliges the export to carry all nine, and reading
those back as nine edits would be faithful to the file and wrong about the intent. With that,
**export → import → export is byte-stable**.

Anything unplaceable is named rather than dropped, because a half-read theme that looks
complete is worse than one that says what it missed.

---

## Track C — The chooser

### C1. Create tokens, not just edit them · ✅ **done**

An override may now carry a `create` payload, which brings a token into existence that
upstream does not have. Adding a colour gives you a real scale — thirteen generated steps,
`--brand-*` custom properties, a `.theme-brand` class — and leaves Bootstrap's sixteen alone.

Most of the machinery already worked once the model could create: `expandColorScales`
generates the steps for any hue in the tree, and the exporter reads the tree rather than a
list, so `$colors` and `$theme-colors` picked the addition up for free. The export is minimal
and idiomatic — the new scale and the new role, nothing else.

Two details were load-bearing. A created node needs its `$value` seeded at creation, or it is
a group rather than a token and gets walked straight past. And the hue lists in both the
chooser and the preview had to start reading the document instead of a hardcoded sixteen, or
an added colour is invisible in the two places it most needs to appear.

Still to do: adding a *component* token, and adding a size to a component that has none.

### C2. Themes as objects · ✅ **done**

A theme now has a name and an identity. Keep several, switch between them, duplicate, rename,
delete — and share one as a link.

Sharing packs the theme into the URL fragment with the platform's own `CompressionStream`,
so it stays dependency-free. A theme is mostly repeated token paths, which deflate hard: the
22-token Editorial preset comes out at **571 characters**, short enough to paste into a
message. Nothing is uploaded anywhere.

Two things had to be right. The store migrates both older shapes forward — losing someone's
work to a refactor is not an upgrade path — and share links are adopted on `hashchange` as
well as at startup, because pasting a link into a page that is already open changes the
fragment without reloading.

Still to do: **comparing two themes side by side**, which is the other half of "show me A next
to B" and needs the preview to render from two documents at once.

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
