/**
 * The colour maths behind the chooser's picker and its contrast readings.
 *
 * Bootstrap v6 authors deliberately saturated hues — `oklch(60% 0.24 240)` is outside sRGB —
 * so the interesting property is not "does it convert" but "what does it do when it cannot".
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { oklchToRgb, rgbToOklch, rgbToHex, hexToRgb, formatColor, parseComputedColor } from '../lib/color.mjs'

/** Bootstrap's actual base hues, from tokens/primitive/color.json. */
const HUES = {
  blue: { l: 0.6, c: 0.24, h: 240 },
  yellow: { l: 0.88, c: 0.24, h: 88 },
  green: { l: 0.64, c: 0.22, h: 160 },
  lime: { l: 0.65, c: 0.24, h: 135 },
  cyan: { l: 0.69, c: 0.22, h: 220 },
  indigo: { l: 0.56, c: 0.26, h: 288 },
  pink: { l: 0.6, c: 0.22, h: 4 }
}

test('out-of-gamut colours keep their hue and lightness', () => {
  // Clamping each channel independently instead moved blue 14 degrees towards violet,
  // which silently rewrote the palette whenever the picker was touched.
  for (const [name, color] of Object.entries(HUES)) {
    const back = rgbToOklch(oklchToRgb(color))
    const hueShift = Math.abs(((back.h - color.h + 540) % 360) - 180)

    assert.ok(hueShift < 1, `${name}: hue moved ${hueShift.toFixed(1)}°`)
    assert.ok(Math.abs(back.l - color.l) < 0.01, `${name}: lightness moved ${(back.l - color.l).toFixed(3)}`)
  }
})

test('gamut mapping only ever reduces chroma', () => {
  for (const [name, color] of Object.entries(HUES)) {
    const back = rgbToOklch(oklchToRgb(color))
    assert.ok(back.c <= color.c + 0.005, `${name}: chroma grew to ${back.c.toFixed(3)}`)
  }
})

test('colours already inside sRGB are left alone', () => {
  const inGamut = { l: 0.6, c: 0.08, h: 200 }
  const back = rgbToOklch(oklchToRgb(inGamut))

  assert.ok(Math.abs(back.c - inGamut.c) < 0.005)
  assert.ok(Math.abs(back.l - inGamut.l) < 0.005)
})

test('greys survive the round trip without acquiring a hue', () => {
  for (const grey of [[0, 0, 0], [128, 128, 128], [255, 255, 255]]) {
    const { c } = rgbToOklch(grey)
    assert.ok(c < 1e-6, `expected no chroma, got ${c}`)
    assert.deepEqual(oklchToRgb(rgbToOklch(grey)), grey)
  }
})

test('hex conversion round-trips', () => {
  assert.deepEqual(hexToRgb('#7952b3'), [121, 82, 179])
  assert.deepEqual(hexToRgb('#abc'), [170, 187, 204])
  assert.equal(rgbToHex([121, 82, 179]), '#7952b3')
})

test('a value is reformatted in the notation it was authored in', () => {
  // Writing hex back into a token authored in oklch() would quietly change colour space.
  assert.match(formatColor([121, 82, 179], 'oklch(60% 0.24 240)'), /^oklch\([\d.]+% [\d.]+ [\d.]+\)$/)
  assert.equal(formatColor([121, 82, 179], '#0d6efd'), '#7952b3')
})

test('computed colours are parsed in every notation a browser may return', () => {
  assert.deepEqual(parseComputedColor('rgb(121, 82, 179)'), [121, 82, 179])
  assert.deepEqual(parseComputedColor('rgb(121 82 179 / 0.5)'), [121, 82, 179])
  assert.deepEqual(parseComputedColor('color(srgb 0 0.5 1)'), [0, 128, 255])
  assert.deepEqual(parseComputedColor('oklch(0.6 0.08 200)'), oklchToRgb({ l: 0.6, c: 0.08, h: 200 }))
  assert.deepEqual(parseComputedColor('oklch(60% 0.08 200)'), oklchToRgb({ l: 0.6, c: 0.08, h: 200 }))
  assert.equal(parseComputedColor('not a colour'), null)
})
