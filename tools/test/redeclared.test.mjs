/**
 * theme.css and the Theme Builder preview have to land where custom.scss lands: in the layer
 * Bootstrap emits each component map in, on that rule's selectors, with the later rules that
 * re-declare a property repeated after the override. See issue #100.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { annotateCascade, probeOverrides, probedTokens } from '../lib/redeclared.mjs'
import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, diffResolved, themeCss, SHIPPED_PREFIX, redeclaredNote, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { tokensDir } from '../lib/config.mjs'

const NS = 'dev.bootstrap.tokens'

const token = (cssVar, sassMap, $value = 'x') => ({ $value, $extensions: { [NS]: { cssVar, sassMap } } })
const group = (sassMap, selector, tokens) => ({ $extensions: { [NS]: { sassMap, selector } }, ...tokens })

/** Two maps that share `--btn-color`, the shape Bootstrap's buttons have. */
function buttonFiles() {
  return {
    'component/btn.json': {
      btn: group('$button-tokens', '.btn', { color: token('--btn-color', '$button-tokens') })
    },
    'component/button-link.json': {
      'button-link': group('$button-link-tokens', '.btn-link', {
        'btn-color': token('--btn-color', '$button-link-tokens')
      })
    }
  }
}

const probeCss = `
@layer reboot, components, utilities;
@layer components {
  .btn, .btn-solid { --btn-color: var(--bstokens-probe-0); }
  .btn-solid { --btn-color: var(--theme-contrast); }
  .btn-link { --btn-color: var(--bstokens-probe-1); }
  .btn-outline { --btn-color: wins-anyway !important; }
  @media (width >= 1024px) { .btn-lg { --btn-color: wide; } }
  @container (width >= 576px) { .bar .btn { --btn-color: narrow; } }
}
@layer reboot { .btn-reboot { --btn-color: loses-anyway; } }
@layer utilities { .text-btn { --btn-color: wins-anyway; } }
`

test('sync records each map’s layer and rule, and the later rules of that layer', () => {
  const files = buttonFiles()
  const paths = probedTokens(files)
  assert.deepEqual(paths, ['btn.color', 'button-link.btn-color'])

  const { tokenOf } = probeOverrides(paths)
  assert.deepEqual(annotateCascade(files, probeCss, tokenOf), [])

  const btn = files['component/btn.json'].btn
  assert.deepEqual(btn.$extensions[NS].cascade, { layer: 'components', rule: '.btn, .btn-solid' })
  assert.deepEqual(btn.color.$extensions[NS].redeclared, [
    { selector: '.btn-solid', value: 'var(--theme-contrast)' },
    // Written by another map: it carries that token's value, edited or not.
    { selector: '.btn-link', token: 'button-link.btn-color' },
    { selector: '.btn-lg', at: ['@media (width >= 1024px)'], value: 'wide' },
    { selector: '.bar .btn', at: ['@container (width >= 576px)'], value: 'narrow' }
  ])

  const link = files['component/button-link.json']['button-link']
  assert.deepEqual(link.$extensions[NS].cascade, { layer: 'components', rule: '.btn-link' })
  assert.deepEqual(
    link['btn-color'].$extensions[NS].redeclared.map(({ selector }) => selector),
    ['.btn-lg', '.bar .btn']
  )
})

test('a map included twice repeats the edit in its second rule', () => {
  const files = buttonFiles()
  const { tokenOf } = probeOverrides(probedTokens(files))
  const css = `@layer components {
    .btn { --btn-color: var(--bstokens-probe-0); --btn-color: transparent; }
    .btn-plain { --btn-color: var(--bstokens-probe-0); }
    .btn-link { --btn-color: var(--bstokens-probe-1); }
  }`
  annotateCascade(files, css, tokenOf)

  assert.deepEqual(files['component/btn.json'].btn.color.$extensions[NS].redeclared, [
    // The same rule declaring it twice: the second statement wins there, so it is repeated.
    { selector: '.btn', value: 'transparent' },
    { selector: '.btn-plain', token: 'btn.color' },
    { selector: '.btn-link', token: 'button-link.btn-color' }
  ])
})

test('a map emitted nowhere is reported, not guessed', () => {
  const files = buttonFiles()
  const { tokenOf } = probeOverrides(probedTokens(files))
  const problems = annotateCascade(files, '.btn-link { --btn-color: var(--bstokens-probe-1); }', tokenOf)
  assert.deepEqual(problems, [`$button-tokens is emitted on no rule, so theme.css cannot place it in Bootstrap's layers`])
  assert.equal(files['component/btn.json'].btn.$extensions[NS].cascade, undefined)
})

/** What diffResolved hands themeCss for two edits that share a property, and a global one. */
const changes = [
  {
    path: 'btn.color',
    cssVar: '--btn-color',
    value: 'red',
    cascade: { layer: 'components', rule: '.btn, .btn-solid' },
    redeclared: [
      { selector: '.btn-solid', value: 'var(--theme-contrast)' },
      { selector: '.btn-link', token: 'button-link.btn-color', value: 'blue' },
      { selector: '.prose', at: ['@media (width >= 1024px)'], value: 'wide' }
    ]
  },
  {
    path: 'button-link.btn-color',
    cssVar: '--btn-color',
    value: 'blue',
    cascade: { layer: 'components', rule: '.btn-link' },
    redeclared: [{ selector: '.prose', at: ['@media (width >= 1024px)'], value: 'wide' }]
  },
  { path: 'color.blue.500', cssVar: '--blue-500', value: 'green', cascade: null, redeclared: null }
]

test('theme.css puts each override in its layer and repeats the rules that must keep winning', () => {
  assert.equal(
    themeCss(changes),
    `:root {
  --blue-500: green;
}

@layer components {
  .btn, .btn-solid {
    --btn-color: red;
  }

  .btn-link {
    --btn-color: blue;
  }

  /* Bootstrap re-declares these properties in later rules of this layer. Repeated here, they keep winning, as they do in a compiled custom.scss. */
  .btn-solid {
    --btn-color: var(--theme-contrast);
  }

  .btn-link {
    --btn-color: blue;
  }

  @media (width >= 1024px) {
    .prose {
      --btn-color: wide;
    }
  }
}
`
  )
})

test('the scoped preview adds no specificity to component rules', () => {
  const css = themeCss(changes, { scope: '.pane-after' })
  assert.match(css, /^\.pane-after \{\n {2}--blue-500: green;/)
  assert.match(css, /\n {2}:where\(\.pane-after\) \.btn, :where\(\.pane-after\) \.btn-solid \{\n/)
  assert.match(css, /\n {4}:where\(\.pane-after\) \.prose \{\n/)
  assert.doesNotMatch(css, /[^(]\.pane-after \.btn/)
})

test('the downloadable theme.css renames layered overrides and their repeated rules too', () => {
  const css = themeCss(changes, { prefix: SHIPPED_PREFIX })
  assert.match(css, /@layer components \{\n {2}\.btn, \.btn-solid \{\n {4}--bs-btn-color: red;/)
  assert.match(css, /\n {2}\.btn-solid \{\n {4}--bs-btn-color: var\(--bs-theme-contrast\);/)
  assert.match(css, /\n {4}\.prose \{\n {6}--bs-btn-color: wide;/)
  assert.doesNotMatch(css, /(?:^|\s|\()--(?!bs-)[\w-]+/m)
})

const { tree } = loadTree(tokensDir)
const base = index(expandColorScales(clone(tree)))

test('a repeated rule another token writes carries that token’s value, edited or not', () => {
  const alone = diffResolved(base, withOverrides(tree, { 'navbar.color': { value: 'red' } }))
  const [dark] = alone.find(({ path }) => path === 'navbar.color').redeclared
  assert.equal(dark.selector, '.navbar[data-bs-theme=dark]')
  assert.equal(dark.value, base.cssValueOf('navbar-dark.navbar-color'))

  const both = diffResolved(
    base,
    withOverrides(tree, { 'navbar.color': { value: 'red' }, 'navbar-dark.navbar-color': { value: 'pink' } })
  )
  assert.equal(both.find(({ path }) => path === 'navbar.color').redeclared[0].value, 'pink')

  const css = themeCss(both)
  assert.equal(css.match(/--navbar-color: pink;/g).length, 2, 'once as an override, once in its place')
  assert.doesNotMatch(css, /--navbar-color: color-mix/)
})

test('the Theme Builder names the variants an edit does not reach', () => {
  const note = (path) => redeclaredNote(base.tokens.get(path), path)

  assert.equal(
    note('btn.color'),
    'Bootstrap sets --btn-color again on .btn-solid, .btn-outline, .btn-subtle, .btn-text and .btn-link, ' +
      'so this edit does not reach them, here or in your compiled theme. ' +
      'To change .btn-link too, edit button-link.btn-color.'
  )
  assert.equal(
    note('prose.content-font-size'),
    'Bootstrap sets --content-font-size again on .prose when (width >= 1024px), ' +
      'so this edit does not reach it, here or in your compiled theme.'
  )
  // `.form-control-plaintext` includes the same map, so the edit does reach it.
  assert.doesNotMatch(note('form-control.control-fg'), /plaintext/)
  assert.equal(note('alert.gap'), null)
})
