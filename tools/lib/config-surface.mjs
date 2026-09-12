/**
 * Bootstrap's build options — the things that are configurable but are not design values.
 *
 * `$enable-rounded: false` squares every corner in the system, and `$button-sizes` decides
 * which classes exist at all. Both belong in an exported theme; neither is a design token,
 * and putting them in `tokens/` would turn a DTCG document into a Sass config dump. So they
 * live beside it, with their own shape, and the exporter emits both.
 *
 * Values are stored as the Sass source text rather than parsed into JS types. That keeps
 * emission lossless — `"media-query"` keeps its quotes, `4.5` stays a number, and a list
 * stays a list — and there is nothing to convert back.
 */

import { parseScalarVariable, scan } from './sass-parser.mjs'

/**
 * The value a `defaults()` call is seeded with.
 *
 * Bootstrap declares list and map options twice — `$button-sizes: () !default;` then
 * `$button-sizes: defaults(("xs", "sm", "lg"), $button-sizes);`. Reading the last
 * declaration gets the call, not the value, and emitting that back produces
 * `defaults(…, $button-sizes)` referring to a variable that does not exist yet.
 */
function unwrapDefaults(raw) {
  const value = raw.replace(/\s*!default\s*$/, '').trim()
  if (!value.startsWith('defaults(')) return value

  const open = value.indexOf('(')
  const close = scan(value, open + 1, null)
  const inner = value.slice(open + 1, close)

  // First argument, keeping its own delimiters so a list stays a list.
  const split = scan(inner, 0, ',')
  return inner.slice(0, split).trim()
}

/**
 * What we model, in the order it should be presented. `kind` drives the chooser's control
 * and nothing else; `describe` is why a reader should care.
 */
export const OPTIONS = [
  {
    name: '$enable-rounded',
    kind: 'flag',
    group: 'Appearance',
    describe: 'Off squares every corner in the system, including components that set their own radius.'
  },
  {
    name: '$enable-shadows',
    kind: 'flag',
    group: 'Appearance',
    describe: 'Off removes the depth cues from buttons and inputs. The elevation scale still exists for components that ask for it.'
  },
  {
    name: '$enable-gradients',
    kind: 'flag',
    group: 'Appearance',
    describe: 'Adds a subtle sheen over filled components. Off gives flat fills.'
  },
  {
    name: '$enable-caret',
    kind: 'flag',
    group: 'Appearance',
    describe: 'The little triangle on dropdown toggles.'
  },
  {
    name: '$enable-transitions',
    kind: 'flag',
    group: 'Motion',
    describe: 'Off removes every transition. Prefer `$enable-reduced-motion`, which respects the reader’s own setting.'
  },
  {
    name: '$enable-reduced-motion',
    kind: 'flag',
    group: 'Motion',
    describe: 'Honours `prefers-reduced-motion`. Leave this on: turning it off overrides an accessibility preference the reader set deliberately.'
  },
  {
    name: '$enable-smooth-scroll',
    kind: 'flag',
    group: 'Motion',
    describe: 'Smooth scrolling for in-page links. Off by default, and still gated on `prefers-reduced-motion` when on.'
  },
  {
    name: '$enable-grid-classes',
    kind: 'flag',
    group: 'Output size',
    describe: 'Generates `.row` and `.col-*`. Off if you lay out with CSS grid or your own system.'
  },
  {
    name: '$enable-container-classes',
    kind: 'flag',
    group: 'Output size',
    describe: 'Generates `.container` and its responsive variants.'
  },
  {
    name: '$enable-cssgrid',
    kind: 'flag',
    group: 'Output size',
    describe: 'Generates the CSS-grid layout classes alongside the flex ones.'
  },
  {
    name: '$enable-button-pointers',
    kind: 'flag',
    group: 'Appearance',
    describe: 'Gives buttons `cursor: pointer`. Off matches the native platform behaviour.'
  },
  {
    name: '$enable-deprecation-messages',
    kind: 'flag',
    group: 'Build',
    describe: 'Warns at compile time when you use something scheduled for removal. Worth leaving on.'
  },

  {
    name: '$color-mode-type',
    kind: 'choice',
    choices: ['"media-query"', '"data"'],
    group: 'Colour modes',
    describe: 'Whether dark mode follows the system setting or a `data-bs-theme` attribute you control.'
  },
  {
    name: '$min-contrast-ratio',
    kind: 'number',
    group: 'Colour modes',
    describe: 'The ratio `color-contrast()` aims for when picking text to sit on a fill. 4.5 is WCAG AA for body text.'
  },
  {
    name: '$color-contrast-dark',
    kind: 'color',
    group: 'Colour modes',
    describe: 'The dark option `color-contrast()` chooses between when deciding what to put on a fill.'
  },
  {
    name: '$color-contrast-light',
    kind: 'color',
    group: 'Colour modes',
    describe: 'The light option `color-contrast()` chooses between.'
  },

  {
    name: '$button-sizes',
    kind: 'list',
    group: 'Output size',
    describe: 'Which button size classes are generated. Dropping one removes `.btn-xs` and its CSS entirely.'
  },
  {
    name: '$pagination-sizes',
    kind: 'list',
    group: 'Output size',
    describe: 'Which pagination size classes are generated.'
  },
  {
    name: '$otp-sizes',
    kind: 'list',
    group: 'Output size',
    describe: 'Which one-time-code input size classes are generated.'
  },
  {
    name: '$strength-levels',
    kind: 'sequence',
    group: 'Appearance',
    describe: 'The names of the password strength meter’s levels, weakest first.'
  },

  {
    name: '$avatar-sizes',
    kind: 'map',
    group: 'Output size',
    describe: 'Which avatar size classes are generated, and how big each one is.'
  },
  {
    name: '$dialog-sizes',
    kind: 'map',
    group: 'Output size',
    describe: 'Which dialog size classes are generated, and the max-width of each.'
  },
  {
    name: '$form-control-sizes',
    kind: 'list',
    group: 'Output size',
    describe: 'Which form control size classes are generated. Keep in step with `$otp-sizes`.'
  },
  {
    name: '$input-group-sizes',
    kind: 'list',
    group: 'Output size',
    describe: 'Which input group size classes are generated.'
  },
  {
    name: '$validation-states',
    kind: 'map',
    group: 'Appearance',
    describe: 'Maps each validation state to the theme colour it borrows. Add a state here and its feedback classes are generated for you.'
  },

  {
    name: '$table-striped-order',
    kind: 'choice',
    choices: ['odd', 'even'],
    group: 'Appearance',
    describe: 'Which rows a striped table shades.'
  },
  {
    name: '$table-striped-columns-order',
    kind: 'choice',
    choices: ['odd', 'even'],
    group: 'Appearance',
    describe: 'Which columns a column-striped table shades.'
  },
  {
    name: '$stretched-link-pseudo-element',
    kind: 'choice',
    choices: ['after', 'before'],
    group: 'Build',
    describe: 'Which pseudo-element `.stretched-link` uses, in case it collides with your own.'
  }
]

export const optionByName = new Map(OPTIONS.map((option) => [option.name, option]))

/** Read every modelled option out of a Bootstrap checkout. */
export function extractOptions(readFile, files) {
  const found = {}

  for (const option of OPTIONS) {
    for (const file of files) {
      const raw = parseScalarVariable(readFile(file), option.name)
      if (raw === null) continue

      const value = unwrapDefaults(raw)
      if (value === '()') continue // only the empty seed declaration lives in this file

      found[option.name] = { value, kind: option.kind, file, description: option.describe }
      break
    }
  }

  return found
}

/**
 * Options whose value differs from Bootstrap's default, each carrying the default it moved
 * away from — which a list needs in order to say what was removed.
 */
export function changedOptions(base, current) {
  const changed = {}
  for (const [name, entry] of Object.entries(current)) {
    if (base[name]?.value === entry.value) continue
    changed[name] = { ...entry, base: base[name]?.value }
  }
  return changed
}

/**
 * Render an option for a `@use … with ()` block.
 *
 * The size options need converting. `defaults()` turns its *defaults* argument from a list
 * into a map, but never touches the override — so passing `("sm", "lg")` back reaches
 * `map.merge(map, list)` and fails to compile. Emitting the map form that `defaults()` would
 * have produced is equivalent and actually works. See issue #13.
 */
export function renderOption(name, entry) {
  const option = optionByName.get(name)
  const value = entry.value

  if (option?.kind === 'list') {
    const wanted = items(value)

    // `defaults()` *merges*, so listing the sizes you want keeps the ones you left out.
    // Dropping one takes an explicit null, which is the removal mechanism upstream
    // documents for every one of its maps.
    const removed = items(entry.base ?? value).filter((item) => !wanted.includes(item))

    return `(${[
      ...wanted.map((item) => `${item}: true`),
      ...removed.map((item) => `${item}: null`)
    ].join(', ')})`
  }

  // A bare comma list would be read as two arguments inside `with (…)`.
  return /^[^("']*,/.test(value) ? `(${value})` : value
}

const items = (value) =>
  value
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
