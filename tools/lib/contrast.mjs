/**
 * Two ways of asking "can someone read this?", and the pairs worth asking about.
 *
 * WCAG 2's ratio is what conformance is measured against today, so it has to be here. It is
 * also known to misjudge exactly our case — light text on a saturated fill — because it
 * works from a luminance ratio that ignores how the eye actually handles polarity and
 * spatial frequency. APCA is the model WCAG 3 is built on and gives better advice on the
 * same pairs.
 *
 * Reporting both, rather than picking, is the honest position: one is the rule you are
 * judged by and the other is the one that will tell you when your yellow button is a
 * problem.
 */

import { hexToRgb, contrastRatio, contrastGrade } from './color.mjs'
import { flattenValues } from './flatten.mjs'
import { walk } from './tokens.mjs'
import { VISIONS, simulate, difference, SAME_COLOUR } from './vision.mjs'

/* --------------------------------------------------------------------------
 * APCA — Accessible Perceptual Contrast Algorithm, W3 version 0.1.9
 * -------------------------------------------------------------------------- */

const TRC = 2.4
const COEFFICIENTS = [0.2126729, 0.7151522, 0.072175]

const NORM_BG = 0.56
const NORM_TEXT = 0.57
const REVERSE_TEXT = 0.62
const REVERSE_BG = 0.65

const BLACK_THRESHOLD = 0.022
const BLACK_CLAMP = 1.414
const SCALE = 1.14
const OFFSET = 0.027
const LOW_CLIP = 0.1
const DELTA_Y_MIN = 0.0005

/** Screen luminance, with the soft clamp APCA applies near black. */
function luminanceApca([r, g, b]) {
  const y = COEFFICIENTS.reduce(
    (total, coefficient, i) => total + coefficient * ([r, g, b][i] / 255) ** TRC,
    0
  )
  return y > BLACK_THRESHOLD ? y : y + (BLACK_THRESHOLD - y) ** BLACK_CLAMP
}

/**
 * APCA lightness contrast, roughly -108…+106.
 *
 * The sign carries meaning and must not be discarded: positive is dark text on a light
 * background, negative is light on dark. The two are not equivalent to the eye, which is
 * the main thing WCAG 2's symmetric ratio gets wrong.
 */
export function apcaLc(text, background) {
  const textY = luminanceApca(text)
  const bgY = luminanceApca(background)
  if (Math.abs(bgY - textY) < DELTA_Y_MIN) return 0

  if (bgY > textY) {
    const found = (bgY ** NORM_BG - textY ** NORM_TEXT) * SCALE
    return (found < LOW_CLIP ? 0 : found - OFFSET) * 100
  }

  const found = (bgY ** REVERSE_BG - textY ** REVERSE_TEXT) * SCALE
  return (found > -LOW_CLIP ? 0 : found + OFFSET) * 100
}

/**
 * What an APCA score allows, using the Bronze simple thresholds.
 *
 * These are use-case levels, not pass/fail marks: Lc 60 is fine for a 24px heading and not
 * for 14px body text, so the honest output names the smallest thing the pair can carry.
 */
export function apcaLevel(lc) {
  const magnitude = Math.abs(lc)
  if (magnitude >= 90) return { use: 'any text, including thin weights', ok: true }
  if (magnitude >= 75) return { use: 'body text', ok: true }
  if (magnitude >= 60) return { use: 'large or bold text only', ok: true }
  if (magnitude >= 45) return { use: 'headlines and UI elements only', ok: null }
  if (magnitude >= 30) return { use: 'non-text elements only', ok: null }
  return { use: 'nothing — invisible or nearly so', ok: false }
}

/* --------------------------------------------------------------------------
 * The pairs
 * -------------------------------------------------------------------------- */

/**
 * The colour pairs a reader actually has to be able to see.
 *
 * Not every pair of tokens is a pair a person looks at, and auditing all of them would bury
 * the four that matter under a thousand that do not. `contrast` is the text placed on a
 * role's solid fill; `fg` and `fg-emphasis` are that role's text on the page background.
 * Those are exactly the places a re-tinted palette quietly goes unreadable.
 */
export function contrastPartner(path) {
  const theme = /^theme-color\.([\w-]+)\.(contrast|fg|fg-emphasis)$/.exec(path)
  if (theme) {
    return theme[2] === 'contrast'
      ? { partner: `theme-color.${theme[1]}.bg`, label: 'on fill' }
      : { partner: 'bg.body', label: 'on page' }
  }
  if (/^fg\.\d$/.test(path) || path === 'fg.body') return { partner: 'bg.body', label: 'on page' }
  if (path === 'type.link.color' || path === 'type.link.hover-color') {
    return { partner: 'bg.body', label: 'on page' }
  }
  return null
}

/** Every auditable pair in one scheme, measured both ways. */
export function auditContrast(doc, { mode = 'light' } = {}) {
  const { values } = flattenValues(doc, { mode })
  const rows = []

  for (const [path, token] of walk(doc.tree)) {
    if (token.$type !== 'color') continue
    const pair = contrastPartner(path)
    if (!pair) continue

    const foreground = values.get(path)
    const background = values.get(pair.partner)
    if (!foreground || !background) continue

    // Alpha would need a backdrop to composite against, which a token pair does not have.
    if (foreground.length > 7 || background.length > 7) continue

    const text = hexToRgb(foreground)
    const surface = hexToRgb(background)
    const ratio = contrastRatio(text, surface)
    const lc = apcaLc(text, surface)

    rows.push({
      path,
      partner: pair.partner,
      label: pair.label,
      mode,
      foreground,
      background,
      ratio,
      wcag: contrastGrade(ratio),
      lc,
      apca: apcaLevel(lc)
    })
  }

  return rows
}

export { contrastRatio, contrastGrade }

/* --------------------------------------------------------------------------
 * Colour vision
 * -------------------------------------------------------------------------- */

/**
 * Roles that carry meaning by colour alone, so two of them looking alike is a bug rather
 * than a style choice. `primary`, `accent`, `secondary` and `inverse` are branding — nobody
 * reads "this went wrong" out of them — and are reported without being called a failure.
 */
const STATUS_ROLES = new Set(['success', 'danger', 'warning', 'info'])

/**
 * How common each kind is, so a reader can weigh nine findings against one.
 *
 * Deuteranopia and protanopia are the ones a real audience has; tritan defects are rare and
 * achromatopsia is very rare. Listing all four with equal weight would bury the finding that
 * matters under three that almost never apply, which is how a check gets switched off.
 */
export const HOW_COMMON = {
  deuteranopia: { note: 'about 1 in 100 men', weight: 3 },
  protanopia: { note: 'about 1 in 100 men', weight: 3 },
  tritanopia: { note: 'rare, and not sex-linked', weight: 2 },
  achromatopsia: { note: 'very rare — roughly 1 in 30,000', weight: 1 }
}

/**
 * Pairs of semantic roles that cannot be told apart.
 *
 * This is the gap the contrast report cannot cover. Luminance survives colour blindness
 * almost intact, so a palette can clear every ratio and still hand around eight percent of
 * men a success button and a danger button in the same colour. It is also the failure mode
 * nobody catches by looking, because the person choosing the colours usually sees both.
 *
 * Two cases, and they are not the same problem. A pair that is already indistinguishable in
 * ordinary vision is wrong for everyone and reported with no simulation attached. A pair
 * that is distinct until you simulate has a distinction that exists and is lost — which is
 * the one nobody notices.
 */
export function roleCollisions(doc, { mode = 'light' } = {}) {
  const { values } = flattenValues(doc, { mode })

  const roles = []
  for (const key of Object.keys(doc.tree['theme-color'] ?? {})) {
    if (key.startsWith('$')) continue
    const hex = values.get(`theme-color.${key}.bg`)
    if (hex && hex.length === 7) roles.push({ role: key, rgb: hexToRgb(hex), hex })
  }

  const found = []
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const [a, b] = [roles[i], roles[j]]
      const shared = {
        mode,
        roles: [a.role, b.role],
        colors: [a.hex, b.hex],
        status: STATUS_ROLES.has(a.role) && STATUS_ROLES.has(b.role)
      }

      const normal = difference(a.rgb, b.rgb)
      if (normal < SAME_COLOUR) {
        found.push({ ...shared, vision: null, normal, apart: normal, identical: true })
        continue
      }

      for (const vision of Object.keys(VISIONS)) {
        const apart = difference(simulate(a.rgb, vision), simulate(b.rgb, vision))
        if (apart < SAME_COLOUR) {
          found.push({ ...shared, vision, normal, apart, identical: false })
        }
      }
    }
  }

  // Worst first: two roles nobody can tell apart, then status pairs, then by how common the
  // vision is. Sorting by the raw distance instead would put an exotic near-miss on top.
  return found.sort(
    (a, b) =>
      Number(b.identical) - Number(a.identical) ||
      Number(b.status) - Number(a.status) ||
      (HOW_COMMON[b.vision]?.weight ?? 9) - (HOW_COMMON[a.vision]?.weight ?? 9) ||
      a.apart - b.apart
  )
}
