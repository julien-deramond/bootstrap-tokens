import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { validate as run } from '../lib/validate.mjs'
import { tokensDir } from '../lib/config.mjs'

/** What `sync` saw Bootstrap declare, or null when the document predates that record. */
function declaredProperties() {
  try {
    const meta = JSON.parse(readFileSync(join(tokensDir, 'meta.json'), 'utf8'))
    return meta.declaredCustomProperties ? new Set(meta.declaredCustomProperties) : null
  } catch {
    return null
  }
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
  return 0
}
