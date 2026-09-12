# The `bstokens` CLI

Every command is also available as an npm script in this repository (`npm run build`,
`npm run verify`, …). `npx bstokens --help` prints the full flag list.

## Pointing at a Bootstrap checkout

Bootstrap 6 is not on npm yet, so the commands that read or compile upstream Sass — `sync`,
`verify`, `vendor`, `eject` — need a `v6-dev` checkout:

```bash
git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap
```

They look for it in this order: `--src <path>`, `$BOOTSTRAP_SRC`, a `bootstrapSource` entry
in `bootstrap-tokens.config.json`, then the conventional siblings `../bootstrap`,
`vendor/bootstrap` and `node_modules/bootstrap`.

## Commands

| Command | What it does |
| --- | --- |
| `sync` | Re-extract tokens from a `v6-dev` checkout into `tokens/` |
| `validate` | Check references, cycles, layer direction and DTCG shape |
| `build` | Emit Sass, CSS, JSON, TypeScript, Style Dictionary and Figma into `build/` |
| `verify` | Compile upstream and our export, and diff the CSS |
| `report` | Audit contrast and colour vision, as Markdown, HTML or JSON |
| `probe` | Write a page that checks the flattened colours against a real browser |
| `vendor` | Compile upstream Bootstrap into `web/vendor/bootstrap.css` for the Theme Builder |
| `import` | Read an existing `custom.scss` back into a `theme.json` |
| `init` | Scaffold a project that compiles a theme |
| `eject` | Write the tokens into `v6-dev`'s own Sass sources (maintainers) |

### `sync` — track upstream

```bash
npx bstokens sync                # re-extract into tokens/
npx bstokens sync --check        # report drift without writing, exit 1 if any   (CI)
```

`--check` fails on two things: a token whose value moved upstream, and a configurable surface
upstream offers that the document neither models nor explicitly ignores. The second is the
one that matters — two token maps went missing for the life of the project before that check
existed.

A nightly workflow runs it and opens an issue when `v6-dev` moves.

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

### `report` — contrast and colour vision

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

Because v6 is not on npm, the scaffold depends on the `v6-dev` branch — named as a tarball URL
rather than a `github:` spec, because the `github:` form makes npm shell out to `git`, which is
not present everywhere a project gets installed (a browser sandbox, most containers). Both
resolve the same branch, and it installs cleanly either way: upstream ships `scss/**` and a
built `js/dist/**`, and defines no prepare script. Pass `--bootstrap` to pin a release once one
exists, and `--force` to write into a non-empty directory.

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
