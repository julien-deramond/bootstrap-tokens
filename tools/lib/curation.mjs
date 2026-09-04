/**
 * Curation: the editorial layer on top of mechanical extraction.
 *
 * `$root-tokens` is one flat bag of 67 custom properties. Left alone it would extract into a
 * `root.*` group with no meaning. This table gives every entry a semantic path and a home
 * file, and — critically — fixes the *order* in which the exporter must re-emit them, since
 * upstream's `:root` block has to come out byte-identical.
 */

/** `--custom-property` → token path, in upstream `$root-tokens` order. */
export const ROOT_TOKEN_PATHS = [
  ['--black', 'color.black'],
  ['--white', 'color.white'],
  ['--gradient', 'decoration.gradient'],

  ['--body-font-family', 'type.body.font-family'],
  ['--body-font-size', 'type.body.font-size'],
  ['--body-font-weight', 'type.body.font-weight'],
  ['--body-line-height', 'type.body.line-height'],

  ['--heading-color', 'type.heading.color'],
  ['--hr-border-color', 'type.hr.border-color'],

  ['--link-color', 'type.link.color'],
  ['--link-decoration', 'type.link.decoration'],
  ['--link-underline-offset', 'type.link.underline-offset'],
  ['--link-hover-color', 'type.link.hover-color'],

  ['--font-mono', 'type.code.font-family'],
  ['--code-font-size', 'type.code.font-size'],
  ['--code-color', 'type.code.color'],

  ['--border-width', 'border.width'],
  ['--border-width-keyline', 'border.width-keyline'],
  ['--border-style', 'border.style'],
  ['--border-color', 'border.color'],
  ['--border-color-translucent', 'border.color-translucent'],

  ['--shadow-color', 'elevation.color'],
  ['--shadow-strength', 'elevation.strength'],

  ['--transition-timing-overlay', 'motion.timing-overlay'],

  ['--spacer', 'spacing.root'],

  ['--focus-ring-width', 'focus.width'],
  ['--focus-ring-offset', 'focus.offset'],
  ['--focus-ring-color', 'focus.color'],
  ['--focus-ring', 'focus.ring'],

  ['--control-checked-bg', 'control.checked-bg'],
  ['--control-checked-border-color', 'control.checked-border-color'],
  ['--control-active-bg', 'control.active-bg'],
  ['--control-active-border-color', 'control.active-border-color'],
  ['--control-disabled-bg', 'control.disabled-bg'],
  ['--control-disabled-opacity', 'control.disabled-opacity'],
  ['--control-transition-duration', 'control.transition-duration'],
  ['--control-transition-timing', 'control.transition-timing'],

  ['--btn-input-fg', 'control.field.fg'],
  ['--btn-input-bg', 'control.field.bg'],
  ['--btn-input-gap', 'control.field.gap'],
  ['--btn-input-min-height', 'control.field.min-height'],
  ['--btn-input-padding-y', 'control.field.padding-y'],
  ['--btn-input-padding-x', 'control.field.padding-x'],
  ['--btn-input-font-size', 'control.field.font-size'],
  ['--btn-input-line-height', 'control.field.line-height'],
  ['--btn-input-border-radius', 'control.field.border-radius'],

  ['--btn-input-xs-gap', 'control.field.xs.gap'],
  ['--btn-input-xs-min-height', 'control.field.xs.min-height'],
  ['--btn-input-xs-padding-y', 'control.field.xs.padding-y'],
  ['--btn-input-xs-padding-x', 'control.field.xs.padding-x'],
  ['--btn-input-xs-font-size', 'control.field.xs.font-size'],
  ['--btn-input-xs-line-height', 'control.field.xs.line-height'],
  ['--btn-input-xs-border-radius', 'control.field.xs.border-radius'],

  ['--btn-input-sm-gap', 'control.field.sm.gap'],
  ['--btn-input-sm-min-height', 'control.field.sm.min-height'],
  ['--btn-input-sm-padding-y', 'control.field.sm.padding-y'],
  ['--btn-input-sm-padding-x', 'control.field.sm.padding-x'],
  ['--btn-input-sm-font-size', 'control.field.sm.font-size'],
  ['--btn-input-sm-line-height', 'control.field.sm.line-height'],
  ['--btn-input-sm-border-radius', 'control.field.sm.border-radius'],

  ['--btn-input-lg-gap', 'control.field.lg.gap'],
  ['--btn-input-lg-min-height', 'control.field.lg.min-height'],
  ['--btn-input-lg-padding-y', 'control.field.lg.padding-y'],
  ['--btn-input-lg-padding-x', 'control.field.lg.padding-x'],
  ['--btn-input-lg-font-size', 'control.field.lg.font-size'],
  ['--btn-input-lg-line-height', 'control.field.lg.line-height'],
  ['--btn-input-lg-border-radius', 'control.field.lg.border-radius']
]

/**
 * Values upstream repeats as literals that a token document would rather express as an alias.
 *
 * Deliberately empty. `--spacer: 1rem` in `$root-tokens` looks like it should alias `$spacer`,
 * and an earlier version rewrote it that way — but upstream hardcodes it, so Sass does *not*
 * recompute it when `$spacer` changes. Asserting the link here made the chooser preview a
 * value the compiled stylesheet would never produce. The token document mirrors what
 * Bootstrap does; where that is surprising, `TOKEN_DESCRIPTIONS` says so.
 */
export const ALIAS_REWRITES = new Map()

/**
 * Tokens that upstream re-declares for dark mode *outside* any token map.
 *
 * `--shadow-strength` is a plain number, so it cannot use `light-dark()`. `scss/_root.scss`
 * instead re-declares it in a `prefers-color-scheme` media query and under
 * `[data-bs-theme="dark"]`, both after the `:root` block — which means overriding the token
 * changes the light value only. Recording that here keeps the preview honest: it re-asserts
 * the fixed dark value exactly as the compiled stylesheet does, instead of showing a dark
 * mode that no build would ever produce.
 */
export const FIXED_DARK = {
  'elevation.strength': '2.4'
}

/** Where upstream re-declares a `FIXED_DARK` token. */
export const FIXED_DARK_SELECTORS = [
  { media: '(prefers-color-scheme: dark)', selector: ':root' },
  { media: null, selector: '[data-bs-theme="dark"]' }
]

/** Per-token notes, surfaced in the chooser and in the resolved JSON. */
export const TOKEN_DESCRIPTIONS = {
  'spacing.root':
    'Upstream hardcodes this rather than deriving it from $spacer, so changing the base spacer does not move it.',
  'radius.pill': 'A fixed 50rem, set on $root-tokens after the $radii loop.',
  'elevation.strength':
    'Multiplies every shadow layer’s alpha. Light mode only: dark mode is pinned to 2.4 by a media query in scss/_root.scss, which no token map can reach.',
  'color-mix.space': 'The interpolation space every generated colour step is mixed in.'
}

/** Which file each root group is written to. */
export const FILE_FOR_GROUP = {
  // primitive
  color: 'primitive/color.json',
  'color-tint': 'primitive/color.json',
  'color-shade': 'primitive/color.json',
  'color-mix': 'primitive/color.json',
  spacing: 'primitive/dimension.json',
  'spacing-negative': 'primitive/dimension.json',
  size: 'primitive/dimension.json',
  radius: 'primitive/dimension.json',
  'border-width': 'primitive/dimension.json',
  'font-size': 'primitive/typography.json',
  'line-height': 'primitive/typography.json',
  'font-weight': 'primitive/typography.json',
  breakpoint: 'primitive/layout.json',
  container: 'primitive/layout.json',
  grid: 'primitive/layout.json',
  'aspect-ratio': 'primitive/layout.json',
  position: 'primitive/layout.json',
  'z-index': 'primitive/z-index.json',
  opacity: 'primitive/opacity.json',

  // semantic
  'theme-color': 'semantic/theme-color.json',
  bg: 'semantic/surface.json',
  fg: 'semantic/surface.json',
  border: 'semantic/border.json',
  type: 'semantic/typography.json',
  elevation: 'semantic/elevation.json',
  shadow: 'semantic/elevation.json',
  focus: 'semantic/focus.json',
  control: 'semantic/control.json',
  motion: 'semantic/motion.json',
  decoration: 'semantic/decoration.json'
}

/** Human-readable blurbs, attached as `$description` on groups. */
export const GROUP_DESCRIPTIONS = {
  color: 'Base hues in oklch() plus the 13-step scale each one generates.',
  'color-tint': 'How much white is mixed in for each tint stop (025–400).',
  'color-shade': 'How much black is mixed in for each shade stop (600–975).',
  'color-mix': 'Inputs to the colour-scale generator: mixing space and tint/shade endpoints.',
  spacing: 'The spacing scale. Every step is a multiple of the base spacer.',
  'spacing-negative': 'Negative spacing steps, used by margin utilities.',
  size: 'Width/height sizing steps.',
  radius: 'The corner-radius scale, derived from the base radius.',
  'border-width': 'Available border widths.',
  'font-size': 'Type scale. Sizes from lg up are fluid via clamp().',
  'line-height': 'Line height paired with each font size.',
  'font-weight': 'Named font weights.',
  breakpoint: 'Minimum viewport widths at which the layout changes.',
  container: 'Maximum `.container` width at each breakpoint.',
  grid: 'Grid column count and gutter sizes.',
  'aspect-ratio': 'Named aspect ratios for the ratio helper.',
  position: 'Offsets used by the position utilities.',
  'z-index': 'The stacking ladder. Change these together or not at all.',
  opacity: 'Opacity steps used by colour utilities.',
  'theme-color': 'Semantic colour roles. Each role carries the nine sub-keys a component needs.',
  bg: 'Neutral background ramp, from the page body up through four raised surfaces.',
  fg: 'Neutral foreground ramp, from primary body text down to the faintest.',
  border: 'Default border width, style and colour, plus the neutral border ramp.',
  type: 'Body, heading, link and code typography.',
  elevation: 'Shadow scale plus the colour and strength every layer is tinted by.',
  shadow: 'The named shadow scale.',
  focus: 'Focus ring geometry and colour.',
  control: 'Shared metrics for buttons and form fields, and their interaction states.',
  motion: 'Shared easing curves.',
  decoration: 'Decorative effects that are not colour, spacing or type.'
}
