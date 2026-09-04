# Exporting v6-dev's own sources

`bstokens eject` writes the token document back into `twbs/bootstrap@v6-dev`'s Sass files, so
a maintainer can pick values in the chooser and end up with an ordinary pull request.

```bash
# in the chooser: edit, then save the theme.json tab
npx bstokens eject --theme theme.json --src ../bootstrap --in-place
npx bstokens eject --theme theme.json --src ../bootstrap --verify
```

`--in-place` patches the checkout. Without it the patched files land in `build/v6-dev/`,
mirroring `scss/`, ready to copy across.

## Why it patches instead of regenerating

The obvious implementation is to render each Sass map from the token document and overwrite
the file. It produces something that compiles, and it is the wrong answer.

Upstream's `_config.scss` says:

```scss
// scss-docs-start spacer-variables-maps
$spacer: 1rem !default;
$spacers: () !default;
// stylelint-disable-next-line scss/dollar-variable-default
$spacers: defaults(
  (
    0: 0,
    1: $spacer * .25,
```

A regenerated file would flatten `$spacer * .25` to `.25rem`, drop the `scss-docs` markers the
documentation site reads, lose the stylelint pragmas, and reflow every map. Changing three
numbers would produce a two-thousand-line diff that no maintainer can review, and it would
quietly delete the derivation the file is built on.

So `eject` locates the byte range of each individual value and splices. Changing four tokens
gives four changed lines:

```diff
 // scss-docs-start spacer-variables-maps
-$spacer: 1rem !default;
+$spacer: 1.25rem !default;
 $spacers: () !default;
```

## What it gets right

**`!default` survives.** The flag is what makes a variable configurable through
`@use … with ()`. The replacement range deliberately stops before it, so ejected sources stay
usable by downstream consumers.

**References stay symbolic.** `sourceValueOf()` renders a reference as `var(--blue-500)` when
the target has a custom property and `$spacer` when it only has a Sass scalar, and it does
*not* evaluate arithmetic. `$spacer * .25` is left alone; change `$spacer` and the scale still
follows, exactly as upstream intended. This is the one place the maintainer export and the
consumer export deliberately differ — a `with ()` block is evaluated in the consumer's scope,
where `$spacer` does not exist, so that route resolves the arithmetic instead.

**Indirection is followed.** `$colors` holds `("blue": $blue)` and `$root-tokens` holds
`--white: #{$white}`. Editing the map entry there would be wrong: the value lives in the
scalar, and that is where a maintainer looks for it. When the located text is a bare `$name`,
the edit follows it to that declaration.

## What it does not do

* **Add or remove tokens.** The chooser only edits values. Adding a theme colour or a hue is a
  change to `tokens/`, made by hand and then `sync`ed — `eject` will insert a missing map key
  if the token document has one, but nothing in the UI produces that yet.
* **Reformat.** If you want the sources reformatted, that is stylelint's job, not this tool's.
* **Touch anything but token values.** Mixins, selectors, the `@layer` order and the utility
  API are out of scope by design.

## The check that makes it trustworthy

`--verify` compiles the patched checkout, compiles the *same* theme through the consumer
`@use … with ()` route against a pristine checkout, and diffs the two stylesheets.

They must be identical. That is a genuinely load-bearing test: the two routes reach the same
CSS by different means — one keeps `$spacer * .25` symbolic and lets Sass recompute the scale,
the other resolves the arithmetic in JavaScript and emits literals. If the JS arithmetic, the
reference resolution or the file locating were wrong, the two would disagree.

It also caught a real bug. `--spacer: 1rem` in `$root-tokens` *looks* like it should derive
from `$spacer`, and an earlier version of the token document modelled it as an alias. Upstream
hardcodes it, so Sass never recomputes it — the chooser was previewing a value the compiled
stylesheet would never produce. The token document now mirrors what Bootstrap actually does,
and `spacing.root` carries a `$description` saying so.
