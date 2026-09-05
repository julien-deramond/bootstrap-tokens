/**
 * Resolve the token document all the way down to sRGB, per colour scheme.
 *
 * Everything else in this repository preserves Bootstrap's runtime behaviour: a reference
 * becomes `var(--x)`, a scale step stays a `color-mix()`, a themed pair stays
 * `light-dark()`. That is correct for CSS and unusable everywhere else. Figma has no
 * `var()`, Tokens Studio has no `color-mix()`, and a designer opening either wants a swatch,
 * not an expression.
 *
 * Flattening is therefore a *lossy export*, and the loss is stated rather than hidden: a
 * value that cannot be computed without a browser (`currentcolor`, `inherit`) comes back as
 * `null` with a reason, and every consumer that uses this has to say what it did with those.
 */

import { ext, walk } from './tokens.mjs'
import { parseColor, mixColors, toHex } from './color.mjs'
import { cssLiteral } from './value.mjs'
import { lintValue, splitTopLevel } from './css-lint.mjs'

const CALL = /^([a-z-]+)\((.*)\)$/is

/** Trailing `<percentage>` on a `color-mix()` argument, e.g. `var(--white) 25%`. */
const WEIGHT = /\s+(-?[\d.]+)%\s*$/

/**
 * Compute one CSS colour expression to `{ rgb, alpha }`.
 *
 * `lookup` turns a custom property name into the CSS value that declares it, which is what
 * lets `var()` chains resolve without a document being passed around.
 */
export function computeColor(css, { lookup, mode = 'light', seen = new Set() } = {}) {
  const text = String(css ?? '').trim()
  if (!text) return null

  const direct = parseColor(text)
  if (direct) return direct

  const call = CALL.exec(text)
  if (!call) return null
  const [, name, body] = call
  const recurse = (value) => computeColor(value, { lookup, mode, seen })

  if (name === 'light-dark') {
    const sides = splitTopLevel(body)
    if (sides.length !== 2) return null
    return recurse(mode === 'dark' ? sides[1] : sides[0])
  }

  if (name === 'var') {
    const [reference, ...fallback] = splitTopLevel(body)
    const property = reference.trim()
    if (seen.has(property)) return null // a cycle; the CSS would be invalid too
    const declared = lookup?.(property)
    if (declared != null) {
      return computeColor(declared, { lookup, mode, seen: new Set(seen).add(property) })
    }
    return fallback.length > 0 ? recurse(fallback.join(',')) : null
  }

  if (name === 'color-mix') {
    // A malformed weight makes the browser drop the whole declaration, so the honest answer
    // is "no colour", not a plausible one computed from a weight nobody wrote. See U6.
    if (lintValue(text).length > 0) return null

    // The interpolation method is optional in CSS Color 5; without it a browser uses oklab.
    const parts = splitTopLevel(body)
    const named = /^in\s+/.test(parts[0]?.trim() ?? '')
    const space = named ? parts[0].trim().replace(/^in\s+/, '') : 'oklab'
    const [first, second] = named ? parts.slice(1) : parts
    if (!first || !second) return null

    const weighted = (part) => {
      const found = WEIGHT.exec(part)
      return found
        ? { color: recurse(part.slice(0, found.index)), weight: Number(found[1]) / 100 }
        : { color: recurse(part), weight: null }
    }

    const a = weighted(first)
    const b = weighted(second)
    // CSS: an omitted weight is whatever the other one leaves over, or 50% if both are omitted.
    const weight = a.weight ?? (b.weight === null ? 0.5 : 1 - b.weight)
    return mixColors(a.color, b.color, weight, space)
  }

  return null
}

/** Why a token has no flat value, for consumers that must say so. */
function reasonFor(css, { kind = 'colour' } = {}) {
  const text = String(css ?? '').trim()
  if (text === 'null' || text === '') return 'has no value'
  if (/currentcolor/i.test(text)) return 'depends on currentcolor'
  if (/^(inherit|unset|initial|revert)$/i.test(text)) return `is the CSS keyword \`${text}\``
  if (/^#\{?url\(/i.test(text)) return 'is an embedded image, not a colour'
  if (lintValue(text).length > 0) return 'is invalid CSS upstream (BACKLOG U6)'
  if (VAR_CALL.test(text)) return 'reads a custom property no token declares'
  return `is not a ${kind} this exporter can compute`
}

/** Custom properties that more than one token declares, each under its own selector. */
export function declaredMoreThanOnce(doc) {
  const byProperty = new Map()
  for (const [path, token] of walk(doc.tree)) {
    const property = ext(token).cssVar
    if (!property) continue
    if (!byProperty.has(property)) byProperty.set(property, [])
    byProperty.get(property).push(path)
  }
  return new Map([...byProperty].filter(([, paths]) => paths.length > 1))
}

/**
 * Every `color` token as a flat hex, for one scheme.
 *
 * Returns `{ colors, skipped, contextual }`. `colors` is path → `#rrggbb[aa]`; `skipped` is
 * path → why there is no swatch; `contextual` is path → the custom properties whose value
 * depends on where the element sits.
 *
 * That last one is not a detail. 39 custom properties are declared by more than one
 * component — `--nav-link-color` by both `.nav` and `.navbar-nav`, `--btn-color` by `.btn`
 * and `.btn-link` — and in CSS the nearest ancestor wins. A flat file has no ancestors, so
 * it has to pick one and say that it picked. Silently choosing would make a swatch that is
 * right in one place and wrong in another look equally authoritative.
 */
export function flattenColors(doc, { mode = 'light' } = {}) {
  const ambiguous = declaredMoreThanOnce(doc)

  const colors = new Map()
  const skipped = new Map()
  const contextual = new Map()

  for (const [path, token] of walk(doc.tree)) {
    if (token.$type !== 'color') continue
    let css
    try {
      css = doc.cssValueOf(path)
    } catch {
      skipped.set(path, 'does not resolve')
      continue
    }

    const touched = new Set()
    const lookup = (property) => {
      if (ambiguous.has(property)) touched.add(property)
      const target = doc.byCssVar.get(property)
      return target ? doc.cssValueOf(target) : null
    }

    const computed = computeColor(css, { lookup, mode })
    if (computed) colors.set(path, toHex(computed))
    else skipped.set(path, reasonFor(css))
    if (touched.size > 0) contextual.set(path, [...touched])
  }

  return { colors, skipped, contextual, mode }
}

/** The custom property a token is published under, if it has one. */
export const cssVarOf = (token) => ext(token).cssVar ?? null

/* -------------------------------------------------------------------------- */

/**
 * Inline every `var()` and pick a side of every `light-dark()`, leaving CSS a tool with no
 * cascade can use. Colours additionally become hex; everything else keeps its CSS text,
 * because `.15s` and `1.25rem` mean the same thing to a browser and to a designer.
 */
export function flattenValues(doc, { mode = 'light' } = {}) {
  const ambiguous = declaredMoreThanOnce(doc)
  const values = new Map()
  const contextual = new Map()
  const unresolved = new Map()

  for (const [path, token] of walk(doc.tree)) {
    const touched = new Set()
    const lookup = (property) => {
      if (ambiguous.has(property)) touched.add(property)
      const target = doc.byCssVar.get(property)
      return target ? doc.cssValueOf(target) : null
    }

    let css
    try {
      css = doc.cssValueOf(path)
    } catch {
      unresolved.set(path, 'does not resolve')
      continue
    }

    const literal = inline(css, { lookup, mode })
    if (literal === null) {
      unresolved.set(path, reasonFor(css, { kind: token.$type ?? 'value' }))
    } else if (token.$type === 'color') {
      const computed = computeColor(literal, { lookup: () => null, mode })
      if (computed) values.set(path, toHex(computed))
      else unresolved.set(path, reasonFor(css))
    } else {
      // A colour can sit inside a composite: a border, a shadow, a gradient stop. Those
      // have to be computed too, or a "flat" export still contains a color-mix().
      const folded = foldColors(cssLiteral(literal), mode)
      if (folded === null) unresolved.set(path, reasonFor(css, { kind: token.$type ?? 'value' }))
      else values.set(path, folded)
    }
    if (touched.size > 0) contextual.set(path, [...touched])
  }

  return { values, contextual, unresolved, mode }
}

/** Replace every `color-mix()` inside a composite value with the colour it computes to. */
function foldColors(text, mode) {
  return replaceCall(text, 'color-mix', (args) => {
    const computed = computeColor(`color-mix(${args})`, { lookup: () => null, mode })
    return computed ? toHex(computed) : null
  })
}


const VAR_CALL = /\bvar\(/

/**
 * Substitute `var()` and `light-dark()` throughout a value, anywhere they appear — a border
 * is `var(--border-width) solid var(--alert-border-color)`, so this cannot just look at the
 * whole string. Returns `null` when a reference has no declaration and no fallback.
 */
export function inline(css, { lookup, mode = 'light', depth = 0 } = {}) {
  let text = String(css ?? '').trim()
  if (!text || text === 'null') return null
  if (depth > 24) return null // a cycle; the CSS would be invalid too

  text = replaceCall(text, 'light-dark', (args) => {
    const sides = splitTopLevel(args)
    return sides.length === 2 ? (mode === 'dark' ? sides[1] : sides[0]).trim() : null
  })
  if (text === null) return null

  if (!VAR_CALL.test(text)) return text

  const substituted = replaceCall(text, 'var', (args) => {
    const [reference, ...fallback] = splitTopLevel(args)
    const declared = lookup?.(reference.trim())
    if (declared != null) return declared
    return fallback.length > 0 ? fallback.join(',').trim() : null
  })
  if (substituted === null) return null

  return inline(substituted, { lookup, mode, depth: depth + 1 })
}

/**
 * Rewrite every `name(...)` call in `text` through `replace`. Written by hand rather than
 * with a regex because the arguments nest: `var(--a, var(--b))` needs balanced matching.
 */
function replaceCall(text, name, replace) {
  const needle = `${name}(`
  let out = ''
  let at = 0

  for (;;) {
    const start = text.indexOf(needle, at)
    if (start === -1) return out + text.slice(at)

    // Only a call, not the tail of a longer identifier.
    if (start > 0 && /[\w-]/.test(text[start - 1])) {
      out += text.slice(at, start + needle.length)
      at = start + needle.length
      continue
    }

    let depth = 1
    let i = start + needle.length
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    if (depth !== 0) return null // unbalanced; not something to guess at

    const replaced = replace(text.slice(start + needle.length, i - 1))
    if (replaced === null) return null
    out += text.slice(at, start) + replaced
    at = i
  }
}
