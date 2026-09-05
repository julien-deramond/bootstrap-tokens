/**
 * What each token is *for*.
 *
 * The document had four descriptions across 1203 tokens, which made it a config file with
 * extra syntax. A description earns its place only by saying something the name does not —
 * "the alert's horizontal padding" is worse than nothing, because it costs a line and
 * teaches nothing. So these concentrate on the semantic layer, where the difference between
 * `fg` and `fg-emphasis` is a decision rather than a value, and on the handful of tokens
 * elsewhere that behave surprisingly.
 *
 * Two families are templated rather than written out. The nine theme-colour sub-keys mean
 * the same thing for every role, and the seven control metrics mean the same thing at every
 * size — writing 72 and 28 near-identical strings would invite them to drift apart.
 */

/** The eight semantic colour roles. */
const ROLES = {
  primary: 'The main brand colour. Buttons, links and focus rings default to it.',
  accent: 'A second brand colour, for highlights that should not compete with primary.',
  success: 'Confirmation: something finished, saved or passed validation.',
  danger: 'Destruction or failure — deletions, errors, and the confirmations that guard them.',
  warning: 'Something needs attention but has not failed yet.',
  info: 'Neutral information that is worth noticing but carries no verdict.',
  inverse: 'Reverses against the page: dark on a light page, light on a dark one. For surfaces that should dominate.',
  secondary: 'Low emphasis. For controls that should recede behind the primary action.'
}

/** The nine sub-keys every role carries. `{role}` is substituted. */
const SUB_KEYS = {
  base: 'The solid {role} colour, unmodified. Use it when you need the hue itself rather than a surface or a text role.',
  fg: '{Role} text on the page background — darkened in light mode and lightened in dark, so it stays readable in both.',
  'fg-emphasis':
    'A higher-contrast {role} text colour, for headings or for text sitting on a {role}-tinted surface.',
  bg: 'A solid {role} fill. Pair it with `contrast` for anything placed on top.',
  'bg-subtle': 'A lightly tinted {role} surface — the usual background for alerts and subtle badges.',
  'bg-muted': 'A stronger tint than `bg-subtle`, for hover and active states on tinted surfaces.',
  border:
    'A {role} border against the page background — tinted enough to read as {role}, calm enough not to compete with the fill.',
  'focus-ring':
    'The focus ring for {role} controls. Mixed with the page background, so it stays visible in either scheme.',
  contrast:
    'Text and icons placed *on* `bg`. Chosen for legibility rather than hue, so it is usually white or near-black.'
}

/** The seven metrics every control size carries. `{size}` is substituted. */
const CONTROL_METRICS = {
  gap: 'Space between a control’s icon and its label{size}.',
  'min-height': 'Minimum height of a button or form field{size}. This is what sets the vertical rhythm of a form.',
  'padding-y': 'Vertical padding inside a button or form field{size}.',
  'padding-x': 'Horizontal padding inside a button or form field{size}.',
  'font-size': 'Text size inside a button or form field{size}.',
  'line-height':
    'Leading inside a button or form field{size}. Together with the padding it decides how tall the control ends up.',
  'border-radius':
    'Corner rounding on a button or form field{size}. Taken from the radius scale, so it moves when the base radius does.'
}

const SIZE_NAMES = { xs: ' at the extra-small size', sm: ' at the small size', lg: ' at the large size' }

/** Everything else, written individually. */
const TOKENS = {
  // --- neutral surface ramp -------------------------------------------------
  'bg.body': 'The page background. Every other surface is measured against it.',
  'bg.1': 'The first raised surface — card headers, table stripes, anything a step above the page.',
  'bg.2': 'A second step up, for a surface raised above one that is already raised.',
  'bg.3': 'A third step, used mostly for disabled controls and inset wells.',
  'bg.4': 'The strongest neutral fill before you reach an inverted surface.',
  'bg.fg': 'The foreground colour used as a background — for inverted blocks that flip the page around.',
  'bg.white': 'Fixed white in both schemes. Use it when a surface must not follow the theme.',
  'bg.black': 'Fixed black in both schemes. Use it when a surface must not follow the theme.',
  'bg.transparent': 'No background at all. Use it to clear an inherited one.',
  'bg.inherit': 'Take whatever background the parent has. A CSS-wide keyword, so it cannot be stored in a custom property.',

  'fg.body': 'Primary body text. The default reading colour.',
  'fg.1': 'Slightly de-emphasised text — secondary lines that still have to be read comfortably.',
  'fg.2': 'Supporting text: captions, helper text under a field, table metadata.',
  'fg.3': 'Faint text for labels and placeholders. Below WCAG AA for body copy, so keep it off long prose.',
  'fg.4': 'The faintest step, for decorative or disabled text only. It does not meet WCAG AA at any size.',
  'fg.bg': 'The page background used as a text colour — for text on an inverted surface.',
  'fg.white': 'Fixed white in both schemes, for text that must stay light whatever the theme does.',
  'fg.black': 'Fixed black in both schemes, for text that must stay dark whatever the theme does.',
  'fg.inherit': 'Take whatever text colour the parent has.',

  // --- borders --------------------------------------------------------------
  'border.width': 'The default border width. Components reference it rather than hard-coding 1px.',
  'border.width-keyline': 'A sub-pixel hairline for dividers that should read as a seam rather than a border.',
  'border.style':
    'The default border style. Every component reads it, so switching to `dashed` restyles the whole system rather than one element.',
  'border.color': 'The default border colour, for anything that does not choose a more specific one.',
  'border.color-translucent':
    'A border mixed from the foreground rather than a fixed grey, so it works over any surface underneath.',
  'border.bg': 'A border the colour of the page — used to punch a gap between adjacent filled elements.',
  'border.body': 'The standard visible border. Stronger than `subtle`, calmer than `emphasized`.',
  'border.muted': 'A quieter border for grouping without drawing a line the eye stops at.',
  'border.subtle': 'The faintest border. For separating areas that are already distinguished by space.',
  'border.emphasized': 'A deliberately visible border, for focus targets and selected states.',
  'border.white': 'Fixed white in both schemes, for an edge that must stay light whatever the theme does.',
  'border.black': 'Fixed black in both schemes, for an edge that must stay dark whatever the theme does.',

  // --- control states -------------------------------------------------------
  'control.checked-bg': 'Fill of a checkbox, radio or switch once it is on.',
  'control.checked-border-color': 'Border of a checked control. Follows the checked fill unless you separate them.',
  'control.active-bg': 'Fill of a control while it is being pressed.',
  'control.active-border-color':
    'Border of a control while it is being pressed. Follows the active fill unless you set the two apart.',
  'control.disabled-bg':
    'Fill of a control that cannot be used. Combined with the disabled opacity below, so the two compound.',
  'control.disabled-opacity':
    'How far a disabled control fades. Applied on top of the disabled fill, so both compound.',
  'control.transition-duration': 'How long a checkbox or radio mark takes to appear.',
  'control.transition-timing':
    'Easing for a checkbox or radio mark. Overshoots slightly, so the mark pops rather than slides.',
  'control.field.fg':
    'Text colour shared by buttons and form fields, so an unstyled button matches an input beside it.',
  'control.field.bg':
    'Background shared by buttons and form fields. Variants paint over it; this is what an unstyled control shows.',

  // --- elevation ------------------------------------------------------------
  'elevation.color':
    'The colour every shadow is tinted from. Set it to a hue and the whole elevation scale warms or cools with it.',
  'shadow.default': 'The everyday shadow. Three layers, so it stays soft rather than reading as a hard edge.',
  'shadow.xs': 'A single-layer shadow for elements barely lifted off the page.',
  'shadow.sm': 'Two layers, for resting cards and small popovers.',
  'shadow.lg': 'Four layers, for menus and anything that overlaps content.',
  'shadow.xl': 'The deepest scale step, for dialogs and drawers that should detach from the page.',
  'shadow.inset': 'An inward shadow, for wells and pressed states.',

  // --- focus ----------------------------------------------------------------
  'focus.width': 'Thickness of the focus ring. Do not go below 2px: this is the only cue a keyboard user gets.',
  'focus.offset': 'Gap between a control and its focus ring, so the ring stays legible against the control.',
  'focus.color': 'Colour of the focus ring. Follows the primary role by default.',
  'focus.ring': 'The whole focus ring shorthand, composed from the width and colour above.',

  // --- typography -----------------------------------------------------------
  'type.body.font-family':
    'The body font stack. It deliberately omits `system-ui`, which resolves to the locale’s UI font and renders non-Latin text incorrectly.',
  'type.body.font-size': 'Base text size. Component sizes that reference it follow; the fluid heading scale does not.',
  'type.body.font-weight':
    'Weight of ordinary running text. Headings set their own, so this governs paragraphs and labels.',
  'type.body.line-height':
    'Leading for running text. Headings override it, so this mostly decides how dense a paragraph feels.',
  'type.heading.color': 'Heading colour. Inherits by default, so headings match body text unless you separate them.',
  'type.hr.border-color': 'Colour of a horizontal rule, and of the divider inside an alert or a card.',
  'type.link.color': 'Link colour. Uses the solid brand colour in light mode and the lighter text variant in dark.',
  'type.link.hover-color': 'Link colour on hover — the base colour darkened, so the shift reads without changing hue.',
  'type.link.decoration':
    'How a link is marked. Removing the underline leaves colour as the only cue, which fails for readers who cannot distinguish it.',
  'type.link.underline-offset':
    'How far the underline sits below the text. Enough clearance keeps it from cutting through descenders.',
  'type.code.font-family': 'The monospace stack, for code and any figure that should align in columns.',
  'type.code.font-size': 'Code size relative to its surrounding text, so inline code does not tower over the line.',
  'type.code.color': 'Colour of inline code, set a step away from running text so it reads as a quotation.',

  // --- everything else ------------------------------------------------------
  'motion.timing-overlay':
    'Shared easing for overlays — dialogs, drawers and menus — so they all enter with the same character.',
  'decoration.gradient': 'The sheen laid over filled components when `$enable-gradients` is on.',
  'strength.transition': 'How the password strength meter animates as it fills.',

  // --- primitives worth a note ----------------------------------------------
  'spacing.base': 'The base spacer. Every step of the spacing scale is a multiple of it, so changing it rescales the whole system.',
  'radius.base':
    'The base radius. Every step of the 0–9 scale is a multiple of it, so one change rounds or squares every component at once.',
  'color.white': 'Pure white, referenced by the tint half of every colour scale.',
  'color.black': 'Pure black, referenced by the shade half of every colour scale.',
  'color-mix.space': 'The interpolation space every generated colour step is mixed in.',
  'color-mix.tint-color': 'What tints are mixed towards — the light end of every scale.',
  'color-mix.shade-color': 'What shades are mixed towards — the dark end of every scale.',
  'grid.gutter-x':
    'Horizontal gutter between grid columns. It also sets the default container padding, so it decides the page margin too.',
  'grid.gutter-y':
    'Vertical gutter between grid rows. Zero by default, so rows sit flush together unless you opt in.',
  'grid.columns':
    'How many columns a row divides into. Every `.col-*` class is generated from it, so this is a wider change than it looks.',
  'grid.row-columns': 'The highest count a `.row-cols-*` layout offers before you have to write your own.',
  'grid.container-padding-x':
    'Inline padding inside a container, holding content clear of the viewport edge on small screens.'
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * A component token that reads a `--theme-*` hook behaves differently from one that does
 * not, and nothing in its name says so: it changes with the `.theme-*` class on an ancestor
 * and falls back only when there is none. That is worth a sentence; "the alert's background"
 * is not.
 */
const THEME_HOOK = /var\(--theme-([\w-]+),/

export function describeThemeHook(value) {
  const hook = THEME_HOOK.exec(String(value ?? ''))
  if (!hook) return null

  return `Follows the \`.theme-*\` class on an ancestor through \`--theme-${hook[1]}\`, and uses the fallback only when no theme class is set.`
}

/** The description for a token path, or null when it does not need one. */
export function describe(path) {
  if (TOKENS[path]) return TOKENS[path]

  const theme = /^theme-color\.([\w-]+)\.([\w-]+)$/.exec(path)
  if (theme) {
    const [, role, key] = theme
    const template = SUB_KEYS[key]
    if (!template) return null
    return template.replaceAll('{role}', role).replaceAll('{Role}', capitalise(role))
  }

  const control = /^control\.field\.(?:(xs|sm|lg)\.)?([\w-]+)$/.exec(path)
  if (control) {
    const [, size, metric] = control
    const template = CONTROL_METRICS[metric]
    if (!template) return null
    return template.replace('{size}', size ? SIZE_NAMES[size] : '')
  }

  return null
}

/** The description for a whole theme-colour role group. */
export const describeRole = (role) => ROLES[role] ?? null

export { ROLES, SUB_KEYS }
