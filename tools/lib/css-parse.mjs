/**
 * Read compiled CSS well enough to compare it.
 *
 * A real CSS parser would be the obvious dependency and the wrong one: this only ever reads
 * Bootstrap's own output, and every bug found here so far has been about *which* rule a
 * declaration belongs to rather than about parsing exotic syntax. Keeping it small keeps the
 * rules it applies visible, which is where the mistakes have been.
 */

/**
 * Custom properties grouped by the selector they are declared on, ignoring anything inside a
 * conditional at-rule.
 *
 * Grouping by selector is the whole point. A global last-declaration-wins map produced a
 * false failure on the first run, because upstream re-declares `--shadow-strength` under
 * `[data-bs-theme=light]` and `[data-bs-theme=dark]` — different rules, not overrides of
 * `:root`.
 *
 * *Within* one selector, though, last does win, and it has to: `.drawer` declares
 * `--drawer-backdrop-bg` twice, once from each of two token maps, and the effective value is
 * the second. Keeping the first there compares against a value no browser ever uses.
 */
export function customProperties(css) {
  const bySelector = new Map()
  const stack = []
  const conditionalDepth = []
  let buffer = ''
  let conditional = 0

  for (let i = 0; i < css.length; i++) {
    const ch = css[i]

    if (ch === '{') {
      // Comments accumulate into the prelude, so the banner above `:root, :host` became
      // part of the selector and nothing matched.
      const prelude = buffer.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      buffer = ''

      const atRule = prelude.startsWith('@')
      // `@layer` is not conditional — what is inside it always applies, it just sits lower
      // in the cascade. Treating it as conditional hid every token in `@layer colors`.
      if (atRule) {
        const isConditional = CONDITIONAL.test(prelude)
        conditionalDepth.push(isConditional ? 1 : 0)
        if (isConditional) conditional++
      }
      stack.push(atRule ? null : prelude)
      continue
    }

    if (ch === '}') {
      const prelude = stack.pop()
      if (prelude === null && conditionalDepth.length > 0) conditional -= conditionalDepth.pop()
      buffer = ''
      continue
    }

    if (ch === ';') {
      // Inside an at-rule the top of the stack is null, so walk out to the nearest selector.
      const selector = [...stack].reverse().find((entry) => entry !== null) ?? null
      const declaration = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buffer.replace(/\/\*[\s\S]*?\*\//g, ''))

      if (selector && declaration && conditional === 0) {
        for (const part of selector.split(',').map((one) => one.trim())) {
          if (!bySelector.has(part)) bySelector.set(part, new Map())
          bySelector.get(part).set(declaration[1], declaration[2].trim())
        }
      }
      buffer = ''
      continue
    }

    buffer += ch
  }

  return bySelector
}

const CONDITIONAL = /^@(media|supports|container)\b/

/**
 * Upstream writes `:root,\n:host` and the parser records those as two rules, so a lookup for
 * the combined selector we emit finds nothing. Silently — which is how 653 of the 1328
 * declarations, every global token, went uncompared while the check reported success on the
 * 591 that happened to be single-selector components.
 */
export function valueOn(bySelector, selector, property) {
  for (const part of String(selector).split(',')) {
    const found = bySelector.get(part.trim())?.get(property)
    if (found !== undefined) return found
  }
  return undefined
}

