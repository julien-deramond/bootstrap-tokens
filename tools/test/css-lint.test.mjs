import test from 'node:test'
import assert from 'node:assert/strict'

import { lintValue, splitTopLevel } from '../lib/css-lint.mjs'
import { loadTokens } from '../lib/load-fs.mjs'
import { validate } from '../lib/validate.mjs'
import { tokensDir } from '../lib/config.mjs'

test('a bare color-mix() weight is reported, a percentage is not', () => {
  assert.equal(lintValue('color-mix(in oklch, var(--white) .55, transparent)').length, 1)
  assert.match(lintValue('color-mix(in oklch, var(--white) .55, transparent)')[0], /55%/)
  assert.deepEqual(lintValue('color-mix(in oklch, var(--white) 55%, transparent)'), [])
})

test('a weight above 1 is suggested as-is rather than multiplied', () => {
  assert.match(lintValue('color-mix(in oklch, red 55, blue)')[0], /55%/)
})

test('numbers that are not weights are left alone', () => {
  // Alpha inside a nested colour, and a plain omitted weight, are both legal.
  assert.deepEqual(lintValue('light-dark(rgb(0 0 0 / 50%), rgb(0 0 0 / 65%))'), [])
  assert.deepEqual(lintValue('color-mix(in oklch, currentcolor, transparent)'), [])
  assert.deepEqual(lintValue('cubic-bezier(.25, .1, .25, 1)'), [])
})

test('splitTopLevel ignores commas inside parentheses', () => {
  assert.deepEqual(splitTopLevel('in oklch, rgb(1, 2, 3) 50%, blue'), [
    'in oklch',
    ' rgb(1, 2, 3) 50%',
    ' blue'
  ])
})

test('the document carries exactly the four known upstream findings', () => {
  // If this number moves, either upstream fixed the navbar or something new broke. Both are
  // worth being told about, which is the point of pinning it.
  const { findings } = validate(loadTokens(tokensDir))
  assert.equal(findings.length, 4)
  assert.ok(findings.every((finding) => finding.startsWith('navbar-dark.')))
})
