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

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { repoRoot } from '../lib/config.mjs'

/** Everything `web/` reaches for, as repository-relative paths. */
const TREES = ['web', 'tools/lib', 'tokens', 'build/json']

/** Development-only scripts have no business on a static host; the rest of the trees is used. */
const DEV_ONLY = ['dev-server.mjs', 'og-capture.mjs'].map((file) => join('web', file))
const keep = (from) => !DEV_ONLY.some((file) => from.endsWith(file))

/**
 * The link-preview tags, taken from `web/index.html` rather than written again here.
 *
 * The root of the site is a redirect, and it is also the URL the README hands out and the one
 * people paste into Slack. Scrapers do not follow a meta refresh, so tags that live only on
 * `/web/` would never be seen — but keeping a second copy in this file is how the two drift.
 * So the redirect page borrows the real ones.
 */
function linkPreviewTags() {
  const source = readFileSync(join(repoRoot, 'web', 'index.html'), 'utf8')
  const block = source.match(/<!-- open-graph -->([\s\S]*?)<!-- \/open-graph -->/)

  // Loud, not silent: a root page with no preview looks fine and is only discovered when a
  // shared link renders bare, long after the deploy.
  if (!block) {
    throw new Error(
      'No <!-- open-graph --> block in web/index.html, so the site root would have no link preview.'
    )
  }

  return block[1].trim()
}

const redirect = (tags) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bootstrap Theme Builder</title>

    ${tags.split('\n').map((line) => line.trim()).join('\n    ')}

    <meta http-equiv="refresh" content="0; url=./web/" />
    <!--
      Self-referential, and web/index.html points here: the root is the address this tool is
      published at and the one the README hands out, and /web/ is where the redirect happens
      to land. Both pages have to name the same canonical URL as og:url or they contradict
      each other about what was shared.
    -->
    <link rel="canonical" href="./" />
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

  // Read before writing anything: this throws when the tags have gone missing, and it should
  // do so with the previous site still on disk rather than half-way through replacing it.
  const tags = linkPreviewTags()

  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })

  for (const tree of TREES) {
    const target = join(out, tree)
    mkdirSync(join(target, '..'), { recursive: true })
    cpSync(join(repoRoot, tree), target, { recursive: true, filter: keep })
    console.log(`  ${tree}`)
  }

  writeFileSync(join(out, 'index.html'), redirect(tags))
  console.log(`  index.html  →  ./web/`)
  console.log(`\nSite written to ${relative(repoRoot, out)}/`)
  return 0
}
