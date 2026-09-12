# Plan: getting this right

> Maintainer working notes — the author's running plan, not reference documentation.
>
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
the documented entrypoint at all. See [issue #9](https://github.com/julien-deramond/bootstrap-tokens/issues/9).

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

Every command that takes `--theme` now applies migrations and then **refuses to run** if the
theme still names a token that does not exist, unless told `--skip-unknown`. It used to
proceed: `withOverrides` ignores an unknown path, so `init` scaffolded a project quietly
missing those values, `report` audited a theme nobody wrote, and `verify` — the command whose
whole job is to say what you will get — announced "all 1 previewed property matches" for a
three-token theme.

The chooser had the same hole from the other end. Migration ran *after* the base document was
built, so its guard short-circuited and the startup path, the one every visitor takes, had
never migrated anything. Fixed, and the result is now said on the page rather than in
`console.info`, which nobody reads.

Still to do: DTCG `$deprecated`, once a token is actually deprecated rather than moved.

---

## Track B — Export

### B1. Verify the path people actually use · ✅ **done**

`verify` now compiles a partial theme export and asserts every previewed custom property
matches the compiled value, **at the selector it is declared on**. That last part matters:
comparing by property name alone gives false failures, because upstream re-declares some
properties under `[data-bs-theme]`.

It found a real bug on its first run — see [issue #12](https://github.com/julien-deramond/bootstrap-tokens/issues/12). `--shadow-strength`
is pinned by upstream at `[data-bs-theme="light"]` as well as for dark, so a token override
never reached any page with an explicit theme, including this tool's own preview. The
`fixedDark` extension generalised to `pinnedModes`, the runtime CSS re-asserts at every
selector upstream pins, and the Sass export now names what it cannot express.

`verify --theme <file>` runs the same check on **your** theme rather than the built-in
fixture, which is the question anyone about to ship one actually has. It found two bugs on
its first real theme: Sass strings emitted with their quotes, so `font-family` named a single
family with commas in it and matched nothing, and `#{…}` interpolation left in, so every icon
and every box shadow in `build/css/tokens.css` was `#{url(…)}`.

Both were invisible because nothing compared the **CSS route**. The Sass export is proved
byte-identical and covers one of the three ways out of this document; the CSS export is
assembled in JavaScript and had never been checked against anything. `verify` now compares it
to upstream's compiled output per selector, modulo the ways Sass reformats — leading zeros,
hue angles, legacy colour syntax, folded constants.

Fixing the comparison exposed a third problem in the check itself: upstream writes
`:root,\n:host`, which the parser records as two rules, so a lookup for the combined selector
matched nothing and 653 declarations — every global token — went silently uncompared while the
check reported success on the 591 that happened to be single-selector components. The count is
now printed, including what could not be compared.

Checking the CSS route also exposed that eight of the sixty-two component maps were recorded
against the wrong selector. That is not cosmetic: an exported theme scopes a component
override to it, so overriding `--check-size` wrote `.form-check-input { … }` for a property
Bootstrap reads on `.check`, and the override did nothing. Nothing had noticed, because the
Sass export does not use these selectors — it hands values to Sass and lets Bootstrap place
them, so byte-identical output stayed byte-identical.

`sync` now checks placement against the compiled stylesheet, and coverage of the CSS route is
1313 of 1313.

Running `eject --verify` on a realistic theme rather than the fixture found a disagreement
between the two routes. `$colors: ("blue": $blue)` and `$radii: (5: $radius)` look identical
in the source, and the right answer differs: the colour map is a pure re-export so the edit
belongs on the scalar, while `$radii` is a scale whose eight other entries derive from
`$radius`, so patching it because step 5 moved would move all nine. The eject route did the
latter and the consumer route did the former, and `--rounded-size` came out half. The
indirection is now followed only when nothing else in the same map leans on the same scalar.

Still to do: the same end-to-end check for `eject` on a theme that *adds* a key.

### B2. Say when a change cannot be expressed · ✅ **done**

Built alongside B1. `unexpressible()` finds overrides a `@use … with ()` configuration
cannot reach, and `themeScss` appends the CSS the consumer also needs, rather than producing
a file that quietly does less than the preview showed.

### B3. Expose the configuration surface · ✅ **done**

Delivered with A2 — the two are the same work seen from either end.

### B4. More consumer shapes · ✅ **done**

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

   The scaffold now ships `npm run verify` too, so the consumer can make the claim in their
   own project rather than reading it in ours: the Bootstrap they installed is the one that
   matters, and a dependency bump is exactly when you want to ask again. Run from a clean
   directory: 34 of 34 previewed properties matching against `node_modules/bootstrap`.
2. ✅ **Typed JS/TS** — a runtime module plus declarations rather than a `.ts` source, so it
   works from plain JavaScript too. `TokenPath` is a union of all 1206 paths, which is the
   point of shipping types at all: a typo becomes a compile error instead of a `var()` that
   silently does nothing.
3. ✅ **Style Dictionary** — DTCG with `{aliases}` intact, because a pipeline that cannot see
   `theme.primary` following `color.blue.500` can only re-print. Two configs rather than two
   platforms, since a config has one source set; the dark one uses `include` plus an
   `isSource` filter so `[data-bs-theme=dark]` holds only what changes.
4. ✅ **Tokens Studio** — flat sRGB, light and dark as two sets, DTCG types mapped to the
   vocabulary that decides which Figma property a token can bind to.

Each has a fixture test that runs the real tool: `tsc` over a consumer file and over one with
a deliberate typo, Style Dictionary over both configs as emitted. Asserting the shape of our
own output would only prove we emitted what we meant to.

Doing it needed a colour resolver, which is the part that reimplements a browser and is
therefore checked against one — 1084 of 1092 values matching Chrome exactly. See
[`exports.md`](./exports.md) for what each shape is for and what flattening cannot do.

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

### C3. A preview that proves the theme works · 🚧 **scenarios done**

The sample is a component gallery. It cannot answer "does my theme survive a real page?"

* ✅ **Every state, systematically** — default, active, disabled, focus ring, valid, invalid,
  loading, empty, selected. States are where a theme breaks: a disabled control that still
  looks clickable, a focus ring that vanishes on a dark fill, an invalid field
  indistinguishable from a valid one. Before this they appeared only by accident.
* ✅ **A real page** — navbar, hero, stat cards, a form, a table. A row of buttons beside a row
  of alerts answers "do these components look right?" but not "does my theme survive a page?",
  which is the question anyone actually has. Spacing against real prose is where a density or
  radius choice succeeds or falls apart.
* ✅ **Every component that has tokens.** Fourteen of the sixty-two had no sample at all, so
  theming them looked like it did nothing: every overlay (menu, tooltip, popover, dialog,
  drawer), because they are positioned against the viewport and hidden until JavaScript shows
  them; the OTP, chip input and strength meter, whose markup a plugin builds; the carousel;
  and the dark navbar. Each now renders — overlays inside a specimen box that contains their
  positioning and touches nothing a theme sets. 59 of 62 render; the remaining three are the
  calendar and datepicker, which are a third party's DOM, and `reboot-type`, which is the body
  typography the artboard already carries.
* ⬜ Hover states, which cannot be forced from outside the document.
* ✅ **Markup that is actually v6's.** The preview is a fidelity claim — "this is what your
  theme looks like on Bootstrap" — and it is only true while the markup is Bootstrap's own.
  It had drifted: the forms section used v5's `.form-check`, `.form-check-input` and
  `.form-switch`, none of which v6 styles, so checkboxes, radios and switches rendered as
  bare browser controls and a theme's check and switch tokens appeared to do nothing.
  `.lead`, which v6's migration guide explicitly removed, was there too. Drift like this is
  silent by nature — a class that no longer exists renders an unstyled element, which reads
  as a plain control rather than as a bug — so it is now a test against the vendored
  stylesheet the preview itself loads.
* ✅ **Your own markup**, pasted in. The gallery answers "do Bootstrap's components look
  right?"; this answers the question anyone actually has, which is whether the theme survives
  *their* page — their nesting, their utilities, their content lengths. Stored per browser
  rather than per theme, because it describes your page and you want to see it under every
  theme you try. Stripped of anything that executes before rendering, since the preview is
  same-origin with the chooser, and the editor says what it dropped rather than silently
  drawing less than you pasted.
* **Component isolation** — selecting a component in All tokens previews just that component.

### C4. Accessibility as an output, not a warning · ✅ **done**

* ✅ **APCA alongside WCAG 2.** WCAG 2's ratio is known to misjudge exactly our case — light
  text on saturated fills. APCA is what WCAG 3 is built on. Both are reported, because they
  disagree and knowing where they disagree is the point: `fg.4` on a dark page clears WCAG's
  3:1 large-text bar at Lc -22, which is nearly invisible. Checked against the published
  reference values — a contrast number that is wrong by a little still looks plausible.
* ✅ **A repair action.** Every failing pair now carries the fix. It prefers a different step
  of the *same hue* — moving along the scale keeps the design intent and changes only the
  contrast — and falls back to the neutral poles only when the value was never on a scale,
  which is what a `contrast` sub-key usually looks like. "Nearest" is by distance along the
  scale, so the suggestion is the smallest change that works rather than the safest-looking
  one: `warning.fg` at 4.0:1 is offered `yellow.800`, not black.
* ✅ **Colour-vision simulation**, over the preview *and* as a check. The preview draws the
  artboards through protanopia, deuteranopia, tritanopia or achromatopsia; the report says
  which semantic roles stop being distinguishable, which is the part nobody catches by
  looking. It is the gap contrast cannot cover: luminance barely moves under colour
  blindness, so a palette can clear every ratio and still hand around eight percent of men a
  success button and a danger button in the same colour. `--fail-on vision` gates on it.

  The matrices are applied in linear light, which is both correct for the Viénot
  approximations and identical to what an SVG filter does — verified against Chrome by
  painting each colour through the real filter and reading the pixel back, 28 of 28 exact.
  The widely copied sRGB variants understate the loss, which is the worst direction to be
  wrong in.
* ✅ **An exportable report** to attach to a pull request. `bstokens report` writes Markdown,
  HTML or JSON, and `--fail-on introduced` turns it into a CI gate that judges a theme on
  what it changed rather than on what Bootstrap already had. The chooser produces the
  identical document from the browser — the rendering lives in one library, because the
  header used to say three issues while the report said four, and a number that disagrees
  with the file you hand a reviewer is worse than no number.

### C5. Show what changed · ✅ **done**

The change counter is now a disclosure listing every edit: token or build option, its
previous value struck through, its new one, and a Revert button per row. Reverting is an
ordinary mutation, so undo takes it back.

Build options matter here more than the tokens do — they never appeared as tokens anywhere,
so before this there was no way at all to see that a theme had turned `$enable-rounded` off
short of reading the exported Sass.

**Before / after** renders the same page twice in the same colour scheme, Bootstrap's
defaults on one side and this theme on the other. The override stylesheet is scoped to the
themed pane — custom properties inherit, so declaring them on a wrapper themes everything
inside it and nothing outside — which is what makes the comparison possible without a second
document or a second iframe.

### C6. First run and delight · ✅ **done**

Three sentences on first visit, dismissed forever on the first click, rather than a tour
nobody finishes. Eight dials and a preview explain themselves eventually — but not what the
thing *produces*, and the export is the whole point.

**Surprise me** generates a coherent theme rather than a random one. Rolling every dial
independently produces noise, so it picks a brand hue, an accent a fixed distance around the
wheel from it so the two relate, and one shape idea applied consistently — then repairs any
contrast the combination broke, using the same suggestion machinery as C4. A surprise that
hands back something unreadable is not a feature.

Keyboard shortcuts beyond undo remain open.

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
