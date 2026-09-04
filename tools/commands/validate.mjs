import { loadTokens } from '../lib/load-fs.mjs'
import { validate as run } from '../lib/validate.mjs'
import { tokensDir } from '../lib/config.mjs'

export async function validate({ flags }) {
  const doc = loadTokens(tokensDir)
  const { errors, warnings } = run(doc, { strict: Boolean(flags.strict) })

  for (const warning of warnings) console.warn(`  warning  ${warning}`)
  for (const error of errors) console.error(`  error    ${error}`)

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s) in ${doc.tokens.size} tokens.`)
    return 1
  }

  console.log(`✓ ${doc.tokens.size} tokens valid${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`)
  return 0
}
