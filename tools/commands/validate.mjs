import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { validate as run } from '../lib/validate.mjs'
import { buildOutputs } from './build.mjs'
import { tokensDir, repoRoot } from '../lib/config.mjs'

/** What `sync` saw Bootstrap declare, or null when the document predates that record. */
function declaredProperties() {
  try {
    const meta = JSON.parse(readFileSync(join(tokensDir, 'meta.json'), 'utf8'))
    return meta.declaredCustomProperties ? new Set(meta.declaredCustomProperties) : null
  } catch {
    return null
  }
}

/**
 * Which committed build products no longer match what the exporters would emit.
 *
 * `build/` travels with the source, and CI fails the push when it is stale — a round trip of
 * minutes for a mistake that is knowable the moment the token document changes. This asks
 * the same question locally, by generating the outputs in memory and comparing them with
 * what is on disk. It is the slow part of `validate`, which is why it is behind a flag.
 */
async function staleOutputs(importPath) {
  const { outputs } = await buildOutputs({ importPath })

  const stale = []
  for (const [relative, content] of Object.entries(outputs)) {
    let current
    try {
      current = readFileSync(join(repoRoot, relative), 'utf8')
    } catch {
      stale.push([relative, 'missing'])
      continue
    }
    if (current !== content) stale.push([relative, 'out of date'])
  }

  return stale
}

export async function validate({ flags }) {
  const doc = loadTokens(tokensDir)
  const { errors, warnings, findings } = run(doc, {
    strict: Boolean(flags.strict),
    declared: declaredProperties()
  })

  for (const finding of findings) console.warn(`  upstream ${finding}`)
  for (const warning of warnings) console.warn(`  warning  ${warning}`)
  for (const error of errors) console.error(`  error    ${error}`)

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s) in ${doc.tokens.size} tokens.`)
    return 1
  }

  const notes = [
    warnings.length ? `${warnings.length} warning(s)` : null,
    findings.length ? `${findings.length} upstream finding(s)` : null
  ].filter(Boolean)

  console.log(`✓ ${doc.tokens.size} tokens valid${notes.length ? ` (${notes.join(', ')})` : ''}.`)

  if (flags.check) {
    const stale = await staleOutputs(typeof flags.import === 'string' ? flags.import : undefined)
    for (const [relative, why] of stale) console.error(`  stale    ${relative} (${why})`)

    if (stale.length > 0) {
      // The wording CI uses, so the fix reads the same wherever you meet the failure.
      console.error(
        `\n✗ ${stale.length} generated file(s) out of date. ` +
          'Run `npm run build` and commit the result.'
      )
      return 1
    }

    console.log('✓ build/ and docs/token-inventory.md match the token document.')
  }

  return 0
}
