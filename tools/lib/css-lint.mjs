/**
 * Values that are faithful to upstream and still wrong in a browser.
 *
 * The rest of this repository asks "does the document say what Bootstrap says?". That
 * question has a blind spot: if Bootstrap says something a browser rejects, a perfectly
 * faithful document reproduces the mistake and every check still passes. Byte-identical CSS
 * proves fidelity, not correctness.
 *
 * So these rules run against *resolved* values and report findings rather than errors. The
 * document is not invalid — the value it mirrors is. Fixing it here would break fidelity;
 * the fix belongs upstream, and until it lands the finding is how we avoid forgetting.
 */

/**
 * `color-mix()` weights must be `<percentage>`.
 *
 * A bare number parses at declaration time — a custom property accepts any token sequence —
 * and fails at substitution, so the property falls back to its inherited value instead of
 * the colour that was written. It is silent: no console warning, no visible error, just the
 * wrong colour. Verified in Chrome 148.
 */
const COLOR_MIX = /\bcolor-mix\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi
const BARE_WEIGHT = /(?:^|[\s,])(\.\d+|\d+(?:\.\d+)?)(?=\s*(?:,|$))/

function colorMixWeights(value) {
  const problems = []
  for (const [, args] of value.matchAll(COLOR_MIX)) {
    // Drop the `in <space>` prefix, then look at each colour-and-weight argument.
    const parts = splitTopLevel(args).slice(1)
    for (const part of parts) {
      const bare = BARE_WEIGHT.exec(part.trim())
      if (bare) {
        problems.push(
          `color-mix() weight \`${bare[1]}\` is a number, not a percentage — ` +
            `the declaration is dropped at substitution and the colour is inherited instead ` +
            `(did upstream mean \`${percentOf(bare[1])}\`?)`
        )
      }
    }
  }
  return problems
}

const percentOf = (n) => `${Number((Number(n) <= 1 ? Number(n) * 100 : Number(n)).toFixed(4))}%`

/** Split on commas that are not inside parentheses. */
export function splitTopLevel(text, separator = ',') {
  const parts = []
  let depth = 0
  let current = ''
  for (const character of text) {
    if (character === '(') depth++
    else if (character === ')') depth--
    if (character === separator && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += character
  }
  parts.push(current)
  return parts
}

const RULES = [colorMixWeights]

/** Findings for one resolved CSS value. */
export function lintValue(value) {
  const text = String(value ?? '')
  return RULES.flatMap((rule) => rule(text))
}
