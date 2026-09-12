<p align="center">
  <a href="https://github.com/twbs/bootstrap/tree/v6-dev">
    <img src="web/vendor/bootstrap-logo-shadow.png" alt="Bootstrap logo" width="200" height="165">
  </a>
</p>

<h3 align="center">bootstrap-tokens</h3>

<p align="center">
  Bootstrap 6's design system as portable design tokens — and a visual theme builder that
  writes them.
  <br>
  <a href="https://julien-deramond.github.io/bootstrap-tokens/"><strong>Open the Theme Builder »</strong></a>
  <br>
  <br>
  <a href="#quick-start">Quick start</a>
  ·
  <a href="docs/theme-builder.md">Theme Builder</a>
  ·
  <a href="docs/exports.md">Exports</a>
  ·
  <a href="docs/cli.md">CLI</a>
  ·
  <a href="https://github.com/julien-deramond/bootstrap-tokens/issues/new">Report bug</a>
</p>

<p align="center">
  <a href="https://github.com/julien-deramond/bootstrap-tokens/actions/workflows/ci.yml"><img src="https://github.com/julien-deramond/bootstrap-tokens/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://julien-deramond.github.io/bootstrap-tokens/"><img src="https://img.shields.io/badge/theme%20builder-live-7952b3.svg" alt="Theme Builder, live"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT licence"></a>
</p>

## Table of contents

- [What this is](#what-this-is)
- [Quick start](#quick-start)
- [Status](#status)
- [What's included](#whats-included)
- [Using the tokens](#using-the-tokens)
- [Theme Builder](#theme-builder)
- [Commands](#commands)
- [Documentation](#documentation)
- [Bugs and feature requests](#bugs-and-feature-requests)
- [Contributing](#contributing)
- [Copyright and license](#copyright-and-license)

## What this is

Bootstrap 6 already has a real token system: `oklch()` colour scales generated with
`color-mix()`, semantic `$theme-colors`, and a per-component `$*-tokens` map emitted as CSS
custom properties. What it does not have is that system in a **portable** form.

So this repository holds two things:

- **The tokens** — Bootstrap 6 lifted into [DTCG format](https://tr.designtokens.org/format/),
  layered primitive → semantic → component, and exported to Sass, CSS, TypeScript, Style
  Dictionary and Figma. Extracted from [`twbs/bootstrap@v6-dev`](https://github.com/twbs/bootstrap/tree/v6-dev),
  and checked back against it.
- **Bootstrap Theme Builder** — a local web app for designing a theme by editing those tokens,
  with real Bootstrap components re-theming beside you. It exports Sass byte-identical to what
  you would have hand-written.

```text
tokens/  (DTCG, source of truth)  ──build──▶  Sass maps · CSS custom properties · resolved JSON
    ▲                                                        │
    └────────────sync────── twbs/bootstrap@v6-dev ◀──────verify
```

> An independent project, not affiliated with or endorsed by the Bootstrap team.

## Quick start

**Design a theme** in the [Theme Builder](https://julien-deramond.github.io/bootstrap-tokens/). Nothing to
install — it runs in the browser, and every push to `main` redeploys it.

**Start a project** from a theme it exported:

```bash
npx bstokens init my-theme --theme theme.json
cd my-theme && npm install && npm run watch
```

**Or just consume the tokens** — see [using the tokens](#using-the-tokens).

The rest of the tooling reads a `v6-dev` checkout, because Bootstrap 6 is not on npm yet:

```bash
git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap
npm install
```

## Status

[![CI status](https://github.com/julien-deramond/bootstrap-tokens/actions/workflows/ci.yml/badge.svg)](https://github.com/julien-deramond/bootstrap-tokens/actions/workflows/ci.yml)

Tracks Bootstrap `6.0.0-alpha1`. **1206 tokens**, covering all 64 of upstream's `$*-tokens`
maps.

`bstokens verify` compiles upstream's `bootstrap.scss` and the configuration exported from
these tokens, and asserts the resulting CSS is identical — today it is, across all 18174
lines. CI runs that on every push, alongside a nightly job that opens an issue when `v6-dev`
drifts from the committed document.

## What's included

```text
bootstrap-tokens/
├── tokens/     the token document — primitive/, semantic/, component/
├── tools/      extractor, resolver, validator, exporters, CLI
├── build/      generated exports (committed, so they are browsable)
├── web/        Bootstrap Theme Builder
└── docs/       reference documentation and maintainer notes
```

## Using the tokens

```js
import { loadTokens, themeScss, createHue } from 'bootstrap-tokens'
```
```scss
@use "bootstrap-tokens/scss";   // every Sass map, !default-flagged
```
```css
@import "bootstrap-tokens/css"; /* the flat custom-property surface */
```

`npm run build` (or `npx bstokens build`) writes every shape into `build/`:

| File | What it is |
| --- | --- |
| `scss/_tokens.scss` | every Sass map, `!default`-flagged — a drop-in starting point for `v6-dev` |
| `scss/bootstrap-custom.scss` | a ready-to-compile `@use "bootstrap" with (…)` configuration |
| `css/tokens.css` | the flat custom-property surface, no Sass required |
| `json/tokens.resolved.json` | every token with its `$value` resolved to CSS |
| `json/tokens.tree.json` | the document the Theme Builder loads |
| `ts/tokens.js` + `tokens.d.ts` | typed access for React and CSS-in-JS, with a union of all token paths |
| `style-dictionary/` | DTCG sources and configs, aliases intact, for pipelines that already exist |
| `figma/tokens.json` | Tokens Studio sets, flat sRGB, light and dark |

They are not one export renamed six times. Anything consumed by CSS keeps `var()` and
`color-mix()`, so a theme stays live; anything consumed by a tool with no cascade — Figma, a
chart library — is resolved to the colour a browser would have painted, checked against a real
one. **[`docs/exports.md`](docs/exports.md)** covers which to reach for, how to compile
Bootstrap with your values, and what resolving cannot do.

## Theme Builder

**[julien-deramond.github.io/bootstrap-tokens](https://julien-deramond.github.io/bootstrap-tokens/)** — the
deployed build of `main`. To run it against your own checkout instead:

```bash
npm run vendor   # compile upstream Bootstrap into web/vendor/bootstrap.css (once)
npm run web      # http://localhost:4000
```

Watch real Bootstrap components re-theme in the panel beside you, then export. There is no
Sass in the browser and no compile step in the loop: v6 drives everything through CSS custom
properties, so re-declaring them is the whole mechanism.

- **Two modes over one model.** *Design* is eight controls that each move a lot of the system
  — brand colour, radius, density, type, shadow. *All tokens* is all 1206, grouped and
  searchable. Both write the same overrides, so switching is lossless.
- **Light and dark side by side**, as framed artboards on a neutral canvas — a v6 theme is
  always two themes.
- **Every change is listed and revertible**, with undo throughout and a full diff of what you
  changed.
- **Contrast and colour-vision checks built in**, separating problems you introduced from ones
  Bootstrap's defaults already had, exportable as a report for a pull request.
- **Themes are files.** Save, name, duplicate, share by link, reopen later — and every CLI
  command takes the same `theme.json`.

**[`docs/theme-builder.md`](docs/theme-builder.md)** is the full tour.

## Commands

```bash
npx bstokens build      # emit Sass, CSS, JSON, TypeScript, Style Dictionary and Figma
npx bstokens verify     # compile upstream vs. our export, diff the CSS
npx bstokens sync       # re-extract from a v6-dev checkout into tokens/
npx bstokens validate   # references, cycles, layer direction, DTCG shape
npx bstokens report     # contrast and colour vision, as Markdown, HTML or JSON
npx bstokens init       # scaffold a project that compiles a theme
npx bstokens import     # read an existing custom.scss back into a theme.json
npx bstokens eject      # write the tokens into v6-dev's own Sass sources (maintainers)
```

Point any of them at a checkout with `--src <path>`, `$BOOTSTRAP_SRC`, or a
`bootstrap-tokens.config.json`. Full flags and workflows: **[`docs/cli.md`](docs/cli.md)**.

## Documentation

| Document | What's in it |
| --- | --- |
| [`exports.md`](docs/exports.md) | The output shapes, which to reach for, and how to compile Bootstrap with your values |
| [`theme-builder.md`](docs/theme-builder.md) | The Theme Builder in full |
| [`cli.md`](docs/cli.md) | Every command and flag |
| [`bootstrap-v6-architecture.md`](docs/bootstrap-v6-architecture.md) | What upstream's Sass actually does |
| [`dtcg-conventions.md`](docs/dtcg-conventions.md) | The four places this deviates from the DTCG spec, and why |
| [`layers.md`](docs/layers.md) | The three layers and the reference direction |
| [`maintainer-export.md`](docs/maintainer-export.md) | `eject` — patching Bootstrap's own sources, for a pull request |
| [`token-inventory.md`](docs/token-inventory.md) | Generated token counts, refreshed by `bstokens build` |

[`PLAN.md`](docs/PLAN.md) and [`ROADMAP.md`](docs/ROADMAP.md) are the maintainer's working
notes — what's wrong and what's next, and what's done. The **eight findings about Bootstrap
itself** that this pipeline surfaced are issues labelled
[`upstream`](https://github.com/julien-deramond/bootstrap-tokens/issues?q=is%3Aissue+label%3Aupstream), each with the compile, diff or browser
measurement behind it.

## Bugs and feature requests

Open an [issue](https://github.com/julien-deramond/bootstrap-tokens/issues/new/choose). Two
kinds are especially welcome: a token whose exported value doesn't match what Bootstrap
compiles, and a configurable surface upstream has that this document doesn't model.

Every issue opens as `needs-triage` and becomes `ready-to-dev` once a maintainer has read it;
[`CONTRIBUTING.md`](CONTRIBUTING.md#issues-and-triage) has the labels in full, including the
rules AI agents follow when they file or pick up work.

Bugs in Bootstrap itself belong at [`twbs/bootstrap`](https://github.com/twbs/bootstrap/issues).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Because `tokens/` is generated from upstream and
`build/` is committed, there are two rules worth knowing before a first pull request — both
are covered there.

## Copyright and license

Code and documentation copyright 2026 Julien Déramond, released under the
[MIT Licence](LICENSE) — the same licence as Bootstrap.

Bootstrap is © the Bootstrap Authors, MIT-licensed; its name and logo are trademarks of its
authors, used here only to identify what this project is built for.
