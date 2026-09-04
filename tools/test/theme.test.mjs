/**
 * End-to-end: an edit made the way the chooser makes it must compile, through Sass, into
 * the CSS the chooser previewed. Skipped when no Bootstrap checkout is available.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTree } from '../lib/load-fs.mjs'
import { withOverrides, themeScss, themeCss, diffResolved, mapsTouched, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'

const { tree } = loadTree(tokensDir)
const base = index(expandColorScales(clone(tree)))

const OVERRIDES = {
  'color.blue.base': { value: 'oklch(58% 0.19 28)' },
  'spacing.base': { value: '1.25rem' },
  'alert.border-radius': { value: '{radius.9}' }
}

const themed = withOverrides(tree, OVERRIDES)

test('an override reaches every token derived from it', () => {
  assert.equal(themed.cssValueOf('color.blue.500'), 'oklch(58% 0.19 28)')
  assert.equal(themed.cssValueOf('spacing.1'), '.3125rem')
  assert.equal(themed.cssValueOf('spacing.9'), '3.75rem')
  assert.equal(themed.cssValueOf('alert.border-radius'), 'var(--radius-9)')
})

test('only the edited maps are exported, not everything they move', () => {
  const maps = mapsTouched(themed, OVERRIDES)
  assert.deepEqual([...maps].sort(), ['$alert-tokens', '$colors', '$spacer'])
  // $spacers follows from $spacer inside Bootstrap; re-emitting it would be noise.
  assert.ok(!maps.has('$spacers'))
})

test('the runtime CSS lands on the right selectors', () => {
  const css = themeCss(diffResolved(base, themed))
  assert.match(css, /:root \{[\s\S]*--blue-500: oklch\(58% 0\.19 28\)/)
  assert.match(css, /\.alert \{[\s\S]*--alert-border-radius: var\(--radius-9\)/)
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout — the compile test below is skipped */
}

test('the exported custom.scss compiles to the previewed values', { skip: !source }, async () => {
  const sass = await import('sass')
  const work = mkdtempSync(join(tmpdir(), 'bstokens-theme-'))
  const entry = join(work, 'custom.scss')

  writeFileSync(
    entry,
    themeScss(themed, OVERRIDES, { version: 'test', importPath: join(source, 'scss', 'bootstrap') })
  )

  const { css } = sass.compile(entry, { loadPaths: [source], style: 'expanded' })

  // Sass normalises a bare hue to `deg` on output; both compile paths do it alike.
  assert.match(css, /--blue-500: oklch\(58% 0\.19 28deg\)/)
  assert.match(css, /--spacer-4: 1\.25rem/)
  assert.match(css, /--spacer-1: 0\.3125rem/)
  assert.match(css, /--alert-border-radius: var\(--radius-9\)/)
  // Untouched tokens keep upstream's values.
  assert.match(css, /--green-500: oklch\(64% 0\.22 160deg\)/)
})
