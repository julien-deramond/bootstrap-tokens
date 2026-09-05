/**
 * Read a `twbs/bootstrap@v6-dev` checkout and lift its token maps into a DTCG tree.
 *
 * Used two ways:
 *   - once, to seed `tokens/` (`bstokens sync --write`)
 *   - continuously, to detect upstream drift (`bstokens sync --check`)
 *
 * The extractor never guesses where a value lives — `sass-targets.mjs` and `curation.mjs`
 * decide that, and anything they don't account for is reported rather than silently dropped.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { parseMapVariable, parseScalarVariable } from './sass-parser.mjs'
import { GROUPS, SCALARS, COMPONENTS, SASS_VAR_PATHS } from './sass-targets.mjs'
import {
  ROOT_TOKEN_PATHS,
  ALIAS_REWRITES,
  FILE_FOR_GROUP,
  GROUP_DESCRIPTIONS,
  TOKEN_DESCRIPTIONS,
  FIXED_DARK
} from './curation.mjs'
import { splitLightDark, cssToRefs, isPureAlias, typeLiteral } from './value.mjs'
import { hintFor, GROUP_HINTS } from './hints.mjs'
import { evaluateSassFunctions } from './sass-functions.mjs'

const NS = 'dev.bootstrap.tokens'

const SOURCES = {
  colors: 'scss/_colors.scss',
  config: 'scss/_config.scss',
  theme: 'scss/_theme.scss',
  root: 'scss/_root.scss'
}

class Sources {
  constructor(root) {
    this.root = root
    this.cache = new Map()
  }

  read(relative) {
    if (!this.cache.has(relative)) {
      const path = join(this.root, relative)
      if (!existsSync(path)) throw new Error(`Not found in the Bootstrap checkout: ${relative}`)
      this.cache.set(relative, readFileSync(path, 'utf8'))
    }
    return this.cache.get(relative)
  }

  /** Look for a Sass map across the core files, or in one specific file. */
  map(name, file) {
    const files = file ? [file] : Object.values(SOURCES)
    for (const relative of files) {
      const parsed = parseMapVariable(this.read(relative), name)
      if (parsed) return parsed
    }
    return null
  }

  /** Every `.scss` file in the checkout, so a lookup is never limited to the core four. */
  all() {
    if (!this.files) {
      this.files = []
      const walk = (dir) => {
        for (const entry of readdirSync(dir).sort()) {
          const path = join(dir, entry)
          if (statSync(path).isDirectory()) walk(path)
          else if (entry.endsWith('.scss')) this.files.push(relative(this.root, path).split(sep).join('/'))
        }
      }
      walk(join(this.root, 'scss'))
    }
    return this.files
  }

  /**
   * Core files first, then the rest of the checkout. Some configuration points live outside
   * the four we read by default — `$strength-transition` is in `scss/forms/_strength.scss` —
   * and searching only the core four silently returned null for them.
   */
  scalar(name, file) {
    const files = file ? [file] : [...Object.values(SOURCES), ...this.all()]
    for (const relative of files) {
      const parsed = parseScalarVariable(this.read(relative), name)
      if (parsed !== null) return parsed
    }
    return null
  }
}

/** Ordered `{ path, cssVar, sassMap, raw, hint, … }` records, before DTCG conversion. */
function collect(sources, warnings) {
  const records = []
  const add = (record) => records.push(record)

  // --- primitive colours ---------------------------------------------------
  const colors = sources.map('$colors', SOURCES.colors) ?? []
  const tints = sources.map('$color-tints', SOURCES.colors) ?? []
  const shades = sources.map('$color-shades', SOURCES.colors) ?? []

  for (const { key: hue, quoted } of colors) {
    const raw = sources.scalar(`$${hue}`, SOURCES.colors)
    if (raw === null) {
      warnings.push(`$colors references $${hue}, which has no scalar declaration`)
      continue
    }
    // `$colors` holds `("blue": $blue)`, so the value really lives in the scalar. Recording
    // it means an eject edits `$blue` where a maintainer expects to find it.
    add({
      path: `color.${hue}.base`,
      cssVar: null,
      sassMap: '$colors',
      sassKey: hue,
      sassQuoted: quoted,
      sassVar: `$${hue}`,
      raw,
      hint: 'color',
      layer: 'primitive'
    })
  }

  for (const { key, quoted, value } of tints) {
    add({ path: `color-tint.${key}`, cssVar: null, sassMap: '$color-tints', sassKey: key, sassQuoted: quoted, raw: value, hint: 'number', layer: 'primitive' })
  }
  for (const { key, quoted, value } of shades) {
    add({ path: `color-shade.${key}`, cssVar: null, sassMap: '$color-shades', sassKey: key, sassQuoted: quoted, raw: value, hint: 'number', layer: 'primitive' })
  }

  // --- scalar-backed tokens ------------------------------------------------
  for (const scalar of SCALARS) {
    const raw = sources.scalar(scalar.sassVar)
    if (raw === null) {
      warnings.push(`missing scalar ${scalar.sassVar}`)
      continue
    }
    add({
      path: scalar.path,
      cssVar: scalar.cssVar,
      sassMap: null,
      sassVar: scalar.sassVar,
      sassEmit: scalar.sassEmit ?? null,
      raw,
      hint: GROUP_HINTS[scalar.path.split('.')[0]] ?? hintFor(scalar.path.split('.').at(-1)),
      layer: scalar.layer
    })
  }

  // --- plain maps ----------------------------------------------------------
  for (const group of GROUPS) {
    if (group.flat || group.nestedRoles || group.scale || group.nested || group.group === 'shadow') continue
    if (['color-tint', 'color-shade'].includes(group.group)) continue

    const entries = sources.map(group.sassMap)
    if (!entries) {
      warnings.push(`missing map ${group.sassMap}`)
      continue
    }

    for (const { key, quoted, value } of entries) {
      if (Array.isArray(value)) {
        warnings.push(`${group.sassMap}.${key} is a nested map but ${group.group} is declared flat`)
        continue
      }
      add({
        path: `${group.group}.${key}`,
        cssVar: group.cssPrefix ? `${group.cssPrefix}${key}` : null,
        sassMap: group.sassMap,
        sassKey: key,
        sassQuoted: quoted,
        raw: value,
        hint: GROUP_HINTS[group.group] ?? hintFor(key),
        layer: group.layer
      })
    }
  }

  // --- `$font-sizes` is one map feeding two groups -------------------------
  for (const { key, quoted, value } of sources.map('$font-sizes') ?? []) {
    if (!Array.isArray(value)) continue
    for (const { key: prop, value: raw } of value) {
      const group = prop === 'font-size' ? 'font-size' : 'line-height'
      add({
        path: `${group}.${key}`,
        cssVar: `--${group}-${key}`,
        sassMap: '$font-sizes',
        sassKey: key,
        sassQuoted: quoted,
        sassSubKey: prop,
        raw,
        hint: GROUP_HINTS[group],
        layer: 'primitive'
      })
    }
  }

  // --- `--radius-pill` is set directly on `$root-tokens`, after the loop ----
  add({
    path: 'radius.pill',
    cssVar: '--radius-pill',
    sassMap: null,
    raw: '50rem',
    hint: 'dimension',
    layer: 'primitive',
    readonly: 'Set directly on $root-tokens after the $radii loop; not overridable through a map.'
  })

  // --- semantic theme colours ---------------------------------------------
  for (const { key: role, quoted, value } of sources.map('$theme-colors', SOURCES.theme) ?? []) {
    if (!Array.isArray(value)) continue
    for (const { key: sub, value: raw } of value) {
      add({
        path: `theme-color.${role}.${sub}`,
        cssVar: `--${role}-${sub}`,
        sassMap: '$theme-colors',
        sassKey: role,
        sassQuoted: quoted,
        sassSubKey: sub,
        raw,
        hint: 'color',
        layer: 'semantic'
      })
    }
  }

  // --- shadows -------------------------------------------------------------
  for (const { key, value } of sources.map('$shadows') ?? []) {
    const name = key === 'null' ? 'default' : key
    add({
      path: `shadow.${name}`,
      cssVar: key === 'null' ? '--box-shadow' : `--box-shadow-${key}`,
      sassMap: '$shadows',
      sassKey: key,
      raw: value,
      hint: null,
      layer: 'semantic'
    })
  }

  // --- root tokens ---------------------------------------------------------
  const rootEntries = new Map((sources.map('$root-tokens', SOURCES.root) ?? []).map((e) => [e.key, e.value]))
  const scalarPaths = new Set(SCALARS.map((s) => s.path))

  for (const [cssVar, path] of ROOT_TOKEN_PATHS) {
    if (!rootEntries.has(cssVar)) {
      warnings.push(`curation lists ${cssVar} but $root-tokens does not define it`)
      continue
    }
    const raw = rootEntries.get(cssVar)
    rootEntries.delete(cssVar)

    // Scalar-backed entries (`--white: #{$white}`) already have a record; only record order.
    if (scalarPaths.has(path)) continue

    add({
      path,
      cssVar,
      sassMap: '$root-tokens',
      sassKey: cssVar,
      raw,
      hint: hintFor(cssVar),
      layer: 'semantic'
    })
  }

  for (const cssVar of rootEntries.keys()) {
    warnings.push(`$root-tokens defines ${cssVar}, which curation.mjs does not map to a path`)
  }

  // --- component tokens ----------------------------------------------------
  for (const component of COMPONENTS) {
    const entries = sources.map(component.sassMap, component.file)
    if (!entries) {
      warnings.push(`missing component map ${component.sassMap} in ${component.file}`)
      continue
    }

    const names = entries.map((e) => e.key)
    for (const { key: cssVar, value: raw } of entries) {
      add({
        path: `${component.name}.${componentKey(component.name, cssVar, names)}`,
        cssVar,
        sassMap: component.sassMap,
        sassKey: cssVar,
        raw,
        hint: hintFor(cssVar),
        layer: 'component',
        component: component.name
      })
    }
  }

  return records
}

/**
 * `--alert-padding-x` in `$alert-tokens` becomes `alert.padding-x`; `--hr-border-color`
 * in the same map stays `alert.hr-border-color`. The prefix is only stripped when doing so
 * cannot collide with another key in the same map.
 */
function componentKey(name, cssVar, allNames) {
  const bare = cssVar.replace(/^--/, '')
  const prefix = `${name}-`
  if (!bare.startsWith(prefix)) return bare

  const stripped = bare.slice(prefix.length)
  const collides = allNames.some((other) => other !== cssVar && other.replace(/^--/, '') === stripped)
  return collides ? bare : stripped
}

/** cssVar name → token path, with component-local names shadowing global ones. */
function buildIndex(records) {
  const global = new Map()
  const perComponent = new Map()

  for (const record of records) {
    if (!record.cssVar) continue
    if (record.component) {
      if (!perComponent.has(record.component)) perComponent.set(record.component, new Map())
      perComponent.get(record.component).set(record.cssVar.replace(/^--/, ''), record.path)
    } else {
      global.set(record.cssVar.replace(/^--/, ''), record.path)
    }
  }

  // The colour scale is generated, so its custom properties aren't in `records`.
  return { global, perComponent }
}

function addColorScaleToIndex(index, sources) {
  const colors = sources.map('$colors', SOURCES.colors) ?? []
  const tints = sources.map('$color-tints', SOURCES.colors) ?? []
  const shades = sources.map('$color-shades', SOURCES.colors) ?? []
  const stops = [...tints.map((t) => t.key), '500', ...shades.map((s) => s.key)]

  for (const { key: hue } of colors) {
    for (const stop of stops) index.global.set(`${hue}-${stop}`, `color.${hue}.${stop}`)
  }
}

const ARITHMETIC = /[+\-*/]/

/**
 * Rewrite Sass scalars inside a value into aliases: `$spacer * .25` becomes
 * `{spacing.base} * .25`, and a whole-value `#{$container-padding-x}` becomes a plain alias.
 * Returns `{ value, arithmetic }`, or null when the value holds no Sass variable.
 */
function rewriteSassExpression(raw) {
  if (!raw.includes('$')) return null

  let value = raw.trim()
  const interpolated = /^#\{(.*)\}$/s.exec(value)
  if (interpolated) value = interpolated[1].trim()

  let touched = false
  for (const [sassVar, path] of SASS_VAR_PATHS) {
    const pattern = new RegExp(`\\${sassVar}(?![\\w-])`, 'g')
    if (pattern.test(value)) {
      value = value.replace(pattern, `{${path}}`)
      touched = true
    }
  }
  if (!touched) return null

  const rest = value.replace(/(?<!#)\{[^{}]+\}/g, '')
  return { value, arithmetic: ARITHMETIC.test(rest) }
}

/** Turn one record into a DTCG token object. */
function toToken(record, lookup) {
  const extensions = {}
  if (record.cssVar) extensions.cssVar = record.cssVar
  if (record.sassMap) extensions.sassMap = record.sassMap
  if (record.sassVar) extensions.sassVar = record.sassVar
  if (record.sassEmit) extensions.sassEmit = record.sassEmit
  if (record.sassKey !== undefined) extensions.sassKey = String(record.sassKey)
  if (record.sassSubKey) extensions.sassSubKey = record.sassSubKey
  if (record.sassQuoted) extensions.sassQuoted = true
  if (record.readonly) extensions.readonly = record.readonly
  if (FIXED_DARK[record.path]) extensions.fixedDark = FIXED_DARK[record.path]

  const raw = evaluateSassFunctions(record.raw)
  const sassExpression = rewriteSassExpression(raw)
  if (sassExpression) {
    const token = {}
    if (record.hint) token.$type = record.hint
    token.$value = sassExpression.value
    if (sassExpression.arithmetic) {
      extensions.expression = true
      extensions.arithmetic = true
    }
    if (Object.keys(extensions).length > 0) token.$extensions = { [NS]: extensions }
    return token
  }

  const pair = splitLightDark(raw)
  const light = cssToRefs(pair ? pair[0] : raw, lookup)
  const dark = pair ? cssToRefs(pair[1], lookup) : null
  if (dark) extensions.dark = dark

  const override = ALIAS_REWRITES.get(record.path)
  const value = override ?? light

  const token = {}

  if (isPureAlias(value) && !override) {
    if (record.hint) token.$type = record.hint
    token.$value = value
  } else if (override || /(?<!#)\{[^{}]+\}/.test(value)) {
    if (record.hint) token.$type = record.hint
    token.$value = value
    if (!isPureAlias(value)) extensions.expression = true
  } else {
    const typed = typeLiteral(value, record.hint)
    if (typed) {
      Object.assign(token, typed)
    } else {
      if (record.hint) token.$type = record.hint
      token.$value = value
      extensions.css = true
    }
  }

  if (dark && /(?<!#)\{[^{}]+\}/.test(dark) && !isPureAlias(dark)) extensions.expression = true

  if (Object.keys(extensions).length > 0) token.$extensions = { [NS]: extensions }
  return token
}

/** Record the intended child order for every level of `path`. JSON will not preserve it. */
function recordOrder(orders, path) {
  const parts = path.split('.')
  for (let i = 0; i < parts.length; i++) {
    const parent = parts.slice(0, i).join('.')
    if (!orders.has(parent)) orders.set(parent, [])
    const siblings = orders.get(parent)
    if (!siblings.includes(parts[i])) siblings.push(parts[i])
  }
}

/**
 * Attach an explicit `order` to any group whose intended child order differs from the
 * order a JSON round-trip would give it (`JSON.parse` hoists integer-like keys).
 */
function applyOrders(tree, orders, at = '') {
  const keys = Object.keys(tree).filter((key) => !key.startsWith('$'))
  const intended = (orders.get(at) ?? []).filter((key) => keys.includes(key))

  if (intended.length === keys.length && intended.some((key, i) => key !== keys[i])) {
    tree.$extensions = { ...(tree.$extensions ?? {}) }
    tree.$extensions[NS] = { ...(tree.$extensions[NS] ?? {}), order: intended }
  }

  for (const key of keys) {
    const child = tree[key]
    if (child && typeof child === 'object' && child.$value === undefined) {
      applyOrders(child, orders, at ? `${at}.${key}` : key)
    }
  }
}

/** Insert a token at a dotted path inside a nested object. */
function place(tree, path, token) {
  const parts = path.split('.')
  let node = tree
  for (const part of parts.slice(0, -1)) {
    if (node[part] === undefined) node[part] = {}
    if (node[part].$value !== undefined) {
      throw new Error(`Path collision: "${path}" would nest under the token "${part}"`)
    }
    node = node[part]
  }
  const leaf = parts.at(-1)
  if (node[leaf] !== undefined) throw new Error(`Duplicate token path: ${path}`)
  node[leaf] = token
}

/** Extract the whole token document from a Bootstrap checkout. */
export function extract(bootstrapRoot) {
  const sources = new Sources(bootstrapRoot)
  const warnings = []

  const records = collect(sources, warnings)
  const index = buildIndex(records)
  addColorScaleToIndex(index, sources)

  const lookup = (name, component) => {
    if (component && index.perComponent.get(component)?.has(name)) {
      return index.perComponent.get(component).get(name)
    }
    return index.global.get(name) ?? null
  }

  const files = {}
  const orders = new Map()

  for (const record of records) {
    const group = record.path.split('.')[0]
    const file = record.component
      ? `component/${record.component}.json`
      : (FILE_FOR_GROUP[group] ?? `primitive/${group}.json`)

    files[file] ??= {}

    const token = toToken(record, (name) => lookup(name, record.component))
    if (TOKEN_DESCRIPTIONS[record.path]) token.$description = TOKEN_DESCRIPTIONS[record.path]
    place(files[file], record.path, token)
    recordOrder(orders, record.path)
  }

  for (const tree of Object.values(files)) applyOrders(tree, orders)

  decorate(files, warnings)

  return { files, records, index, warnings, version: readVersion(sources) }
}

/** Attach group `$type`, `$description` and component metadata. */
function decorate(files, warnings) {
  for (const [file, tree] of Object.entries(files)) {
    for (const [group, node] of Object.entries(tree)) {
      if (!node || typeof node !== 'object' || node.$value !== undefined) continue
      if (GROUP_DESCRIPTIONS[group]) node.$description = GROUP_DESCRIPTIONS[group]
    }

    if (!file.startsWith('component/')) continue

    const name = file.slice('component/'.length, -'.json'.length)
    const meta = COMPONENTS.find((c) => c.name === name)
    if (!meta) {
      warnings.push(`no component metadata for ${file}`)
      continue
    }
    tree[name].$description = `Tokens emitted on \`${meta.selector}\`.`
    tree[name].$extensions = {
      [NS]: {
        sassMap: meta.sassMap,
        selector: meta.selector,
        source: meta.file,
        ...(meta.variantOf ? { variantOf: meta.variantOf } : {})
      }
    }
  }
}

function readVersion(sources) {
  try {
    return JSON.parse(readFileSync(join(sources.root, 'package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
}
