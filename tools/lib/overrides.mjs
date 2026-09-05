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

const scalarByPath = new Map(SCALARS.map((s) => [s.path, s.sassVar]))
const selectorByMap = new Map(COMPONENTS.map((c) => [c.sassMap, c.selector]))

export const clone = (value) => JSON.parse(JSON.stringify(value))

/**
 * Return a new document with `overrides` applied.
 *
 * An override is `{ value, dark }`; `dark: null` removes an existing light/dark pairing.
 * An override carrying `create` brings a token into existence that upstream does not have —
 * a new hue, a new theme role — which is what lets someone add a brand colour instead of
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
      after = next.cssValueOf(path)
      before = base.tokens.has(path) ? base.cssValueOf(path) : null
    } catch {
      continue
    }
    if (after !== before) {
      changes.push({
        path,
        cssVar: meta.cssVar,
        sassMap: meta.sassMap,
        value: after,
        pinnedModes: meta.pinnedModes ?? null
      })
    }
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

/**
 * A stylesheet that layers the changed custom properties over compiled Bootstrap.
 *
 * `scope` confines the whole thing to one subtree, which is what makes a before/after view
 * possible: the same page rendered twice, themed on one side and stock on the other. Custom
 * properties inherit, so declaring them on a wrapper themes everything inside it and nothing
 * outside.
 */
export function themeCss(changes, { scope = null } = {}) {
  if (changes.length === 0) return ''

  const blocks = []
  for (const [selector, declarations] of declarationsBySelector(changes)) {
    const body = declarations.map(([name, value]) => `  ${name}: ${value};`).join('\n')
    blocks.push(`${scoped(selector, scope)} {\n${body}\n}`)
  }

  blocks.push(...reassertPinned(changes, scope))
  return `${blocks.join('\n\n')}\n`
}

/** `:root` becomes the wrapper itself; everything else becomes a descendant of it. */
function scoped(selector, scope) {
  if (!scope) return selector
  return selector === ':root' ? scope : `${scope} ${selector}`
}

/**
 * Re-declare the tokens Bootstrap pins per colour scheme, at the selectors it pins them on.
 *
 * Two different failures without this. Skip the dark pins and the preview shows a dark mode
 * no build produces. Skip the *light* pin and the override does nothing at all on any page
 * carrying an explicit `data-bs-theme` — which is every page this tool previews.
 * See PINNED_MODES in curation.mjs.
 */
function reassertPinned(changes, scope = null) {
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
      const rule = `${target} {\n  ${change.cssVar}: ${value};\n}`
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

const indent = (text) => text.split('\n').map((line) => `  ${line}`).join('\n')

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

  // Silence here would mean shipping a file that does less than the preview showed.
  const note = [
    '',
    '// Bootstrap re-declares these under [data-bs-theme] after :root, so a Sass override',
    '// alone will not reach a page with an explicit theme. Add this CSS as well:',
    '//',
    ...gaps.flatMap(({ path, cssVar }) => [
      `//   [data-bs-theme="light"] { ${cssVar}: ${doc.cssValueOf(path)}; }`
    ]),
    ''
  ].join('\n')

  return scss + note
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
 * The overrides that add a new colour scale.
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
        $description: `A colour scale added to this theme. Bootstrap does not ship it.`,
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
