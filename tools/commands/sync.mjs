import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { extract } from '../lib/extract.mjs'
import { writeTokenFiles } from '../lib/write-tokens.mjs'
import { discover } from '../lib/discover.mjs'
import { loadTokens } from '../lib/load-fs.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'

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
    tokens: records.length
  }

  console.log(`Bootstrap ${version} at ${source}`)
  console.log(`Extracted ${records.length} tokens into ${Object.keys(files).length} files.`)

  for (const warning of warnings) console.warn(`  warning: ${warning}`)

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

  const { tokenMaps, tokenMapsModelled, unaccounted, stale, flags } = discover(source, doc)

  console.log(`\nCoverage: ${tokenMapsModelled}/${tokenMaps} component token maps, ${flags.length} $enable-* flags not modelled (PLAN.md A2).`)

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
