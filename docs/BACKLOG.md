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

## P — This project

### P1 · `sync --check` cannot tell a rename from a delete-plus-add

Covered as PLAN.md A7. Noting the concrete failure: a `theme.json` referencing a renamed
token silently loses that value on import, with no warning.

### P2 · The chooser's `title` tooltips are not keyboard reachable

The theme-health chip puts its detail in a `title` attribute. Tooltips do not open on
keyboard focus and are not announced reliably. Should be a disclosure or popover.

### ~~P3 · No test asserts the preview and the export agree~~ · done

`verify` now compiles a partial theme export and compares every previewed custom property
against the compiled value, selector by selector. It found the U4 pin on its first run.

### P4 · `build/` is committed and can go stale

CI catches it, but only on push. A pre-commit hook or a `--check` in `validate` would catch
it earlier.

### P5 · Component variant maps have no preview

`$navbar-dark-tokens`, `$nav-underline-tokens`, `$spinner-grow-tokens` and the other variant
maps are editable in All tokens, but the sample markup does not render them, so editing them
shows nothing. Either add them to the sample or mark them "not previewed" in the UI.
