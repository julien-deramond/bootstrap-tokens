import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTokens, ext } from '../lib/tokens.mjs'
import { validate } from '../lib/validate.mjs'
import { tokensDir } from '../lib/config.mjs'
import { emitTokensModule } from '../lib/emit-scss.mjs'

const doc = loadTokens(tokensDir)

test('the committed token document is valid', () => {
  const { errors } = validate(doc)
  assert.deepEqual(errors, [])
})

test('the colour scale is generated, not stored', () => {
  assert.equal(ext(doc.tokens.get('color.blue.500')).generated, 'color-scale')
  assert.equal(doc.cssValueOf('color.blue.500'), 'oklch(60% 0.24 240)')
  assert.equal(
    doc.cssValueOf('color.blue.100'),
    'color-mix(in oklch, var(--white) 80%, oklch(60% 0.24 240))'
  )
})

test('references to tokens that have a custom property stay as var()', () => {
  assert.equal(doc.cssValueOf('theme-color.primary.base'), 'var(--blue-500)')
})

test('references to tokens without a custom property are inlined', () => {
  assert.equal(doc.cssValueOf('spacing.4'), '1rem')
  assert.equal(doc.cssValueOf('spacing.1'), '.25rem')
})

test('light/dark pairs round-trip through the dark extension', () => {
  assert.equal(
    doc.cssValueOf('theme-color.primary.fg'),
    'light-dark(var(--blue-600), var(--blue-400))'
  )
})

test('every component map upstream declares is present', () => {
  const maps = new Set([...doc.byMap.keys()].filter((name) => name.endsWith('-tokens')))
  assert.ok(maps.has('$alert-tokens'))
  assert.ok(maps.has('$button-tokens'))
  assert.ok(maps.size >= 55, `expected 55+ component maps, found ${maps.size}`)
})

test('the emitted Sass module reproduces upstream map shapes', () => {
  const scss = emitTokensModule(doc, { version: 'test' })
  assert.match(scss, /\$colors: \(\n {2}"blue": oklch\(60% 0\.24 240\)/)
  assert.match(scss, /\$breakpoints: \(\n {2}xs: 0/)
  assert.match(scss, /2xl: 1536px/)
  assert.doesNotMatch(scss, /"2xl": 1536px/)
  assert.match(scss, /--alert-gap: var\(--spacer-3\)/)
})
