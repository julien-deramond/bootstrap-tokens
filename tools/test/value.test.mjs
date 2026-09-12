import test from 'node:test'
import assert from 'node:assert/strict'

import {
  splitLightDark,
  cssToRefs,
  refsToCss,
  isPureAlias,
  typeLiteral,
  typedToCss,
  unresolvedReferences
} from '../lib/value.mjs'
import { evaluate } from '../lib/tokens.mjs'
import { escapeSvg, evaluateSassFunctions } from '../lib/sass-functions.mjs'

const lookup = (name) => ({ 'blue-500': 'color.blue.500', 'bg-body': 'bg.body' })[name] ?? null

test('splits a whole-value light-dark() pair', () => {
  assert.deepEqual(splitLightDark('light-dark(a, b)'), ['a', 'b'])
})

test('does not split light-dark() nested inside a larger value', () => {
  assert.equal(splitLightDark('inset 0 1px light-dark(a, b)'), null)
  assert.equal(splitLightDark('color-mix(in oklch, light-dark(a, b) 50%, c)'), null)
})

test('rewrites known custom properties into aliases and leaves unknown ones alone', () => {
  assert.equal(
    cssToRefs('color-mix(in oklch, var(--blue-500) 50%, var(--bg-body))', lookup),
    'color-mix(in oklch, {color.blue.500} 50%, {bg.body})'
  )
  assert.equal(cssToRefs('var(--unknown)', lookup), 'var(--unknown)')
})

test('treats Sass interpolation as interpolation, not as an alias', () => {
  assert.equal(isPureAlias('#{"1 / 1"}'), false)
  assert.equal(isPureAlias('{a.b}'), true)
  assert.equal(refsToCss('#{"1 / 1"}', () => 'WRONG'), '#{"1 / 1"}')
})

test('types literals it understands and declines the rest', () => {
  assert.deepEqual(typeLiteral('.5rem'), { $type: 'dimension', $value: { value: 0.5, unit: 'rem' } })
  assert.deepEqual(typeLiteral('cubic-bezier(.22, 1, .36, 1)'), {
    $type: 'cubicBezier',
    $value: [0.22, 1, 0.36, 1]
  })
  assert.equal(typeLiteral('clamp(1rem, 2vw, 2rem)'), null)
})

test('renders dimensions without a leading zero, matching Bootstrap style', () => {
  assert.equal(typedToCss({ $type: 'dimension', $value: { value: 0.25, unit: 'rem' } }), '.25rem')
})

test('evaluates the Sass arithmetic that appears in token values', () => {
  assert.equal(evaluate('1rem * .25'), '.25rem')
  assert.equal(evaluate('1.5rem * .5'), '.75rem')
  assert.equal(evaluate('1rem * -.25'), '-.25rem')
  assert.equal(evaluate('.5rem'), '.5rem')
  assert.equal(evaluate('clamp(1rem, 2vw, 2rem)'), 'clamp(1rem, 2vw, 2rem)')
})

test('flags a reference to a token that does not exist, and only that one', () => {
  const tokens = new Map([['radius.9', {}], ['color.blue.500', {}]])

  assert.deepEqual(unresolvedReferences('{radius.doesnotexist}', tokens), ['radius.doesnotexist'])
  assert.deepEqual(unresolvedReferences('{radius.9}', tokens), [])
  assert.deepEqual(
    unresolvedReferences('color-mix(in oklch, {color.blue.500} 50%, {color.nope})', tokens),
    ['color.nope']
  )
})

test('escape-svg matches the Sass implementation', () => {
  assert.equal(
    escapeSvg(`url("data:image/svg+xml,<svg xmlns='x'><path d='#a'/></svg>")`),
    `url("data:image/svg+xml,%3csvg xmlns='x'%3e%3cpath d='%23a'/%3e%3c/svg%3e")`
  )
  assert.equal(escapeSvg('url("https://example.com/a.svg")'), 'url("https://example.com/a.svg")')
  assert.match(evaluateSassFunctions(`escape-svg(url("data:image/svg+xml,<svg/>"))`), /^url\("data:image\/svg\+xml,%3csvg\/%3e"\)$/)
})
