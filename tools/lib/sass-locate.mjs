/**
 * Locating the exact byte range of a value inside a Sass source file.
 *
 * This exists so the maintainer-facing export can *patch* upstream's own files rather than
 * regenerate them. Regeneration would reformat every token map — losing `$spacer * .25`,
 * `escape-svg(…)`, the section comments and the blank lines — and the resulting diff would
 * be unreviewable. Splicing single values leaves everything else byte-for-byte intact, so
 * `git diff` shows only what the maintainer actually changed.
 */

import { scan, unquote } from './sass-parser.mjs'

/** Trim whitespace from a range, returning the tightened `[start, end)`. */
function tighten(src, start, end) {
  let from = start
  let to = end
  while (from < to && /\s/.test(src[from])) from++
  while (to > from && /\s/.test(src[to - 1])) to--
  return [from, to]
}

/**
 * Every `$name: …;` declaration with the byte range of its right-hand side.
 * Returns `Map<name, { all: [{ valueStart, valueEnd, raw }] }>` in source order.
 */
export function locateDeclarations(src) {
  const found = new Map()
  const re = /(^|\n)[ \t]*(\$[\w-]+)[ \t]*:/g
  let match

  while ((match = re.exec(src)) !== null) {
    const name = match[2]
    const start = match.index + match[0].length
    const end = scan(src, start, ';')
    const [valueStart, valueEnd] = tighten(src, start, end)

    if (!found.has(name)) found.set(name, { name, all: [] })
    found.get(name).all.push({ valueStart, valueEnd, raw: src.slice(valueStart, valueEnd) })
    re.lastIndex = end
  }

  return found
}

const withoutDefault = (src, start, end) => {
  const bang = src.slice(start, end).search(/\s*!default\s*$/)
  return bang === -1 ? end : start + bang
}

/**
 * The range of the map literal a declaration defines, following into `defaults((…), $x)`.
 * Returns null when the declaration is not a map.
 */
export function locateMapBody(src, declaration) {
  const end = withoutDefault(src, declaration.valueStart, declaration.valueEnd)
  const [start] = tighten(src, declaration.valueStart, end)

  if (src.startsWith('defaults(', start)) {
    const open = start + 'defaults('.length - 1
    const close = scan(src, open + 1, null)
    // First argument of defaults() is the map of built-in values.
    const [argStart] = tighten(src, open + 1, close)
    if (src[argStart] !== '(') return null
    const argClose = scan(src, argStart + 1, null)
    return { start: argStart + 1, end: argClose }
  }

  if (src[start] === '(') {
    const close = scan(src, start + 1, null)
    return { start: start + 1, end: close }
  }

  return null
}

/** Pick the declaration of `$name` that actually defines a map (upstream declares it twice). */
export function mapDeclarationOf(src, declarations, name) {
  const entry = declarations.get(name)
  if (!entry) return null

  for (const declaration of [...entry.all].reverse()) {
    const body = locateMapBody(src, declaration)
    if (body && src.slice(body.start, body.end).trim() !== '') return { declaration, body }
  }
  return null
}

/**
 * Split a map body into entries, with absolute offsets for the key, the value, and the whole
 * entry including its leading comments and trailing comma — the last of which is what makes
 * clean insertion and deletion possible.
 */
export function locateEntries(src, body) {
  const entries = []
  let cursor = body.start

  while (cursor < body.end) {
    let stop = scan(src, cursor, ',')
    if (stop > body.end) stop = body.end

    const segmentEnd = Math.min(stop, body.end)
    const [start, end] = tighten(src, cursor, segmentEnd)

    if (end > start) {
      const entry = describeEntry(src, start, end)
      if (entry) {
        entry.entryStart = cursor
        entry.entryEnd = segmentEnd < body.end && src[segmentEnd] === ',' ? segmentEnd + 1 : segmentEnd
        entries.push(entry)
      }
    }

    if (segmentEnd >= body.end) break
    cursor = segmentEnd + 1
  }

  return entries
}

function describeEntry(src, start, end) {
  const colon = scan(src, start, ':')
  if (colon >= end || src[colon] !== ':') return null

  const [keyStart, keyEnd] = tighten(src, start, colon)
  const [valueStart, valueEnd] = tighten(src, colon + 1, end)
  const rawKey = src.slice(keyStart, keyEnd)
  const value = src.slice(valueStart, valueEnd)

  const entry = {
    key: unquote(rawKey),
    quoted: rawKey !== unquote(rawKey),
    keyStart,
    keyEnd,
    valueStart,
    valueEnd,
    value
  }

  // A nested map (`"primary": ( "base": … )`) carries its own entries.
  if (value.startsWith('(')) {
    const close = scan(src, valueStart + 1, null)
    if (close === valueEnd - 1) {
      entry.isMap = true
      entry.body = { start: valueStart + 1, end: close }
      entry.entries = locateEntries(src, entry.body)
    }
  }

  return entry
}

/** Indentation of the line `offset` sits on. */
export function indentAt(src, offset) {
  const lineStart = src.lastIndexOf('\n', offset - 1) + 1
  const indent = /^[ \t]*/.exec(src.slice(lineStart, offset))
  return indent ? indent[0] : ''
}

/**
 * Apply non-overlapping `{ start, end, text }` edits to a string.
 * Applied back to front so earlier offsets stay valid.
 */
export function applyEdits(src, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start)

  let previousStart = Number.POSITIVE_INFINITY
  for (const edit of ordered) {
    if (edit.end > previousStart) throw new Error('Overlapping source edits')
    previousStart = edit.start
  }

  let out = src
  for (const edit of ordered) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
