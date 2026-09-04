/**
 * The bidirectional map between token paths and their Sass / CSS homes.
 *
 * This is the single place that knows "`spacing.4` lives in `$spacers` and is emitted as
 * `--spacer-4`". Both the extractor and the exporter read it, so they cannot drift apart.
 */

/** Sass maps whose keys are projected into `$root-tokens` by a loop in `scss/_root.scss`. */
export const LOOPED_INTO_ROOT = new Set([
  '$font-sizes',
  '$font-weights',
  '$theme-colors',
  '$theme-bgs',
  '$theme-fgs',
  '$theme-borders',
  '$breakpoints',
  '$spacers',
  '$radii',
  '$shadows',
  '$zindex-levels'
])

/**
 * Primitive and semantic groups. `group` is the root path segment in the token document.
 *
 *  - `sassMap`   the Sass map that owns the values (what an override must target)
 *  - `cssPrefix` prefix for the emitted custom property; `null` = not emitted directly
 *  - `layer`     which token layer the group belongs to
 *  - `nested`    the map is a map-of-maps (`$theme-colors`, `$font-sizes`)
 */
export const GROUPS = [
  // --- primitive -----------------------------------------------------------
  { group: 'color', sassMap: '$colors', cssPrefix: null, layer: 'primitive', scale: true },
  { group: 'color-tint', sassMap: '$color-tints', cssPrefix: null, layer: 'primitive' },
  { group: 'color-shade', sassMap: '$color-shades', cssPrefix: null, layer: 'primitive' },
  { group: 'spacing', sassMap: '$spacers', cssPrefix: '--spacer-', layer: 'primitive' },
  { group: 'spacing-negative', sassMap: '$negative-spacers', cssPrefix: null, layer: 'primitive' },
  { group: 'size', sassMap: '$sizes', cssPrefix: null, layer: 'primitive' },
  { group: 'radius', sassMap: '$radii', cssPrefix: '--radius-', layer: 'primitive' },
  { group: 'border-width', sassMap: '$border-widths', cssPrefix: null, layer: 'primitive' },
  { group: 'font-size', sassMap: '$font-sizes', cssPrefix: '--font-size-', layer: 'primitive', nested: 'font-size' },
  { group: 'line-height', sassMap: '$font-sizes', cssPrefix: '--line-height-', layer: 'primitive', nested: 'line-height' },
  { group: 'font-weight', sassMap: '$font-weights', cssPrefix: '--font-weight-', layer: 'primitive' },
  { group: 'breakpoint', sassMap: '$breakpoints', cssPrefix: '--breakpoint-', layer: 'primitive' },
  { group: 'container', sassMap: '$container-max-widths', cssPrefix: null, layer: 'primitive' },
  { group: 'aspect-ratio', sassMap: '$aspect-ratios', cssPrefix: null, layer: 'primitive' },
  { group: 'position', sassMap: '$position-values', cssPrefix: null, layer: 'primitive' },
  { group: 'z-index', sassMap: '$zindex-levels', cssPrefix: '--z-', layer: 'primitive' },
  { group: 'opacity', sassMap: '$util-opacity', cssPrefix: null, layer: 'primitive' },

  // --- semantic ------------------------------------------------------------
  { group: 'theme-color', sassMap: '$theme-colors', cssPrefix: '--', layer: 'semantic', nestedRoles: true },
  { group: 'bg', sassMap: '$theme-bgs', cssPrefix: '--bg-', layer: 'semantic' },
  { group: 'fg', sassMap: '$theme-fgs', cssPrefix: '--fg-', layer: 'semantic' },
  { group: 'border', sassMap: '$theme-borders', cssPrefix: '--border-', layer: 'semantic' },
  { group: 'shadow', sassMap: '$shadows', cssPrefix: '--box-shadow', layer: 'semantic', dashOptional: true },
  { group: 'root', sassMap: '$root-tokens', cssPrefix: '--', layer: 'semantic', flat: true }
]

/** Scalar Sass variables that are tokens in their own right. */
export const SCALARS = [
  { path: 'color.white', sassVar: '$white', cssVar: '--white', sassEmit: '#{$white}', layer: 'primitive' },
  { path: 'color.black', sassVar: '$black', cssVar: '--black', sassEmit: '#{$black}', layer: 'primitive' },
  { path: 'decoration.gradient', sassVar: '$gradient', cssVar: '--gradient', sassEmit: '#{$gradient}', layer: 'semantic' },
  { path: 'border.width', sassVar: '$border-width', cssVar: '--border-width', sassEmit: '#{$border-width}', layer: 'semantic' },
  { path: 'border.style', sassVar: '$border-style', cssVar: '--border-style', sassEmit: '#{$border-style}', layer: 'semantic' },
  { path: 'spacing.base', sassVar: '$spacer', cssVar: null, layer: 'primitive' },
  { path: 'radius.base', sassVar: '$radius', cssVar: null, layer: 'primitive' },
  { path: 'grid.columns', sassVar: '$grid-columns', cssVar: null, layer: 'primitive' },
  { path: 'grid.row-columns', sassVar: '$grid-row-columns', cssVar: null, layer: 'primitive' },
  { path: 'grid.gutter-x', sassVar: '$grid-gutter-x', cssVar: null, layer: 'primitive' },
  { path: 'grid.gutter-y', sassVar: '$grid-gutter-y', cssVar: null, layer: 'primitive' },
  { path: 'grid.container-padding-x', sassVar: '$container-padding-x', cssVar: null, layer: 'primitive' },
  { path: 'color-mix.space', sassVar: '$color-mix-space', cssVar: null, layer: 'primitive' },
  { path: 'color-mix.tint-color', sassVar: '$tint-color', cssVar: null, layer: 'primitive' },
  { path: 'color-mix.shade-color', sassVar: '$shade-color', cssVar: null, layer: 'primitive' }
]

/**
 * Component / variant token maps. `selector` is where the map is emitted, and matters
 * for the chooser's live preview and for documentation — not for the Sass export, which
 * only needs the map name.
 */
export const COMPONENTS = [
  { name: 'accordion', sassMap: '$accordion-tokens', file: 'scss/_accordion.scss', selector: '.accordion' },
  { name: 'alert', sassMap: '$alert-tokens', file: 'scss/_alert.scss', selector: '.alert' },
  { name: 'avatar', sassMap: '$avatar-tokens', file: 'scss/_avatar.scss', selector: '.avatar' },
  { name: 'badge', sassMap: '$badge-tokens', file: 'scss/_badge.scss', selector: '.badge' },
  { name: 'blockquote', sassMap: '$blockquote-tokens', file: 'scss/content/_blockquote.scss', selector: '.blockquote' },
  { name: 'breadcrumb', sassMap: '$breadcrumb-tokens', file: 'scss/_breadcrumb.scss', selector: '.breadcrumb' },
  { name: 'btn', sassMap: '$button-tokens', file: 'scss/buttons/_button.scss', selector: '.btn' },
  { name: 'button-link', sassMap: '$button-link-tokens', file: 'scss/buttons/_button.scss', selector: '.btn-link', variantOf: 'btn' },
  { name: 'button-styled', sassMap: '$button-styled-tokens', file: 'scss/buttons/_button.scss', selector: '.btn-primary, …', variantOf: 'btn' },
  { name: 'btn-close', sassMap: '$btn-close-tokens', file: 'scss/buttons/_close.scss', selector: '.btn-close' },
  { name: 'calendar', sassMap: '$calendar-tokens', file: 'scss/_calendar.scss', selector: '.calendar' },
  { name: 'card', sassMap: '$card-tokens', file: 'scss/_card.scss', selector: '.card' },
  { name: 'carousel', sassMap: '$carousel-tokens', file: 'scss/_carousel.scss', selector: '.carousel' },
  { name: 'check', sassMap: '$check-tokens', file: 'scss/forms/_check.scss', selector: '.form-check-input' },
  { name: 'chip', sassMap: '$chip-tokens', file: 'scss/_chip.scss', selector: '.chip' },
  { name: 'chip-input', sassMap: '$chip-input-tokens', file: 'scss/forms/_chip-input.scss', selector: '.chip-input' },
  { name: 'datepicker', sassMap: '$datepicker-tokens', file: 'scss/_datepicker.scss', selector: '.datepicker' },
  { name: 'dialog', sassMap: '$dialog-tokens', file: 'scss/_dialog.scss', selector: '.dialog' },
  { name: 'drawer', sassMap: '$drawer-tokens', file: 'scss/_drawer.scss', selector: '.drawer' },
  { name: 'drawer-backdrop', sassMap: '$drawer-backdrop-tokens', file: 'scss/_drawer.scss', selector: '.drawer-backdrop', variantOf: 'drawer' },
  { name: 'figure', sassMap: '$figure-tokens', file: 'scss/content/_images.scss', selector: '.figure' },
  { name: 'form-adorn', sassMap: '$form-adorn-tokens', file: 'scss/forms/_form-adorn.scss', selector: '.form-adorn' },
  { name: 'form-control', sassMap: '$form-control-tokens', file: 'scss/forms/_form-control.scss', selector: '.form-control' },
  { name: 'form-floating', sassMap: '$form-floating-tokens', file: 'scss/forms/_floating-labels.scss', selector: '.form-floating' },
  { name: 'form-label', sassMap: '$form-label-tokens', file: 'scss/forms/_labels.scss', selector: '.form-label' },
  { name: 'form-text', sassMap: '$form-text-tokens', file: 'scss/forms/_form-text.scss', selector: '.form-text' },
  { name: 'hover-lift', sassMap: '$hover-lift-tokens', file: 'scss/helpers/_hover-lift.scss', selector: '.hover-lift' },
  { name: 'icon-link', sassMap: '$icon-link-tokens', file: 'scss/helpers/_icon-link.scss', selector: '.icon-link' },
  { name: 'input-group-addon', sassMap: '$input-group-addon-tokens', file: 'scss/forms/_input-group.scss', selector: '.input-group-text' },
  { name: 'list-group', sassMap: '$list-group-tokens', file: 'scss/_list-group.scss', selector: '.list-group' },
  { name: 'menu', sassMap: '$menu-tokens', file: 'scss/_menu.scss', selector: '.menu' },
  { name: 'nav', sassMap: '$nav-tokens', file: 'scss/_nav.scss', selector: '.nav' },
  { name: 'nav-pills', sassMap: '$nav-pills-tokens', file: 'scss/_nav.scss', selector: '.nav-pills', variantOf: 'nav' },
  { name: 'nav-tabs', sassMap: '$nav-tabs-tokens', file: 'scss/_nav.scss', selector: '.nav-tabs', variantOf: 'nav' },
  { name: 'nav-underline', sassMap: '$nav-underline-tokens', file: 'scss/_nav.scss', selector: '.nav-underline', variantOf: 'nav' },
  { name: 'navbar', sassMap: '$navbar-tokens', file: 'scss/_navbar.scss', selector: '.navbar' },
  { name: 'navbar-dark', sassMap: '$navbar-dark-tokens', file: 'scss/_navbar.scss', selector: '.navbar[data-bs-theme=dark]', variantOf: 'navbar' },
  { name: 'navbar-nav', sassMap: '$navbar-nav-tokens', file: 'scss/_navbar.scss', selector: '.navbar-nav', variantOf: 'navbar' },
  { name: 'otp', sassMap: '$otp-tokens', file: 'scss/forms/_otp-input.scss', selector: '.otp-input' },
  { name: 'pagination', sassMap: '$pagination-tokens', file: 'scss/_pagination.scss', selector: '.pagination' },
  { name: 'placeholder', sassMap: '$placeholder-tokens', file: 'scss/_placeholder.scss', selector: '.placeholder' },
  { name: 'popover', sassMap: '$popover-tokens', file: 'scss/_popover.scss', selector: '.popover' },
  { name: 'progress', sassMap: '$progress-tokens', file: 'scss/_progress.scss', selector: '.progress' },
  { name: 'prose', sassMap: '$prose-tokens', file: 'scss/content/_prose.scss', selector: '.prose' },
  { name: 'radio', sassMap: '$radio-tokens', file: 'scss/forms/_radio.scss', selector: '.form-radio-input' },
  { name: 'range', sassMap: '$range-tokens', file: 'scss/forms/_form-range.scss', selector: '.form-range' },
  { name: 'reboot-kbd', sassMap: '$reboot-kbd-tokens', file: 'scss/content/_reboot.scss', selector: 'kbd' },
  { name: 'reboot-mark', sassMap: '$reboot-mark-tokens', file: 'scss/content/_reboot.scss', selector: 'mark' },
  { name: 'spinner-border', sassMap: '$spinner-border-tokens', file: 'scss/_spinner.scss', selector: '.spinner-border' },
  { name: 'spinner-grow', sassMap: '$spinner-grow-tokens', file: 'scss/_spinner.scss', selector: '.spinner-grow', variantOf: 'spinner-border' },
  { name: 'stepper', sassMap: '$stepper-tokens', file: 'scss/_stepper.scss', selector: '.stepper' },
  { name: 'strength', sassMap: '$strength-tokens', file: 'scss/forms/_strength.scss', selector: '.strength' },
  { name: 'stretched-link', sassMap: '$stretched-link-tokens', file: 'scss/helpers/_stretched-link.scss', selector: '.stretched-link' },
  { name: 'switch', sassMap: '$switch-tokens', file: 'scss/forms/_switch.scss', selector: '.form-switch' },
  { name: 'table', sassMap: '$table-tokens', file: 'scss/content/_tables.scss', selector: '.table' },
  { name: 'tab-pane', sassMap: '$tab-pane-tokens', file: 'scss/_nav.scss', selector: '.tab-pane', variantOf: 'nav' },
  { name: 'thumbnail', sassMap: '$thumbnail-tokens', file: 'scss/content/_images.scss', selector: '.img-thumbnail' },
  { name: 'toast', sassMap: '$toast-tokens', file: 'scss/_toasts.scss', selector: '.toast' },
  { name: 'tooltip', sassMap: '$tooltip-tokens', file: 'scss/_tooltip.scss', selector: '.tooltip' },
  { name: 'reboot-type', sassMap: '$type-tokens', file: 'scss/content/_reboot.scss', selector: ':root' }
]

export const groupByName = new Map(GROUPS.map((g) => [g.group, g]))
export const componentByName = new Map(COMPONENTS.map((c) => [c.name, c]))

/** Build the custom-property name for a `group`/`key` pair, or null if it isn't emitted. */
export function cssVarFor(group, key) {
  const meta = groupByName.get(group)
  if (!meta || meta.cssPrefix === null) return null
  if (meta.dashOptional) return key === 'default' ? meta.cssPrefix : `${meta.cssPrefix}-${key}`
  return `${meta.cssPrefix}${key}`
}

/**
 * Sass scalars that appear *inside* other token values (`$spacer * .25`). Rewriting them
 * into aliases keeps the derived relationship — change the base spacer and the whole scale
 * moves — while the exporter still evaluates the arithmetic down to a literal.
 */
export const SASS_VAR_PATHS = new Map([
  ['$spacer', 'spacing.base'],
  ['$radius', 'radius.base'],
  ['$grid-gutter-x', 'grid.gutter-x'],
  ['$grid-gutter-y', 'grid.gutter-y'],
  ['$container-padding-x', 'grid.container-padding-x'],
  ['$border-width', 'border.width'],
  ['$white', 'color.white'],
  ['$black', 'color.black']
])

/**
 * Which upstream file each global Sass declaration lives in.
 *
 * Display only — `bstokens eject` finds the declaration by scanning the checkout, so this
 * table cannot silently misdirect an edit. It exists so the chooser can name the file a
 * change will land in without having Bootstrap's sources in the browser.
 */
export const SASS_FILE_FOR = new Map([
  ['$white', 'scss/_colors.scss'],
  ['$black', 'scss/_colors.scss'],
  ['$colors', 'scss/_colors.scss'],
  ['$color-tints', 'scss/_colors.scss'],
  ['$color-shades', 'scss/_colors.scss'],
  ['$color-mix-space', 'scss/_colors.scss'],
  ['$tint-color', 'scss/_colors.scss'],
  ['$shade-color', 'scss/_colors.scss'],
  ['$spacer', 'scss/_config.scss'],
  ['$spacers', 'scss/_config.scss'],
  ['$negative-spacers', 'scss/_config.scss'],
  ['$sizes', 'scss/_config.scss'],
  ['$radius', 'scss/_config.scss'],
  ['$radii', 'scss/_config.scss'],
  ['$border-width', 'scss/_config.scss'],
  ['$border-widths', 'scss/_config.scss'],
  ['$border-style', 'scss/_config.scss'],
  ['$gradient', 'scss/_config.scss'],
  ['$breakpoints', 'scss/_config.scss'],
  ['$container-max-widths', 'scss/_config.scss'],
  ['$container-padding-x', 'scss/_config.scss'],
  ['$grid-columns', 'scss/_config.scss'],
  ['$grid-row-columns', 'scss/_config.scss'],
  ['$grid-gutter-x', 'scss/_config.scss'],
  ['$grid-gutter-y', 'scss/_config.scss'],
  ['$aspect-ratios', 'scss/_config.scss'],
  ['$position-values', 'scss/_config.scss'],
  ['$zindex-levels', 'scss/_config.scss'],
  ['$font-sizes', 'scss/_config.scss'],
  ['$font-weights', 'scss/_config.scss'],
  ['$shadows', 'scss/_config.scss'],
  ['$theme-colors', 'scss/_theme.scss'],
  ['$theme-bgs', 'scss/_theme.scss'],
  ['$theme-fgs', 'scss/_theme.scss'],
  ['$theme-borders', 'scss/_theme.scss'],
  ['$util-opacity', 'scss/_theme.scss'],
  ['$root-tokens', 'scss/_root.scss'],
  ...COMPONENTS.map((component) => [component.sassMap, component.file])
])
