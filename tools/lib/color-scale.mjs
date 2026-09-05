/**
 * Bootstrap generates its 13-step colour scales at *runtime* with `color-mix()`, from
 * 16 base hues plus a tint/shade recipe. We do the same rather than freezing 208 hex
 * values that would drift from upstream and lose the runtime behaviour.
 */

/** Ordered stops, tints first, then the base, then shades. */
export function stopsFor(tints, shades) {
  return [
    ...Object.entries(tints).map(([stop, percent]) => ({ stop, percent, kind: 'tint' })),
    { stop: '500', percent: null, kind: 'base' },
    ...Object.entries(shades).map(([stop, percent]) => ({ stop, percent, kind: 'shade' }))
  ]
}

/**
 * Build the `color.<hue>.<stop>` tokens for one hue.
 * `base` is the hue's CSS value; `tintColor`/`shadeColor` are CSS values too.
 */
export function scaleFor(hue, { base, tints, shades, space, tintColor, shadeColor }) {
  const out = {}

  for (const { stop, percent, kind } of stopsFor(tints, shades)) {
    const cssVar = `--${hue}-${stop}`

    if (kind === 'base') {
      out[stop] = {
        $type: 'color',
        $value: `{color.${hue}.base}`,
        $extensions: {
          'dev.bootstrap.tokens': { cssVar, sassMap: '$color-tokens', generated: 'color-scale' }
        }
      }
      continue
    }

    const mixWith = kind === 'tint' ? tintColor : shadeColor
    out[stop] = {
      $type: 'color',
      $value: `color-mix(in ${space}, ${mixWith} ${percent}, {color.${hue}.base})`,
      $extensions: {
        'dev.bootstrap.tokens': {
          cssVar,
          sassMap: '$color-tokens',
          generated: 'color-scale',
          expression: true
        }
      }
    }
  }

  return out
}

/** Expand every hue in the loaded tree. Mutates `tree.color` in place. */
export function expandColorScales(tree) {
  const colorGroup = tree.color
  if (!colorGroup) return tree

  const tints = plainValues(tree['color-tint'])
  const shades = plainValues(tree['color-shade'])
  const space = rawValue(tree['color-mix']?.space) ?? 'oklch'
  const tintColor = rawValue(tree['color-mix']?.['tint-color']) ?? 'var(--white)'
  const shadeColor = rawValue(tree['color-mix']?.['shade-color']) ?? 'var(--black)'

  for (const [hue, group] of Object.entries(colorGroup)) {
    if (hue.startsWith('$') || !isGroup(group) || !group.base) continue
    Object.assign(group, scaleFor(hue, { base: group.base, tints, shades, space, tintColor, shadeColor }))
  }

  return tree
}

const isGroup = (node) => node && typeof node === 'object' && node.$value === undefined

function rawValue(token) {
  return token && typeof token === 'object' ? token.$value : undefined
}

function plainValues(group) {
  const out = {}
  for (const [key, node] of Object.entries(group ?? {})) {
    if (key.startsWith('$')) continue
    if (node && typeof node === 'object' && node.$value !== undefined) out[key] = node.$value
  }
  return out
}
