/**
 * Compile upstream Bootstrap into `web/vendor/bootstrap.css`.
 *
 * The chooser previews real Bootstrap markup, and because v6 drives everything through CSS
 * custom properties, overriding those properties re-themes the preview instantly — no Sass
 * in the browser. The vendored stylesheet is what makes that possible.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveBootstrapSource, repoRoot } from '../lib/config.mjs'

export async function vendor({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const sass = await import('sass')

  const target = join(repoRoot, 'web', 'vendor')
  mkdirSync(target, { recursive: true })

  const { css } = sass.compile(join(source, 'scss', 'bootstrap.scss'), {
    loadPaths: [source],
    style: 'expanded',
    sourceMap: false
  })

  const banner = `/*!\n * Bootstrap v6 (compiled from ${source}) — MIT\n * Vendored for the token chooser preview. Regenerate with: bstokens vendor\n */\n`
  const path = join(target, 'bootstrap.css')
  writeFileSync(path, banner + css)

  console.log(`  ${String(css.length).padStart(8)} B  web/vendor/bootstrap.css`)
  return 0
}
