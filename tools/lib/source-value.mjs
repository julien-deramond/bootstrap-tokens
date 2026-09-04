/**
 * Rendering a token the way a Bootstrap maintainer would write it in the source.
 *
 * Different from `cssValueOf` in two ways that matter: a reference resolves to the Sass
 * scalar (`$spacer`) when there is no custom property for it, and arithmetic is left
 * symbolic instead of evaluated — so `$spacer * .25` survives an eject rather than being
 * flattened to `.25rem` and losing the relationship the source is built on.
 *
 * Free of Node built-ins so the chooser can preview the same text it will produce.
 */

import { ext } from './tokens.mjs'
import { typedToCss, refsToCss } from './value.mjs'
import { SCALARS, SASS_VAR_PATHS, SASS_FILE_FOR } from './sass-targets.mjs'

/** Token path → the Sass scalar that holds it. */
export const SASS_VAR_FOR = new Map([
  ...[...SASS_VAR_PATHS].map(([sassVar, path]) => [path, sassVar]),
  ...SCALARS.map((scalar) => [scalar.path, scalar.sassVar])
])

/**
 * Render a token as a maintainer would write it in the source: references become `var(--x)`
 * where a custom property exists and `$spacer` where a Sass scalar does, and arithmetic is
 * left symbolic rather than evaluated, so `$spacer * .25` survives.
 */
export function sourceValueOf(doc, path, { wrap = true, seen = new Set() } = {}) {
  const token = doc.tokens.get(path)
  if (!token) return null
  if (seen.has(path)) throw new Error(`Reference cycle through "${path}"`)

  const next = new Set(seen).add(path)
  const meta = ext(token)

  const side = (value) =>
    typeof value === 'string'
      ? refsToCss(value, (target) => sourceRefOf(doc, target, next))
      : typedToCss({ ...token, $value: value })

  const light = side(token.$value)
  let out = meta.dark ? `light-dark(${light}, ${side(meta.dark)})` : light

  // Upstream interpolates arithmetic that lands in a custom-property map, because the
  // `tokens()` mixin emits the value verbatim.
  if (wrap && meta.arithmetic && String(meta.sassKey ?? '').startsWith('--')) out = `#{${out}}`

  return out
}

function sourceRefOf(doc, path, seen) {
  const token = doc.tokens.get(path)
  if (!token) return null

  const meta = ext(token)
  if (meta.cssVar) return `var(${meta.cssVar})`
  if (SASS_VAR_FOR.has(path)) return SASS_VAR_FOR.get(path)

  return sourceValueOf(doc, path, { wrap: false, seen })
}

/**
 * A readable preview of the source edits a set of overrides implies, without needing the
 * Bootstrap checkout. `to` is exactly what `bstokens eject` will write, because it comes
 * from the same renderer; `from` is our rendering of upstream's value, which can be
 * formatted differently in the file (upstream may have written `escape-svg(url(…))` where
 * we hold the escaped result).
 */
export function sourceEdits(baseDoc, themedDoc, overrides) {
  const edits = []

  for (const path of Object.keys(overrides)) {
    const token = themedDoc.tokens.get(path)
    if (!token) continue

    const meta = ext(token)
    if (meta.readonly || meta.generated) continue

    const declaration = meta.sassVar ?? meta.sassMap ?? null
    const to = sourceValueOf(themedDoc, path)
    const from = baseDoc.tokens.has(path) ? sourceValueOf(baseDoc, path) : null
    if (from === to) continue

    edits.push({
      path,
      declaration,
      // A scalar such as `$blue` is not in the file table; its map (`$colors`) is, and they
      // live in the same file.
      file: SASS_FILE_FOR.get(declaration) ?? SASS_FILE_FOR.get(meta.sassMap) ?? null,
      key: meta.sassVar ?? [meta.sassKey, meta.sassSubKey].filter(Boolean).join('.'),
      from,
      to
    })
  }

  return edits.sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || a.key.localeCompare(b.key))
}
