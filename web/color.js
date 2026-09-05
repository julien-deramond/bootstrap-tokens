/**
 * Just enough colour maths to let a native `<input type="color">` edit a token that is
 * authored in `oklch()`.
 *
 * Bootstrap v6 authors every hue in OKLCH, so round-tripping through hex would quietly
 * rewrite the palette into a different colour space. Converting properly means the picker
 * hands back `oklch(60% 0.24 240)`, in the notation the token was written in.
 */

const clamp01 = (n) => Math.min(1, Math.max(0, n))
const cbrt = Math.cbrt

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** sRGB (0–255) → OKLCH `{ l: 0–1, c, h: degrees }`. */
export function rgbToOklch([red, green, blue]) {
  const r = toLinear(red / 255)
  const g = toLinear(green / 255)
  const b = toLinear(blue / 255)

  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  const chroma = Math.hypot(okA, okB)
  let hue = (Math.atan2(okB, okA) * 180) / Math.PI
  if (hue < 0) hue += 360

  return { l: okL, c: chroma, h: chroma < 1e-6 ? 0 : hue }
}

/** OKLCH → linear-light sRGB, unclamped, so we can tell whether it is in gamut. */
function oklchToLinear({ l: okL, c: chroma, h: hue }) {
  const rad = (hue * Math.PI) / 180
  const okA = chroma * Math.cos(rad)
  const okB = chroma * Math.sin(rad)

  const l = (okL + 0.3963377774 * okA + 0.2158037573 * okB) ** 3
  const m = (okL - 0.1055613458 * okA - 0.0638541728 * okB) ** 3
  const s = (okL - 0.0894841775 * okA - 1.291485548 * okB) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
}

const EPSILON = 1e-5
const inSrgb = (rgb) => rgb.every((channel) => channel >= -EPSILON && channel <= 1 + EPSILON)

/**
 * OKLCH → sRGB (0–255), gamut-mapped by reducing chroma.
 *
 * Clamping each channel independently is the obvious implementation and it is wrong: it
 * moves the colour sideways in hue. Bootstrap authors deliberately saturated hues —
 * `oklch(60% 0.24 240)` is outside sRGB — so a naive round-trip through the colour picker
 * turned that blue into a 254° blue-violet, silently rewriting the palette. Reducing chroma
 * until the colour fits keeps lightness and hue exactly, which is what CSS Color 4 asks for
 * and what a designer expects: same colour, less saturated.
 */
export function oklchToRgb({ l, c, h }) {
  const lightness = clamp01(l)

  let chroma = Math.max(0, c)
  if (!inSrgb(oklchToLinear({ l: lightness, c: chroma, h }))) {
    let low = 0
    let high = chroma

    // 24 bisections resolves chroma far finer than 8-bit output can show.
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (inSrgb(oklchToLinear({ l: lightness, c: mid, h }))) low = mid
      else high = mid
    }
    chroma = low
  }

  return oklchToLinear({ l: lightness, c: chroma, h }).map(
    (channel) => Math.round(clamp01(toGamma(clamp01(channel))) * 255)
  )
}

const hex2 = (n) => n.toString(16).padStart(2, '0')
export const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

export function hexToRgb(hex) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16))
}

const trim = (n, places) => Number(n.toFixed(places)).toString()

/** Format in the same notation the token was authored in. */
export function formatColor(rgb, like) {
  if (/^oklch\(/i.test(like ?? '')) {
    const { l, c, h } = rgbToOklch(rgb)
    return `oklch(${trim(l * 100, 1)}% ${trim(c, 3)} ${trim(h, 1)})`
  }
  return rgbToHex(rgb)
}

const NUMBER = '([+-]?[\\d.]+)'
const RGB = new RegExp(`^rgba?\\(\\s*${NUMBER}[\\s,]+${NUMBER}[\\s,]+${NUMBER}`, 'i')
const OKLCH = new RegExp(`^oklch\\(\\s*${NUMBER}(%?)\\s+${NUMBER}\\s+${NUMBER}`, 'i')
const SRGB = new RegExp(`^color\\(\\s*srgb\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}`, 'i')

/**
 * Parse whatever `getComputedStyle` hands back for a colour. Browsers are inconsistent here:
 * some resolve `oklch()` to `rgb()`, some keep it, some use `color(srgb …)`.
 */
export function parseComputedColor(value) {
  const text = String(value ?? '').trim()

  const rgb = RGB.exec(text)
  if (rgb) return [1, 2, 3].map((i) => Math.round(Number(rgb[i])))

  const srgb = SRGB.exec(text)
  if (srgb) return [1, 2, 3].map((i) => Math.round(clamp01(Number(srgb[i])) * 255))

  const oklch = OKLCH.exec(text)
  if (oklch) {
    const lightness = Number(oklch[1]) / (oklch[2] === '%' ? 100 : 1)
    return oklchToRgb({ l: lightness, c: Number(oklch[3]), h: Number(oklch[4]) })
  }

  return null
}

/* -------------------------------------------------------------------------- */

const channelLuminance = (c) => {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]) {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/** The strongest WCAG level a ratio clears for normal-size body text. */
export function contrastGrade(ratio) {
  if (ratio >= 7) return { level: 'AAA', ok: true }
  if (ratio >= 4.5) return { level: 'AA', ok: true }
  if (ratio >= 3) return { level: 'AA large', ok: null }
  return { level: 'fail', ok: false }
}
