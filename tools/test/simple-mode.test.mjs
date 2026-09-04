/**
 * Simple mode's dials are a view over the same override model Advanced mode edits, so the
 * transform they apply has to be exactly right — a wrong substitution here would silently
 * produce a half-recoloured theme.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTree } from '../lib/load-fs.mjs'
import { index, authoredValue } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { clone, withOverrides } from '../lib/overrides.mjs'
import { tokensDir } from '../lib/config.mjs'
import { DIALS, PRESETS, HUES, hueOfRole, repointRole, selectedOption } from '../../web/easy.js'

const { tree } = loadTree(tokensDir)
const doc = index(expandColorScales(clone(tree)))

const read = (path, side = 'value') => authoredValue(doc.tokens.get(path), side)

test('every dial targets tokens that exist', () => {
  for (const dial of DIALS) {
    if (dial.kind === 'hue') {
      assert.ok(doc.tokens.has(`theme-color.${dial.role}.base`), `${dial.id}: missing role`)
      continue
    }
    for (const option of dial.options) {
      for (const path of Object.keys(option.values)) {
        assert.ok(doc.tokens.has(path), `${dial.id}: ${path} is not a token`)
      }
    }
  }
})

test('every dial has a position matching stock Bootstrap', () => {
  for (const dial of DIALS.filter((d) => d.kind === 'choice')) {
    assert.ok(selectedOption(dial, read), `${dial.id} does not match the default token values`)
  }
})

test('every preset names real dials and real options', () => {
  for (const preset of PRESETS) {
    for (const [id, choice] of Object.entries(preset.dials)) {
      const dial = DIALS.find((d) => d.id === id)
      assert.ok(dial, `${preset.id}: no dial "${id}"`)

      if (dial.kind === 'hue') assert.ok(HUES.includes(choice), `${preset.id}: "${choice}" is not a hue`)
      else assert.ok(dial.options.some((o) => o.label === choice), `${preset.id}: no option "${choice}"`)
    }
  }
})

test('primary is built from the blue scale out of the box', () => {
  assert.equal(hueOfRole(doc, 'primary', read), 'blue')
  assert.equal(hueOfRole(doc, 'accent', read), 'indigo')
})

test('repointing a role rewrites every sub-key, light and dark', () => {
  const values = repointRole(doc, 'primary', 'blue', 'green', {
    read,
    contrastFor: () => '{color.white}'
  })

  assert.equal(values['theme-color.primary.base'].value, '{color.green.500}')
  assert.equal(values['theme-color.primary.bg-subtle'].value, '{color.green.100}')
  assert.equal(values['theme-color.primary.bg-subtle'].dark, '{color.green.900}')
  assert.equal(
    values['theme-color.primary.focus-ring'].value,
    'color-mix(in oklch, {color.green.500} 50%, {bg.body})'
  )

  // No reference to the old scale may survive anywhere.
  for (const entry of Object.values(values)) {
    assert.doesNotMatch(String(entry.value ?? ''), /color\.blue\./)
    assert.doesNotMatch(String(entry.dark ?? ''), /color\.blue\./)
  }
})

test('contrast is chosen, not substituted', () => {
  // `contrast` names the text placed on the fill. Substituting it would give
  // `{color.yellow.white}`; picking it by measured contrast is the whole point.
  const values = repointRole(doc, 'primary', 'blue', 'yellow', {
    read,
    contrastFor: (hue) => (hue === 'yellow' ? '{color.gray.900}' : '{color.white}')
  })
  assert.equal(values['theme-color.primary.contrast'].value, '{color.gray.900}')
})

test('a repointed role resolves to the new scale', () => {
  const values = repointRole(doc, 'primary', 'blue', 'green', { read, contrastFor: () => '{color.white}' })
  const themed = withOverrides(tree, values)

  assert.equal(themed.cssValueOf('theme-color.primary.base'), 'var(--green-500)')
  assert.equal(themed.cssValueOf('theme-color.primary.fg'), 'light-dark(var(--green-600), var(--green-400))')
})
