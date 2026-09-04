/**
 * JS ports of the handful of Sass functions Bootstrap calls *inside* token values.
 *
 * Evaluating them at extraction time is what lets an exported theme stand alone: a
 * `@use "bootstrap" with (…)` block is evaluated in the consumer's scope, where
 * `escape-svg()` is not defined. Storing the escaped literal also means the token
 * document holds a real CSS value the chooser can show.
 */

/** `scss/_config.scss` — `$escaped-characters`. */
const ESCAPED = [
  ['<', '%3c'],
  ['>', '%3e'],
  ['#', '%23'],
  ['(', '%28'],
  [')', '%29']
]

const replaceAll = (input, from, to) => input.split(from).join(to)

/** Port of `escape-svg()` from `scss/_functions.scss`. */
export function escapeSvg(value) {
  if (!value.includes('data:image/svg+xml')) return value

  const url = /^url\(("|')([\s\S]*)\1\)$/.exec(value.trim())
  if (!url) {
    let out = value
    for (const [char, encoded] of ESCAPED) out = replaceAll(out, char, encoded)
    return out
  }

  let inner = url[2]
  for (const [char, encoded] of ESCAPED) inner = replaceAll(inner, char, encoded)
  return `url("${inner}")`
}

/** Find the index of the paren closing the one at `open`. */
function matchParen(src, open) {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Evaluate every `escape-svg(…)` call inside a value. */
export function evaluateSassFunctions(value) {
  let out = value
  let guard = 0

  while (out.includes('escape-svg(') && guard++ < 10) {
    const start = out.indexOf('escape-svg(')
    const open = start + 'escape-svg'.length
    const close = matchParen(out, open)
    if (close === -1) break
    out = out.slice(0, start) + escapeSvg(out.slice(open + 1, close).trim()) + out.slice(close + 1)
  }

  return out
}
