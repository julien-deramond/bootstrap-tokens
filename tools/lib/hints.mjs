/** Guess a DTCG `$type` from a custom-property name. Used only where the group doesn't say. */

const COLOR = /(^|-)(color|bg|fg|background|border-color|fill|stroke|shadow-color|contrast)$/
const COLOR_MID = /(^|-)(color|bg|fg)-/
const DIMENSION = /(^|-)(width|height|size|offset|gap|padding|margin|radius|spacer|inset|thickness|indent|top|bottom|start|end|x|y)$/
const DURATION = /(^|-)duration$/
const TIMING = /(^|-)(timing|easing)$/
const WEIGHT = /(^|-)font-weight$/
const FAMILY = /(^|-)font-family$/
const OPACITY = /(^|-)opacity$/
const SHADOW = /(^|-)(shadow|box-shadow)$/
const BORDER = /(^|-)border$/
/* A composite transition (`transform .2s ease-in-out`), not the property list beside it. */
const TRANSITION = /(^|-)transition$/
const ZINDEX = /(^|-)(zindex|z-index)$/
const SPACING = /(^|-)spacing$/
const GRADIENT = /(^|-)gradient$/
/* `3px solid <colour>` is a border composite, whatever it is called. */
const RING = /(^|-)ring$/

export function hintFor(name) {
  const key = String(name).replace(/^--/, '')

  if (ZINDEX.test(key)) return 'number'
  if (SPACING.test(key)) return 'dimension'
  if (GRADIENT.test(key)) return 'gradient'
  if (RING.test(key)) return 'border'
  if (SHADOW.test(key)) return 'shadow'
  if (BORDER.test(key)) return 'border'
  if (TRANSITION.test(key)) return 'transition'
  if (WEIGHT.test(key)) return 'fontWeight'
  if (FAMILY.test(key)) return 'fontFamily'
  if (DURATION.test(key)) return 'duration'
  if (TIMING.test(key)) return 'cubicBezier'
  if (OPACITY.test(key)) return 'number'
  if (COLOR.test(key) || COLOR_MID.test(key)) return 'color'
  if (DIMENSION.test(key)) return 'dimension'
  return null
}

/** Fixed hints per token group, which beat the name-based guess. */
export const GROUP_HINTS = {
  shadow: 'shadow',
  color: 'color',
  'theme-color': 'color',
  bg: 'color',
  fg: 'color',
  spacing: 'dimension',
  'spacing-negative': 'dimension',
  size: 'dimension',
  radius: 'dimension',
  'border-width': 'dimension',
  'font-size': 'dimension',
  'line-height': 'number',
  'font-weight': 'fontWeight',
  breakpoint: 'dimension',
  container: 'dimension',
  'z-index': 'number',
  opacity: 'number',
  'color-tint': 'number',
  'color-shade': 'number'
}
