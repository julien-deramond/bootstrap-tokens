/**
 * Conversion between Bootstrap's CSS-native Sass values and our DTCG values.
 *
 * See docs/dtcg-conventions.md — a `$value` may be a plain alias (`"{a.b}"`), a
 * Bootstrap expression (an alias embedded in CSS), or a literal CSS string.
 */

const VAR_REF = /var\(\s*--([\w-]+)\s*\)/g
// `#{...}` is Sass interpolation, not an alias — the lookbehind keeps them apart.
const ALIAS = /(?<!#)\{([^{}]+)\}/g

/** Find the index of the paren that closes the one at `open`. */
function matchParen(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Split a function's argument list on top-level commas. */
export function splitArgs(src) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(src.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(src.slice(start).trim())
  return parts
}

/** If `css` is exactly one `light-dark(a, b)` call, return `[a, b]`. */
export function splitLightDark(css) {
  const value = css.trim()
  if (!value.startsWith('light-dark(')) return null
  const close = matchParen(value, value.indexOf('('))
  if (close !== value.length - 1) return null
  const args = splitArgs(value.slice(value.indexOf('(') + 1, close))
  return args.length === 2 ? args : null
}

/** Rewrite every resolvable `var(--x)` into a `{token.path}` alias. */
export function cssToRefs(css, lookup) {
  return css.replace(VAR_REF, (whole, name) => {
    const path = lookup(name)
    return path ? `{${path}}` : whole
  })
}

/** Rewrite every `{token.path}` alias back into whatever the token emits. */
export function refsToCss(value, emit) {
  return String(value).replace(ALIAS, (whole, path) => {
    const out = emit(path.trim())
    return out === undefined || out === null ? whole : out
  })
}

/** List the token paths a value references. */
export function referencesIn(value) {
  const out = []
  for (const match of String(value).matchAll(ALIAS)) out.push(match[1].trim())
  return out
}

/** True when the value is exactly one alias and nothing else. */
export function isPureAlias(value) {
  return typeof value === 'string' && /^(?<!#)\{[^{}]+\}$/.test(value.trim())
}

const DIMENSION = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)$/
const UNITLESS = /^-?(?:\d+\.?\d*|\.\d+)$/
const HEX = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i
const FONT_WEIGHT = /^(?:[1-9]00|normal|bold|bolder|lighter)$/
const DURATION = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/
const EASING = /^cubic-bezier\(([^()]*)\)$/

/**
 * Give a literal CSS value a DTCG `$type` and typed `$value` when it maps cleanly.
 * Returns `null` when it doesn't — the caller then keeps the raw string and marks
 * the token `css: true`.
 */
export function typeLiteral(css, hint) {
  const value = String(css).trim()

  if (hint === 'color') {
    if (HEX.test(value)) return { $type: 'color', $value: value }
    return null
  }

  const dimension = DIMENSION.exec(value)
  if (dimension) {
    return { $type: 'dimension', $value: { value: Number(dimension[1]), unit: dimension[2] } }
  }

  const duration = DURATION.exec(value)
  if (duration && hint === 'duration') {
    return { $type: 'duration', $value: { value: Number(duration[1]), unit: duration[2] } }
  }

  const easing = EASING.exec(value)
  if (easing) {
    const parts = splitArgs(easing[1]).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { $type: 'cubicBezier', $value: parts }
    }
  }

  if (hint === 'fontWeight' && FONT_WEIGHT.test(value)) {
    return { $type: 'fontWeight', $value: UNITLESS.test(value) ? Number(value) : value }
  }

  if (UNITLESS.test(value)) return { $type: 'number', $value: Number(value) }

  return null
}

/** Render a typed DTCG `$value` back to CSS. */
export function typedToCss(token) {
  const value = token.$value

  if (token.$type === 'dimension' && value && typeof value === 'object') {
    return `${formatNumber(value.value)}${value.unit}`
  }
  if (token.$type === 'duration' && value && typeof value === 'object') {
    return `${formatNumber(value.value)}${value.unit}`
  }
  if (token.$type === 'cubicBezier' && Array.isArray(value)) {
    return `cubic-bezier(${value.map(formatNumber).join(', ')})`
  }
  if (typeof value === 'number') return formatNumber(value)

  return String(value)
}

/** Bootstrap's Sass omits leading zeros (`.5rem`, not `0.5rem`). Match it. */
export function formatNumber(n) {
  const str = String(n)
  if (str.startsWith('0.')) return str.slice(1)
  if (str.startsWith('-0.')) return `-${str.slice(2)}`
  return str
}
