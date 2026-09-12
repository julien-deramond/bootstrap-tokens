/**
 * The project a theme turns into — as a `{ path: contents }` map, written by nobody.
 *
 * Two things scaffold a project now: `bstokens init`, which writes the map to disk, and the
 * Theme Builder's *Open in StackBlitz* button, which POSTs the same map to a sandbox. They
 * have to agree. A sandbox that scaffolded one way while the CLI scaffolded another would be
 * the second implementation this repository keeps refusing to write — and it is the kind that
 * rots quietly, because the two are never seen side by side.
 *
 * So the generator is a pure function of the theme, and both callers are thin. No Node
 * built-ins: the browser imports this file directly, the same way it imports the resolver.
 *
 * ## Two templates
 *
 * `sass` is the original and stays the default: a `custom.scss`, the `sass` CLI, and a page
 * that links the result. Nothing to explain beyond "Sass compiles this file into that one",
 * which is what a Bootstrap theme honestly is.
 *
 * `vite` is for the far more common case — someone who is going to build an app with the
 * theme. It mirrors [`twbs/examples/vite` on `v6-dev`][1] closely enough that a Bootstrap
 * developer recognises it: Vite rooted at `src/`, the stylesheet linked straight from the
 * HTML and imported by the JS entry, Bootstrap resolved through bare specifiers out of
 * `node_modules`, and `@floating-ui/dom` as a real dependency because v6 externalises
 * positioning. Every deliberate divergence from upstream is commented where it happens.
 *
 * [1]: https://github.com/twbs/examples/tree/v6-dev/vite
 */

import { themeScss } from './overrides.mjs'
import { changedOptions } from './config-surface.mjs'
import { page } from './sample-page.mjs'

/*
 * Bootstrap 6 is not on npm — the registry has nothing above 5.3.x — so a semver range would
 * fail `npm install` in the very file meant to prove this works. The `v6-dev` branch is the
 * only way to get v6 today, and it installs cleanly whichever way you name it: twbs/bootstrap
 * ships `scss/**` and a built `js/dist/**`, and defines no prepare script, so there is nothing
 * to build after the download. Override with --bootstrap once a release exists.
 *
 * It is named as a tarball URL rather than as `github:twbs/bootstrap#v6-dev`, which is what
 * upstream's own example writes and what this repository wrote until Open in StackBlitz went
 * looking for evidence. A `github:` spec makes npm shell out to `git`, and StackBlitz's
 * WebContainer has no git binary — `npm error syscall spawn git`, install over, sandbox dead
 * on arrival. codeload serves the same branch as a plain tarball over HTTPS, which npm fetches
 * itself. Same commit, same contents, one fewer thing that has to exist on the machine.
 *
 * (The archive is the whole repository rather than a packed npm tarball, so it is ~28 MB
 * against ~10 MB. That is the price of not needing git, and it is paid once per install.)
 */
export const BOOTSTRAP_DEFAULT = 'https://codeload.github.com/twbs/bootstrap/tar.gz/refs/heads/v6-dev'

/*
 * The `sass` scaffold depends on this package so `npm run verify` works without a global
 * install. Pinned to the repository for the same reason Bootstrap is: there is no published
 * release yet, and a semver range that resolves to nothing fails at `npm install` — in the
 * very feature meant to prove the export works.
 *
 * A `github:` spec is fine here, unlike Bootstrap's: this dependency only appears in the
 * `sass` template, which is installed on a developer's machine, where git exists.
 */
export const BOOTSTRAP_TOKENS_DEFAULT = 'github:julien-deramond/bootstrap-tokens'

/*
 * Pinned to the versions `twbs/examples` builds against, so the template is known to work
 * rather than known to have worked. `sass` matches what this repository compiles with.
 */
const VITE_VERSION = '^8.0.16'
const FLOATING_UI_VERSION = '^1.7.6'
const SASS_VERSION = '^1.93.0'

/** Where a generated project points back to, so a theme can be picked up again. */
const THEME_BUILDER_URL = 'https://julien-deramond.github.io/bootstrap-tokens/'

export const TEMPLATES = ['sass', 'vite']

/** Descriptions, so `--help` and the docs do not each invent their own. */
export const TEMPLATE_NOTES = {
  sass: 'the sass CLI compiling custom.scss — no bundler to explain',
  vite: "Vite compiling Bootstrap's source Sass, the shape twbs/examples uses"
}

const packageName = (name) => name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')

/**
 * Every file a scaffolded project is made of.
 *
 * @param {object} input
 * @param {object} input.doc         The token document with the theme's overrides applied.
 * @param {object} input.overrides   The theme's overrides.
 * @param {object} [input.options]   The theme's `$enable-*` and friends, as authored.
 * @param {object} [input.baseOptions] Upstream's values for those, so only changes are emitted.
 * @param {string} input.name        What to call the project.
 * @param {string} input.version     The Bootstrap the theme was built against.
 * @param {'sass'|'vite'} [input.template]
 * @param {string} [input.bootstrap] Dependency spec for Bootstrap itself.
 * @returns {Record<string, string>} Repository-relative path → file contents.
 */
export function projectFiles({
  doc,
  overrides,
  options = {},
  baseOptions = {},
  name,
  version,
  template = 'sass',
  bootstrap = BOOTSTRAP_DEFAULT
}) {
  if (!TEMPLATES.includes(template)) {
    throw new Error(`Unknown template "${template}". Pick one of: ${TEMPLATES.join(', ')}.`)
  }

  const changed = changedOptions(baseOptions, { ...baseOptions, ...options })

  /*
   * The name is carried through so reopening the theme, or verifying it, still calls it what
   * you called it rather than "theme.json".
   */
  const themeFile = `${JSON.stringify(
    { format: 'bootstrap-tokens-theme@1', name, bootstrap: version, overrides, options },
    null,
    2
  )}\n`

  return template === 'vite'
    ? viteProject({ doc, overrides, changed, name, version, bootstrap, themeFile })
    : sassProject({ doc, overrides, changed, name, version, bootstrap, themeFile })
}

/* ------------------------------------------------------------------ sass -- */

const SASS_INDEX_HTML = (name) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name}</title>
    <link href="css/app.css" rel="stylesheet" />
  </head>
  <body class="p-4">
    <h1>${name}</h1>
    <p class="fs-lg fw-light">Your theme is compiled into <code>css/app.css</code>.</p>

    <div class="d-flex flex-wrap gap-2 my-4">
      <button type="button" class="btn btn-solid theme-primary">Primary</button>
      <button type="button" class="btn btn-outline theme-primary">Outline</button>
      <button type="button" class="btn btn-solid theme-success">Success</button>
    </div>

    <div class="alert theme-primary" role="alert">
      <p class="m-0">Edit <code>scss/custom.scss</code> and run <code>npm run watch</code>.</p>
    </div>
  </body>
</html>
`

const SASS_README = (name) => `# ${name}

A Bootstrap v6 theme, generated by [bootstrap-tokens](https://github.com/julien-deramond/bootstrap-tokens).

\`\`\`bash
npm install
npm run watch     # rebuild css/app.css as you edit
npm run build     # one compressed build
npm run verify    # check the theme compiles to the values you previewed
\`\`\`

Then open \`index.html\`.

\`npm run verify\` is the one worth knowing about. It compiles this theme against the Bootstrap
you actually installed and compares every custom property it produces with what the chooser
showed you. "It looked right in the tool" and "it compiles to this" are different claims, and
only the second one survives a dependency bump.

## What is where

| Path | What it is |
| --- | --- |
| \`scss/custom.scss\` | Your theme. It configures Bootstrap through \`@use … with ()\`, so only the values you changed are here. |
| \`theme.json\` | The same theme in portable form. Load it back into the chooser to keep editing. |
| \`css/app.css\` | The compiled stylesheet. Link this instead of Bootstrap's own. |

Everything not listed in \`custom.scss\` comes from Bootstrap's defaults, so upgrading is a
matter of bumping the dependency.

## About the Bootstrap dependency

Bootstrap 6 is not published to npm yet, so \`package.json\` points at the \`v6-dev\` branch,
as a tarball URL rather than a \`github:\` spec — the latter makes npm shell out to \`git\`, which
is not there in every place a project gets installed. Once there is a release, swap it for a
version range.
`

function sassProject({ doc, overrides, changed, name, version, bootstrap, themeFile }) {
  return {
    /*
     * A relative path, because `sass scss/custom.scss` is a plain CLI invocation with no
     * resolver: it has no idea what `node_modules` is.
     */
    'scss/custom.scss': themeScss(doc, overrides, {
      version,
      importPath: '../node_modules/bootstrap/scss/bootstrap',
      options: changed
    }),
    'index.html': SASS_INDEX_HTML(name),
    'README.md': SASS_README(name),
    '.gitignore': 'node_modules/\ncss/\n',
    'theme.json': themeFile,
    'package.json': `${JSON.stringify(
      {
        name: packageName(name),
        private: true,
        type: 'module',
        scripts: {
          build: 'sass --style=compressed --no-source-map scss/custom.scss css/app.css',
          watch: 'sass --watch scss/custom.scss css/app.css',
          /*
           * The theme compiles here, against your own installed Bootstrap, and every value
           * is compared with what the chooser previewed. Worth having in the project rather
           * than only in this repository: the version you install is the one that matters,
           * and "it looked right in the tool" is not the same claim as "it compiles to this".
           */
          verify: 'bstokens verify --theme theme.json --src node_modules/bootstrap'
        },
        dependencies: { bootstrap },
        devDependencies: { sass: SASS_VERSION, 'bootstrap-tokens': BOOTSTRAP_TOKENS_DEFAULT }
      },
      null,
      2
    )}\n`
  }
}

/* ------------------------------------------------------------------ vite -- */

/**
 * The interactive half of the starter page.
 *
 * The shared sample page is static markup, and a theme whose drawer, menu, popover and
 * tooltip cannot be opened under-sells itself: those are four of the surfaces a theme's
 * tokens reach, and they are in the Theme Builder's own preview. They also earn the
 * `@floating-ui/dom` dependency, which is otherwise an unexplained line in `package.json`.
 */
const VITE_OVERLAYS = `
      <h2>Overlays</h2>
      <p>These four need Bootstrap's JavaScript, imported in <code>src/js/main.js</code>.</p>

      <div class="d-flex flex-wrap gap-2 align-items-center">
        <button type="button" class="btn btn-solid theme-primary" data-bs-toggle="drawer" data-bs-target="#starter-drawer">
          Open a drawer
        </button>

        <button type="button" class="btn btn-outline theme-primary" id="starter-menu-button" data-bs-toggle="menu">
          Open a menu
        </button>
        <div class="menu" aria-labelledby="starter-menu-button">
          <h6 class="menu-header">Account</h6>
          <a class="menu-item" href="#">Profile</a>
          <a class="menu-item" href="#">Settings</a>
          <hr class="menu-divider" />
          <a class="menu-item" href="#">Sign out</a>
        </div>

        <button type="button" class="btn btn-text theme-primary" data-bs-toggle="popover"
                data-bs-title="Popover title" data-bs-content="And a sentence of body copy that wraps onto a second line.">
          Show a popover
        </button>

        <button type="button" class="btn btn-text" data-bs-toggle="tooltip" data-bs-title="A short hint">
          Hover for a tooltip
        </button>
      </div>

      <dialog class="drawer drawer-end" tabindex="-1" id="starter-drawer" aria-labelledby="starter-drawer-title">
        <div class="drawer-header">
          <h5 class="drawer-title" id="starter-drawer-title">Drawer</h5>
          <button type="button" class="btn-close" data-bs-dismiss="drawer" aria-label="Close"></button>
        </div>
        <div class="drawer-body">
          <p>Anything can go in here. The surface, the border and the shadow are all theme tokens.</p>
        </div>
      </dialog>

      <!--
        Not only a footer: a menu or a popover opened from the row above needs somewhere to
        open into, and without this the last one on the page lands below the fold.
      -->
      <hr class="mt-5 mb-4">
      <p class="fg-secondary">Generated from a theme designed in the
        <a href="${THEME_BUILDER_URL}">Bootstrap Theme Builder</a>. Drop <code>theme.json</code>
        back into it to carry on editing.</p>`

/*
 * No `data-bs-theme` on <html>, which is where upstream's example pins itself to light.
 *
 * v6 themes with `light-dark()`, so a theme is always two themes, and leaving the attribute
 * off means this page follows the operating system and shows both. It also keeps the page
 * honest: Bootstrap re-declares some tokens under `[data-bs-theme]` after `:root`, so an
 * explicit theme is the one case where a Sass override can fail to reach the page — the
 * exporter says so when a theme touches one of those values, and a starter page that pinned
 * the attribute would be demonstrating exactly that trap.
 */
const VITE_INDEX_HTML = (name) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${name}</title>
    <link rel="stylesheet" href="scss/styles.scss">
    <script type="module" src="./js/main.js"></script>
  </head>
  <body>
    <div class="container py-4 px-3 mx-auto">
${page('starter')
  .replace(/^\n/, '')
  .trimEnd()
  .split('\n')
  .map((line) => (line.trim() ? `    ${line}` : line))
  .join('\n')}

      <hr class="my-5">
${VITE_OVERLAYS}
    </div>
  </body>
</html>
`

const VITE_MAIN_JS = `// The stylesheet, so Vite compiles it and hot-reloads it as you edit.
import '../scss/styles.scss'

/*
 * Only the plugins this page uses. Importing Drawer and Menu is enough to make them work —
 * each one registers its own \`data-bs-toggle\` handler on the document — while tooltips and
 * popovers are opt-in per element, so they need the two loops below.
 *
 * All four position themselves with Floating UI, which v6 does not bundle. That is what
 * \`@floating-ui/dom\` is doing in package.json.
 */
import { Drawer, Menu, Popover, Tooltip } from 'bootstrap'

for (const element of document.querySelectorAll('[data-bs-toggle="popover"]')) {
  new Popover(element)
}

for (const element of document.querySelectorAll('[data-bs-toggle="tooltip"]')) {
  new Tooltip(element)
}
`

/*
 * Upstream's config: Vite rooted at `src/` so `index.html` sits beside the Sass and JS it
 * references, `dist/` under it, and a dev server on 8080.
 *
 * One divergence. Upstream writes `resolve(__dirname, 'src')` in a package that is not
 * declared ESM, and Vite 8 warns about that on every build — "ESM syntax in a file loaded as
 * CommonJS", a shape it is dropping. So this template declares `"type": "module"` and uses
 * `import.meta.dirname`, which is the same thing said in the module system the rest of the
 * project is already written in.
 */
const VITE_CONFIG = `import { resolve } from 'node:path'

export default {
  root: resolve(import.meta.dirname, 'src'),
  build: {
    outDir: './dist'
  },
  server: {
    port: 8080
  }
}
`

const VITE_README = (name) => `# ${name}

A Bootstrap v6 theme in a Vite project, generated by
[bootstrap-tokens](https://github.com/julien-deramond/bootstrap-tokens).

\`\`\`bash
npm install
npm start         # dev server on http://localhost:8080, hot reload on a Sass edit
npm run build     # a production bundle in src/dist
\`\`\`

Bootstrap is compiled here from its own source Sass, configured through \`@use … with ()\`.
Nothing in this project overrides compiled CSS, which matters more than it sounds: a
custom-property overlay works, but it is not how a v6 project is built, and the difference
shows the first time you need a value Bootstrap computes rather than declares.

## What is where

| Path | What it is |
| --- | --- |
| \`src/scss/styles.scss\` | Your theme. It configures Bootstrap through \`@use … with ()\`, so only the values you changed are here. |
| \`src/js/main.js\` | The entry point: the stylesheet, plus the Bootstrap plugins this page uses. |
| \`src/index.html\` | The page. Vite serves it and rewrites the \`.scss\` link at build time. |
| \`theme.json\` | The same theme in portable form. Load it back into the Theme Builder to keep editing. |

## Checking the theme against the Bootstrap you installed

"It looked right in the tool" and "it compiles to this" are different claims, and only the
second one survives a dependency bump:

\`\`\`bash
npx github:julien-deramond/bootstrap-tokens verify --theme theme.json --src node_modules/bootstrap
\`\`\`

That compiles this theme against your own \`node_modules/bootstrap\` and compares every custom
property it produces with what the Theme Builder previewed.

## About the dependencies

Bootstrap 6 is not published to npm yet, so \`package.json\` points at the \`v6-dev\` branch,
as a tarball URL rather than a \`github:\` spec — the latter makes npm shell out to \`git\`, which
is not there in every place a project gets installed. Once there is a release, swap it for a
version range.

\`@floating-ui/dom\` is not optional: v6 externalises positioning, so menus, tooltips and
popovers need it at runtime.
`

function viteProject({ doc, overrides, changed, name, version, bootstrap, themeFile }) {
  return {
    /*
     * A bare specifier, not the relative path the `sass` template uses: Vite resolves
     * `bootstrap/scss/bootstrap` out of `node_modules` the way upstream's example does, and
     * a `../node_modules/…` path would be both wrong here and unlike anything a reader has
     * seen in Bootstrap's own docs.
     */
    'src/scss/styles.scss': themeScss(doc, overrides, {
      version,
      importPath: 'bootstrap/scss/bootstrap',
      options: changed
    }),
    'src/index.html': VITE_INDEX_HTML(name),
    'src/js/main.js': VITE_MAIN_JS,
    'vite.config.js': VITE_CONFIG,
    'README.md': VITE_README(name),
    '.gitignore': '.DS_Store\n/node_modules/\nsrc/dist/\n',
    'theme.json': themeFile,
    'package.json': `${JSON.stringify(
      {
        name: packageName(name),
        private: true,
        // See VITE_CONFIG: upstream leaves this off and pays a Vite 8 deprecation warning.
        type: 'module',
        /*
         * How StackBlitz knows what to run once it has installed. Upstream declares the same
         * field, which is the evidence that a `github:twbs/bootstrap#v6-dev` dependency
         * installs inside a WebContainer at all.
         */
        stackblitz: { startCommand: 'npm start' },
        scripts: { start: 'vite', build: 'vite build' },
        dependencies: { '@floating-ui/dom': FLOATING_UI_VERSION, bootstrap },
        /*
         * No `bootstrap-tokens` here, unlike the `sass` template. This one has to install in
         * a browser sandbox in under a minute, and a second dependency fetched from GitHub is
         * install time plus one more thing that can fail in the thirty seconds this template
         * exists to save. The README gives the `npx` form instead.
         */
        devDependencies: { sass: SASS_VERSION, vite: VITE_VERSION }
      },
      null,
      2
    )}\n`
  }
}
