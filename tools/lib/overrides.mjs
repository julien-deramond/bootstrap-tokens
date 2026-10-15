/**
 * Applying a set of edits to the token document, and turning them back into a theme.
 *
 * Shared by the CLI and the web chooser — the browser imports this file directly, which is
 * why it stays free of Node built-ins. The chooser therefore previews and exports through
 * exactly the same resolver that `bstokens verify` proves correct.
 */

import { ext, index, walk, NS } from './tokens.mjs'
import { expandColorScales } from './color-scale.mjs'
import { emitUseWith } from './emit-scss.mjs'
import { SCALARS, COMPONENTS } from './sass-targets.mjs'
import { PINNED_SELECTORS } from './curation.mjs'
import { cssLiteral, unresolvedReferences } from './value.mjs'
import { selectorsOf } from './redeclared.mjs'

const scalarByPath = new Map(SCALARS.map((s) => [s.path, s.sassVar]))
const selectorByMap = new Map(COMPONENTS.map((c) => [c.sassMap, c.selector]))

export const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * Return a new document with `overrides` applied.
 *
 * An override is `{ value, dark }`; `dark: null` removes an existing light/dark pairing.
 * An override carrying `create` brings a token into existence that upstream does not have —
 * a new hue, a new theme role — which is what lets someone add a brand color instead of
 * painting over `blue`.
 */
export function withOverrides(baseTree, overrides) {
  const tree = clone(baseTree)

  // Creations first: a later override may target a token one of them just made. The value
  // is seeded here rather than in the payload, because a node without `$value` is a group,
  // not a token, and would be walked straight past.
  for (const [path, override] of Object.entries(overrides)) {
    if (!override.create) continue
    createAt(tree, path, { ...override.create, $value: override.value ?? '' })
  }

  for (const [path, override] of Object.entries(overrides)) {
    const token = nodeAt(tree, path)
    if (!token) continue

    if (override.value !== undefined) token.$value = override.value

    if (override.dark !== undefined) {
      token.$extensions ??= {}
      const meta = { ...(token.$extensions[NS] ?? {}) }
      if (override.dark === null || override.dark === '') delete meta.dark
      else meta.dark = override.dark
      token.$extensions[NS] = meta
    }
  }

  expandColorScales(tree)
  return index(tree)
}

/**
 * Split `overrides` into what can be applied and what refers to tokens that do not exist.
 *
 * A value like `{color.bluu.500}` resolves to nothing, so the exporters skip it: it would
 * still be counted as a change while custom.scss and theme.css quietly lacked it. The value
 * editor already refuses such a value when it is typed; this is the same check for the other
 * ways a theme comes in (an imported file, a shared link, a saved theme from an older build).
 *
 * References are checked against the document *with* the overrides applied, so one override
 * may point at a token another creates. Dropping a broken one can orphan a reference that
 * relied on it, so this repeats until nothing more falls out. Only the broken side goes: a
 * valid `dark` stays when its `value` is dropped. A creation whose `value` is broken goes
 * whole, since a created token without a value is not a token.
 *
 * Returns `{ overrides, broken }`, where `broken` lists `{ path, side, value, missing }`.
 */
export function withoutBrokenReferences(baseTree, overrides) {
  let kept = overrides
  const broken = []

  for (;;) {
    const { tokens } = withOverrides(baseTree, kept)
    const next = {}
    let removed = false

    for (const [path, override] of Object.entries(kept)) {
      const entry = { ...override }
      for (const side of ['value', 'dark']) {
        if (typeof entry[side] !== 'string') continue
        const missing = unresolvedReferences(entry[side], tokens)
        if (missing.length === 0) continue
        broken.push({ path, side, value: entry[side], missing })
        delete entry[side]
        removed = true
      }

      if (entry.create && entry.value === undefined) continue
      if (Object.keys(entry).length > 0) next[path] = entry
    }

    kept = next
    if (!removed) return { overrides: kept, broken }
  }
}

function nodeAt(tree, path) {
  let node = tree
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return null
    node = node[part]
  }
  return node && node.$value !== undefined ? node : null
}

/** Place a brand-new token at `path`, building any groups it needs on the way. */
function createAt(tree, path, token) {
  const parts = path.split('.')
  let node = tree

  for (const part of parts.slice(0, -1)) {
    if (node[part] === undefined) node[part] = {}
    if (node[part].$value !== undefined) return // a token already sits where a group must go
    node = node[part]
  }

  const leaf = parts.at(-1)
  if (node[leaf] === undefined) node[leaf] = clone(token)
}

/** Tokens whose resolved CSS differs between two documents. */
export function diffResolved(base, next) {
  const changes = []
  for (const [path, token] of walk(next.tree)) {
    const meta = ext(token)
    if (!meta.cssVar) continue

    let after
    let before
    try {
      after = cssLiteral(next.cssValueOf(path))
      before = base.tokens.has(path) ? cssLiteral(base.cssValueOf(path)) : null
    } catch {
      continue
    }
    if (after !== before) {
      changes.push({
        path,
        cssVar: meta.cssVar,
        sassMap: meta.sassMap,
        value: after,
        pinnedModes: meta.pinnedModes ?? null,
        cascade: cascadeOf(next.tree, path, meta.sassMap),
        redeclared: redeclaredIn(next, meta.redeclared)
      })
    }
  }
  return changes
}

/**
 * Where a component token's map sits in Bootstrap's cascade, as `sync` recorded it on the
 * component group: `{ layer, rule }`, or null for a global token or an unknown map.
 * See tools/lib/redeclared.mjs.
 */
function cascadeOf(tree, path, sassMap) {
  if (!sassMap) return null
  const group = ext(tree[path.split('.')[0]])
  return group.sassMap === sassMap && group.cascade ? group.cascade : null
}

/**
 * The later rules that re-declare a token, each with the value it has in this document: a
 * rule another token writes takes that token's value, edited or not. A token Bootstrap leaves
 * null writes nothing until a theme sets it, so its rule is left out.
 */
function redeclaredIn(doc, entries) {
  if (!entries) return null
  const out = []
  for (const entry of entries) {
    if (!entry.token) {
      out.push(entry)
      continue
    }
    let value = null
    try {
      value = cssLiteral(doc.cssValueOf(entry.token))
    } catch {
      value = null
    }
    if (value != null && value !== 'null') out.push({ ...entry, value })
  }
  return out
}

/** Group changed declarations by the selector they belong on. */
export function declarationsBySelector(changes) {
  const bySelector = new Map()
  for (const change of changes) {
    const selector = selectorByMap.get(change.sassMap) ?? ':root'
    if (!bySelector.has(selector)) bySelector.set(selector, [])
    bySelector.get(selector).push([change.cssVar, change.value])
  }
  return bySelector
}

/**
 * A stylesheet that layers the changed custom properties over compiled Bootstrap.
 *
 * It has to land where `custom.scss` lands, and `custom.scss` edits Bootstrap's own rule in
 * place: same layer, same selector list, same position. So each component override goes in
 * the layer its map is emitted in, on that rule's selectors, and is followed by every later
 * rule of that layer that re-declares the property, with Bootstrap's value, in Bootstrap's
 * order. Without them the override, coming last, would beat `.btn-solid`, `.chip.active` or
 * the wide-screen `.prose` rule, which the compiled theme leaves alone. Global tokens stay
 * unlayered, as Bootstrap declares them. Load the result after Bootstrap's stylesheet: the
 * layer order is the one Bootstrap declares first.
 *
 * `scope` confines the whole thing to one subtree, which is what makes a before/after view
 * possible: the same page rendered twice, themed on one side and stock on the other. Custom
 * properties inherit, so declaring them on a wrapper themes everything inside it and nothing
 * outside. Component rules are scoped with `:where()`, which adds no specificity, so a
 * Bootstrap rule that beats the override on the page still beats it in the scoped copy.
 *
 * `prefix` renames every custom property the way Bootstrap's build does. Its Sass declares
 * `--link-color`, and a PostCSS step (`postcss-prefix-custom-properties`) turns that into
 * `--bs-link-color` in the shipped `dist/css`. The preview paints over CSS compiled straight
 * from Sass, so it leaves the names bare; the downloadable theme.css is loaded after the
 * shipped stylesheet, so it passes `SHIPPED_PREFIX`, or it would declare properties nothing reads.
 */
export function themeCss(changes, { scope = null, prefix = '' } = {}) {
  if (changes.length === 0) return ''

  const rename = prefixer(prefix)
  const blocks = []
  for (const [selector, declarations] of declarationsBySelector(changes.filter((change) => !change.cascade))) {
    blocks.push(ruleOf(scoped(selector, scope), declarations, rename))
  }

  const byLayer = new Map()
  for (const change of changes) {
    if (!change.cascade) continue
    const layer = change.cascade.layer ?? ''
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(change)
  }

  for (const [layer, layered] of byLayer) {
    const rules = layerRules(layered, scope, rename)
    blocks.push(...(layer ? [`@layer ${layer} {\n${indent(rules.join('\n\n'))}\n}`] : rules))
  }

  blocks.push(...reassertPinned(changes, scope, rename))
  return `${blocks.join('\n\n')}\n`
}

/** The prefix `dist/css/bootstrap.css` carries on every custom property (twbs/bootstrap `build/postcss.config.mjs`). */
export const SHIPPED_PREFIX = 'bs-'

/** Upstream's PostCSS step leaves names that already carry `--bs-` or `--bd-` (the docs' own) alone. */
const UNPREFIXED = /^--(?:bs|bd)-/

/**
 * The renaming `postcss-prefix-custom-properties` applies: a declared custom property, and
 * the first argument of every `var()` in a value, so `var(--link-color)` follows the
 * declaration it points at.
 */
function prefixer(prefix) {
  const name = (property) => (prefix && !UNPREFIXED.test(property) ? `--${prefix}${property.slice(2)}` : property)
  const value = (text) =>
    prefix ? String(text).replace(/\bvar\((\s*)(--[\w-]+)/g, (_, space, property) => `var(${space}${name(property)}`) : text
  return { name, value }
}

/**
 * One layer's overrides, then the later rules that must keep winning over them.
 *
 * The cascade is per property, so only the order among one property's rules matters. Two
 * edits can share a property — `navbar.color` on `.navbar` and `navbar-dark.navbar-color` on
 * the dark navbar — and then the later one is among the earlier one's repeated rules: it is
 * repeated there with its new value, in its place, rather than with Bootstrap's.
 */
function layerRules(changes, scope, rename) {
  const bases = new Map()
  for (const change of changes) {
    const { rule, at = [] } = change.cascade
    const key = JSON.stringify([rule, at])
    if (!bases.has(key)) bases.set(key, { rule, at, declarations: new Map() })
    bases.get(key).declarations.set(change.cssVar, change.value)
  }
  const rules = [...bases.values()].map(({ rule, at, declarations }) =>
    wrap(at, ruleOf(scopedList(rule, scope), [...declarations], rename))
  )

  const byProperty = new Map()
  for (const change of changes) {
    if (!byProperty.has(change.cssVar)) byProperty.set(change.cssVar, [])
    byProperty.get(change.cssVar).push(change)
  }

  const repeats = []
  for (const [property, shared] of byProperty) {
    const covered = new Set(
      shared.flatMap(({ path, redeclared }) =>
        (redeclared ?? []).map(({ token }) => token).filter((token) => token && token !== path)
      )
    )
    for (const change of shared) {
      if (covered.has(change.path)) continue
      for (const { selector, at = [], value } of change.redeclared ?? []) {
        repeats.push(wrap(at, ruleOf(scopedList(selector, scope), [[property, value]], rename)))
      }
    }
  }

  if (repeats.length === 0) return rules
  return [
    ...rules,
    `/* Bootstrap re-declares ${repeats.length === 1 ? 'this property in a later rule' : 'these properties in later rules'} of this layer. Repeated here, ${repeats.length === 1 ? 'it keeps' : 'they keep'} winning, as ${repeats.length === 1 ? 'it does' : 'they do'} in a compiled custom.scss. */\n${repeats[0]}`,
    ...repeats.slice(1)
  ]
}

const ruleOf = (selector, declarations, rename) =>
  `${selector} {\n${declarations.map(([name, value]) => `  ${rename.name(name)}: ${rename.value(value)};`).join('\n')}\n}`

/** `@media`, `@container`… around a rule, outermost first. */
const wrap = (at, rule) => at.reduceRight((inner, prelude) => `${prelude} {\n${indent(inner)}\n}`, rule)

/** `:root` becomes the wrapper itself; everything else becomes a descendant of it. */
function scoped(selector, scope) {
  if (!scope) return selector
  return selector === ':root' ? scope : `${scope} ${selector}`
}

/** A rule's selector list, each one confined to `scope` without changing its specificity. */
function scopedList(list, scope) {
  if (!scope) return list
  const out = selectorsOf(list).map((selector) =>
    selector === ':root' || selector === ':host' ? scope : `:where(${scope}) ${selector}`
  )
  return [...new Set(out)].join(', ')
}

/**
 * What the Theme Builder says under an edited token (`token`, found at `path`) that later
 * Bootstrap rules re-declare, so an edit that reaches plain `.btn` and not `.btn-solid` does
 * not look broken. Null when nothing re-declares it.
 */
export function redeclaredNote(token, path) {
  const meta = ext(token)
  // A second rule the same map is written in takes the edit too: nothing to explain there.
  const entries = (meta.redeclared ?? []).filter(({ token: owner }) => owner !== path)
  if (entries.length === 0) return null

  const labels = []
  const states = []
  const owners = []
  for (const { selector, at = [], token: owner } of entries) {
    const plain = []
    for (const one of selectorsOf(selector)) {
      // `:hover`, `:active`… are states of an element listed anyway, not variants of their own.
      const state = /(?:^|[^\\]):([\w-]+)/.exec(one)
      if (state && state[1] !== 'root') {
        if (!states.includes(state[1])) states.push(state[1])
        continue
      }
      const condition = at.map((prelude) => prelude.replace(/^@media\s+/, '').replace(/^@/, '')).join(' and ')
      plain.push(`${unescaped(one)}${condition ? ` when ${condition}` : ''}`)
    }
    for (const label of plain) if (!labels.includes(label)) labels.push(label)
    if (owner && plain.length > 0) owners.push(`To change ${listOf(plain)} too, edit ${owner}.`)
  }

  const shown = labels.slice(0, 5)
  const more = labels.length - shown.length
  const named = more > 0 ? `${shown.join(', ')} and ${more} more` : listOf(shown)
  const pseudo = listOf(states.map((state) => `:${state}`))
  const where =
    labels.length === 0
      ? `on ${pseudo}`
      : `on ${named}${states.length > 0 ? `, and on ${pseudo}` : ''}`

  return [
    `Bootstrap sets ${meta.cssVar} again ${where}, so this edit does not reach ${labels.length + states.length === 1 ? 'it' : 'them'}, here or in your compiled theme.`,
    ...new Set(owners)
  ].join(' ')
}

const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

/** `.sm\:navbar-expand` as someone would type it in a class attribute: `.sm:navbar-expand`. */
const unescaped = (selector) =>
  selector.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/\\(.)/g, '$1')

/**
 * Re-declare the tokens Bootstrap pins per color scheme, at the selectors it pins them on.
 *
 * Two different failures without this. Skip the dark pins and the preview shows a dark mode
 * no build produces. Skip the *light* pin and the override does nothing at all on any page
 * carrying an explicit `data-bs-theme` — which is every page this tool previews.
 * See PINNED_MODES in curation.mjs.
 */
function reassertPinned(changes, scope = null, rename = prefixer('')) {
  const blocks = []

  for (const change of changes) {
    if (!change.pinnedModes) continue

    for (const { media, selector, mode } of PINNED_SELECTORS) {
      // A null pin means upstream fixes it to the default, so the token's value stands.
      const value = change.pinnedModes[mode] ?? change.value
      const target = scope
        ? selector === ':root'
          ? scope
          : `${scope}${selector}`
        : selector
      const rule = `${target} {\n  ${rename.name(change.cssVar)}: ${rename.value(value)};\n}`
      blocks.push(media ? `@media ${media} {\n${indent(rule)}\n}` : rule)
    }
  }

  return blocks
}

/**
 * Overrides that a `@use … with ()` configuration cannot fully express, because upstream
 * re-declares them at selectors no token map reaches. The Sass export names them rather than
 * quietly doing less than the preview showed.
 */
export function unexpressible(doc, overrides) {
  const out = []

  for (const path of Object.keys(overrides)) {
    const meta = ext(doc.tokens.get(path))
    if (meta.pinnedModes) out.push({ path, cssVar: meta.cssVar })
  }

  return out
}

const indent = (text) => text.split('\n').map((line) => (line ? `  ${line}` : line)).join('\n')

/**
 * The Sass maps an export has to carry. Derived from what the user *edited*, not from what
 * changed: editing `$spacer` moves the whole spacing scale on its own once Bootstrap
 * recomputes it, so re-emitting `$spacers` too would only add noise.
 */
export function mapsTouched(doc, overrides) {
  const maps = new Set()
  for (const path of Object.keys(overrides)) {
    const token = doc.tokens.get(path)
    if (!token) continue
    const meta = ext(token)
    if (scalarByPath.has(path)) maps.add(scalarByPath.get(path))
    else if (meta.sassMap) maps.add(meta.sassMap)
  }
  return maps
}

/**
 * Which key of each touched map actually changed.
 *
 * Without this, editing one shadow value exports all 67 entries of `$root-tokens` — correct,
 * but unreadable, and it hides the four lines that matter. `defaults()` merges key by key,
 * so a theme only needs to carry its own keys.
 */
export function changedKeysOf(doc, overrides) {
  const byMap = new Map()

  for (const path of Object.keys(overrides)) {
    const token = doc.tokens.get(path)
    if (!token) continue

    const meta = ext(token)
    if (!meta.sassMap || scalarByPath.has(path)) continue

    if (!byMap.has(meta.sassMap)) byMap.set(meta.sassMap, new Set())
    byMap.get(meta.sassMap).add(meta.sassKey ?? path.split('.').at(-1))
  }

  return byMap
}

/** The `custom.scss` a user drops into their project. */
export function themeScss(
  doc,
  overrides,
  { version, importPath = '../node_modules/bootstrap/scss/bootstrap', options = null } = {}
) {
  const only = mapsTouched(doc, overrides)
  const changedOptions = options ?? {}

  if (only.size === 0 && Object.keys(changedOptions).length === 0) {
    return `// No token overrides yet — this is stock Bootstrap.\n@use "${importPath}";\n`
  }

  const scss = emitUseWith(doc, {
    version,
    importPath,
    only,
    changedKeys: changedKeysOf(doc, overrides),
    options: changedOptions
  })
  const gaps = unexpressible(doc, overrides)
  if (gaps.length === 0) return scss

  // Silence here would mean shipping a file that does less than the preview showed. Plain CSS
  // after the @use is valid SCSS and wins on equal specificity by source order.
  const companion = [
    '',
    '// Bootstrap re-declares these under [data-bs-theme] after :root, so the Sass override',
    '// above does not reach a page with an explicit theme. This block re-asserts them.',
    ...gaps.map(
      ({ path, cssVar }) =>
        `[data-bs-theme="light"] {\n  ${cssVar}: ${cssLiteral(doc.cssValueOf(path))};\n}`
    ),
    ''
  ].join('\n')

  return scss + companion
}

/** A portable theme file that loads straight back into the chooser. */
export function themeJson(overrides, { version }) {
  return `${JSON.stringify(
    {
      format: 'bootstrap-tokens-theme@1',
      bootstrap: version,
      generated: new Date().toISOString().slice(0, 10),
      overrides
    },
    null,
    2
  )}\n`
}


/* -------------------------------------------------------------------------- */

const NS_KEY = 'dev.bootstrap.tokens'

/** A Sass map key must be a plain identifier, and must not already exist. */
export function validateNewName(name, taken) {
  const trimmed = String(name ?? '').trim().toLowerCase()

  if (!trimmed) return 'Give it a name.'
  if (!/^[a-z][a-z0-9-]*$/.test(trimmed)) {
    return 'Use lowercase letters, digits and hyphens, starting with a letter.'
  }
  if (taken.includes(trimmed)) return `“${trimmed}” already exists.`
  return null
}

/**
 * The overrides that add a new color scale.
 *
 * Only the base hue has to be created: `expandColorScales` generates the thirteen steps from
 * it exactly as it does for Bootstrap's own sixteen, so the new scale gets `--brand-500` and
 * the rest for free, and `$colors` picks it up because the exporter reads the tree.
 */
export function createHue(name, value) {
  return {
    [`color.${name}.base`]: {
      value,
      create: {
        $type: 'color',
        $description: `A color scale added to this theme. Bootstrap does not ship it.`,
        $extensions: {
          [NS_KEY]: { sassMap: '$colors', sassKey: name, sassQuoted: true, css: true, added: true }
        }
      }
    }
  }
}

/** The nine sub-keys of a new theme role, built from an existing scale. */
export function createRole(name, hue, { contrast = '{color.white}' } = {}) {
  const sub = (key, light, dark) => ({
    [`theme-color.${name}.${key}`]: {
      value: light,
      ...(dark ? { dark } : {}),
      create: {
        $type: 'color',
        $extensions: {
          [NS_KEY]: {
            cssVar: `--${name}-${key}`,
            sassMap: '$theme-colors',
            sassKey: name,
            sassQuoted: true,
            sassSubKey: key,
            added: true
          }
        }
      }
    }
  })

  return {
    ...sub('base', `{color.${hue}.500}`),
    ...sub('fg', `{color.${hue}.600}`, `{color.${hue}.400}`),
    ...sub('fg-emphasis', `{color.${hue}.800}`, `{color.${hue}.200}`),
    ...sub('bg', `{color.${hue}.500}`),
    ...sub('bg-subtle', `{color.${hue}.100}`, `{color.${hue}.900}`),
    ...sub('bg-muted', `{color.${hue}.200}`, `{color.${hue}.800}`),
    ...sub('border', `{color.${hue}.300}`, `{color.${hue}.600}`),
    ...sub(
      'focus-ring',
      `color-mix(in oklch, {color.${hue}.500} 50%, {bg.body})`,
      `color-mix(in oklch, {color.${hue}.500} 75%, {bg.body})`
    ),
    ...sub('contrast', contrast)
  }
}

/** Every override that belongs to a created hue or role, for removal. */
export function pathsOfAddition(overrides, prefix) {
  return Object.keys(overrides).filter((path) => path === prefix || path.startsWith(`${prefix}.`))
}
