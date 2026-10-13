/**
 * Simple mode: a small set of dials that each move a lot of the system.
 *
 * The important property is that this is a *view*, not a second model. Every dial writes
 * into the same `overrides` object Advanced mode edits, so switching between them is
 * lossless and the export is produced from one source of truth. A dial reads its current
 * position back out of those overrides, and reports "Custom" when the underlying tokens hold
 * something it cannot represent — rather than silently snapping them back to a preset.
 */

import { ext, authoredValue } from '../tools/lib/tokens.mjs'
import { withOverrides } from '../tools/lib/overrides.mjs'
import { auditContrast } from '../tools/lib/contrast.mjs'
import { audit } from '../tools/lib/report.mjs'

/** Bootstrap's own sixteen hues, in its order. */
export const HUES = [
  'blue', 'indigo', 'violet', 'purple', 'pink', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'teal', 'cyan', 'brown', 'gray', 'pewter'
]

/**
 * Every scale a role can be built from, read from the document rather than the list above,
 * so a color the user added is a first-class choice rather than a special case.
 */
export function availableHues(doc) {
  const group = doc.tree.color ?? {}
  const found = Object.keys(group).filter(
    (key) => !key.startsWith('$') && group[key] && group[key].base?.$value !== undefined
  )

  // Bootstrap's own first, in its order; anything added after, in the order it was added.
  const extra = found.filter((hue) => !HUES.includes(hue))
  return [...HUES.filter((hue) => found.includes(hue)), ...extra]
}

/** Scales this theme added, which upstream does not ship. */
export const addedHues = (doc) => availableHues(doc).filter((hue) => !HUES.includes(hue))

const FONT_STACKS = {
  system:
    '"-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', \'Noto Sans\', \'Liberation Sans\', Arial, sans-serif, \'Apple Color Emoji\', \'Segoe UI Emoji\', \'Segoe UI Symbol\', \'Noto Color Emoji\'"',
  geometric: '"Inter, \'Helvetica Neue\', Helvetica, Arial, sans-serif"',
  humanist: '"\'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif"',
  serif: '"Georgia, Cambria, \'Times New Roman\', Times, serif"',
  mono: '"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"'
}

/**
 * Dial definitions. `choice` dials map a label onto a set of token values; `hue` dials
 * repoint a whole theme-color role at a different color scale.
 */
export const DIALS = [
  {
    id: 'primary',
    section: 'Color',
    kind: 'hue',
    role: 'primary',
    preview: 'buttons',
    label: 'Brand color',
    help: 'Repoints the primary role at another color scale. Buttons, links, focus rings and every component that uses primary follow.'
  },
  {
    id: 'accent',
    section: 'Color',
    kind: 'hue',
    role: 'accent',
    preview: 'buttons',
    label: 'Accent color',
    help: 'The secondary brand role, used for highlights alongside primary.'
  },
  {
    id: 'radius',
    section: 'Shape',
    kind: 'choice',
    label: 'Corner radius',
    help: 'Sets the base radius. The whole 0–9 scale is derived from it, so every component moves together.',
    token: 'radius.base',
    preview: 'surfaces',
    swatch: 'radius',
    options: [
      { label: 'Square', values: { 'radius.base': '0' } },
      { label: 'Slight', values: { 'radius.base': '.25rem' } },
      { label: 'Default', values: { 'radius.base': '.5rem' } },
      { label: 'Round', values: { 'radius.base': '.75rem' } },
      { label: 'Pillowy', values: { 'radius.base': '1rem' } }
    ]
  },
  {
    id: 'density',
    section: 'Shape',
    kind: 'choice',
    label: 'Density',
    help: 'Sets the base spacer. The spacing scale, gutters and every component padding derive from it.',
    token: 'spacing.base',
    preview: 'surfaces',
    swatch: 'density',
    options: [
      { label: 'Compact', values: { 'spacing.base': '.875rem' } },
      { label: 'Default', values: { 'spacing.base': '1rem' } },
      { label: 'Comfortable', values: { 'spacing.base': '1.125rem' } },
      { label: 'Spacious', values: { 'spacing.base': '1.25rem' } }
    ]
  },
  {
    id: 'border',
    section: 'Shape',
    kind: 'choice',
    label: 'Border weight',
    help: 'The default border width, used by cards, inputs, tables and dividers.',
    token: 'border.width',
    preview: 'forms',
    swatch: 'border',
    options: [
      { label: 'Hairline', values: { 'border.width': '.5px' } },
      { label: 'Default', values: { 'border.width': '1px' } },
      { label: 'Bold', values: { 'border.width': '2px' } }
    ]
  },
  {
    id: 'typeface',
    section: 'Type',
    kind: 'choice',
    label: 'Typeface',
    help: 'The body font stack. Anything not installed falls back through the rest of the stack.',
    token: 'type.body.font-family',
    preview: 'typography',
    swatch: 'font',
    options: [
      { label: 'System', values: { 'type.body.font-family': FONT_STACKS.system } },
      { label: 'Geometric', values: { 'type.body.font-family': FONT_STACKS.geometric } },
      { label: 'Humanist', values: { 'type.body.font-family': FONT_STACKS.humanist } },
      { label: 'Serif', values: { 'type.body.font-family': FONT_STACKS.serif } },
      { label: 'Mono', values: { 'type.body.font-family': FONT_STACKS.mono } }
    ]
  },
  {
    id: 'text-size',
    section: 'Type',
    kind: 'choice',
    label: 'Base text size',
    help: 'The body font size. Component sizes that reference it follow; the fluid heading scale does not.',
    token: 'type.body.font-size',
    preview: 'typography',
    swatch: 'text-size',
    options: [
      { label: '14px', values: { 'type.body.font-size': '.875rem' } },
      { label: '15px', values: { 'type.body.font-size': '.9375rem' } },
      { label: '16px', values: { 'type.body.font-size': '1rem' } },
      { label: '17px', values: { 'type.body.font-size': '1.0625rem' } },
      { label: '18px', values: { 'type.body.font-size': '1.125rem' } }
    ]
  },
  {
    id: 'shadow',
    section: 'Depth',
    kind: 'choice',
    label: 'Shadow depth',
    help: 'Multiplies every shadow layer’s opacity. Light mode only — Bootstrap pins dark mode to 2.4 with a media query no token can reach.',
    token: 'elevation.strength',
    preview: 'elevation',
    swatch: 'shadow',
    options: [
      { label: 'None', values: { 'elevation.strength': '0' } },
      { label: 'Subtle', values: { 'elevation.strength': '.5' } },
      { label: 'Default', values: { 'elevation.strength': '1' } },
      { label: 'Strong', values: { 'elevation.strength': '1.75' } }
    ]
  }
]

/** One-click starting points. Each is just a bundle of dial positions. */
export const PRESETS = [
  { id: 'default', label: 'Bootstrap default', dials: {} },
  {
    id: 'soft',
    label: 'Soft',
    dials: { primary: 'indigo', accent: 'violet', radius: 'Pillowy', density: 'Comfortable', shadow: 'Subtle' }
  },
  {
    id: 'sharp',
    label: 'Sharp',
    dials: { radius: 'Square', density: 'Compact', border: 'Bold', shadow: 'None' }
  },
  {
    id: 'editorial',
    label: 'Editorial',
    dials: { primary: 'brown', accent: 'amber', typeface: 'Serif', radius: 'Slight', 'text-size': '17px', shadow: 'Subtle' }
  }
]

/* -------------------------------------------------------------------------- */

/** Which color scale a theme role is currently built from, e.g. `primary` → `blue`. */
export function hueOfRole(doc, role, read) {
  const value = read(`theme-color.${role}.base`)
  const match = /\{color\.([\w-]+)\./.exec(String(value ?? ''))
  return match ? match[1] : null
}

/**
 * Repointing a role at another hue is a string substitution across its sub-keys, because
 * every one of them references the same scale. `contrast` is the exception: it names the
 * text color that sits *on* the fill, so it is chosen by contrast rather than substituted —
 * white on yellow would otherwise be the default and unreadable.
 */
export function repointRole(doc, role, fromHue, toHue, { read, contrastFor }) {
  const values = {}

  for (const key of ['base', 'fg', 'fg-emphasis', 'bg', 'bg-subtle', 'bg-muted', 'border', 'focus-ring']) {
    const path = `theme-color.${role}.${key}`
    if (!doc.tokens.has(path)) continue

    const light = String(read(path, 'value') ?? '')
    const dark = read(path, 'dark')

    values[path] = {
      value: light.replaceAll(`{color.${fromHue}.`, `{color.${toHue}.`),
      ...(dark ? { dark: String(dark).replaceAll(`{color.${fromHue}.`, `{color.${toHue}.`) } : {})
    }
  }

  const contrastPath = `theme-color.${role}.contrast`
  if (doc.tokens.has(contrastPath)) {
    values[contrastPath] = { value: contrastFor(toHue) }
  }

  return values
}

/** Which dial option is currently selected, or null when the tokens hold something else. */
export function selectedOption(dial, read) {
  if (dial.kind !== 'choice') return null

  return (
    dial.options.find((option) =>
      Object.entries(option.values).every(([path, value]) => String(read(path)) === String(value))
    ) ?? null
  )
}

/* -------------------------------------------------------------------------- */

/** Every step of a color scale, lightest first. */
export const SCALE_STOPS = ['025', '050', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']

/** The poles a `contrast` sub-key chooses between, darkest and lightest first. */
export const NEUTRAL_CANDIDATES = ['{color.gray.975}', '{color.gray.900}', '{color.white}', '{color.black}']

/** Every other step of the same hue, ordered by how far it is from where we are. */
export function sameHueCandidates(hue, stop) {
  const from = SCALE_STOPS.indexOf(stop)
  if (from === -1) return NEUTRAL_CANDIDATES

  return SCALE_STOPS.map((candidate, index) => ({ candidate, distance: Math.abs(index - from) }))
    .filter(({ distance }) => distance > 0)
    .sort((a, b) => a.distance - b.distance)
    .map(({ candidate }) => `{color.${hue}.${candidate}}`)
}

/**
 * Put back the contrast a set of dial positions broke, without changing how it looks.
 *
 * A hue dial repoints a role step for step, which is right for blue and wrong for a hue whose
 * 600 is too light to read on white (amber), whose 500 is too light for the link color (brown),
 * or whose 400 drops below AA once the link hover darkens it on a dark page (indigo). Only the
 * pairs these overrides broke are touched: a pair Bootstrap already ships failing stays
 * Bootstrap's. Each one gets the smallest move that keeps the hue:
 *
 * - text on a role's fill (`contrast`) moves to the nearest neutral that reads;
 * - role text on the page (`fg`, `fg-emphasis`) moves along its own scale;
 * - a link drawn with the role's fill color switches to the role's text color, the variant
 *   made to be read on the page, and only then does that color move along its scale.
 *
 * Returns whole override entries to merge over `overrides`, so `{ ...overrides, ...fixes }`
 * is the repaired theme.
 */
export function repairContrast(tree, base, overrides) {
  const fixes = {}
  const theme = () => ({ ...overrides, ...fixes })

  // A move can unsettle another pair (a darker fg is also a darker link), so look again.
  for (let round = 0; round < 3; round++) {
    const broken = audit(withOverrides(tree, theme()), base).filter((row) => !row.wcag.ok && !row.inherited)
    if (broken.length === 0) break

    for (const row of broken) {
      const current = theme()
      // An earlier fix in this round may have settled it already (one value, both schemes).
      if (readable(tree, current, row)) continue

      const doc = withOverrides(tree, current)
      const patch = movesFor(row, doc).find((move) => readable(tree, { ...current, ...patched(current, move) }, row))
      if (patch) Object.assign(fixes, patched(current, patch))
    }
  }

  return fixes
}

/** The side of a token a scheme reads: its dark value in dark mode, when it has one. */
function sideOf(doc, path, mode) {
  const token = doc.tokens.get(path)
  const side = mode === 'dark' && ext(token).dark !== undefined ? 'dark' : 'value'
  return { side, value: String(authoredValue(token, side) ?? '').trim() }
}

/** Patches to try for one failing pair, in the order of how little they change. */
function movesFor(row, doc) {
  if (/^theme-color\.[\w-]+\.contrast$/.test(row.path)) {
    const { side, value } = sideOf(doc, row.path, row.mode)
    return NEUTRAL_CANDIDATES.filter((candidate) => candidate !== value).map((candidate) => ({
      [row.path]: { [side]: candidate }
    }))
  }

  if (/^theme-color\.[\w-]+\.(fg|fg-emphasis)$/.test(row.path)) return alongScale(doc, row.path, row.mode)

  if (row.path === 'type.link.color' || row.path === 'type.link.hover-color') {
    const { side, value } = sideOf(doc, 'type.link.color', row.mode)
    const role = /^\{theme-color\.([\w-]+)\.(base|fg)\}$/.exec(value)
    if (!role) return []

    const text = `theme-color.${role[1]}.fg`
    const toText = role[2] === 'base' ? { 'type.link.color': { [side]: `{${text}}` } } : {}
    const steps = alongScale(doc, text, row.mode).map((step) => ({ ...toText, ...step }))
    return role[2] === 'base' ? [toText, ...steps] : steps
  }

  return []
}

/** The same token on every other step of its scale, nearest first. */
function alongScale(doc, path, mode) {
  const { side, value } = sideOf(doc, path, mode)
  const step = /^\{color\.([\w-]+)\.(\w+)\}$/.exec(value)
  if (!step || !SCALE_STOPS.includes(step[2])) return []

  return sameHueCandidates(step[1], step[2]).map((candidate) => ({ [path]: { [side]: candidate } }))
}

/** The entries of `theme` a patch changes, with the patch laid over each. */
function patched(theme, patch) {
  return Object.fromEntries(
    Object.entries(patch).map(([path, entry]) => [path, { ...(theme[path] ?? {}), ...entry }])
  )
}

/** Whether the pair `row` measured passes AA under `theme`. */
function readable(tree, theme, row) {
  const found = auditContrast(withOverrides(tree, theme), { mode: row.mode }).find((pair) => pair.path === row.path)
  return found?.wcag.ok === true
}
