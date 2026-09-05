import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { tokensDir, repoRoot } from '../lib/config.mjs'
import { flattenColors, computeColor, declaredMoreThanOnce } from '../lib/flatten.mjs'
import { parseColor, mixColors, toHex, parseComputedColor, rgbToHex } from '../lib/color.mjs'

const doc = loadTokens(tokensDir)
const chrome = JSON.parse(
  readFileSync(join(repoRoot, 'tools', 'test', 'fixtures', 'chrome-colors.json'), 'utf8')
)

/*
 * The point of this file. Everything else here proves we copied Bootstrap correctly; this
 * proves the flattened export is the colour a user actually sees, by comparing against what
 * a browser computed for the same token. The fixture records Chrome's answers so CI can
 * check it without one — see the file's own $comment for how it was measured.
 */
for (const mode of ['light', 'dark']) {
  test(`flattened ${mode} colours match what Chrome computed`, () => {
    const { colors } = flattenColors(doc, { mode })
    const wrong = []
    for (const [path, expected] of Object.entries(chrome[mode])) {
      const ours = colors.get(path)
      if (ours !== expected) wrong.push(`${path}: browser ${expected}, ours ${ours}`)
    }
    assert.deepEqual(wrong, [])
  })
}

test('mixing happens in OKLCH, not through sRGB', () => {
  // blue.500 is outside sRGB on purpose. Gamut-mapping it before the mix loses chroma the
  // mix was meant to keep, and Chrome does not: blue.400 is #00a2ee, not a washed-out blue.
  const white = parseColor('#fff')
  const blue = parseColor('oklch(60% 0.24 240)')
  assert.equal(toHex(mixColors(white, blue, 0.2)), '#00a2ee')
  assert.equal(toHex(mixColors(white, blue, 0.8)), '#cce9ff')
})

test('a mix with transparent keeps the other colour and takes its alpha', () => {
  assert.equal(toHex(mixColors(parseColor('#fff'), parseColor('transparent'), 0.55)), '#ffffff8c')
})

test('an omitted weight is whatever the other one leaves over', () => {
  const lookup = () => null
  assert.equal(
    toHex(computeColor('color-mix(in oklch, #fff, #000)', { lookup })),
    toHex(computeColor('color-mix(in oklch, #fff 50%, #000)', { lookup }))
  )
})

test('light-dark() picks by mode, and var() follows the document', () => {
  const lookup = (property) => (property === '--x' ? 'light-dark(#fff, #000)' : null)
  assert.equal(toHex(computeColor('var(--x)', { lookup, mode: 'light' })), '#ffffff')
  assert.equal(toHex(computeColor('var(--x)', { lookup, mode: 'dark' })), '#000000')
  assert.equal(computeColor('var(--missing)', { lookup }), null)
  assert.equal(toHex(computeColor('var(--missing, #abc)', { lookup })), '#aabbcc')
})

test('a var() cycle resolves to nothing rather than hanging', () => {
  const lookup = (property) => (property === '--a' ? 'var(--b)' : 'var(--a)')
  assert.equal(computeColor('var(--a)', { lookup }), null)
})

test('values a browser cannot compute statically are skipped with a reason', () => {
  const { skipped } = flattenColors(doc)
  assert.match(skipped.get('badge.color'), /inherit/)
  assert.equal(skipped.get('navbar-dark.navbar-color'), 'is invalid CSS upstream (BACKLOG U6)')
})

test('context-dependent values are named, not silently resolved', () => {
  // `--nav-link-color` is declared by both `.nav` and `.navbar-nav`; in CSS the nearest
  // ancestor wins, and a flat file has no ancestors.
  assert.ok(declaredMoreThanOnce(doc).size > 30)
  const { contextual } = flattenColors(doc)
  assert.deepEqual(contextual.get('navbar-nav.nav-link-color'), ['--navbar-color'])
})

test('parseComputedColor reads CSS Color 4 `none` components', () => {
  assert.equal(rgbToHex(parseComputedColor('oklch(0.999994 0.0000497986 none / 0.55)')), '#ffffff')
})
