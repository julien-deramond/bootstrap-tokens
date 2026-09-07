/**
 * Assemble the Theme Builder into a static site.
 *
 * The app is not bundled: it imports the same `tools/lib/*.mjs` the CLI uses and fetches the
 * same `tokens/` and `build/json/` the CLI writes, so that token resolution has one
 * implementation rather than two. That is a virtue locally and a constraint here — the site
 * has to keep the repository's shape, because `web/app.js` reaches out of `web/` to find the
 * rest. So this copies the four trees it reaches for, and puts a redirect at the root, which
 * is what `web/dev-server.mjs` serves at `/` too.
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { repoRoot } from '../lib/config.mjs'

/** Everything `web/` reaches for, as repository-relative paths. */
const TREES = ['web', 'tools/lib', 'tokens', 'build/json']

/** The dev server has no business on a static host; everything else in the trees is used. */
const keep = (from) => !from.endsWith(join('web', 'dev-server.mjs'))

const REDIRECT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bootstrap Theme Builder</title>
    <meta http-equiv="refresh" content="0; url=./web/" />
    <link rel="canonical" href="./web/" />
  </head>
  <body>
    <p><a href="./web/">Bootstrap Theme Builder</a></p>
  </body>
</html>
`

export async function site({ flags }) {
  const out = flags.out ? join(repoRoot, flags.out) : join(repoRoot, 'build', 'site')

  const missing = TREES.filter((tree) => !existsSync(join(repoRoot, tree)))
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.join(', ')}. The site is assembled from build output — run:\n  bstokens build`
    )
  }

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  for (const tree of TREES) {
    const target = join(out, tree)
    mkdirSync(join(target, '..'), { recursive: true })
    cpSync(join(repoRoot, tree), target, { recursive: true, filter: keep })
    console.log(`  ${tree}`)
  }

  writeFileSync(join(out, 'index.html'), REDIRECT)
  console.log(`  index.html  →  ./web/`)
  console.log(`\nSite written to ${relative(repoRoot, out)}/`)
  return 0
}
