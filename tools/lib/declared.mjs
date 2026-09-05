/**
 * Which custom properties Bootstrap actually declares.
 *
 * A token value like `var(--btn-input-font-weight)` is only meaningful if something,
 * somewhere, declares that property. Bootstrap declares plenty outside the token maps —
 * `--theme-fg` comes from the `.theme-*` helpers, sizes come from loops — so the list
 * cannot be derived from `tokens/` alone, and guessing from naming conventions would be
 * exactly the kind of almost-right that hides a real gap.
 *
 * So compile the stylesheet and read them off. That needs a checkout, which is why this
 * runs during `sync` and the answer is recorded in `tokens/meta.json` for everything else.
 */

import { join } from 'node:path'

const DECLARATION = /(--[\w-]+)\s*:/g

/** Returns a sorted list, or `null` if no Sass compiler is available — "unknown", not "none". */
export async function declaredCustomProperties(source) {
  let sass
  try {
    sass = await import('sass')
  } catch {
    return null
  }

  const { css } = sass.compile(join(source, 'scss', 'bootstrap.scss'), { loadPaths: [source] })
  return [...new Set([...css.matchAll(DECLARATION)].map((match) => match[1]))].sort()
}
