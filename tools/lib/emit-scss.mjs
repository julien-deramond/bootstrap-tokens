/**
 * Render the token document back into Sass.
 *
 * Two shapes come out of here:
 *   - a plain module of `$map: (...) !default;` declarations, readable and droppable into
 *     a `v6-dev` checkout as the generated source of its token maps;
 *   - a `@use "bootstrap" with (...)` configuration, which is how a real consumer applies
 *     a theme.
 *
 * Both are driven entirely by the `sassMap` / `sassKey` extensions, so adding a token to
 * the document is enough — nothing here needs to learn about it.
 */

import { ext, walk, childKeys } from './tokens.mjs'
import { SCALARS, LOOPED_INTO_ROOT } from './sass-targets.mjs'
import { ROOT_TOKEN_PATHS } from './curation.mjs'

/** Maps emitted, in the order a reader wants to meet them. */
export const MAP_ORDER = [
  '$colors',
  '$color-tints',
  '$color-shades',
  '$spacers',
  '$negative-spacers',
  '$sizes',
  '$radii',
  '$border-widths',
  '$font-sizes',
  '$font-weights',
  '$breakpoints',
  '$container-max-widths',
  '$aspect-ratios',
  '$position-values',
  '$zindex-levels',
  '$util-opacity',
  '$shadows',
  '$theme-colors',
  '$theme-bgs',
  '$theme-fgs',
  '$theme-borders',
  '$root-tokens'
]

const NESTED_MAPS = new Set(['$colors', '$theme-colors', '$font-sizes'])

/** Group tokens by their owning Sass map, preserving document order. */
export function mapEntries(doc) {
  const maps = new Map()

  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (!meta.sassMap) continue

    if (!maps.has(meta.sassMap)) maps.set(meta.sassMap, [])
    maps.get(meta.sassMap).push({
      path,
      key: meta.sassKey ?? path.split('.').at(-1),
      subKey: meta.sassSubKey ?? null,
      quoted: Boolean(meta.sassQuoted),
      generated: Boolean(meta.generated),
      readonly: Boolean(meta.readonly),
      sassEmit: meta.sassEmit ?? null
    })
  }

  // `$root-tokens` has a fixed order that must match upstream's `:root` block.
  maps.set('$root-tokens', ROOT_TOKEN_PATHS.map(([cssVar, path]) => {
    const token = doc.tokens.get(path)
    return {
      path,
      key: cssVar,
      subKey: null,
      quoted: false,
      generated: false,
      readonly: false,
      sassEmit: ext(token).sassEmit ?? null
    }
  }))

  return maps
}

/**
 * Quoting is not cosmetic here. Upstream writes `2xl: 1536px` unquoted, which Sass reads as
 * the *number* 2 with unit `xl`, not the string "2xl" — quoting it would create a second,
 * distinct map key and duplicate every container rule. So reproduce upstream's quoting
 * exactly rather than applying a rule of our own.
 */
function renderKey(key, quoted) {
  if (key === 'null') return 'null'
  return quoted ? JSON.stringify(key) : key
}

/** A value with a top-level comma would be read as two map entries; wrap it in a list. */
function renderValue(value) {
  if (hasTopLevelComma(value)) return `#{(${value})}`
  return value
}

function hasTopLevelComma(value) {
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < value.length && value[i] !== quote) {
        if (value[i] === '\\') i++
        i++
      }
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

/**
 * Build one Sass map's body as `[key, renderedValue]` pairs.
 * `inline` swaps `#{$white}`-style passthroughs for literals, which is required in a
 * `with ()` block where those Sass variables are not in scope.
 */
export function buildMap(doc, name, entries, { inline = false, skipReadonly = true, keys = null } = {}) {
  if (NESTED_MAPS.has(name)) return buildNestedMap(doc, name, entries, { inline, keys })

  const rows = []
  for (const entry of entries) {
    if (entry.generated) continue
    if (skipReadonly && entry.readonly) continue
    if (keys && !keys.has(entry.key)) continue
    const value = entry.sassEmit && !inline ? entry.sassEmit : doc.cssValueOf(entry.path)
    rows.push([renderKey(entry.key, entry.quoted), renderValue(value)])
  }
  return rows
}

function buildNestedMap(doc, name, entries, { inline, keys = null }) {
  if (name === '$colors') {
    return entries
      .filter((entry) => !entry.generated && entry.path.endsWith('.base'))
      .filter((entry) => !keys || keys.has(entry.key))
      .map((entry) => [renderKey(entry.key, entry.quoted), doc.cssValueOf(entry.path)])
  }

  // A nested map merges only one level deep, so a changed sub-key means emitting that
  // whole sub-map — but only for the roles that changed, not all of them.
  const grouped = new Map()
  for (const entry of entries) {
    if (entry.generated) continue
    if (keys && !keys.has(entry.key)) continue
    const key = renderKey(entry.key, entry.quoted)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push([
      JSON.stringify(entry.subKey),
      renderValue(entry.sassEmit && !inline ? entry.sassEmit : doc.cssValueOf(entry.path))
    ])
  }
  return [...grouped]
}

const isNestedRows = (rows) => rows.length > 0 && Array.isArray(rows[0][1])

function renderMap(name, rows, { indent = 0, suffix = ' !default;' } = {}) {
  const pad = ' '.repeat(indent)
  if (rows.length === 0) return `${pad}${name}: ()${suffix}`

  const body = isNestedRows(rows)
    ? rows
        .map(([key, sub]) => {
          const inner = sub.map(([k, v]) => `${pad}    ${k}: ${v}`).join(',\n')
          return `${pad}  ${key}: (\n${inner}\n${pad}  )`
        })
        .join(',\n')
    : rows.map(([key, value]) => `${pad}  ${key}: ${value}`).join(',\n')

  return `${pad}${name}: (\n${body}\n${pad})${suffix}`
}

/** Scalars, rendered as `$name: value !default;`. */
export function buildScalars(doc) {
  const out = []
  for (const scalar of SCALARS) {
    const token = doc.tokens.get(scalar.path)
    if (!token) continue
    out.push([scalar.sassVar, doc.cssValueOf(scalar.path)])
  }
  return out
}

/** Component maps, in alphabetical order by map name. */
export function componentMaps(maps) {
  return [...maps.keys()].filter((name) => name.endsWith('-tokens') && name !== '$root-tokens').sort()
}

/** The standalone `_tokens.scss` module. */
export function emitTokensModule(doc, { version }) {
  const maps = mapEntries(doc)
  const lines = [banner(version), '']

  lines.push('// Scalars', '')
  for (const [name, value] of buildScalars(doc)) lines.push(`${name}: ${value} !default;`)
  lines.push('')

  lines.push('// Global maps', '')
  for (const name of MAP_ORDER) {
    const entries = maps.get(name)
    if (!entries) continue
    lines.push(renderMap(name, buildMap(doc, name, entries)), '')
  }

  lines.push('// Component maps', '')
  for (const name of componentMaps(maps)) {
    lines.push(renderMap(name, buildMap(doc, name, maps.get(name))), '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * A `@use "…/bootstrap" with (…)` configuration.
 * `only` limits the output to the maps that actually changed; omit it for a full config.
 */
export function emitUseWith(
  doc,
  { version, importPath = 'bootstrap/scss/bootstrap', only = null, changedKeys = null } = {}
) {
  const maps = mapEntries(doc)
  const blocks = []

  const wanted = (name) => only === null || only.has(name)

  for (const [name, value] of buildScalars(doc)) {
    if (wanted(name)) blocks.push(`  ${name}: ${value}`)
  }

  for (const name of [...MAP_ORDER, ...componentMaps(maps)]) {
    const entries = maps.get(name)
    if (!entries || !wanted(name)) continue
    // `defaults()` merges key by key, so a theme only has to carry the keys it changed.
    const rows = buildMap(doc, name, entries, { inline: true, keys: changedKeys?.get(name) ?? null })
    if (rows.length === 0) continue
    blocks.push(renderMap(name, rows, { indent: 2, suffix: '' }))
  }

  if (blocks.length === 0) {
    return `${banner(version)}\n\n@use "${importPath}";\n`
  }

  return `${banner(version)}\n\n@use "${importPath}" with (\n${blocks.join(',\n')}\n);\n`
}

/** Which maps a token's value can be changed through. Loop-generated keys are not one. */
export function overridableMapFor(token) {
  const meta = ext(token)
  if (!meta.sassMap) return null
  if (meta.sassMap === '$root-tokens') return '$root-tokens'
  return meta.sassMap
}

export { LOOPED_INTO_ROOT }

function banner(version) {
  return [
    '// Generated by bootstrap-tokens. Do not edit by hand.',
    `// Token document: tokens/  ·  Bootstrap: v${version}`,
    '// https://github.com/julien-deramond/bootstrap-tokens'
  ].join('\n')
}
