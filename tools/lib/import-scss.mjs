/**
 * Read a `custom.scss` back into a theme.
 *
 * The inverse of the exporter. Someone with a Bootstrap theme already written should be able
 * to open it here and carry on, rather than being told to start again — which is the
 * difference between a tool you adopt and a tool you evaluate.
 *
 * Deliberately forgiving about *shape* and strict about *meaning*: it accepts any
 * `@use … with (…)` block however it is formatted, but anything it cannot map onto a known
 * token is reported rather than guessed at, so an import never silently drops half a theme.
 */

import { parseMapBody, scan } from './sass-parser.mjs'
import { cssToRefs, splitLightDark } from './value.mjs'
import { ext, walk, authoredValue } from './tokens.mjs'
import { optionByName } from './config-surface.mjs'

/** Where each Sass name and map key lives in the token document. */
export function buildReverseIndex(doc) {
  const byVar = new Map()
  const byMapKey = new Map()
  const byCssVar = new Map()

  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (meta.sassVar) byVar.set(meta.sassVar, path)
    if (meta.cssVar) byCssVar.set(meta.cssVar.replace(/^--/, ''), path)
    if (meta.sassMap && meta.sassKey !== undefined) {
      byMapKey.set(`${meta.sassMap} ${meta.sassKey} ${meta.sassSubKey ?? ''}`, path)
    }
  }

  return { byVar, byMapKey, byCssVar }
}

/** The body of the `with (…)` block, or null when the file has no configuration. */
export function findWithBlock(source) {
  const at = source.search(/@use\s+["'][^"']+["']\s+with\s*\(/)
  if (at === -1) return null

  const open = source.indexOf('(', source.indexOf('with', at))
  const close = scan(source, open + 1, null)
  return close === -1 ? null : source.slice(open + 1, close)
}

const asLightDark = (raw, toRefs) => {
  const pair = splitLightDark(raw)
  return pair ? { value: toRefs(pair[0]), dark: toRefs(pair[1]) } : { value: toRefs(raw) }
}

/**
 * Turn a `custom.scss` into `{ overrides, options, unmapped }`.
 *
 * `unmapped` is the honest part: every declaration that could not be placed, and why.
 */
export function importScss(source, doc) {
  const body = findWithBlock(source)

  if (body === null) {
    // A file that only imports Bootstrap is a valid theme — the empty one.
    const uses = /@use\s+["'][^"']+["']/.test(source)
    return {
      overrides: {},
      options: {},
      unmapped: uses ? [] : [{ name: '(file)', reason: 'no @use rule found' }]
    }
  }

  const { byVar, byMapKey, byCssVar } = buildReverseIndex(doc)
  const toRefs = (raw) => cssToRefs(raw, (name) => byCssVar.get(name) ?? null)

  const overrides = {}
  const options = {}
  const unmapped = []

  for (const { key: name, value } of parseMapBody(body)) {
    if (!name.startsWith('$')) continue

    if (optionByName.has(name)) {
      options[name] = {
        value: typeof value === 'string' ? value : renderMap(value),
        kind: optionByName.get(name).kind
      }
      continue
    }

    if (typeof value === 'string') {
      const path = byVar.get(name)
      if (path) overrides[path] = asLightDark(value, toRefs)
      else unmapped.push({ name, reason: 'not a variable this project models' })
      continue
    }

    // A map: each key is a token, and a nested map is a role with its own sub-keys.
    for (const entry of value) {
      if (Array.isArray(entry.value)) {
        for (const sub of entry.value) {
          place(overrides, unmapped, byMapKey, name, entry.key, sub.key, sub.value, toRefs)
        }
        continue
      }
      place(overrides, unmapped, byMapKey, name, entry.key, '', entry.value, toRefs)
    }
  }

  return { overrides: onlyChanges(overrides, doc), options, unmapped }
}

/**
 * Drop anything that merely restates Bootstrap's default.
 *
 * A nested map merges one level deep, so changing one sub-key of a theme role obliges the
 * export to carry all nine. Reading those nine back as nine edits would be faithful to the
 * file and wrong about the intent: the user changed one. Comparing against the base document
 * recovers the edit that was actually made, and makes export → import → export stable.
 */
function onlyChanges(overrides, doc) {
  const changed = {}

  for (const [path, override] of Object.entries(overrides)) {
    const token = doc.tokens.get(path)
    const sameValue = override.value === authoredValue(token, 'value')
    const sameDark = (override.dark ?? '') === authoredValue(token, 'dark')

    if (sameValue && sameDark) continue
    changed[path] = override
  }

  return changed
}

function place(overrides, unmapped, byMapKey, map, key, subKey, raw, toRefs) {
  const path = byMapKey.get(`${map} ${key} ${subKey}`)

  if (!path) {
    unmapped.push({
      name: `${map} > ${subKey ? `${key}.${subKey}` : key}`,
      reason: 'no token in the document has that map key'
    })
    return
  }

  if (typeof raw !== 'string') {
    unmapped.push({ name: `${map} > ${key}`, reason: 'nested deeper than this project models' })
    return
  }

  overrides[path] = asLightDark(raw, toRefs)
}

/** Re-render a parsed map, for an option whose value we keep as source text. */
function renderMap(entries) {
  const inner = entries
    .map(({ key, quoted, value }) => {
      const name = quoted ? JSON.stringify(key) : key
      return `${name}: ${Array.isArray(value) ? renderMap(value) : value}`
    })
    .join(', ')
  return `(${inner})`
}
