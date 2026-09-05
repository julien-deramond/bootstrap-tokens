/**
 * Creating tokens, not just editing them.
 *
 * Until this existed, a custom brand colour had to overwrite `color.blue.base`, which also
 * recoloured every `--blue-*` utility on the page. The chooser said so, which was honest,
 * but it was not the right answer.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, themeScss, createHue, createRole, validateNewName, clone } from '../lib/overrides.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'

const { tree } = loadTree(tokensDir)
const BRAND = { ...createHue('brand', 'oklch(55% 0.2 285)'), ...createRole('brand', 'brand') }

test('a new hue generates the same thirteen steps as a built-in one', () => {
  const doc = withOverrides(tree, createHue('brand', 'oklch(55% 0.2 285)'))

  assert.equal(doc.cssValueOf('color.brand.500'), 'oklch(55% 0.2 285)')
  assert.equal(
    doc.cssValueOf('color.brand.100'),
    'color-mix(in oklch, var(--white) 80%, oklch(55% 0.2 285))'
  )

  const steps = [...doc.tokens.keys()].filter((path) => path.startsWith('color.brand.'))
  assert.equal(steps.length, 14, 'expected the base plus thirteen scale steps')
})

test('a new role is built from a scale and carries all nine sub-keys', () => {
  const doc = withOverrides(tree, BRAND)
  const keys = [...doc.tokens.keys()].filter((path) => path.startsWith('theme-color.brand.'))

  assert.equal(keys.length, 9)
  assert.equal(doc.cssValueOf('theme-color.brand.bg-subtle'), 'light-dark(var(--brand-100), var(--brand-900))')
})

test("Bootstrap's own scales are untouched", () => {
  const doc = withOverrides(tree, BRAND)
  assert.equal(doc.cssValueOf('color.blue.500'), 'oklch(60% 0.24 240)')
  assert.equal(doc.cssValueOf('theme-color.primary.base'), 'var(--blue-500)')
})

test('the export carries only the additions', () => {
  const doc = withOverrides(tree, BRAND)
  const scss = themeScss(doc, BRAND, { version: 'test' })

  assert.match(scss, /\$colors: \(\n {4}"brand": oklch\(55% 0\.2 285\)\n {2}\)/)
  assert.match(scss, /"brand": \(/)
  assert.doesNotMatch(scss, /"indigo"/, 'an untouched scale was re-emitted')
  assert.doesNotMatch(scss, /"primary": \(/, 'an untouched role was re-emitted')
})

test('a name has to be a usable Sass map key', () => {
  assert.equal(validateNewName('brand', ['blue']), null)
  assert.equal(validateNewName('my-brand', []), null)
  assert.match(validateNewName('', []), /name/i)
  assert.match(validateNewName('2brand', []), /lowercase/i)
  assert.match(validateNewName('Brand!', []), /lowercase/i)
  assert.match(validateNewName('blue', ['blue']), /already exists/)
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout */
}

test('an added colour compiles into real CSS', { skip: !source }, async () => {
  const sass = await import('sass')
  const doc = withOverrides(tree, BRAND)

  const work = mkdtempSync(join(tmpdir(), 'bstokens-create-'))
  const entry = join(work, 'custom.scss')
  writeFileSync(entry, themeScss(doc, BRAND, { version: 'test', importPath: join(source, 'scss', 'bootstrap') }))

  const { css } = sass.compile(entry, { loadPaths: [source], style: 'expanded' })

  assert.match(css, /--brand-500:/, 'the scale was not emitted')
  assert.equal((css.match(/--brand-\d+:/g) ?? []).length, 13, 'the generated scale is incomplete')
  assert.match(css, /--brand-bg-subtle:/, 'the role was not emitted')
  assert.match(css, /\.theme-brand\b/, 'no .theme-brand class was generated')

  // The point of adding rather than overwriting.
  assert.match(css, /--blue-500: oklch\(60% 0\.24 240deg\)/, "Bootstrap's blue was disturbed")
})
