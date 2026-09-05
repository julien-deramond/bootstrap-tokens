/**
 * Colour-vision simulation, as a check rather than a demonstration.
 *
 * The preview can show you a theme through someone else's eyes, which is useful and easy to
 * forget to do. What it cannot do is tell you, without you noticing, that success and danger
 * have become the same button. Contrast survives colour blindness almost unchanged — a
 * palette can clear every ratio in the report and still collapse into one colour for around
 * eight percent of men — so that has to be measured separately.
 *
 * These are the Viénot/Brettel approximations, applied in *linear* light. That matters: the
 * matrices are derived for linear RGB, and SVG filters default to `linearRGB`, so doing it
 * this way is both correct and identical to what the preview draws. Applying them to
 * gamma-encoded values, as many copied-around versions of these filters do, understates the
 * loss — it makes a palette look more distinguishable than it is.
 */

import { rgbToOklch } from './color.mjs'

export const VISIONS = {
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758]
  ],
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7]
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525]
  ],
  achromatopsia: [
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114]
  ]
}

const clamp01 = (n) => Math.min(1, Math.max(0, n))
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB 0–255 through one simulation matrix, back to sRGB 0–255. */
export function simulate(rgb, kind) {
  const matrix = VISIONS[kind]
  if (!matrix) return rgb

  const linear = rgb.map((channel) => toLinear(channel / 255))
  return matrix.map((row) =>
    Math.round(clamp01(toGamma(clamp01(row.reduce((sum, k, i) => sum + k * linear[i], 0)))) * 255)
  )
}

/**
 * How far apart two colours are, in a space where equal distances look equally different.
 *
 * Euclidean distance in OKLab, which is what ΔEok is. Doing this in sRGB would call a
 * dark blue and a dark green "far apart" because the numbers are, and they are not.
 */
export function difference(a, b) {
  const one = rgbToOklch(a)
  const two = rgbToOklch(b)
  const radians = (degrees) => (degrees * Math.PI) / 180
  const ab = ({ l, c, h }) => [l, c * Math.cos(radians(h)), c * Math.sin(radians(h))]
  const [l1, a1, b1] = ab(one)
  const [l2, a2, b2] = ab(two)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/**
 * Below this, two colours are the same colour for practical purposes.
 *
 * Calibrated against Bootstrap's own palette: its sixteen base hues sit between 0.09 and
 * 0.6 apart in normal vision, and the closest pair that still reads as two colours in the
 * preview lands just above 0.05. Set it lower and real collapses go unreported; higher and
 * every neighbouring hue is a finding.
 */
export const SAME_COLOUR = 0.05
