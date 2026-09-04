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

const scalarByPath = new Map(SCALARS.map((s) => [s.path, s.sassVar]))
const selectorByMap = new Map(COMPONENTS.map((c) => [c.sassMap, c.selector]))

export const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * Return a new document with `overrides` applied.
 * An override is `{ value, dark }`; `dark: null` removes an existing light/dark pairing.
 */
export function withOverrides(baseTree, overrides) {
  const tree = clone(baseTree)

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

function nodeAt(tree, path) {
  let node = tree
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return null
    node = node[part]
  }
  return node && node.$value !== undefined ? node : null
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
      after = next.cssValueOf(path)
      before = base.tokens.has(path) ? base.cssValueOf(path) : null
    } catch {
      continue
    }
    if (after !== before) changes.push({ path, cssVar: meta.cssVar, sassMap: meta.sassMap, value: after })
  }
  return changes
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

/** A stylesheet that layers the changed custom properties over compiled Bootstrap. */
export function themeCss(changes) {
  if (changes.length === 0) return ''

  const blocks = []
  for (const [selector, declarations] of declarationsBySelector(changes)) {
    const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n')
    blocks.push(`${selector} {\n${body}\n}`)
  }
  return `${blocks.join('\n\n')}\n`
}

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

/** The `custom.scss` a user drops into their project. */
export function themeScss(doc, overrides, { version, importPath = '../node_modules/bootstrap/scss/bootstrap' } = {}) {
  const only = mapsTouched(doc, overrides)
  if (only.size === 0) {
    return `// No token overrides yet — this is stock Bootstrap.\n@use "${importPath}";\n`
  }
  return emitUseWith(doc, { version, importPath, only })
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
