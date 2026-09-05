/**
 * Reading an existing `custom.scss` back into a theme.
 *
 * Someone with a Bootstrap theme already written should be able to open it here and carry
 * on. Being told to start again is the difference between a tool you adopt and one you
 * evaluate.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, themeScss } from '../lib/overrides.mjs'
import { importScss, findWithBlock } from '../lib/import-scss.mjs'
import { tokensDir } from '../lib/config.mjs'

const { tree } = loadTree(tokensDir)
const base = withOverrides(tree, {})

test('a hand-written stylesheet is read, not just one we produced', () => {
  const scss = `
// Someone's own file, formatted their way.
@use '../node_modules/bootstrap/scss/bootstrap' with (
  $radius : 1rem,
  $enable-shadows: false,
  $theme-colors: ( "primary": ( "base": var(--green-500), "fg": light-dark(var(--green-600), var(--green-400)) ) )
);
`
  const { overrides, options, unmapped } = importScss(scss, base)

  assert.deepEqual(overrides['radius.base'], { value: '1rem' })
  assert.deepEqual(overrides['theme-color.primary.base'], { value: '{color.green.500}' })
  assert.deepEqual(overrides['theme-color.primary.fg'], {
    value: '{color.green.600}',
    dark: '{color.green.400}'
  })
  assert.equal(options['$enable-shadows'].value, 'false')
  assert.deepEqual(unmapped, [])
})

test('custom properties come back as token references, not opaque strings', () => {
  // `var(--green-500)` has to become `{color.green.500}`, or the imported theme is a wall of
  // literals that no longer follows the scale it came from.
  const { overrides } = importScss(
    '@use "b" with ($theme-colors: ("primary": ("bg": var(--red-500))));',
    base
  )
  assert.equal(overrides['theme-color.primary.bg'].value, '{color.red.500}')
})

test('values that merely restate a default are not read as edits', () => {
  // A nested map merges one level deep, so changing one sub-key obliges the export to carry
  // all nine. Reading those back as nine edits is faithful to the file and wrong about the
  // intent.
  const original = { 'theme-color.warning.fg': { value: '{color.amber.700}', dark: '{color.amber.300}' } }
  const doc = withOverrides(tree, original)
  const scss = themeScss(doc, original, { version: 'test' })

  const { overrides } = importScss(scss, base)
  assert.deepEqual(Object.keys(overrides), ['theme-color.warning.fg'])
})

test('export, import, export is stable', () => {
  const original = {
    'color.blue.base': { value: 'oklch(58% 0.19 28)' },
    'spacing.base': { value: '1.25rem' },
    'alert.border-radius': { value: '{radius.9}' }
  }
  const options = { '$enable-rounded': { value: 'false' } }

  const first = themeScss(withOverrides(tree, original), original, { version: 'test', options })
  const back = importScss(first, base)
  const second = themeScss(withOverrides(tree, back.overrides), back.overrides, {
    version: 'test',
    options: back.options
  })

  assert.equal(second, first)
})

test('a stylesheet that configures nothing imports as the empty theme', () => {
  const { overrides, options, unmapped } = importScss('@use "../node_modules/bootstrap/scss/bootstrap";', base)
  assert.deepEqual(overrides, {})
  assert.deepEqual(options, {})
  assert.deepEqual(unmapped, [])
})

test('what cannot be placed is named, not dropped', () => {
  // A half-read theme that looks complete is worse than one that says what it missed.
  const { overrides, unmapped } = importScss(
    '@use "b" with ($not-a-bootstrap-variable: 1, $theme-colors: ("nonesuch": ("base": red)));',
    base
  )

  assert.deepEqual(overrides, {})
  assert.equal(unmapped.length, 2)
  assert.ok(unmapped.some((entry) => entry.name === '$not-a-bootstrap-variable'))
  assert.ok(unmapped.some((entry) => entry.name.includes('nonesuch')))
})

test('the with() block is found whatever the formatting', () => {
  assert.equal(findWithBlock('@use "b" with ($a: 1);').trim(), '$a: 1')
  assert.equal(findWithBlock("@use 'b'\n  with (\n  $a: 1\n);").trim(), '$a: 1')
  assert.equal(findWithBlock('@use "b";'), null)
  // Parentheses inside a value must not end the block early.
  assert.match(findWithBlock('@use "b" with ($a: color-mix(in oklch, red, blue));'), /color-mix/)
})
