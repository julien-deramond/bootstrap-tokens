import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { extract } from '../lib/extract.mjs'
import { writeTokenFiles } from '../lib/write-tokens.mjs'
import { discover } from '../lib/discover.mjs'
import { loadTokens, loadOptions } from '../lib/load-fs.mjs'
import { detectRenames, migrationFingerprint } from '../lib/migrations.mjs'
import { ext, walk } from '../lib/tokens.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { declaredCustomProperties } from '../lib/declared.mjs'

/** The upstream commit the token document was extracted from, when git can tell us. */
function upstreamCommit(source) {
  try {
    return execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export async function sync({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const check = Boolean(flags.check)

  const { files, warnings, version, records } = extract(source)

  files['meta.json'] = {
    bootstrap: version,
    branch: 'v6-dev',
    commit: upstreamCommit(source),
    extractedAt: new Date().toISOString().slice(0, 10),
    tokens: records.length,
    // Everything Bootstrap declares, token maps and runtime helpers alike. Recorded here
    // because it is the only way `validate` can tell a deliberate opt-in hook — a `var()`
    // a theme class fills in — from a reference to a property that simply does not exist.
    declaredCustomProperties: await declaredCustomProperties(source)
  }

  console.log(`Bootstrap ${version} at ${source}`)
  console.log(`Extracted ${records.length} tokens into ${Object.keys(files).length} files.`)

  for (const warning of warnings) console.warn(`  warning: ${warning}`)

  // Before writing, ask what moved. A path that vanished while a similar one appeared is
  // the shape of a rename, and a rename that goes unrecorded silently empties saved themes.
  const moved = reportMovedTokens(files)

  const changed = writeTokenFiles(tokensDir, files, { dryRun: check })

  // Coverage is checked against the document we just wrote, so a surface upstream offers
  // can never go missing without someone deciding, in writing, to ignore it.
  const coverage = reportCoverage(source, check ? null : tokensDir)

  for (const { file, status } of changed) console.log(`  ${status.padEnd(7)} ${file}`)

  if (changed.length === 0) console.log('tokens/ is in sync with upstream.')
  else if (!check) console.log(`\nWrote ${changed.length} file(s).`)

  if (check && changed.length > 0) {
    console.error(`\n${changed.length} file(s) drifted from upstream. Run \`bstokens sync\` to update.`)
    return 1
  }

  return coverage ? 1 : 0
}

/**
 * Compare the freshly extracted document against the committed one and name what moved.
 *
 * `sync` proposes; a person decides. Only a human can tell a rename from a coincidence, so
 * this prints candidates for `tokens/migrations.json` rather than writing them.
 */
function reportMovedTokens(files) {
  let committed
  try {
    committed = loadTokens(tokensDir)
  } catch {
    return false
  }

  // Rebuild the extracted tree the way the loader would see it.
  const tree = {}
  for (const [name, content] of Object.entries(files)) {
    if (name === 'meta.json' || name.startsWith('config/')) continue
    Object.assign(tree, mergeShallow(tree, content))
  }
  const extracted = index(expandColorScales(JSON.parse(JSON.stringify(tree))))

  const { candidates, unmatched } = detectRenames(
    migrationFingerprint(walk(committed.tree), ext),
    migrationFingerprint(walk(extracted.tree), ext)
  )

  if (candidates.length === 0 && unmatched.length === 0) return false

  console.log('')
  for (const { from, to, because } of candidates) {
    console.log(`  moved?   ${from}  ->  ${to}   (${because})`)
  }
  for (const path of unmatched) {
    console.log(`  gone     ${path}   (no obvious replacement)`)
  }
  console.log(
    '\n  Record real renames in tokens/migrations.json so themes saved against the old\n' +
      '  names keep working. A rename left unrecorded empties those values silently.'
  )

  return true
}

/** Merge extracted file trees into one, without the duplicate checking the loader does. */
function mergeShallow(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && value.$value === undefined && target[key]) {
      mergeShallow(target[key], value)
    } else {
      target[key] = value
    }
  }
  return target
}

/**
 * Hold the checkout against the token document and report anything unaccounted for.
 * Returns true when coverage is incomplete.
 */
function reportCoverage(source, dir) {
  let doc
  try {
    doc = loadTokens(dir ?? tokensDir)
  } catch {
    return false
  }

  const { tokenMaps, tokenMapsModelled, unaccounted, stale, flags } = discover(
    source,
    doc,
    loadOptions(dir ?? tokensDir)
  )

  console.log(
    `\nCoverage: ${tokenMapsModelled}/${tokenMaps} component token maps, ${flags.length} $enable-* flags, ` +
      `${unaccounted.length} unaccounted.`
  )

  for (const { name } of stale.map((name) => ({ name }))) {
    console.error(`  error   we model ${name}, which upstream no longer declares`)
  }

  for (const { name, file } of unaccounted) {
    console.error(`  error   ${name} (${file}) is configurable upstream but neither modelled nor listed in NOT_TOKENS`)
  }

  if (unaccounted.length === 0 && stale.length === 0) return false

  console.error(
    '\nEvery !default variable upstream declares must be modelled, or listed in\n' +
      'tools/lib/discover.mjs NOT_TOKENS with a reason. There is no third option.'
  )
  return true
}
