# The `bstokens` CLI

Every command is also available as an npm script in this repository (`npm run build`,
`npm run verify`, …). `npx bstokens --help` prints the full flag list.

## Which Bootstrap the commands read

The commands that read or compile upstream Sass (`sync`, `verify`, `vendor`, `eject`) use the
Bootstrap release `package.json` pins as a devDependency, `bootstrap@6.0.0-alpha.1`. `npm ci`
installs it into `node_modules/bootstrap`, and CI uses the same one.

They look for a source in this order: `--src <path>`, `$BOOTSTRAP_SRC`, a `bootstrapSource`
entry in `bootstrap-tokens.config.json`, then `node_modules/bootstrap`. Nothing else is picked
up on its own, so a `main` clone sitting next to this repository is only used when you name it.
`sync` and `verify` print which Bootstrap they read, and warn when it isn't the pinned version.

A `main` checkout is still useful for two things: `eject`, to prepare a pull request for
Bootstrap itself, and a look at what the next alpha will change.

```bash
git clone --depth 1 -b main https://github.com/twbs/bootstrap.git /tmp/bootstrap-main
npx bstokens sync --check --src /tmp/bootstrap-main
```

## Commands

| Command | What it does |
| --- | --- |
| `sync` | Re-extract tokens from Bootstrap's Sass into `tokens/` |
| `validate` | Check references, cycles, layer direction and DTCG shape |
| `build` | Emit Sass, CSS, JSON, TypeScript, Style Dictionary and Figma into `build/` |
| `verify` | Compile upstream and our export, and diff the CSS |
| `report` | Audit contrast and color vision, as Markdown, HTML or JSON |
| `probe` | Write a page that checks the flattened colors against a real browser |
| `vendor` | Compile upstream Bootstrap into `web/vendor/bootstrap.css` for the Theme Builder |
| `import` | Read an existing `custom.scss` back into a `theme.json` |
| `init` | Scaffold a project that compiles a theme |
| `eject` | Write the tokens into Bootstrap's own Sass sources (maintainers) |

### `sync` — track upstream

```bash
npx bstokens sync                # re-extract into tokens/
npx bstokens sync --check        # report drift without writing, exit 1 if any   (CI)
```

`--check` fails on two things: a token whose value moved upstream, and a configurable surface
upstream offers that the document neither models nor explicitly ignores. The second is the
one that matters — two token maps went missing for the life of the project before that check
existed.

`tokens/meta.json` records where the document came from: `"source": "npm"` and the version
for the pinned release, or `"source": "git"` with the branch and commit for a checkout.
`--check` ignores that provenance and compares only the tokens.

A nightly workflow, `next-release-preview.yml`, runs it against `twbs/bootstrap@main` along with
`verify` and `eject --verify`. It keeps one `upstream-drift` issue open while `main` differs
from the pinned release, as advance notice for the next alpha, and never fails a pull
request.

### `validate` — check the document

```bash
npx bstokens validate
npx bstokens validate --strict   # also flag component→primitive shortcuts
```

### `build` — emit every export

```bash
npx bstokens build
npx bstokens build --import "bootstrap/scss/bootstrap"   # the path in the generated @use
```

What each output shape is for is covered in [`exports.md`](./exports.md).

### `verify` — the central claim

```bash
npx bstokens verify                        # upstream vs. our export, byte for byte
npx bstokens verify --theme theme.json     # …and your theme compiles to what you previewed
```

Compiles upstream's `bootstrap.scss` and the exported configuration and asserts the resulting
CSS is identical, then checks the CSS export against upstream's own output declaration by
declaration. With `--theme`, it compiles that theme against the Bootstrap you installed and
compares every custom property with what the Theme Builder previewed — "it looked right in
the tool" and "it compiles to this" are different claims, and only the second survives a
dependency bump.

The theme check compares what a page gets, not what a selector declares. It puts the preview's
stylesheet (compiled Bootstrap plus the Theme Builder's unlayered overrides, the same rules
`theme.css` ships) next to the compiled `custom.scss`. Then it asks both which value of every
token's custom property reaches the element that reads it. That follows `@layer` order,
specificity, source order, `prefers-color-scheme` and inheritance, so a later rule that shadows
a value shows up. Each property is probed on `<html>` or on an element built from its
component's selector, in six page contexts: OS light or dark, with `data-bs-theme` light, dark
or absent on `<html>`. It's probed again with `data-bs-theme` light and dark on the element
itself, which is how Bootstrap's dark navbar works. Any difference there fails, and the
message names both values and the selector that won on each side:

```text
--shadow-strength (elevation.strength) on <html data-bs-theme="light">: preview .5 from [data-bs-theme="light"], compiled 1 from [data-bs-theme=light]
```

Two kinds of difference only warn. The first shows only at a wider viewport (the widths come
from the stylesheets' own media queries). The second shows only under a modifier class that
re-declares a component's properties, such as `.btn-solid`, `.pagination-sm` or `.chip.active`.
Both come from the preview, not from the export. The Theme Builder paints its overrides
unlayered, so they beat every variant rule Bootstrap keeps in its components layer, while
`custom.scss` lands inside that layer and the variants keep Bootstrap's values. Editing the
button text color, for example, changes every solid, outline and link button in the preview,
and none of them in the compiled theme.

The model has limits. Selectors with pseudo-classes other than `:root`, pseudo-elements, `+`
or `~` never match a probe. `@supports`, `@container` and media features other than color
scheme and width count as false. `var()` isn't substituted, so two values compare as written.

### `report` — contrast and color vision

```bash
npx bstokens report --theme theme.json --out contrast.md
npx bstokens report --theme theme.json --fail-on introduced   # a CI gate
```

`--format` is `md`, `html` or `json`. `--fail-on` takes `regression`, `introduced`, `vision`
or `any`, and gates on what *your theme* changed rather than on failures Bootstrap's defaults
already carry. The scoring and that distinction are explained in
[`exports.md`](./exports.md#bstokens-report--the-contrast-audit).

### `init` — scaffold a project

```bash
npx bstokens init my-theme --theme theme.json
cd my-theme && npm install && npm run watch
```

Writes a project that compiles: the entry stylesheet, a `package.json` with the right
dependencies and scripts, a page that uses the result, and the `theme.json` so you can reopen
it in the Theme Builder later. It also gets `npm run verify`, which compiles the theme against
the Bootstrap you installed and compares the result with what you previewed.

The scaffold depends on the exact Bootstrap release this repository builds against
(`bootstrap@6.0.0-alpha.1`), from the npm registry. Exact, because an alpha can rename the
variables a theme sets. And from the registry, because that installs without `git`, which isn't
there everywhere a project gets installed (a browser sandbox, most containers). Pass
`--bootstrap` to name another dependency spec, and `--force` to write into a non-empty
directory.

#### `--template` — which kind of project

```bash
npx bstokens init my-app --theme theme.json --template vite
cd my-app && npm install && npm start
```

| Template | What you get |
| --- | --- |
| `sass` (default) | `scss/custom.scss`, the `sass` CLI, `index.html` linking the compiled file. No bundler to explain, which is what a Bootstrap theme honestly is. |
| `vite` | Vite compiling Bootstrap's **source Sass**, rooted at `src/`, with the theme's page and working drawer, menu, popover and tooltip. |

`vite` mirrors [`twbs/examples/vite` on `v6-dev`](https://github.com/twbs/examples/tree/v6-dev/vite)
file for file where it can — `vite.config.js` rooted at `src/`, `src/index.html`,
`src/js/main.js`, `src/scss/styles.scss`, Bootstrap imported through bare specifiers, and
`@floating-ui/dom` as a real dependency because v6 externalises positioning. Someone who has
read Bootstrap's own guides should not have to learn a second layout to use a theme.

Three deliberate divergences, each commented in the generated files: the package is declared
`"type": "module"` (upstream's `__dirname` config earns a Vite 8 deprecation warning on every
build); there is no `data-bs-theme` pinned on `<html>`, so the page follows the operating system
and shows the theme in both schemes; and the page is the Theme Builder's own "A page" artboard
rather than a minimal did-it-work page, so what you download looks like what you designed
against.

Pick `sass` for a theme you are going to hand to someone else, and `vite` if you are going to
build an app with it. The same `vite` project is what
[Open in StackBlitz](./theme-builder.md#open-in-stackblitz) sends to a sandbox — one generator,
[`tools/lib/project.mjs`](../tools/lib/project.mjs), so the two cannot describe different
projects.

### `import` — read a stylesheet back

```bash
npx bstokens import custom.scss --out theme.json
```

Turns an existing `@use "bootstrap" with (…)` configuration into a theme file the Theme
Builder can open.

### `eject` — Bootstrap's own sources (maintainers)

```bash
npx bstokens eject --theme theme.json --src ../bootstrap --in-place
npx bstokens eject --theme theme.json --src ../bootstrap --verify
```

`--src` names your Bootstrap clone, usually on `main`, since the result is meant to become a
pull request there. Without it, `eject` reads the pinned release, which is enough for `--verify`.

Patches values in place rather than regenerating files, so four token edits give four changed
lines and every comment, `!default`, symbolic expression and `scss-docs` marker survives.
See [`maintainer-export.md`](./maintainer-export.md).

### `probe` — check the maths against a browser

```bash
npx bstokens probe --out build/probe.html
```

Writes a self-contained page that declares every custom property, reads back
`getComputedStyle` and compares it with the flattened values. Open it in a browser.

## Themes that name tokens which no longer exist

Bootstrap 6 is an alpha and token names move. Every command that takes `--theme` applies
recorded renames first, then **refuses to run** if the theme still names a token that does not
exist. Pass `--skip-unknown` to proceed without those values.

Silently dropping an override is how a theme loses work nobody notices — so it is never the
default.
