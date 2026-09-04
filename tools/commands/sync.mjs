import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { extract } from '../lib/extract.mjs'
import { writeTokenFiles } from '../lib/write-tokens.mjs'
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

  if (changed.length === 0) {
    console.log('tokens/ is in sync with upstream.')
    return 0
  }

  for (const { file, status } of changed) console.log(`  ${status.padEnd(7)} ${file}`)

  if (check) {
    console.error(`\n${changed.length} file(s) drifted from upstream. Run \`bstokens sync\` to update.`)
    return 1
  }

  console.log(`\nWrote ${changed.length} file(s).`)
  return warnings.length > 0 ? 0 : 0
}
