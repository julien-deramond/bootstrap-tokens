/**
 * `verify` compares what the preview paints with what the Sass export compiles to, on a
 * real page. These cases run the comparison on hand-written stylesheets that reproduce the
 * shapes Bootstrap ships, so they need no Bootstrap checkout.
 *
 * The reference side is built the way `verify` builds it: an "upstream" stylesheet, then
 * the real `themeCss()` for the theme, which is what the Theme Builder injects.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, diffResolved, themeCss, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { tokensDir } from '../lib/config.mjs'
import { comparePreview, describeDifferences } from '../commands/verify.mjs'

const { tree } = loadTree(tokensDir)
const base = index(expandColorScales(clone(tree)))

/** Bootstrap's shape for `--shadow-strength`: a root value, pinned again per color scheme. */
const shadowUpstream = (strength) => `
@layer colors, config, root, components;
:root, :host { --shadow-strength: ${strength}; }
@media (prefers-color-scheme: dark) { :root, :host { --shadow-strength: 2.4; } }
[data-bs-theme=dark] { --shadow-strength: 2.4; }
[data-bs-theme=light] { --shadow-strength: 1; }
`

const preview = (upstream, overrides) => {
  const themed = withOverrides(tree, overrides)
  return { themed, reference: `${upstream}\n${themeCss(diffResolved(base, themed))}` }
}

test('a Shadow depth that never reaches a page with data-bs-theme="light" fails', () => {
  const { themed, reference } = preview(shadowUpstream(1), { 'elevation.strength': { value: '.5' } })
  // What `@use … with ()` compiles to without the companion block.
  const compiled = shadowUpstream('.5')

  const { failures } = comparePreview(reference, compiled, themed)
  assert.ok(failures.length > 0)
  assert.ok(failures.every(({ property }) => property === '--shadow-strength'))

  const lines = describeDifferences(failures)
  assert.equal(
    lines[0],
    '--shadow-strength (elevation.strength) on <html data-bs-theme="light">: ' +
      'preview .5 from [data-bs-theme="light"], compiled 1 from [data-bs-theme=light]'
  )
})

test('the companion block custom.scss carries makes the same theme pass', () => {
  const { themed, reference } = preview(shadowUpstream(1), { 'elevation.strength': { value: '.5' } })
  const compiled = `${shadowUpstream('.5')}\n[data-bs-theme="light"] { --shadow-strength: .5; }\n`

  const { failures, warnings, counts } = comparePreview(reference, compiled, themed)
  assert.deepEqual(failures, [])
  assert.deepEqual(warnings, [])
  assert.ok(counts.properties > 1000, 'every token is compared, not only the changed one')
})

test('dark mode keeps upstream’s pinned value on both sides, so it is not a difference', () => {
  // A predicted-value comparison would expect .5 everywhere and fail here.
  const { themed, reference } = preview(shadowUpstream(1), { 'elevation.strength': { value: '.5' } })
  const compiled = `${shadowUpstream('.5')}\n[data-bs-theme="light"] { --shadow-strength: .5; }\n`
  const { failures } = comparePreview(reference, compiled, themed)
  assert.ok(!failures.some(({ page }) => page.attribute === 'dark' || (page.os === 'dark' && !page.attribute)))
})

test('an export that changes more than the preview showed fails too', () => {
  const upstream = '@layer root; @layer root { :root, :host { --spacer: 1rem; --body-font-size: 1rem; } }'
  const { themed, reference } = preview(upstream, {})
  const compiled = '@layer root; @layer root { :root, :host { --spacer: 1rem; --body-font-size: 2rem; } }'
  const { failures } = comparePreview(reference, compiled, themed)
  assert.ok(failures.some(({ property }) => property === '--body-font-size'))
})

/** Bootstrap's shape for components: the base, a dark variant, modifiers, a wide-screen rule. */
const componentUpstream = (color) => `
@layer components;
@layer components {
  .navbar { --navbar-color: ${color}; }
  .navbar[data-bs-theme=dark] { --navbar-color: white; }
  .btn { --btn-color: ${color}; }
  .btn-solid { --btn-color: var(--theme-contrast); }
  .btn:hover { --btn-color: hover; }
  .prose { --content-font-size: ${color === 'red' ? '1.25rem' : '1rem'}; }
  @media (width >= 1024px) { .prose { --content-font-size: var(--font-size-md); } }
}
`

test('a navbar color fails on the dark navbar; button modifiers and wide prose only warn', () => {
  const overrides = {
    'navbar.color': { value: 'red' },
    'btn.color': { value: 'red' },
    'prose.content-font-size': { value: '1.25rem' }
  }
  const { themed, reference } = preview(componentUpstream('gray'), overrides)
  const compiled = componentUpstream('red')

  const { failures, warnings } = comparePreview(reference, compiled, themed)

  const failing = describeDifferences(failures)
  assert.equal(failing.length, 1)
  assert.match(failing[0], /^--navbar-color \(.*navbar\.color.*\) on <div class="navbar" data-bs-theme="dark">, in every page context: preview red from \.navbar, compiled white from \.navbar\[data-bs-theme=dark\]$/)

  const warning = describeDifferences(warnings)
  assert.ok(warning.some((line) => line.startsWith('--btn-color (btn.color) on <div class="btn btn-solid">')))
  assert.ok(warning.some((line) => /^--content-font-size \(prose\.content-font-size\) on <div class="prose">.* at 1024px wide/.test(line)))
  // `:hover` is not something a probe can be in.
  assert.ok(!warning.some((line) => line.includes('hover')))
})

test('identical stylesheets compare clean', () => {
  const css = `${shadowUpstream(1)}\n${componentUpstream('gray')}`
  const { failures, warnings, counts } = comparePreview(css, css, base)
  assert.deepEqual(failures, [])
  assert.deepEqual(warnings, [])
  assert.ok(counts.comparisons > counts.properties)
})
