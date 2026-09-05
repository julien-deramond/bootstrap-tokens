/**
 * The Bootstrap token chooser.
 *
 * It imports the same resolver, the same routing table and the same Sass emitter the CLI
 * uses — `bstokens verify` proves that pipeline reproduces upstream byte for byte, so what
 * you see here and what you compile are the same thing by construction.
 */

import { ext, index, walk, childKeys, authoredValue } from '../tools/lib/tokens.mjs'
import { expandColorScales } from '../tools/lib/color-scale.mjs'
import { COMPONENTS } from '../tools/lib/sass-targets.mjs'
import { FILE_FOR_GROUP, GROUP_DESCRIPTIONS } from '../tools/lib/curation.mjs'
import {
  clone,
  withOverrides,
  diffResolved,
  themeCss,
  themeScss,
  themeJson,
  mapsTouched
} from '../tools/lib/overrides.mjs'
import { sourceEdits } from '../tools/lib/source-value.mjs'
import { DIALS, PRESETS, HUES, hueOfRole, repointRole, selectedOption } from './easy.js'
import { parseComputedColor, formatColor, hexToRgb, rgbToHex, contrastRatio, contrastGrade } from './color.js'

const STORAGE_KEY = 'bootstrap-tokens.chooser.v1'
const MODE_KEY = 'bootstrap-tokens.chooser.mode'

const PRIMITIVE_ORDER = [
  'color',
  'color-tint',
  'color-shade',
  'color-mix',
  'spacing',
  'spacing-negative',
  'size',
  'radius',
  'border-width',
  'font-size',
  'line-height',
  'font-weight',
  'breakpoint',
  'container',
  'grid',
  'aspect-ratio',
  'position',
  'z-index',
  'opacity'
]

const SEMANTIC_ORDER = [
  'theme-color',
  'bg',
  'fg',
  'border',
  'type',
  'elevation',
  'shadow',
  'focus',
  'control',
  'motion',
  'decoration'
]

const LABELS = {
  'color-tint': 'Tint recipe',
  'color-shade': 'Shade recipe',
  'color-mix': 'Mixing inputs',
  'spacing-negative': 'Negative spacing',
  'theme-color': 'Theme colours',
  bg: 'Backgrounds',
  fg: 'Foregrounds',
  type: 'Typography',
  'z-index': 'Z-index',
  'font-size': 'Font sizes',
  'line-height': 'Line heights',
  'font-weight': 'Font weights'
}

const label = (id) => LABELS[id] ?? id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

const $ = (selector) => document.querySelector(selector)

const state = {
  baseTree: null,
  baseDoc: null,
  doc: null,
  meta: { bootstrap: 'unknown' },
  overrides: load(),
  mode: loadMode(),
  section: 'theme-color',
  // Side by side is the point on a wide screen; on a narrow one it halves an already small
  // preview, so start from the reader's own preference there.
  scheme: globalThis.innerWidth >= 1024
    ? 'split'
    : (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  query: '',
  exportTab: 'scss',
  previewReady: false,
  past: [],
  future: []
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides))
  } catch {
    /* private browsing — the session still works, it just won't persist */
  }
}

/** Simple is the default: most people want a theme, not a token browser. */
function loadMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

function setMode(mode) {
  state.mode = mode
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* ignore */
  }
  render()
}

/* ---------------------------------------------------------------- sections */

/**
 * Sixty components in one alphabetical list is a scan, not a menu. Grouping them the way
 * people think about interfaces means you can find "the thing I'm looking at" without
 * knowing its Bootstrap name.
 */
const COMPONENT_GROUPS = [
  { title: 'Forms', names: ['form-control', 'form-label', 'form-text', 'form-adorn', 'form-floating', 'check', 'radio', 'switch', 'range', 'input-group-addon', 'chip-input', 'otp', 'strength'] },
  { title: 'Actions', names: ['btn', 'button-link', 'button-styled', 'btn-close', 'icon-link'] },
  { title: 'Navigation', names: ['nav', 'nav-tabs', 'nav-pills', 'nav-underline', 'tab-pane', 'navbar', 'navbar-dark', 'navbar-nav', 'breadcrumb', 'pagination', 'menu', 'stepper'] },
  { title: 'Feedback', names: ['alert', 'badge', 'chip', 'progress', 'spinner-border', 'spinner-grow', 'placeholder', 'toast', 'tooltip', 'popover'] },
  { title: 'Overlays', names: ['dialog', 'drawer', 'drawer-backdrop'] },
  { title: 'Content', names: ['card', 'list-group', 'accordion', 'table', 'blockquote', 'figure', 'thumbnail', 'prose', 'reboot-type', 'reboot-kbd', 'reboot-mark', 'avatar', 'carousel', 'calendar', 'datepicker', 'hover-lift', 'stretched-link'] }
]

function sections() {
  const groups = new Set(Object.keys(state.baseDoc.tree))
  const componentNames = new Set(COMPONENTS.map((c) => c.name))

  const primitive = PRIMITIVE_ORDER.filter((id) => groups.has(id))
  const semantic = SEMANTIC_ORDER.filter((id) => groups.has(id))

  const unlisted = [...groups].filter(
    (id) => !primitive.includes(id) && !semantic.includes(id) && !componentNames.has(id)
  )

  const grouped = COMPONENT_GROUPS.map((group) => ({
    title: group.title,
    items: group.names.filter((id) => groups.has(id)).map((id) => ({ id, label: id }))
  }))

  // Anything the grouping forgot still has to be reachable.
  const placed = new Set(COMPONENT_GROUPS.flatMap((group) => group.names))
  const rest = [...componentNames].filter((id) => groups.has(id) && !placed.has(id)).sort()
  if (rest.length > 0) grouped.push({ title: 'Other', items: rest.map((id) => ({ id, label: id })) })

  return [
    { title: 'Semantic', items: semantic.map((id) => ({ id, label: label(id) })) },
    { title: 'Primitive', items: [...primitive, ...unlisted].map((id) => ({ id, label: label(id) })) },
    ...grouped
  ]
}

/** The token paths a section shows, filtered by the search box. */
function pathsFor(sectionId) {
  const paths = []
  const group = state.doc.tree[sectionId]

  if (group) {
    for (const [suffix, token] of walk(group)) {
      if (ext(token).generated) continue
      paths.push(`${sectionId}.${suffix}`)
    }
  }

  if (!state.query) return paths
  const needle = state.query.toLowerCase()
  return paths.filter((path) => {
    const cssVar = ext(state.doc.tokens.get(path)).cssVar ?? ''
    return path.toLowerCase().includes(needle) || cssVar.toLowerCase().includes(needle)
  })
}

/** Sections that currently match the search, so the rail can narrow with the results. */
function searchMatches() {
  if (!state.query) return null
  const needle = state.query.toLowerCase()
  const counts = new Map()

  for (const [path, token] of walk(state.doc.tree)) {
    if (ext(token).generated) continue
    const cssVar = ext(token).cssVar ?? ''
    if (!path.toLowerCase().includes(needle) && !cssVar.toLowerCase().includes(needle)) continue
    const group = path.split('.')[0]
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return counts
}

/* ------------------------------------------------------------------ values */

/** The editable string for a token: the override if any, else its authored value. */
function editableValue(path, side = 'value') {
  const override = state.overrides[path]
  if (override && override[side] !== undefined && override[side] !== null) return override[side]

  return authoredValue(state.baseDoc.tokens.get(path), side)
}

const isChanged = (path) => Object.hasOwn(state.overrides, path)

/**
 * Every mutation goes through here, so exploring is always reversible.
 *
 * A tool whose whole purpose is "try a value and see" needs undo more than it needs almost
 * anything else; without it the only way back is a destructive Reset, which makes people
 * stop experimenting.
 */
function mutate(change) {
  state.past.push(JSON.stringify(state.overrides))
  if (state.past.length > 100) state.past.shift()
  state.future.length = 0

  change()

  save()
  recompute()
  render()
}

function undo() {
  const previous = state.past.pop()
  if (previous === undefined) return

  state.future.push(JSON.stringify(state.overrides))
  state.overrides = JSON.parse(previous)
  save()
  recompute()
  render()
}

function redo() {
  const next = state.future.pop()
  if (next === undefined) return

  state.past.push(JSON.stringify(state.overrides))
  state.overrides = JSON.parse(next)
  save()
  recompute()
  render()
}

/** Record one edit without touching the DOM, so batches apply as a single update. */
function writeOverride(path, side, value) {
  const base = editableBase(path, side)
  const next = { ...(state.overrides[path] ?? {}) }

  if (value === base || value === undefined) delete next[side]
  else next[side] = value

  if (Object.keys(next).length === 0) delete state.overrides[path]
  else state.overrides[path] = next
}

function setOverride(path, side, value) {
  mutate(() => writeOverride(path, side, value))
}

/** Apply a `{ path: value | { value, dark } }` batch — how every Simple-mode dial writes. */
function applyValues(values, { focus = null } = {}) {
  mutate(() => {
    for (const [path, entry] of Object.entries(values)) {
      const override = typeof entry === 'string' ? { value: entry } : entry
      if ('value' in override) writeOverride(path, 'value', override.value)
      if ('dark' in override) writeOverride(path, 'dark', override.dark)
    }
  })
  if (focus) postToPreview({ focus })
}

function editableBase(path, side) {
  return authoredValue(state.baseDoc.tokens.get(path), side)
}

function clearOverride(path) {
  mutate(() => {
    delete state.overrides[path]
  })
}

/* ----------------------------------------------------------------- probing */

let probe = null

/**
 * The probe lives inside the preview document on purpose. A token value like
 * `var(--theme-bg-subtle, var(--bg-1))` or `color-mix(in oklch, var(--blue-500) 50%, …)`
 * only means something where Bootstrap's custom properties exist, so the swatch asks the
 * previewed page what the value resolves to rather than trying to compute it here.
 */
function ensureProbe() {
  const document_ = $('#preview').contentDocument
  if (!document_?.body) return null
  if (probe?.ownerDocument === document_ && probe.isConnected) return probe

  probe = document_.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'
  document_.body.append(probe)
  return probe
}

/** Ask the browser what a CSS colour actually resolves to. */
function resolveColor(css, scheme) {
  if (!css) return null
  const element = ensureProbe()
  if (!element) return null

  try {
    element.style.colorScheme = scheme
    element.style.color = ''
    element.style.color = css
    if (!element.style.color) return null
    return parseComputedColor(element.ownerDocument.defaultView.getComputedStyle(element).color)
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- rendering */

function renderRail() {
  const matches = searchMatches()
  const rail = $('#rail')
  rail.textContent = ''

  for (const group of sections()) {
    const items = group.items.filter((item) => !matches || matches.has(item.id))
    if (items.length === 0) continue

    const heading = document.createElement('div')
    heading.className = 'rail-group'
    heading.textContent = group.title
    rail.append(heading)

    for (const item of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'rail-item'
      button.setAttribute('aria-current', String(item.id === state.section))

      const name = document.createElement('span')
      name.textContent = item.label

      const count = document.createElement('span')
      count.className = 'count'
      if (matches?.has(item.id)) count.textContent = String(matches.get(item.id))
      else if (changedIn(item.id) > 0) {
        count.className = 'count dot'
        count.textContent = `${changedIn(item.id)} ●`
      }

      button.append(name, count)
      button.addEventListener('click', () => {
        state.section = item.id
        render()
      })
      rail.append(button)
    }
  }
}

function changedIn(sectionId) {
  return Object.keys(state.overrides).filter((path) => path.split('.')[0] === sectionId).length
}

/**
 * Whether the sample actually renders a component, asked of the preview rather than kept in
 * a list here.
 *
 * A hand-maintained list would go stale the first time the sample changed, and the failure
 * mode is the one this is meant to prevent: the panel claiming something is visible when it
 * is not. Forty of sixty-two components had no markup at all, so editing their tokens
 * changed nothing on screen and the tool said nothing about it.
 */
function isPreviewed(component) {
  const document_ = $('#preview').contentDocument
  if (!document_) return true

  const selector = component.selector.split(',')[0].trim()
  try {
    return Boolean(document_.querySelector(selector))
  } catch {
    return true
  }
}

function renderEditor() {
  const paths = pathsFor(state.section)
  const component = COMPONENTS.find((c) => c.name === state.section)

  $('#section-title').textContent = label(state.section)

  const note = $('#section-note')
  note.textContent = component
    ? `Emitted on ${component.selector} · ${component.sassMap}`
    : (GROUP_DESCRIPTIONS[state.section] ?? '')

  const warning = $('#section-warning')
  const unpreviewed = component && !isPreviewed(component)
  warning.hidden = !unpreviewed
  if (unpreviewed) {
    warning.textContent = `The sample does not render ${component.selector}, so changes here will not show in the preview. They still export.`
  }

  const editor = $('#editor')
  editor.textContent = ''

  if (paths.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'

    if (state.query) {
      // A filtered empty state names the query and offers the way out of it.
      empty.append(`No tokens match “${state.query}” in ${label(state.section)}. `)

      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'link-button'
      clear.textContent = 'Clear search'
      clear.addEventListener('click', () => {
        state.query = ''
        $('#search').value = ''
        render()
      })
      empty.append(clear)
    } else {
      empty.textContent = 'No editable tokens in this group.'
    }

    editor.append(empty)
    return
  }

  const fragment = document.createDocumentFragment()
  for (const path of paths) fragment.append(renderToken(path))
  editor.append(fragment)
}

function renderToken(path) {
  const token = state.doc.tokens.get(path)
  const meta = ext(token)

  const row = document.createElement('div')
  row.className = `token${isChanged(path) ? ' is-changed' : ''}`

  const name = document.createElement('div')
  name.className = 'token-name'

  const code = document.createElement('code')
  code.textContent = path
  name.append(code)

  if (meta.cssVar) {
    const cssVar = document.createElement('span')
    cssVar.className = 'cssvar'
    cssVar.textContent = meta.cssVar
    name.append(cssVar)
  }

  if (token.$description) {
    const description = document.createElement('span')
    description.className = 'desc'
    description.textContent = token.$description
    name.append(description)
  }

  const controls = document.createElement('div')
  controls.className = 'token-controls'

  if (meta.readonly) {
    const note = document.createElement('span')
    note.className = 'readonly-note'
    note.textContent = meta.readonly
    controls.append(note)
  } else {
    const hasDark = Boolean(ext(state.baseDoc.tokens.get(path)).dark) || Boolean(state.overrides[path]?.dark)
    controls.append(renderField(path, 'value', hasDark ? 'light' : '', token))
    if (hasDark) controls.append(renderField(path, 'dark', 'dark', token))
  }

  if (isChanged(path)) {
    const reset = document.createElement('button')
    reset.type = 'button'
    reset.className = 'token-reset'
    reset.textContent = 'Reset to default'
    reset.addEventListener('click', () => {
      clearOverride(path)
    })
    controls.append(reset)
  }

  row.append(name, controls)
  return row
}

function renderField(path, side, modeLabel, token) {
  const field = document.createElement('div')
  field.className = 'field'

  if (modeLabel) {
    const mode = document.createElement('span')
    mode.className = 'mode'
    mode.textContent = modeLabel
    field.append(mode)
  }

  const isColor = token.$type === 'color'
  const resolved = isColor ? resolvedSide(path, side) : null
  const rgb = isColor ? resolveColor(resolved, side === 'dark' ? 'dark' : 'light') : null

  if (isColor) {
    const swatch = document.createElement('span')
    swatch.className = 'swatch'
    swatch.title = resolved ?? ''
    const inner = document.createElement('span')
    inner.style.background = rgb ? rgbToHex(rgb) : 'transparent'
    swatch.append(inner)
    field.append(swatch)
  }

  const input = document.createElement('input')
  input.type = 'text'
  input.spellcheck = false
  input.value = editableValue(path, side)
  input.setAttribute('aria-label', `${path} ${side === 'dark' ? 'dark value' : 'value'}`)
  input.addEventListener('change', () => {
    setOverride(path, side, input.value.trim())
  })
  field.append(input)

  // A native picker only makes sense when the authored value is a literal colour; a token
  // that aliases another one should keep its alias rather than being flattened to a swatch.
  if (isColor && rgb && isLiteralColor(input.value)) {
    const picker = document.createElement('input')
    picker.type = 'color'
    picker.value = rgbToHex(rgb)
    picker.setAttribute('aria-label', `${path} colour picker`)
    picker.addEventListener('input', () => {
      setOverride(path, side, formatColor(hexToRgb(picker.value), input.value))
    })
    field.append(picker)
  }

  const contrast = isColor ? renderContrast(path, side) : null
  if (contrast) field.append(contrast)

  return field
}

/**
 * The colour pairs a reader actually has to be able to see. `contrast` is the text placed on
 * a role's solid fill, and `fg`/`fg-emphasis` are that role's text on the page background —
 * exactly the two places a re-tinted palette quietly goes unreadable.
 */
function contrastPartner(path) {
  const theme = /^theme-color\.([\w-]+)\.(contrast|fg|fg-emphasis)$/.exec(path)
  if (theme) {
    return theme[2] === 'contrast'
      ? { partner: `theme-color.${theme[1]}.bg`, label: 'on fill' }
      : { partner: 'bg.body', label: 'on page' }
  }
  if (/^fg\.\d$/.test(path) || path === 'fg.body') return { partner: 'bg.body', label: 'on page' }
  if (path === 'type.link.color' || path === 'type.link.hover-color') return { partner: 'bg.body', label: 'on page' }
  return null
}

function renderContrast(path, side) {
  const pair = contrastPartner(path)
  if (!pair || !state.doc.tokens.has(pair.partner)) return null

  const scheme = side === 'dark' ? 'dark' : 'light'
  const foreground = resolveColor(resolvedSide(path, side), scheme)
  const background = resolveColor(resolvedSide(pair.partner, side), scheme)
  if (!foreground || !background) return null

  const ratio = contrastRatio(foreground, background)
  const grade = contrastGrade(ratio)

  const badge = document.createElement('span')
  badge.className = `contrast${grade.ok === true ? ' is-pass' : grade.ok === false ? ' is-fail' : ' is-warn'}`
  badge.textContent = `${ratio.toFixed(1)}:1 ${grade.level}`
  badge.title = `WCAG contrast of ${path} ${pair.label} (${pair.partner}), ${scheme} scheme`
  return badge
}

const isLiteralColor = (value) => /^(#|rgb|hsl|oklch|oklab|lab|lch|color\()/i.test(String(value).trim())

function resolvedSide(path, side, doc = state.doc) {
  try {
    const full = doc.cssValueOf(path)
    const pair = /^light-dark\((.*)\)$/s.exec(full)
    if (!pair) return full
    const split = splitTop(pair[1])
    return side === 'dark' ? split[1] : split[0]
  } catch {
    return null
  }
}

function splitTop(value) {
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++
    else if (value[i] === ')') depth--
    else if (value[i] === ',' && depth === 0) return [value.slice(0, i).trim(), value.slice(i + 1).trim()]
  }
  return [value, value]
}

/* ------------------------------------------------------------- simple mode */

const read = (path, side = 'value') => editableValue(path, side)

/** Which colour schemes the panel should report on, following the preview. */
const shownSchemes = () => (state.scheme === 'split' ? ['light', 'dark'] : [state.scheme])

/** The token paths every dial owns, so we can tell "edited elsewhere" from "edited here". */
function dialTokens() {
  const paths = new Set()
  for (const dial of DIALS) {
    if (dial.kind === 'choice') {
      for (const option of dial.options) for (const path of Object.keys(option.values)) paths.add(path)
      continue
    }
    for (const key of ['base', 'fg', 'fg-emphasis', 'bg', 'bg-subtle', 'bg-muted', 'border', 'focus-ring', 'contrast']) {
      paths.add(`theme-color.${dial.role}.${key}`)
    }
    const hue = hueOfRole(state.doc, dial.role, read)
    if (hue) paths.add(`color.${hue}.base`)
  }
  return paths
}

/** Resolve a hue's 500 step to an actual colour, for swatches and contrast decisions. */
function hueColor(hue, scheme = 'light') {
  try {
    return resolveColor(state.doc.cssValueOf(`color.${hue}.500`), scheme)
  } catch {
    return null
  }
}

/**
 * Pick the text colour that sits on a role's fill. White on yellow is the default a naive
 * substitution would produce, and it is unreadable — so choose by measured contrast.
 */
function contrastTokenFor(hue) {
  const fill = hueColor(hue)
  if (!fill) return '{color.white}'

  const onWhite = contrastRatio(fill, [255, 255, 255])
  const dark = resolveColor(state.doc.cssValueOf('color.gray.900'), 'light') ?? [17, 17, 17]
  return onWhite >= contrastRatio(fill, dark) ? '{color.white}' : '{color.gray.900}'
}

function renderSimple() {
  const container = $('#simple')
  container.textContent = ''
  container.append(renderPresets())

  let section = null
  for (const dial of DIALS) {
    if (dial.section !== section) {
      section = dial.section
      const heading = document.createElement('h3')
      heading.className = 'dial-section'
      heading.textContent = section
      container.append(heading)
    }
    container.append(dial.kind === 'hue' ? renderHueDial(dial) : renderChoiceDial(dial))
  }

  container.append(renderSimpleFooter())
}

function renderPresets() {
  const row = document.createElement('div')
  row.className = 'presets'

  const label = document.createElement('span')
  label.className = 'presets-label'
  label.textContent = 'Start from'
  row.append(label)

  for (const preset of PRESETS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'chip-button'
    button.textContent = preset.label
    button.addEventListener('click', () => applyPreset(preset))
    row.append(button)
  }

  return row
}

/**
 * A preset clears every dial-owned token before applying its own, so it is a *state*, not a
 * merge — and the whole thing is one history entry, so one undo takes you back.
 */
function applyPreset(preset) {
  const values = {}
  for (const path of dialTokens()) values[path] = { value: undefined, dark: undefined }

  for (const dial of DIALS) {
    const choice = preset.dials[dial.id]
    if (!choice) continue

    if (dial.kind === 'hue') {
      Object.assign(values, hueValues(dial, choice))
      continue
    }
    const option = dial.options.find((candidate) => candidate.label === choice)
    if (option) Object.assign(values, option.values)
  }

  applyValues(values, { focus: 'buttons' })
}

function hueValues(dial, toHue) {
  // Repointing always starts from Bootstrap's own definition, not the current one, so
  // switching hue twice does not compound substitutions.
  const readBase = (path, side = 'value') => authoredValue(state.baseDoc.tokens.get(path), side)

  const fromHue = hueOfRole(state.baseDoc, dial.role, readBase)
  if (!fromHue) return {}

  return repointRole(state.baseDoc, dial.role, fromHue, toHue, {
    read: readBase,
    contrastFor: contrastTokenFor
  })
}

function dialShell(dial, current) {
  const row = document.createElement('div')
  row.className = `dial${current === null ? ' is-custom' : ''}`

  const head = document.createElement('div')
  head.className = 'dial-head'

  const label = document.createElement('label')
  label.className = 'dial-label'
  label.textContent = dial.label
  head.append(label)

  if (current === null) {
    const custom = document.createElement('span')
    custom.className = 'dial-custom'
    custom.textContent = 'Custom'
    custom.title = 'These tokens hold a value none of these options represents. The All tokens tab shows it.'
    head.append(custom)
  }

  // Progressive disclosure: eight permanently-visible explanations is a wall of text before
  // the user has done anything. The label carries the meaning; the rest is on request.
  const info = document.createElement('button')
  info.type = 'button'
  info.className = 'dial-info'
  info.textContent = '?'
  info.setAttribute('aria-expanded', 'false')
  info.setAttribute('aria-label', `What does ${dial.label} change?`)
  head.append(info)

  row.append(head)

  const help = document.createElement('p')
  help.className = 'dial-help'
  help.textContent = dial.help
  help.hidden = true
  info.addEventListener('click', () => {
    help.hidden = !help.hidden
    info.setAttribute('aria-expanded', String(!help.hidden))
  })
  row.append(help)

  return row
}

function renderChoiceDial(dial) {
  const current = selectedOption(dial, read)
  const row = dialShell(dial, current)

  const group = document.createElement('div')
  group.className = dial.swatch ? 'dial-swatches' : 'segmented dial-options'
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', dial.label)

  for (const option of dial.options) {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-pressed', String(current === option))
    button.addEventListener('click', () => applyValues(option.values, { focus: dial.preview }))

    if (dial.swatch) {
      button.className = 'dial-swatch'
      button.append(optionPreview(dial, option))

      const caption = document.createElement('span')
      caption.className = 'dial-swatch-label'
      caption.textContent = option.label
      button.append(caption)
    } else {
      button.textContent = option.label
    }

    group.append(button)
  }

  row.append(group)
  return row
}

/**
 * Draw what an option does, using the option's own value.
 *
 * A row of words ("Square, Slight, Default, Round") asks the user to click, look somewhere
 * else, and infer. A row of shapes lets them choose by eye, which is what a design tool is
 * for — and it means the explanatory sentence underneath stops carrying the whole load.
 */
function optionPreview(dial, option) {
  const value = Object.values(option.values)[0]
  const box = document.createElement('span')
  box.className = `swatch-preview swatch-${dial.swatch}`
  box.setAttribute('aria-hidden', 'true')

  if (dial.swatch === 'radius') {
    box.style.borderRadius = value
    return box
  }

  if (dial.swatch === 'border') {
    box.style.borderWidth = value
    return box
  }

  if (dial.swatch === 'density') {
    // Three stacked bars whose gap is the value: density read as rhythm, not as a number.
    box.style.gap = `calc(${value} * .45)`
    for (let i = 0; i < 3; i++) box.append(document.createElement('span'))
    return box
  }

  if (dial.swatch === 'shadow') {
    const strength = Number(value) || 0
    box.style.boxShadow =
      strength === 0
        ? 'none'
        : `0 ${1.5 * strength}px ${4 * strength}px rgb(0 0 0 / ${Math.min(0.42, 0.1 * strength + 0.06)})`
    return box
  }

  if (dial.swatch === 'font') {
    // The quoting that makes it a valid Sass map value is not valid CSS here.
    box.style.fontFamily = String(value).replace(/^"|"$/g, '')
    box.textContent = 'Ag'
    return box
  }

  if (dial.swatch === 'text-size') {
    box.style.fontSize = value
    box.textContent = 'Aa'
    return box
  }

  box.textContent = option.label
  return box
}

function renderHueDial(dial) {
  const activeHue = hueOfRole(state.doc, dial.role, read)
  const row = dialShell(dial, activeHue ?? null)

  const grid = document.createElement('div')
  grid.className = 'hue-grid'

  for (const hue of HUES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'hue'
    button.title = hue
    button.setAttribute('aria-label', hue)
    button.setAttribute('aria-pressed', String(hue === activeHue))

    const rgb = hueColor(hue)
    button.style.background = rgb ? rgbToHex(rgb) : 'transparent'
    button.addEventListener('click', () => applyValues(hueValues(dial, hue), { focus: dial.preview }))
    grid.append(button)
  }

  row.append(grid)
  if (activeHue) row.append(renderRoleContrast(dial))
  if (activeHue) row.append(renderCustomHue(dial, activeHue))
  return row
}

/**
 * The point of an easy mode is not to hide the consequences. Picking yellow as a brand
 * colour is a legitimate choice that makes the role's text unreadable on the page, so say
 * so here rather than letting it ship.
 */
function renderRoleContrast(dial) {
  const row = document.createElement('div')
  row.className = 'dial-contrast'

  for (const scheme of shownSchemes()) {
    for (const [key, caption] of [['contrast', 'on fill'], ['fg', 'on page']]) {
      const badge = renderContrast(`theme-color.${dial.role}.${key}`, scheme === 'dark' ? 'dark' : 'value')
      if (!badge) continue

      const item = document.createElement('span')
      item.className = 'dial-contrast-item'

      const text = document.createElement('span')
      text.textContent = shownSchemes().length > 1 ? `${scheme} ${caption}` : caption
      item.append(text, badge)
      row.append(item)
    }
  }

  if (row.querySelector('.is-fail')) {
    const warning = document.createElement('span')
    warning.className = 'dial-contrast-warning'
    warning.textContent = 'Fails WCAG AA for body text. Try a darker step of the same hue, or another hue.'
    row.append(warning)
  }

  return row
}

/**
 * A custom brand colour has to land somewhere. Bootstrap builds `primary` out of a named
 * scale, so the honest place is that scale's base — and the note says so, because it also
 * recolours the `--blue-*` utilities.
 */
function renderCustomHue(dial, hue) {
  const wrap = document.createElement('div')
  wrap.className = 'hue-custom'

  const path = `color.${hue}.base`
  const rgb = resolveColor(state.doc.cssValueOf(path), 'light')

  const picker = document.createElement('input')
  picker.type = 'color'
  picker.value = rgb ? rgbToHex(rgb) : '#000000'
  picker.setAttribute('aria-label', `Custom ${dial.role} colour`)
  picker.addEventListener('input', () => {
    applyValues(
      {
        [path]: formatColor(hexToRgb(picker.value), read(path)),
        [`theme-color.${dial.role}.contrast`]: contrastTokenFor(hue)
      },
      { focus: dial.preview }
    )
  })

  const note = document.createElement('span')
  note.className = 'hue-note'
  note.textContent = `Custom — redefines the ${hue} scale, which also recolours --${hue}-* elsewhere.`

  wrap.append(picker, note)
  return wrap
}

function renderSimpleFooter() {
  const footer = document.createElement('div')
  footer.className = 'simple-footer'

  const owned = dialTokens()
  const elsewhere = Object.keys(state.overrides).filter((path) => !owned.has(path))
  const total = Object.keys(state.overrides).length

  const summary = document.createElement('p')
  summary.textContent = total === 0
    ? 'Nothing changed yet. Pick a brand colour, or start from a preset above.'
    : `${total} token${total === 1 ? '' : 's'} changed. Export writes only what you touched.`
  footer.append(summary)

  if (elsewhere.length > 0) {
    const notice = document.createElement('p')
    notice.className = 'simple-notice'
    notice.textContent = `${elsewhere.length} of them are outside these controls (${elsewhere.slice(0, 3).join(', ')}${elsewhere.length > 3 ? ', …' : ''}).`
    footer.append(notice)
  }

  const link = document.createElement('button')
  link.type = 'button'
  link.className = 'link-button'
  link.textContent = `Edit all ${state.baseDoc.tokens.size} tokens →`
  link.addEventListener('click', () => setMode('advanced'))
  footer.append(link)

  return footer
}

/* ------------------------------------------------------------------ health */

/**
 * One answer to "is this theme readable?".
 *
 * Per-control badges tell you about the control you are looking at; they cannot tell you
 * that the theme as a whole has a problem three sections down. This also separates issues
 * *you* introduced from ones Bootstrap's defaults already have — a fresh visitor seeing a
 * warning they did not cause learns to ignore warnings.
 */
function themeHealth() {
  if (!state.previewReady) return null

  const issues = []

  for (const [path, token] of walk(state.doc.tree)) {
    if (token.$type !== 'color') continue
    const pair = contrastPartner(path)
    if (!pair || !state.doc.tokens.has(pair.partner)) continue

    for (const scheme of shownSchemes()) {
      const side = scheme === 'dark' ? 'dark' : 'value'
      const ratio = ratioFor(path, pair.partner, side, state.doc)
      if (ratio === null || ratio >= 4.5) continue

      const before = state.baseDoc.tokens.has(path)
        ? ratioFor(path, pair.partner, side, state.baseDoc)
        : null

      issues.push({
        path,
        scheme,
        ratio,
        inherited: before !== null && before < 4.5
      })
    }
  }

  return {
    issues,
    introduced: issues.filter((issue) => !issue.inherited).length,
    inherited: issues.filter((issue) => issue.inherited).length
  }
}

function ratioFor(path, partnerPath, side, doc) {
  const foreground = resolveColor(resolvedSide(path, side, doc), side === 'dark' ? 'dark' : 'light')
  const background = resolveColor(resolvedSide(partnerPath, side, doc), side === 'dark' ? 'dark' : 'light')
  return foreground && background ? contrastRatio(foreground, background) : null
}

/**
 * The health summary is a disclosure, not a tooltip.
 *
 * The failing pairs used to live in a `title` attribute, which does not open on keyboard
 * focus and is not reliably announced — so the list of contrast problems was unreachable to
 * exactly the people a contrast warning exists for. Each row is also a link into the token
 * that causes it, which turns the summary from a complaint into a route to the fix.
 */
function renderHealth() {
  const button = $('#health')
  const detail = $('#health-detail')
  const health = themeHealth()

  if (!health) {
    button.hidden = true
    detail.hidden = true
    return
  }

  button.hidden = false

  if (health.issues.length === 0) {
    button.className = 'health is-ok'
    button.textContent = 'Contrast OK'
    button.disabled = true
    detail.hidden = true
    button.setAttribute('aria-expanded', 'false')
    return
  }

  button.disabled = false
  button.className = `health ${health.introduced > 0 ? 'is-warn' : 'is-muted'}`

  // Lead with the source. "12 contrast issues" on a page the visitor has not touched reads
  // as an accusation; naming Bootstrap's defaults makes it information instead.
  button.textContent = health.introduced > 0
    ? `${health.introduced} contrast issue${health.introduced === 1 ? '' : 's'}`
    : `Bootstrap defaults: ${health.inherited} contrast issue${health.inherited === 1 ? '' : 's'}`

  $('#health-detail-head').textContent = health.introduced > 0
    ? 'Below WCAG AA (4.5:1) for body text. Select one to edit it.'
    : 'These already fail in stock Bootstrap — not something you changed.'

  const list = $('#health-list')
  list.textContent = ''

  for (const issue of health.issues) {
    const item = document.createElement('li')

    const link = document.createElement('button')
    link.type = 'button'
    link.className = 'health-issue'
    link.addEventListener('click', () => {
      closeHealth()
      revealToken(issue.path)
    })

    const path = document.createElement('code')
    path.textContent = issue.path

    const meta = document.createElement('span')
    meta.className = 'health-issue-meta'
    meta.textContent = `${issue.scheme} · ${issue.ratio.toFixed(1)}:1${issue.inherited ? ' · inherited' : ''}`

    link.append(path, meta)
    item.append(link)
    list.append(item)
  }
}

function closeHealth() {
  $('#health').setAttribute('aria-expanded', 'false')
  $('#health-detail').hidden = true
}

/** Open All tokens at the group holding `path`, and highlight the row. */
function revealToken(path) {
  state.mode = 'advanced'
  state.section = path.split('.')[0]
  state.query = ''
  $('#search').value = ''
  render()

  const row = [...document.querySelectorAll('#editor .token')].find(
    (element) => element.querySelector('.token-name code')?.textContent === path
  )
  if (!row) return

  row.scrollIntoView({ block: 'center' })
  row.classList.add('is-revealed')
  row.addEventListener('animationend', () => row.classList.remove('is-revealed'), { once: true })
}

/* ------------------------------------------------------------------ update */

/** Draw whichever mode is active. Both read the same override state. */
function render() {
  const simple = state.mode === 'simple'
  document.body.dataset.mode = state.mode

  $('#simple').hidden = !simple
  $('#advanced').hidden = simple

  syncTabs($('#mode'), (tab) => tab.dataset.mode === state.mode)

  $('#undo').disabled = state.past.length === 0
  $('#redo').disabled = state.future.length === 0
  $('#reset').disabled = Object.keys(state.overrides).length === 0

  if (simple) renderSimple()
  else {
    renderRail()
    renderEditor()
  }

  renderHealth()
}

function recompute() {
  try {
    state.doc = withOverrides(state.baseTree, state.overrides)
  } catch (error) {
    console.error('Could not apply overrides', error)
    return
  }

  const changes = diffResolved(state.baseDoc, state.doc)
  const count = Object.keys(state.overrides).length

  const chip = $('#change-count')
  chip.textContent = count === 0 ? 'no changes' : `${count} edited · ${changes.length} properties`
  chip.classList.toggle('is-active', count > 0)
  $('#reset').disabled = count === 0

  postToPreview({ css: themeCss(changes) })
}

function postToPreview(message) {
  const frame = $('#preview')
  if (state.previewReady && frame.contentWindow) frame.contentWindow.postMessage(message, '*')
}

/* ------------------------------------------------------------------ export */

function exportContent() {
  const version = state.meta.bootstrap

  if (state.exportTab === 'scss') {
    return {
      filename: 'custom.scss',
      note: mapsTouched(state.doc, state.overrides).size
        ? 'The usual choice. Bootstrap merges these keys over its own defaults, so this carries only what you changed.'
        : 'Nothing is overridden yet, so this is stock Bootstrap.',
      steps: [
        'Save it as <code>scss/custom.scss</code> in your project.',
        'Install what it needs: <code>npm i bootstrap@6</code> and <code>npm i -D sass</code>.',
        'Compile it: <code>npx sass scss/custom.scss css/app.css</code>.',
        'Link <code>css/app.css</code> instead of Bootstrap’s own stylesheet.'
      ],
      text: themeScss(state.doc, state.overrides, { version })
    }
  }

  if (state.exportTab === 'css') {
    const css = themeCss(diffResolved(state.baseDoc, state.doc))
    return {
      filename: 'theme.css',
      note: 'No build step. Load it after Bootstrap’s stylesheet and it re-themes at runtime.',
      steps: [
        'Save it next to your HTML.',
        'Add it <em>after</em> Bootstrap: <code>&lt;link href="theme.css" rel="stylesheet"&gt;</code>.'
      ],
      text: css || '/* Nothing overridden yet. */\n'
    }
  }

  if (state.exportTab === 'json') {
    return {
      filename: 'theme.json',
      note: 'Your edits, portable. Import it back here to carry on, or hand it to the maintainer export.',
      text: themeJson(state.overrides, { version })
    }
  }

  return {
    filename: 'eject.txt',
    note:
      'For Bootstrap maintainers: this writes the values into v6-dev’s own Sass files, so the ' +
      'result is an ordinary pull request rather than a consumer override.',
    text: maintainerExport(version)
  }
}

/**
 * The maintainer route. The chooser deliberately does not try to produce the patched files
 * itself: it has no copy of Bootstrap's sources, and guessing at them would risk writing a
 * file that does not match the maintainer's checkout. Instead it shows exactly which
 * declaration each edit lands on — the `to` values come from the same renderer the CLI
 * uses — and hands over the command that does the locating properly.
 */
function maintainerExport(version) {
  const edits = sourceEdits(state.baseDoc, state.doc, state.overrides)

  const lines = [
    '# 1. Save the theme.json tab next to your Bootstrap checkout.',
    '# 2. Patch the sources in place:',
    '',
    '    npx bstokens eject --theme theme.json --src ../bootstrap --in-place',
    '',
    '# 3. Check it still compiles and matches what you previewed here:',
    '',
    '    npx bstokens eject --theme theme.json --src ../bootstrap --verify',
    '',
    '# Drop --in-place to write to build/v6-dev instead of touching the checkout.',
    ''
  ]

  if (edits.length === 0) {
    lines.push('# Nothing is overridden yet, so no source file would change.')
    return `${lines.join('\n')}\n`
  }

  lines.push(`# ${edits.length} declaration(s) would change:`, '')

  let currentFile
  for (const edit of edits) {
    if (edit.file !== currentFile) {
      currentFile = edit.file
      lines.push(`# ${currentFile ?? 'unknown file'}`)
    }
    lines.push(`#   ${edit.key}:`)
    lines.push(`#     - ${edit.from ?? '(new)'}`)
    lines.push(`#     + ${edit.to}`)
  }

  lines.push('', `# Bootstrap ${version}. Run \`npm run sync\` first if your checkout is newer.`)
  return `${lines.join('\n')}\n`
}

/** Report an import problem beside the control that caused it, not in a modal alert. */
function showExportMessage(text) {
  const element = $('#export-message')
  element.textContent = text
  element.hidden = !text
}

function renderExport() {
  showExportMessage('')
  const { note, text, steps, filename } = exportContent()

  $('#export-note').textContent = note
  $('#export-code').textContent = text
  $('#download').textContent = `Download ${filename}`

  // "Here is your code" is not an answer to "what do I do with it?".
  const list = $('#export-steps')
  list.textContent = ''
  list.hidden = !steps
  for (const step of steps ?? []) {
    const item = document.createElement('li')
    item.innerHTML = step
    list.append(item)
  }

  syncTabs($('#export-tabs'), (tab) => tab.dataset.tab === state.exportTab)
}

/* -------------------------------------------------------------------- wire */

/**
 * Make a `role="tablist"` behave like one.
 *
 * Declaring the roles without the keyboard behaviour is worse than not declaring them: a
 * screen reader announces "tab, 1 of 4" and the user reaches for the arrow keys, which did
 * nothing. This adds the roving tabindex and arrow/Home/End handling the pattern requires.
 */
function wireTabs(list, select) {
  const tabs = [...list.querySelectorAll('[role="tab"]')]

  const focusTab = (index) => {
    const next = tabs[(index + tabs.length) % tabs.length]
    next.focus()
    next.click()
  }

  list.addEventListener('keydown', (event) => {
    const index = tabs.indexOf(event.target)
    if (index === -1) return

    const keys = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in keys)) return

    event.preventDefault()
    focusTab(keys[event.key])
  })

  for (const tab of tabs) tab.addEventListener('click', () => select(tab))
}

/** Keep `aria-selected` and the roving tabindex in step after any change. */
function syncTabs(list, isSelected) {
  for (const tab of list.querySelectorAll('[role="tab"]')) {
    const selected = isSelected(tab)
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
  }
}

function wire() {
  $('#search').addEventListener('input', (event) => {
    state.query = event.target.value.trim()
    render()
  })

  for (const button of document.querySelectorAll('#scheme button')) {
    button.setAttribute('aria-pressed', String(button.dataset.scheme === state.scheme))
    button.addEventListener('click', () => {
      state.scheme = button.dataset.scheme
      for (const other of document.querySelectorAll('#scheme button')) {
        other.setAttribute('aria-pressed', String(other === button))
      }
      postToPreview({ scheme: state.scheme })
      render()
    })
  }

  wireTabs($('#mode'), (tab) => setMode(tab.dataset.mode))

  // No confirm(): the action is undoable, and a modal to guard a reversible action just
  // trains people to dismiss modals.
  $('#reset').addEventListener('click', () => mutate(() => { state.overrides = {} }))

  $('#health').addEventListener('click', () => {
    const open = $('#health').getAttribute('aria-expanded') === 'true'
    $('#health').setAttribute('aria-expanded', String(!open))
    $('#health-detail').hidden = open
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.health-wrap')) closeHealth()
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHealth()
  })

  $('#undo').addEventListener('click', undo)
  $('#redo').addEventListener('click', redo)

  window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
    if (event.target.matches('input, textarea')) return

    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  })

  $('#open-export').addEventListener('click', () => {
    renderExport()
    $('#export').showModal()
  })

  wireTabs($('#export-tabs'), (tab) => {
    state.exportTab = tab.dataset.tab
    renderExport()
  })

  $('#copy').addEventListener('click', async () => {
    const { text } = exportContent()
    await navigator.clipboard.writeText(text)
    $('#copy').textContent = 'Copied'
    setTimeout(() => ($('#copy').textContent = 'Copy'), 1200)
  })

  $('#download').addEventListener('click', () => {
    const { filename, text } = exportContent()
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  })

  $('#import').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      if (!parsed || typeof parsed.overrides !== 'object') throw new Error('missing "overrides"')
      mutate(() => {
        state.overrides = parsed.overrides
      })
      renderExport()
    } catch {
      showExportMessage('Unable to read that file. Choose a theme.json exported from this page.')
    }
    event.target.value = ''
  })

}

/* ------------------------------------------------------------------- start */

/**
 * The preview frame and the chooser race each other on startup, and either can win. Rather
 * than depend on one handshake, treat both signals as "the frame is live" and make the sync
 * idempotent: the frame announces itself, and we also watch its load event in case it was
 * already up before this module finished importing.
 */
function markPreviewReady() {
  state.previewReady = true
  probe = null
  postToPreview({ scheme: state.scheme })
  if (state.doc) {
    recompute()
    render()
  }
}

window.addEventListener('message', (event) => {
  if (event.data?.ready) markPreviewReady()
})

const frame = document.getElementById('preview')
frame.addEventListener('load', markPreviewReady)
if (frame.contentDocument?.readyState === 'complete') markPreviewReady()

async function start() {
  const [tree, meta] = await Promise.all([
    fetch('../build/json/tokens.tree.json').then((r) => r.json()),
    fetch('../tokens/meta.json').then((r) => r.json()).catch(() => ({ bootstrap: 'unknown' }))
  ])

  state.baseTree = tree
  state.meta = meta
  state.baseDoc = index(expandColorScales(clone(tree)))
  state.doc = withOverrides(tree, state.overrides)

  $('#brand-sub').textContent = `Bootstrap ${meta.bootstrap}`
  $('#search').placeholder = `Search ${state.baseDoc.tokens.size} tokens…`

  wire()
  render()
  recompute()
}

start().catch((error) => {
  console.error(error)
  $('#brand-sub').textContent = 'Could not load the token document. Run npm run build, then reload.'
})
