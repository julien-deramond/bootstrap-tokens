/**
 * Every Simple-mode preset has to pass the same accessibility gate CI applies to stock
 * Bootstrap. A preset is a bundle of dial positions, so it is turned into the overrides the
 * Theme Builder would export and then run through `bstokens report --fail-on`. A dial that
 * quietly made a preset unreadable would otherwise only show up in someone's browser.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTree, loadTokens } from '../lib/load-fs.mjs'
import { index, authoredValue } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { flattenColors } from '../lib/flatten.mjs'
import { hexToRgb, contrastRatio } from '../lib/color.mjs'
import { clone } from '../lib/overrides.mjs'
import { tokensDir } from '../lib/config.mjs'
import { report } from '../commands/report.mjs'
import { DIALS, PRESETS, hueOfRole, repointRole, repairContrast } from '../../web/easy.js'

const { tree } = loadTree(tokensDir)
const doc = index(expandColorScales(clone(tree)))
const base = loadTokens(tokensDir)
const read = (path, side = 'value') => authoredValue(doc.tokens.get(path), side)
const { colors } = flattenColors(doc)
const work = mkdtempSync(join(tmpdir(), 'bstokens-presets-'))

/** Same rule as the Theme Builder: the text on a role's fill is chosen by measured contrast. */
function contrastFor(hue) {
  const fill = colors.get(`color.${hue}.500`)
  if (!fill) return '{color.white}'
  const dark = colors.get('color.gray.900') ?? '#111111'
  const onWhite = contrastRatio(hexToRgb(fill), [255, 255, 255])
  return onWhite >= contrastRatio(hexToRgb(fill), hexToRgb(dark)) ? '{color.white}' : '{color.gray.900}'
}

/** What applying a preset overrides, as `applyPreset` in web/app.js computes it. */
function presetOverrides(preset) {
  const overrides = {}

  for (const dial of DIALS) {
    const choice = preset.dials[dial.id]
    if (!choice) continue

    if (dial.kind === 'hue') {
      const fromHue = hueOfRole(doc, dial.role, read)
      Object.assign(overrides, repointRole(doc, dial.role, fromHue, choice, { read, contrastFor }))
      continue
    }
    const option = dial.options.find((candidate) => candidate.label === choice)
    if (option) Object.assign(overrides, option.values)
  }

  return { ...overrides, ...repairContrast(tree, base, overrides) }
}

/** Run the report command on a theme with the given gates, quietly; returns its exit code. */
async function gate(name, overrides, failOn) {
  const theme = join(work, `${name}.json`)
  writeFileSync(theme, JSON.stringify({ format: 'bootstrap-tokens-theme@1', name, overrides }))

  const { log, error } = console
  const write = process.stdout.write.bind(process.stdout)
  Object.assign(console, { log: () => {}, error: () => {} })
  process.stdout.write = () => true
  try {
    return await report({ flags: { theme, out: join(work, `${name}.md`), 'fail-on': failOn } })
  } finally {
    Object.assign(console, { log, error })
    process.stdout.write = write
  }
}

for (const preset of PRESETS) {
  test(`preset "${preset.id}" introduces no contrast or status-color defects`, async () => {
    const overrides = presetOverrides(preset)
    for (const failOn of ['introduced', 'vision']) {
      assert.equal(await gate(preset.id, overrides, failOn), 0, `${preset.id} fails --fail-on ${failOn}`)
    }
  })
}

test('the gate catches a preset made low-contrast', async () => {
  const overrides = {
    ...presetOverrides(PRESETS.find((preset) => preset.id === 'soft')),
    'theme-color.primary.contrast': { value: '{color.yellow.300}' }
  }
  assert.equal(await gate('low-contrast', overrides, 'introduced'), 1)
})

test('the contrast repair leaves what Bootstrap ships alone', () => {
  // Stock blue already misses AA on its link and button text; that is Bootstrap's to answer for.
  assert.deepEqual(repairContrast(tree, base, {}), {})
})

test('the contrast repair keeps every preset on the hues it picked', () => {
  for (const preset of PRESETS) {
    const overrides = presetOverrides(preset)
    const allowed = new Set(['gray', 'white', 'black', ...Object.values(preset.dials)])
    for (const [path, entry] of Object.entries(overrides)) {
      for (const value of [entry.value, entry.dark]) {
        for (const [, hue] of String(value ?? '').matchAll(/\{color\.([\w-]+)[.}]/g)) {
          assert.ok(allowed.has(hue), `${preset.id}: ${path} uses ${hue}`)
        }
      }
    }
  }
})
