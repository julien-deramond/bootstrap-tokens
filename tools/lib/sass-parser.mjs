/**
 * A small, purpose-built parser for the subset of Sass that Bootstrap v6 uses to
 * declare tokens. It is not a general Sass parser: it understands variable
 * declarations, `defaults(...)` calls and (possibly nested) maps, and it is
 * paren-, quote-, interpolation- and comment-aware. That is all we need to lift
 * `$alert-tokens: defaults((…), $alert-tokens);` into structured data.
 */

const isSpace = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

/**
 * Walk `src` from `start`, returning the index just past the balanced region.
 * Skips over strings, comments and `#{}` interpolation so that delimiters inside
 * them never affect nesting.
 */
function scan(src, start, stopAtDepthZero) {
  let i = start
  let depth = 0

  while (i < src.length) {
    const ch = src[i]

    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }

    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }

    // String
    if (ch === '"' || ch === "'") {
      i++
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') i++
        i++
      }
      i++
      continue
    }

    if (ch === '(' || ch === '[') {
      depth++
      i++
      continue
    }

    if (ch === ')' || ch === ']') {
      depth--
      i++
      if (depth < 0) return i - 1
      continue
    }

    if (depth === 0 && stopAtDepthZero && stopAtDepthZero.includes(ch)) return i

    i++
  }

  return i
}

/** Strip `//` and `/* *\/` comments from a fragment, respecting strings. */
export function stripComments(src) {
  let out = ''
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }

    if (ch === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }

    if (ch === '"' || ch === "'") {
      const quote = ch
      out += ch
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i]
          i++
        }
        out += src[i]
        i++
      }
      out += src[i] ?? ''
      i++
      continue
    }

    out += ch
    i++
  }

  return out
}

/** Split a map/list body on top-level commas. */
function splitTopLevel(body) {
  const parts = []
  let i = 0
  let start = 0

  while (i < body.length) {
    const next = scan(body, i, ',')
    if (next >= body.length) {
      parts.push(body.slice(start))
      break
    }
    if (body[next] === ',') {
      parts.push(body.slice(start, next))
      start = next + 1
      i = next + 1
      continue
    }
    // Unbalanced close paren — shouldn't happen on well-formed input
    parts.push(body.slice(start, next))
    break
  }

  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

/** Remove one layer of wrapping parens, if present. */
function unwrap(value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('(')) return trimmed
  // Only unwrap when the opening paren closes at the very end
  const end = scan(trimmed, 1, null)
  return end === trimmed.length - 1 ? trimmed.slice(1, -1) : trimmed
}

/** True when a value is itself a map: `(a: 1, b: 2)`. */
function looksLikeMap(value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('(')) return false
  const end = scan(trimmed, 1, null)
  if (end !== trimmed.length - 1) return false

  const inner = trimmed.slice(1, -1)
  return splitTopLevel(inner).some((entry) => splitKeyValue(entry) !== null)
}

/** Split `key: value` at the first top-level colon. */
function splitKeyValue(entry) {
  let i = 0
  while (i < entry.length) {
    const next = scan(entry, i, ':')
    if (next >= entry.length) return null
    if (entry[next] === ':') {
      return { key: entry.slice(0, next).trim(), value: entry.slice(next + 1).trim() }
    }
    return null
  }
  return null
}

/** Strip Sass quoting from a map key: `"blue"` → `blue`. */
export function unquote(key) {
  const trimmed = key.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parse a map body (the text between the outermost parens) into an ordered array
 * of `{ key, value }`, where `value` is a string or a nested entry array.
 */
export function parseMapBody(body) {
  return splitTopLevel(stripComments(body))
    .map((entry) => {
      const kv = splitKeyValue(entry)
      if (!kv) return null
      const value = looksLikeMap(kv.value)
        ? parseMapBody(unwrap(kv.value))
        : normalizeValue(kv.value)
      const quoted = kv.key.trim() !== unquote(kv.key)
      return { key: unquote(kv.key), quoted, value }
    })
    .filter(Boolean)
}

/** Collapse the whitespace a multi-line Sass value picks up, without touching strings. */
export function normalizeValue(value) {
  let out = ''
  let i = 0
  const src = value.trim()

  while (i < src.length) {
    const ch = src[i]

    if (ch === '"' || ch === "'") {
      const quote = ch
      out += ch
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i]
          i++
        }
        out += src[i]
        i++
      }
      out += src[i] ?? ''
      i++
      continue
    }

    if (isSpace(ch)) {
      while (i < src.length && isSpace(src[i])) i++
      if (out.length > 0 && i < src.length) out += ' '
      continue
    }

    out += ch
    i++
  }

  return out
}

/**
 * Find every `$name: …;` declaration in a file and return its raw right-hand side.
 * Later declarations of the same name overwrite earlier ones, matching Sass, but
 * we keep the whole history under `all` because Bootstrap declares
 * `$x: () !default;` before `$x: defaults(…);`.
 */
export function findDeclarations(src) {
  const declarations = new Map()
  const re = /(^|\n)[ \t]*(\$[\w-]+)[ \t]*:/g
  let match

  while ((match = re.exec(src)) !== null) {
    const name = match[2]
    const valueStart = match.index + match[0].length
    const end = scan(src, valueStart, ';')
    const raw = src.slice(valueStart, end).trim()

    if (!declarations.has(name)) declarations.set(name, { name, all: [] })
    declarations.get(name).all.push(raw)
    re.lastIndex = end
  }

  for (const entry of declarations.values()) {
    entry.raw = entry.all.at(-1)
  }

  return declarations
}

/**
 * Given a raw right-hand side, return the map body it defines.
 * Handles both `defaults((…), $x)` and a bare `(…) !default`.
 * Returns null when the value is not a map.
 */
export function mapBodyOf(raw) {
  const value = raw.replace(/\s*!default\s*$/, '').trim()

  if (value.startsWith('defaults(')) {
    const inner = value.slice('defaults('.length, scan(value, 'defaults('.length, null))
    const args = splitTopLevel(inner)
    return args.length > 0 ? unwrap(args[0]) : null
  }

  if (value.startsWith('(')) {
    const end = scan(value, 1, null)
    if (end === value.length - 1) return value.slice(1, -1)
  }

  return null
}

/** Parse `$name` from a file's source into an ordered entry array, or null. */
export function parseMapVariable(src, name) {
  const declarations = findDeclarations(src)
  const declaration = declarations.get(name)
  if (!declaration) return null

  for (const raw of [...declaration.all].reverse()) {
    const body = mapBodyOf(raw)
    if (body !== null && body.trim() !== '') return parseMapBody(body)
  }

  return null
}

/** Parse a scalar `$name: value !default;` into its value string. */
export function parseScalarVariable(src, name) {
  const declaration = findDeclarations(src).get(name)
  if (!declaration) return null
  return normalizeValue(declaration.raw.replace(/\s*!default\s*$/, ''))
}

/** Turn an entry array into a plain object (loses ordering fidelity for duplicates). */
export function entriesToObject(entries) {
  const out = {}
  for (const { key, value } of entries) {
    out[key] = Array.isArray(value) ? entriesToObject(value) : value
  }
  return out
}
