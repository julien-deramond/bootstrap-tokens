import test from 'node:test'
import assert from 'node:assert/strict'

import { parseMapVariable, parseScalarVariable, entriesToObject, normalizeValue } from '../lib/sass-parser.mjs'

test('parses a flat map declared through defaults()', () => {
  const src = `
    $spacers: () !default;
    $spacers: defaults(
      (
        0: 0,
        1: $spacer * .25,
      ),
      $spacers
    );
  `
  assert.deepEqual(entriesToObject(parseMapVariable(src, '$spacers')), { 0: '0', 1: '$spacer * .25' })
})

test('keeps commas inside function calls out of the entry split', () => {
  const src = `$m: ("a": light-dark(var(--x), var(--y)), "b": color-mix(in oklch, a 50%, b));`
  assert.deepEqual(entriesToObject(parseMapVariable(src, '$m')), {
    a: 'light-dark(var(--x), var(--y))',
    b: 'color-mix(in oklch, a 50%, b)'
  })
})

test('parses nested maps', () => {
  const src = `$m: ("primary": ("base": var(--blue-500), "fg": var(--blue-600)));`
  assert.deepEqual(entriesToObject(parseMapVariable(src, '$m')), {
    primary: { base: 'var(--blue-500)', fg: 'var(--blue-600)' }
  })
})

test('records whether a key was quoted', () => {
  const src = `$m: ("quoted": 1, unquoted: 2, 2xl: 3);`
  const entries = parseMapVariable(src, '$m')
  assert.deepEqual(entries.map((e) => [e.key, e.quoted]), [
    ['quoted', true],
    ['unquoted', false],
    ['2xl', false]
  ])
})

test('ignores commas and colons inside strings and comments', () => {
  const src = `
    $m: (
      // a: commented, out
      "font": "Helvetica, Arial", /* b: also, out */
      "url": url("data:image/svg+xml,<svg/>")
    );
  `
  assert.deepEqual(entriesToObject(parseMapVariable(src, '$m')), {
    font: '"Helvetica, Arial"',
    url: 'url("data:image/svg+xml,<svg/>")'
  })
})

test('reads scalar variables', () => {
  assert.equal(parseScalarVariable('$blue: oklch(60% 0.24 240) !default;', '$blue'), 'oklch(60% 0.24 240)')
})

test('collapses newlines in values but not inside strings', () => {
  assert.equal(normalizeValue('  a\n   b  '), 'a b')
  assert.equal(normalizeValue('"a\n   b"'), '"a\n   b"')
})
