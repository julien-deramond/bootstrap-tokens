/**
 * The acceptance test for the whole project.
 *
 * Compile upstream `bootstrap.scss` as-is, then compile it again with every token map
 * replaced by what the token document exports. If the token document is a faithful
 * representation, the two stylesheets are identical.
 */

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { emitUseWith } from '../lib/emit-scss.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { sourceVersion } from './build.mjs'

async function compile(entry, loadPaths) {
  const sass = await import('sass')
  const result = sass.compile(entry, { loadPaths, style: 'expanded', sourceMap: false })
  return result.css
}

/** Split a stylesheet into declaration-level lines for a readable diff. */
const lines = (css) => css.split('\n')

function firstDifferences(a, b, limit = 25) {
  const out = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max && out.length < limit; i++) {
    if (a[i] !== b[i]) out.push({ line: i + 1, upstream: a[i] ?? '<eof>', ours: b[i] ?? '<eof>' })
  }
  return out
}

export async function verify({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const doc = loadTokens(tokensDir)
  const version = sourceVersion()

  const work = mkdtempSync(join(tmpdir(), 'bstokens-'))
  const entry = join(work, 'custom.scss')
  writeFileSync(entry, emitUseWith(doc, { version, importPath: join(source, 'scss', 'bootstrap') }))

  console.log(`Compiling upstream (${source})…`)
  const upstream = await compile(join(source, 'scss', 'bootstrap.scss'), [source])

  console.log('Compiling the exported token configuration…')
  const ours = await compile(entry, [source])

  if (upstream === ours) {
    console.log(`\n✓ Identical output — ${lines(upstream).length} lines of CSS.`)
    return 0
  }

  const differences = firstDifferences(lines(upstream), lines(ours))
  const upstreamPath = join(work, 'upstream.css')
  const oursPath = join(work, 'ours.css')
  writeFileSync(upstreamPath, upstream)
  writeFileSync(oursPath, ours)

  console.error(`\n✗ Output differs (${differences.length}+ differing lines).`)
  for (const { line, upstream: a, ours: b } of differences) {
    console.error(`  line ${line}`)
    console.error(`    upstream: ${a.trim()}`)
    console.error(`    ours:     ${b.trim()}`)
  }
  console.error(`\n  ${upstreamPath}\n  ${oursPath}\n  diff them with: diff ${upstreamPath} ${oursPath}`)
  return 1
}
