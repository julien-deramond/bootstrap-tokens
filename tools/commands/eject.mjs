/**
 * `bstokens eject` — write the token document back into Bootstrap's own Sass sources.
 *
 * The output is a v6-dev working tree with the maintainer's values in it, ready to compile
 * and ready to review as a normal diff.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { loadTree } from '../lib/load-fs.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { clone, withOverrides } from '../lib/overrides.mjs'
import { planEject } from '../lib/eject.mjs'
import { emitUseWith } from '../lib/emit-scss.mjs'
import { resolveBootstrapSource, tokensDir, buildDir } from '../lib/config.mjs'
import { sourceVersion } from './build.mjs'

function readTheme(path) {
  if (!path) return {}
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed.overrides !== 'object') {
    throw new Error(`${path} is not a theme file — expected an "overrides" object.`)
  }
  return parsed.overrides
}

export async function eject({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const overrides = readTheme(flags.theme)

  const { tree } = loadTree(tokensDir)
  const base = index(expandColorScales(clone(tree)))
  const doc = withOverrides(tree, overrides)

  const { patched, changes, skipped } = planEject(source, doc, overrides)

  for (const { path, reason } of skipped) console.warn(`  skipped  ${path} — ${reason}`)

  if (changes.length === 0) {
    console.log('No source changes: the token document matches the checkout.')
    return skipped.length > 0 ? 1 : 0
  }

  console.log(`${changes.length} value(s) across ${patched.size} file(s):\n`)
  for (const change of changes) {
    console.log(`  ${change.file}`)
    console.log(`    ${change.key}: ${change.inserted ? '(new)' : change.from}`)
    console.log(`    ${' '.repeat(String(change.key).length)}  → ${change.to}`)
  }

  if (flags.verify) return verifyPatched(source, patched, doc, overrides)

  const target = flags['in-place'] ? source : (flags.out ?? join(buildDir, 'v6-dev'))
  for (const [file, text] of patched) {
    const path = join(target, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }

  console.log(`\nWrote ${patched.size} file(s) to ${target}`)
  if (!flags['in-place']) {
    console.log(`Copy them over your checkout:\n  cp -R ${target}/scss/ <your-bootstrap>/scss/`)
  }
  return 0
}

/**
 * Compile the patched checkout and compare it against the same theme applied the consumer
 * way. Both routes must land on the same stylesheet — otherwise the sources a maintainer
 * ships and the CSS the chooser previewed have drifted apart.
 */
async function verifyPatched(source, patched, doc, overrides) {
  const sass = await import('sass')

  const work = mkdtempSync(join(tmpdir(), 'bstokens-eject-'))
  const checkout = join(work, 'bootstrap')
  cpSync(join(source, 'scss'), join(checkout, 'scss'), { recursive: true })

  for (const [file, text] of patched) {
    const path = join(checkout, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text)
  }

  console.log('\nCompiling the patched sources…')
  const ejected = sass.compile(join(checkout, 'scss', 'bootstrap.scss'), { loadPaths: [checkout], style: 'expanded' }).css

  console.log('Compiling the same theme as a consumer override…')
  const reference = join(work, 'reference.scss')
  writeFileSync(
    reference,
    emitUseWith(doc, {
      version: sourceVersion(),
      importPath: join(source, 'scss', 'bootstrap'),
      only: null
    })
  )
  const consumer = sass.compile(reference, { loadPaths: [source], style: 'expanded' }).css

  if (ejected === consumer) {
    console.log(`\n✓ The patched sources compile to the same CSS as the consumer export (${ejected.split('\n').length} lines).`)
    return 0
  }

  const a = ejected.split('\n')
  const b = consumer.split('\n')
  let shown = 0
  console.error('\n✗ The two routes produce different CSS:')
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 20; i++) {
    if (a[i] === b[i]) continue
    console.error(`  line ${i + 1}`)
    console.error(`    ejected:  ${(a[i] ?? '<eof>').trim()}`)
    console.error(`    consumer: ${(b[i] ?? '<eof>').trim()}`)
    shown++
  }
  writeFileSync(join(work, 'ejected.css'), ejected)
  writeFileSync(join(work, 'consumer.css'), consumer)
  console.error(`\n  ${join(work, 'ejected.css')}\n  ${join(work, 'consumer.css')}`)
  return 1
}
