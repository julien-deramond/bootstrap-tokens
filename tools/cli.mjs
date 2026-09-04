#!/usr/bin/env node
import { parseArgs } from './lib/config.mjs'

const COMMANDS = {
  sync: () => import('./commands/sync.mjs').then((m) => m.sync),
  build: () => import('./commands/build.mjs').then((m) => m.build),
  validate: () => import('./commands/validate.mjs').then((m) => m.validate),
  verify: () => import('./commands/verify.mjs').then((m) => m.verify)
}

const USAGE = `bstokens <command> [options]

  sync       Re-extract tokens from a Bootstrap v6-dev checkout into tokens/
             --src <path>   the checkout (else $BOOTSTRAP_SRC, else a sibling ../bootstrap)
             --check        report drift without writing, exit 1 if any

  validate   Check the token document: references, cycles, layering, DTCG shape
             --strict       also fail on component tokens that skip the semantic layer

  build      Emit Sass, CSS and resolved JSON into build/
             --import <p>   import path used in the generated @use (default bootstrap/scss/bootstrap)

  verify     Compile upstream Bootstrap and our export, and diff the CSS
             --src <path>   the checkout to compile against
`

const { flags, positional } = parseArgs(process.argv.slice(2))
const name = positional[0]

if (!name || flags.help) {
  console.log(USAGE)
  process.exit(name ? 0 : 1)
}

const loader = COMMANDS[name]
if (!loader) {
  console.error(`Unknown command: ${name}\n\n${USAGE}`)
  process.exit(1)
}

try {
  const command = await loader()
  process.exit((await command({ flags, positional: positional.slice(1) })) ?? 0)
} catch (error) {
  console.error(`\n${error.message}\n`)
  if (flags.trace) console.error(error.stack)
  process.exit(1)
}
