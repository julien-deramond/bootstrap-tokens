/**
 * The scaffold.
 *
 * The export dialog hands over a `custom.scss` and four numbered steps, and the steps are
 * where people fall off. This writes the whole project so the only one left is
 * `npm install` — which means the scaffold itself has to be right.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { init } from '../commands/init.mjs'
import { resolveBootstrapSource } from '../lib/config.mjs'

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

test('the dependency points somewhere that exists', async () => {
  const target = await scaffold()
  const pkg = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'))

  assert.match(pkg.dependencies.bootstrap, /^github:twbs\/bootstrap#/)
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
