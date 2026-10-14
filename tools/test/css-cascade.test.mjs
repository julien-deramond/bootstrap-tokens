/**
 * The cascade model `verify` compares the preview and the export with. Every rule it applies
 * gets a case here, on hand-written CSS, because a resolver that gets one of them wrong
 * reports a green check for a page that paints something else.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { parseCascade, effective, element, elementsFor, compileSelector, mediaMatches } from '../lib/css-cascade.mjs'

const html = (attributes = {}) => element({ tag: 'html', root: true, attributes })
const body = () => element({ tag: 'body' })
const div = (classes = [], attributes = {}) => element({ classes, attributes })

/** The value of `property` on the last element of `chain`. */
const valueOf = (css, property, chain = [html()], env = { colorScheme: 'light', width: 375 }) =>
  effective(parseCascade(css), property, chain, env)?.value

test('a later layer beats an earlier one, in the order the @layer statement gives', () => {
  const css = `
    @layer low, high;
    @layer high { :root { --x: high; } }
    @layer low { :root { --x: low; } }
  `
  assert.equal(valueOf(css, '--x'), 'high')
})

test('a layer that is not in the statement ranks by first appearance', () => {
  const css = `
    @layer first { :root { --x: first; } }
    @layer second { :root { --x: second; } }
    @layer first { :root { --x: first again; } }
  `
  assert.equal(valueOf(css, '--x'), 'second')
})

test('unlayered beats every layer, whatever the specificity', () => {
  const css = `
    @layer components { html.page[data-x]:root { --x: layered; } }
    :root { --x: unlayered; }
  `
  const page = element({ tag: 'html', root: true, classes: ['page'], attributes: { 'data-x': '' } })
  assert.equal(valueOf(css, '--x', [page]), 'unlayered')
})

test('!important turns the layer order around', () => {
  const css = `
    @layer low, high;
    @layer low { :root { --x: low !important; } }
    @layer high { :root { --x: high !important; } }
    :root { --x: unlayered !important; }
  `
  assert.equal(valueOf(css, '--x'), 'low')
})

test('a declaration directly in a layer beats the layer’s own sub-layers', () => {
  const css = `
    @layer outer { @layer inner { :root { --x: inner; } } :root { --x: outer; } }
  `
  assert.equal(valueOf(css, '--x'), 'outer')
})

test('higher specificity wins within a layer, then source order', () => {
  const chain = [html(), body(), div(['card', 'active'])]
  assert.equal(valueOf('.card.active { --x: two; } .card { --x: one; }', '--x', chain), 'two')
  assert.equal(valueOf('.card { --x: one; } .active { --x: two; }', '--x', chain), 'two')
  // The Bootstrap case: `[data-bs-theme=light]` and `:root` are both 0,1,0, so order decides.
  const pinned = ':root { --x: themed; } [data-bs-theme=light] { --x: pinned; }'
  assert.equal(valueOf(pinned, '--x', [html({ 'data-bs-theme': 'light' })]), 'pinned')
  assert.equal(valueOf(pinned, '--x', [html()]), 'themed')
})

test('media: color scheme and viewport width, any other condition false', () => {
  const css = `
    :root { --x: base; }
    @media (prefers-color-scheme: dark) { :root { --x: dark; } }
    @media (width >= 1024px) { :root { --y: wide; } }
    @media (min-width: 768px) { :root { --z: medium; } }
    @media (prefers-reduced-motion: no-preference) { :root { --x: motion; } }
    @supports (color: red) { :root { --x: supports; } }
    @container (width >= 1px) { :root { --x: container; } }
  `
  assert.equal(valueOf(css, '--x', [html()], { colorScheme: 'light', width: 375 }), 'base')
  assert.equal(valueOf(css, '--x', [html()], { colorScheme: 'dark', width: 375 }), 'dark')
  assert.equal(valueOf(css, '--y', [html()], { width: 375 }), undefined)
  assert.equal(valueOf(css, '--y', [html()], { width: 1024 }), 'wide')
  assert.equal(valueOf(css, '--z', [html()], { width: 768 }), 'medium')
  assert.equal(mediaMatches('(width < 576px)', { width: 375 }), true)
  assert.equal(mediaMatches('(576px <= width < 768px)', { width: 600 }), true)
  assert.equal(mediaMatches('print, (max-width: 400px)', { width: 375 }), true)
  assert.equal(mediaMatches('print', { width: 375 }), false)
})

test('custom properties inherit, unless @property says they do not', () => {
  const css = `
    :root { --x: from-root; --local: from-root; }
    @property --local { syntax: "*"; inherits: false; initial-value: initial; }
  `
  const chain = [html(), body(), div(['card'])]
  assert.equal(valueOf(css, '--x', chain), 'from-root')
  assert.equal(valueOf(css, '--local', chain), 'initial')
})

test('the nearest declaring ancestor decides, not the most specific rule anywhere', () => {
  const css = '.navbar[data-bs-theme=dark] { --x: navbar; } [data-bs-theme=light] { --x: section; }'
  const chain = [html(), div(['navbar'], { 'data-bs-theme': 'dark' }), div([], { 'data-bs-theme': 'light' })]
  assert.equal(valueOf(css, '--x', chain), 'section')
})

test('escaped class names match the class they spell', () => {
  const css = '.drawer, .\\32 xl\\:drawer { --drawer-width: 400px; }'
  assert.equal(valueOf(css, '--drawer-width', [html(), body(), div(['2xl:drawer'])]), '400px')
  assert.deepEqual(compileSelector('.\\32 xl\\:drawer').compounds[0].classes, ['2xl:drawer'])
})

test('attribute selectors, quoted or not, and the child combinator', () => {
  const chain = [html(), div(['tab-content']), div(['tab-pane'], { 'data-vc': 'calendar' })]
  assert.equal(valueOf('[data-vc=calendar] { --x: a; }', '--x', chain), 'a')
  assert.equal(valueOf('[data-vc="calendar"] { --x: b; }', '--x', chain), 'b')
  assert.equal(valueOf('.tab-content > .tab-pane { --x: c; }', '--x', chain), 'c')
  assert.equal(valueOf('html > .tab-pane { --x: d; }', '--x', chain), undefined)
  assert.equal(valueOf('html .tab-pane { --x: e; }', '--x', chain), 'e')
})

test('what a probe cannot be in never matches it', () => {
  const chain = [html(), body(), div(['btn'])]
  for (const selector of [':host', '.btn:hover', '.btn::before', '.btn:not(.active)', 'body + .btn', 'body ~ .btn', '#id']) {
    assert.equal(valueOf(`${selector} { --x: no; }`, '--x', chain), undefined, selector)
  }
  // `:root, :host` still matches through its first half.
  assert.equal(valueOf(':root, :host { --x: yes; }', '--x', [html()]), 'yes')
})

test('values keep their semicolons and braces when they sit inside a string or url()', () => {
  const css = `:root { --icon: url("data:image/svg+xml;charset=utf-8,<svg>{}</svg>"); --next: 1; }`
  assert.equal(valueOf(css, '--icon'), 'url("data:image/svg+xml;charset=utf-8,<svg>{}</svg>")')
  assert.equal(valueOf(css, '--next'), '1')
})

test('@keyframes and @starting-style declare nothing on an element', () => {
  const css = '@keyframes spin { from { --x: frame; } } @starting-style { :root { --x: start; } }'
  assert.equal(valueOf(css, '--x'), undefined)
})

test('elementsFor builds the elements a component selector describes', () => {
  assert.deepEqual(elementsFor('.tab-content > .tab-pane'), [
    { tag: null, classes: ['tab-content'], attributes: {}, root: false },
    { tag: null, classes: ['tab-pane'], attributes: {}, root: false }
  ])
  assert.deepEqual(elementsFor('.navbar[data-bs-theme=dark]'), [
    { tag: null, classes: ['navbar'], attributes: { 'data-bs-theme': 'dark' }, root: false }
  ])
  assert.equal(elementsFor('.btn:hover'), null)
})
