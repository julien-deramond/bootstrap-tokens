import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

test('the document carries exactly the known upstream findings', () => {
  // If these move, either upstream fixed something or something new broke. Both are worth
  // being told about, which is the point of pinning them.
  const doc = loadTokens(tokensDir)
  const declared = new Set(
    JSON.parse(readFileSync(join(tokensDir, 'meta.json'), 'utf8')).declaredCustomProperties
  )

  const { findings } = validate(doc)
  assert.equal(findings.length, 4, 'four invalid color-mix() weights (BACKLOG U6)')
  assert.ok(findings.every((finding) => finding.startsWith('navbar-dark.')))

  const withDeclarations = validate(doc, { declared }).findings
  assert.equal(withDeclarations.length, 7, 'plus three dangling references (BACKLOG U7)')
  assert.deepEqual(
    withDeclarations.filter((f) => f.includes('never declares')).map((f) => f.split(':')[0]),
    ['btn.font-weight', 'nav-tabs.link-active-color', 'nav-underline.link-active-color']
  )
})
