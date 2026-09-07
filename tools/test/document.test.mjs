import test from 'node:test'
import assert from 'node:assert/strict'

import { ext, walk } from '../lib/tokens.mjs'
import { loadTokens } from '../lib/load-fs.mjs'
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
  assert.equal(doc.cssValueOf('spacing.4'), '.75rem')
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

test('every token is typed, or explicitly marked as raw CSS', () => {
  // A wrong `$type` is worse than a missing one: a tool that trusts `dimension` on `10%`
  // mis-parses it, while a tool that sees no type knows it does not know.
  const unclassified = []
  for (const [path, token] of walk(doc.tree)) {
    if (token.$type || ext(token).css || ext(token).generated) continue
    unclassified.push(path)
  }
  assert.deepEqual(unclassified, [])
})

test('the raw-CSS escape hatch stays small', () => {
  // If this grows a lot, the typing rules have stopped keeping up rather than Bootstrap
  // having gained that many untypeable values.
  let escaped = 0
  let total = 0
  for (const [, token] of walk(doc.tree)) {
    if (ext(token).generated) continue
    total++
    if (!token.$type && ext(token).css) escaped++
  }
  assert.ok(escaped / total < 0.08, `${escaped} of ${total} tokens are untyped`)
})

test('composite types are used where the value permits', () => {
  assert.equal(doc.tokens.get('shadow.lg').$type, 'shadow')
  assert.equal(doc.tokens.get('focus.ring').$type, 'border')
  assert.equal(doc.tokens.get('decoration.gradient').$type, 'gradient')
  assert.equal(doc.tokens.get('border.body').$type, 'color')
  assert.equal(doc.tokens.get('border.width').$type, 'dimension')
})
