/**
 * Simple mode: a small set of dials that each move a lot of the system.
 *
 * The important property is that this is a *view*, not a second model. Every dial writes
 * into the same `overrides` object Advanced mode edits, so switching between them is
 * lossless and the export is produced from one source of truth. A dial reads its current
 * position back out of those overrides, and reports "Custom" when the underlying tokens hold
 * something it cannot represent — rather than silently snapping them back to a preset.
 */

/** The 16 hues a theme role can be built from. */
export const HUES = [
  'blue', 'indigo', 'violet', 'purple', 'pink', 'red', 'orange', 'amber',
  'yellow', 'lime', 'green', 'teal', 'cyan', 'brown', 'gray', 'pewter'
]

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
 * repoint a whole theme-colour role at a different colour scale.
 */
export const DIALS = [
  {
    id: 'primary',
    section: 'Colour',
    kind: 'hue',
    role: 'primary',
    preview: 'buttons',
    label: 'Brand colour',
    help: 'Repoints the primary role at another colour scale. Buttons, links, focus rings and every component that uses primary follow.'
  },
  {
    id: 'accent',
    section: 'Colour',
    kind: 'hue',
    role: 'accent',
    preview: 'buttons',
    label: 'Accent colour',
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

/** Which colour scale a theme role is currently built from, e.g. `primary` → `blue`. */
export function hueOfRole(doc, role, read) {
  const value = read(`theme-color.${role}.base`)
  const match = /\{color\.([\w-]+)\./.exec(String(value ?? ''))
  return match ? match[1] : null
}

/**
 * Repointing a role at another hue is a string substitution across its sub-keys, because
 * every one of them references the same scale. `contrast` is the exception: it names the
 * text colour that sits *on* the fill, so it is chosen by contrast rather than substituted —
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
