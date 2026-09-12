/**
 * What Bootstrap's compiled stylesheet actually says.
 *
 * Several properties of this project can only be settled by compiling: which custom
 * properties exist at all, and which selector each token map is emitted on. Naming
 * conventions get both nearly right, and "nearly right" is how a deliberate opt-in hook gets
 * reported as a bug and a wrong selector goes unnoticed for the life of the project.
 *
 * Compiling needs a checkout, which is why this runs during `sync` and the answers are
 * recorded in `tokens/meta.json` for everything else.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { customProperties } from './css-parse.mjs'

const DECLARATION = /(--[\w-]+)\s*:/g

/** Compile `bootstrap.scss`, or return `null` when no Sass compiler is available. */
export async function compileUpstream(source) {
  let sass
  try {
    sass = await import('sass')
  } catch {
    return null
  }

  const { css } = sass.compile(join(source, 'scss', 'bootstrap.scss'), { loadPaths: [source] })
  return {
    css,
    declared: [...new Set([...css.matchAll(DECLARATION)].map((match) => match[1]))].sort(),
    declarations: customProperties(css)
  }
}

/**
 * Maps that are defined, documented and `!default`-configurable, and never `@include`d.
 *
 * Nothing they contain reaches CSS, so configuring one does nothing at all — silently, which
 * is the worst way for a documented configuration point to fail. Two of Bootstrap's sixty-two
 * are like this today; see issue #16.
 */
export function includedMaps(source) {
  const scss = join(source, 'scss')
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (entry.endsWith('.scss')) files.push(path)
    }
  }
  walk(scss)

  const included = new Set()
  for (const file of files) {
    for (const [, name] of readFileSync(file, 'utf8').matchAll(/@include\s+tokens\(\s*(\$[\w-]+)/g)) {
      included.add(name)
    }
  }
  return included
}
