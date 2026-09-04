/**
 * The maintainer route: the token document written back into Bootstrap's own sources.
 *
 * The property under test is not just "it compiles" but "it stays reviewable" — an eject
 * must touch only the values that changed, and must leave `!default`, comments and the
 * symbolic `$spacer * .25` derivations exactly as upstream wrote them.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { loadTree } from '../lib/load-fs.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { clone, withOverrides } from '../lib/overrides.mjs'
import { sourceValueOf, sourceEdits } from '../lib/source-value.mjs'
import { planEject } from '../lib/eject.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'

const { tree } = loadTree(tokensDir)
const base = index(expandColorScales(clone(tree)))

test('source rendering keeps derivations symbolic instead of evaluating them', () => {
  assert.equal(sourceValueOf(base, 'spacing.1'), '$spacer * .25')
  assert.equal(sourceValueOf(base, 'spacing.4'), '$spacer')
  assert.equal(sourceValueOf(base, 'radius.2'), '$radius * .375')
  // Arithmetic destined for a custom-property map is interpolated, as upstream writes it.
  assert.equal(sourceValueOf(base, 'card.group-margin'), '#{$grid-gutter-x * .5}')
})

test('source rendering prefers a custom property, then a Sass scalar', () => {
  assert.equal(sourceValueOf(base, 'theme-color.primary.base'), 'var(--blue-500)')
  assert.equal(sourceValueOf(base, 'theme-color.primary.fg'), 'light-dark(var(--blue-600), var(--blue-400))')
  assert.equal(sourceValueOf(base, 'toast.spacing'), '$container-padding-x')
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout — the source-patching tests below are skipped */
}

test('an empty theme changes nothing', { skip: !source }, () => {
  const { patched, changes } = planEject(source, base, {})
  assert.equal(changes.length, 0)
  assert.equal(patched.size, 0)
})

const OVERRIDES = {
  'color.blue.base': { value: 'oklch(58% 0.19 28)' },
  'spacing.base': { value: '1.25rem' },
  'alert.border-radius': { value: '{radius.9}' },
  'theme-color.warning.fg': { value: '{color.amber.700}', dark: '{color.amber.300}' }
}

test('an eject edits the declaration a maintainer would expect', { skip: !source }, () => {
  const doc = withOverrides(tree, OVERRIDES)
  const { changes, skipped } = planEject(source, doc, OVERRIDES)

  assert.deepEqual(skipped, [])
  const byKey = new Map(changes.map((c) => [c.key, c]))

  // `$colors` holds `("blue": $blue)`, so the edit follows through to the scalar.
  assert.equal(byKey.get('$blue').file, 'scss/_colors.scss')
  assert.equal(byKey.get('$blue').to, 'oklch(58% 0.19 28)')

  assert.equal(byKey.get('$spacer').file, 'scss/_config.scss')
  assert.equal(byKey.get('--alert-border-radius').file, 'scss/_alert.scss')
  assert.equal(byKey.get('warning.fg').to, 'light-dark(var(--amber-700), var(--amber-300))')

  // Changing the base spacer must not rewrite the scale that derives from it.
  assert.ok(!changes.some((change) => change.file === 'scss/_config.scss' && change.key === '1'))
})

test('an eject preserves !default and everything it did not change', { skip: !source }, () => {
  const doc = withOverrides(tree, OVERRIDES)
  const { files, patched } = planEject(source, doc, OVERRIDES)

  const config = patched.get('scss/_config.scss')
  assert.match(config, /^\$spacer: 1\.25rem !default;$/m)
  assert.match(config, /^ {4}1: \$spacer \* \.25,$/m)
  assert.match(config, /^\/\/ scss-docs-start spacer-variables-maps$/m)

  const colors = patched.get('scss/_colors.scss')
  assert.match(colors, /^\$blue: oklch\(58% 0\.19 28\) !default;$/m)
  assert.match(colors, /^\$indigo: oklch\(56% 0\.26 288\) !default;$/m)

  // Every patched file differs from upstream by exactly the lines we changed.
  const expected = { 'scss/_colors.scss': 1, 'scss/_config.scss': 1, 'scss/_alert.scss': 1, 'scss/_theme.scss': 1 }
  for (const [file, text] of patched) {
    const before = files.get(file).text.split('\n')
    const after = text.split('\n')
    assert.equal(before.length, after.length, `${file} changed line count`)
    const differing = before.filter((line, i) => line !== after[i]).length
    assert.equal(differing, expected[file], `${file} changed ${differing} lines`)
  }
})

test('the chooser preview names the same edits the CLI makes', { skip: !source }, () => {
  const doc = withOverrides(tree, OVERRIDES)
  const preview = sourceEdits(base, doc, OVERRIDES)
  const { changes } = planEject(source, doc, OVERRIDES)

  const previewed = new Map(preview.map((edit) => [edit.key, edit]))
  for (const change of changes) {
    const match = previewed.get(change.key)
    assert.ok(match, `the chooser did not predict the edit to ${change.key}`)
    assert.equal(match.file, change.file)
    assert.equal(match.to, change.to)
  }
  assert.equal(preview.length, changes.length)
})

test('the patched sources compile to the same CSS as the consumer export', { skip: !source }, async () => {
  const sass = await import('sass')
  const { emitUseWith } = await import('../lib/emit-scss.mjs')

  const doc = withOverrides(tree, OVERRIDES)
  const { patched } = planEject(source, doc, OVERRIDES)

  const work = mkdtempSync(join(tmpdir(), 'bstokens-eject-test-'))
  const checkout = join(work, 'bootstrap')
  cpSync(join(source, 'scss'), join(checkout, 'scss'), { recursive: true })

  for (const [file, text] of patched) {
    const path = join(checkout, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }

  const ejected = sass.compile(join(checkout, 'scss', 'bootstrap.scss'), {
    loadPaths: [checkout],
    style: 'expanded'
  }).css

  const reference = join(work, 'reference.scss')
  writeFileSync(reference, emitUseWith(doc, { version: 'test', importPath: join(source, 'scss', 'bootstrap') }))
  const consumer = sass.compile(reference, { loadPaths: [source], style: 'expanded' }).css

  assert.equal(ejected, consumer)
})
