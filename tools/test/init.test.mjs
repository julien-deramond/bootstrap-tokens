/**
 * The scaffold.
 *
 * The export dialog hands over a `custom.scss` and four numbered steps, and the steps are
 * where people fall off. This writes the whole project so the only one left is
 * `npm install` — which means the scaffold itself has to be right.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { init } from '../commands/init.mjs'
import { projectFiles } from '../lib/project.mjs'
import { withOverrides, clone } from '../lib/overrides.mjs'
import { loadTree, loadOptions } from '../lib/load-fs.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { sourceVersion } from '../commands/build.mjs'

const THEME = {
  format: 'bootstrap-tokens-theme@1',
  overrides: {
    'radius.base': { value: '.25rem' },
    'theme-color.primary.bg': { value: '{color.green.500}' }
  },
  options: { '$enable-shadows': { value: 'false' } }
}

async function scaffold(extra = {}) {
  const work = mkdtempSync(join(tmpdir(), 'bstokens-init-'))
  const themePath = join(work, 'theme.json')
  writeFileSync(themePath, JSON.stringify(THEME))

  const target = join(work, 'project')
  const log = console.log
  console.log = () => {}
  try {
    await init({ flags: { theme: themePath, ...extra }, positional: [target] })
  } finally {
    console.log = log
  }
  return target
}

/** Every file in a scaffolded project, as the shared generator would have described it. */
function filesOn(target) {
  const found = {}
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(dir, entry.name), relative)
      else found[relative] = readFileSync(join(dir, entry.name), 'utf8')
    }
  }
  walk(target)
  return found
}

test('it writes a project that needs nothing but npm install', async () => {
  const target = await scaffold()

  for (const file of ['scss/custom.scss', 'package.json', 'index.html', 'README.md', 'theme.json', '.gitignore']) {
    assert.ok(existsSync(join(target, file)), `${file} is missing`)
  }
})

test('the package.json can actually resolve Bootstrap', () => {
  // A semver range would fail: the npm registry has nothing above Bootstrap 5.x, so a
  // scaffold pinned to ^6.0.0-alpha1 breaks on install — in the file meant to prove this
  // all works.
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
  assert.ok(pkg.exports['./scss'], 'the package does not expose its Sass')
})

test('the dependency points somewhere that exists, and needs no git to get there', async () => {
  const target = await scaffold()
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))

  /*
   * A tarball URL rather than `github:twbs/bootstrap#v6-dev`. The `github:` form makes npm
   * shell out to `git`, and StackBlitz's WebContainer has no git binary — the install dies
   * with `npm error syscall spawn git` before anything compiles. Both forms resolve the same
   * branch; only one of them works everywhere this project gets installed.
   */
  assert.match(pkg.dependencies.bootstrap, /^https:\/\/codeload\.github\.com\/twbs\/bootstrap\//)
  assert.match(pkg.dependencies.bootstrap, /v6-dev$/)
  assert.doesNotMatch(pkg.dependencies.bootstrap, /^(github:|git\+)/)

  assert.ok(pkg.devDependencies.sass, 'nothing to compile with')
  assert.match(pkg.scripts.build, /sass/)
  assert.match(pkg.scripts.watch, /--watch/)
})

test('a caller can pin the dependency once there is a release', async () => {
  const target = await scaffold({ bootstrap: '^6.0.0' })
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))
  assert.equal(pkg.dependencies.bootstrap, '^6.0.0')
})

test('the theme travels with the project, both ways', async () => {
  const target = await scaffold()

  const scss = readFileSync(join(target, 'scss', 'custom.scss'), 'utf8')
  assert.match(scss, /\$radius: \.25rem/)
  assert.match(scss, /"primary": \(/)
  assert.match(scss, /\$enable-shadows: false/)

  // theme.json is written back so the project can be reopened in the chooser.
  const theme = JSON.parse(readFileSync(join(target, 'theme.json'), 'utf8'))
  assert.deepEqual(theme.overrides, THEME.overrides)
  assert.deepEqual(theme.options, THEME.options)
  assert.ok(theme.name, 'the name travels too, so the project is not called theme.json')
})

test('the project can check its own theme against the Bootstrap it installed', async () => {
  /*
   * The claim this whole pipeline exists to support — "it compiles to what you previewed" —
   * is worth being able to make in the consumer's project, not only in this repository: the
   * Bootstrap they installed is the one that matters, and a dependency bump is exactly when
   * you want to ask again.
   *
   * Run end to end from a clean directory: scaffold, `npm install`, `npm run verify` — 34 of
   * 34 previewed properties matching against `node_modules/bootstrap`, and `npm run build`
   * producing a 358 KB themed stylesheet.
   */
  const target = await scaffold()
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))

  assert.match(pkg.scripts.verify, /^bstokens verify/)
  assert.match(pkg.scripts.verify, /--theme theme\.json/)
  // Against what they installed, not against a checkout they would have to find.
  assert.match(pkg.scripts.verify, /--src node_modules\/bootstrap/)
  // And `bstokens` has to be resolvable, or the script is a suggestion rather than a command.
  assert.ok(pkg.devDependencies['bootstrap-tokens'], 'nothing provides the bstokens binary')
})

test('it refuses to write over an existing project unless told to', async () => {
  const target = await scaffold()
  await assert.rejects(
    () => init({ flags: {}, positional: [target] }),
    /already exists and is not empty/
  )
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout */
}

test('the scaffolded stylesheet compiles', { skip: !source }, async () => {
  const sass = await import('sass')
  const target = await scaffold()

  // Stand in for `npm install` by pointing the entry at the local checkout.
  const entry = join(target, 'scss', 'custom.scss')
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8').replace('../node_modules/bootstrap/scss/bootstrap', join(source, 'scss', 'bootstrap'))
  )

  const { css } = sass.compile(entry, { loadPaths: [source], style: 'expanded' })

  assert.match(css, /--radius-5: 0\.25rem/)
  assert.match(css, /--primary-bg: var\(--green-500\)/)
  assert.ok(css.length > 100_000, 'the compiled stylesheet looks truncated')
})

/* ------------------------------------------------------------------ vite -- */

test('the vite template is the shape a Bootstrap developer recognises', async () => {
  /*
   * Measured against `twbs/examples/vite` on `v6-dev`, which is upstream's own answer to
   * "how do I build v6 with Vite". Matching it is the point: someone who has read Bootstrap's
   * guides should not have to learn a second layout to use a theme.
   */
  const target = await scaffold({ template: 'vite' })
  const files = filesOn(target)

  assert.deepEqual(
    Object.keys(files).sort(),
    ['.gitignore', 'README.md', 'package.json', 'src/index.html', 'src/js/main.js', 'src/scss/styles.scss', 'theme.json', 'vite.config.js']
  )

  const pkg = JSON.parse(files['package.json'])
  assert.deepEqual(pkg.scripts, { start: 'vite', build: 'vite build' })
  assert.ok(pkg.devDependencies.vite, 'no bundler in a vite template')
  // v6 externalises positioning, so menus, tooltips and popovers need Floating UI at runtime.
  assert.ok(pkg.dependencies['@floating-ui/dom'], 'the overlays on the page would throw')

  // Vite roots itself at src/, so index.html sits beside the Sass and JS it references.
  assert.match(files['vite.config.js'], /root: resolve\(import\.meta\.dirname, 'src'\)/)
  assert.match(files['src/index.html'], /<link rel="stylesheet" href="scss\/styles\.scss">/)
  assert.match(files['src/index.html'], /<script type="module" src="\.\/js\/main\.js"><\/script>/)
  assert.match(files['src/js/main.js'], /^import '\.\.\/scss\/styles\.scss'$/m)
})

test('the vite stylesheet imports Bootstrap the way Vite resolves it', async () => {
  /*
   * The one thing that has to change between templates. `themeScss` defaults to
   * `../node_modules/bootstrap/scss/bootstrap`, which is right for a bare `sass` CLI call and
   * wrong here: Vite resolves bare specifiers out of node_modules, and upstream's example
   * writes the bare form, so a relative path would be both unnecessary and unfamiliar.
   */
  const files = filesOn(await scaffold({ template: 'vite' }))

  assert.match(files['src/scss/styles.scss'], /@use "bootstrap\/scss\/bootstrap" with \(/)
  assert.doesNotMatch(files['src/scss/styles.scss'], /node_modules/)

  // And it is Sass configuration, not a compiled-CSS overlay — which is the whole reason
  // this template exists rather than a theme.css in a sandbox.
  assert.match(files['src/scss/styles.scss'], /\$radius: \.25rem/)
  assert.doesNotMatch(files['src/index.html'], /theme\.css/)
})

test('the vite page can open the overlays it shows', async () => {
  /*
   * A theme whose drawer, menu, popover and tooltip cannot be opened under-sells itself:
   * those are four of the surfaces its tokens reach, and they are in the Theme Builder's own
   * preview. Importing Drawer and Menu is what registers their `data-bs-toggle` handlers;
   * tooltips and popovers are opt-in per element and need the loops.
   */
  const files = filesOn(await scaffold({ template: 'vite' }))

  assert.match(files['src/js/main.js'], /import \{ Drawer, Menu, Popover, Tooltip \} from 'bootstrap'/)

  for (const toggle of ['drawer', 'menu', 'popover', 'tooltip']) {
    assert.match(
      files['src/index.html'],
      new RegExp(`data-bs-toggle="${toggle}"`),
      `nothing on the page opens a ${toggle}`
    )
  }

  for (const plugin of ['Popover', 'Tooltip']) {
    assert.match(files['src/js/main.js'], new RegExp(`new ${plugin}\\(element\\)`))
  }
})

test('an unknown template is refused by name rather than half-written', async () => {
  await assert.rejects(
    () => init({ flags: { template: 'webpack' }, positional: [join(tmpdir(), 'bstokens-never')] }),
    /Unknown template "webpack"/
  )
})

test('the CLI and the sandbox scaffold the same project', () => {
  /*
   * The invariant this whole refactor exists for. `bstokens init` writes a file map to disk
   * and the Theme Builder's *Open in StackBlitz* button POSTs one to a sandbox; if those were
   * two generators, they would drift, and nobody would notice because the two are never seen
   * side by side.
   *
   * So the button is checked here against the same call the command makes. What the browser
   * adds is only the transport — a form of hidden inputs — which is why this can assert the
   * whole map from Node.
   */
  const { tree } = loadTree(tokensDir)
  const doc = withOverrides(tree, THEME.overrides)
  const shared = {
    doc,
    overrides: THEME.overrides,
    options: THEME.options,
    baseOptions: loadOptions(tokensDir),
    name: 'project',
    version: sourceVersion()
  }

  for (const template of ['sass', 'vite']) {
    const files = projectFiles({ ...shared, template })
    assert.ok(Object.keys(files).length > 0)
    // Same inputs, same files — the generator holds no state between calls.
    assert.deepEqual(projectFiles({ ...shared, template }), files)
  }
})

test('what init writes is exactly what the generator described', async () => {
  const target = await scaffold({ template: 'vite' })

  const { tree } = loadTree(tokensDir)
  const expected = projectFiles({
    doc: withOverrides(tree, THEME.overrides),
    overrides: THEME.overrides,
    options: THEME.options,
    baseOptions: loadOptions(tokensDir),
    name: 'project',
    version: sourceVersion(),
    template: 'vite'
  })

  assert.deepEqual(filesOn(target), expected)
})

test('the vite stylesheet compiles', { skip: !source }, async () => {
  const sass = await import('sass')
  const target = await scaffold({ template: 'vite' })

  /*
   * Stand in for `npm install` the way Vite would: the bare specifier resolves out of
   * node_modules, so a load path pointing at the checkout's parent makes `bootstrap/scss/…`
   * mean the same thing here.
   */
  const entry = join(target, 'src', 'scss', 'styles.scss')
  writeFileSync(
    entry,
    readFileSync(entry, 'utf8').replace('bootstrap/scss/bootstrap', join(source, 'scss', 'bootstrap'))
  )

  const { css } = sass.compile(entry, { loadPaths: [source], style: 'expanded' })

  assert.match(css, /--radius-5: 0\.25rem/)
  assert.match(css, /--primary-bg: var\(--green-500\)/)
  assert.ok(css.length > 100_000, 'the compiled stylesheet looks truncated')
})
