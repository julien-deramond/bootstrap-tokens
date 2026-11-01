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

import { join } from 'node:path'

import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, diffResolved, themeCss, themeScss, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'
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

  const { failures, counts } = comparePreview(reference, compiled, themed)
  assert.deepEqual(failures, [])
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

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no Bootstrap to compile — the tests on its real output are skipped */
}

/** Compiled Bootstrap, and the same Bootstrap compiled with a theme's custom.scss. */
async function compileBoth(overrides) {
  const sass = await import('sass')
  const themed = withOverrides(tree, overrides)
  const options = { loadPaths: [source], style: 'expanded' }
  const upstream = sass.compile(join(source, 'scss', 'bootstrap.scss'), options).css
  const scss = themeScss(themed, overrides, { version: 'test', importPath: join(source, 'scss', 'bootstrap') })
  return { themed, upstream, compiled: sass.compileString(scss, options).css }
}

/** The four edits issue #100 reported, each re-declared by variants or a wider viewport. */
const VARIANTS = {
  'btn.color': { value: 'red' },
  'chip.bg': { value: 'red' },
  'navbar.color': { value: 'red' },
  'prose.content-font-size': { value: '99px' }
}

test('component edits reach the variants custom.scss reaches, and no others', { skip: !source }, async () => {
  const { themed, upstream, compiled } = await compileBoth(VARIANTS)
  const reference = `${upstream}\n${themeCss(diffResolved(base, themed))}`

  const { failures, counts } = comparePreview(reference, compiled, themed)
  assert.deepEqual(describeDifferences(failures), [])
  assert.ok(counts.modifiers > 50, 'modifier classes are compared')
  assert.ok(counts.widths.includes(1024), 'the wide-screen prose rule is compared')
})

test('overrides painted unlayered, as the preview once did, fail on variants and wide screens', { skip: !source }, async () => {
  const { themed, upstream, compiled } = await compileBoth(VARIANTS)
  const unlayered = `.btn { --btn-color: red; }\n.chip { --chip-bg: red; }\n.navbar { --navbar-color: red; }\n.prose { --content-font-size: 99px; }`

  const lines = describeDifferences(comparePreview(`${upstream}\n${unlayered}`, compiled, themed).failures)
  assert.ok(lines.some((line) => line.startsWith('--btn-color (btn.color) on <div class="btn btn-solid">')))
  assert.ok(lines.some((line) => line.startsWith('--chip-bg (chip.bg) on <div class="active chip">')))
  assert.ok(lines.some((line) => /^--navbar-color \(.*navbar\.color.*\) on <div class="navbar" data-bs-theme="dark">/.test(line)))
  assert.ok(lines.some((line) => /^--content-font-size \(prose\.content-font-size\) on <div class="prose">.* at .*1024.*px wide/.test(line)))
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

test('identical stylesheets compare clean', () => {
  const css = `${shadowUpstream(1)}\n${componentUpstream('gray')}`
  const { failures, counts } = comparePreview(css, css, base)
  assert.deepEqual(failures, [])
  assert.ok(counts.comparisons > counts.properties)
})
