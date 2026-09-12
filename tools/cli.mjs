#!/usr/bin/env node
import { parseArgs } from './lib/config.mjs'

const COMMANDS = {
  sync: () => import('./commands/sync.mjs').then((m) => m.sync),
  build: () => import('./commands/build.mjs').then((m) => m.build),
  validate: () => import('./commands/validate.mjs').then((m) => m.validate),
  verify: () => import('./commands/verify.mjs').then((m) => m.verify),
  probe: () => import('./commands/probe.mjs').then((m) => m.probe),
  report: () => import('./commands/report.mjs').then((m) => m.report),
  vendor: () => import('./commands/vendor.mjs').then((m) => m.vendor),
  site: () => import('./commands/site.mjs').then((m) => m.site),
  eject: () => import('./commands/eject.mjs').then((m) => m.eject),
  init: () => import('./commands/init.mjs').then((m) => m.init),
  import: () => import('./commands/import.mjs').then((m) => m.importCommand)
}

const USAGE = `bstokens <command> [options]

  sync       Re-extract tokens from a Bootstrap v6-dev checkout into tokens/
             --src <path>   the checkout (else $BOOTSTRAP_SRC, else a sibling ../bootstrap)
             --check        report drift without writing, exit 1 if any

  validate   Check the token document: references, cycles, layering, DTCG shape
             --strict       also fail on component tokens that skip the semantic layer
             --check        also fail when the committed build/ and docs/token-inventory.md
                            no longer match the document, as CI does

  build      Emit Sass, CSS and resolved JSON into build/
             --import <p>   import path used in the generated @use (default bootstrap/scss/bootstrap)

  verify     Compile upstream Bootstrap and our export, and diff the CSS
             --src <path>   the checkout to compile against
             --theme <f>    also check that this theme.json compiles to the values the
                            chooser previewed (default: a built-in fixture)

  probe      Write a page that checks the flattened colours against a real browser
             --out <f>      where to write it (default build/probe.html)

  report     Audit a theme — contrast by WCAG 2 and APCA, plus colour vision
             --theme <f>    a theme.json (default: Bootstrap's own values)
             --out <f>      where to write it (default: stdout)
             --format <f>   md, html or json (default: from --out, else md)
             --fail-on <g>  exit 1 on: regression, introduced, vision, any
                            (default never)

  vendor     Compile upstream Bootstrap into web/vendor/bootstrap.css for the chooser
             --src <path>   the checkout to compile

  site       Assemble the Theme Builder into a static site, ready to deploy
             --out <dir>    where to write it (default build/site)

  eject      Write the tokens back into Bootstrap's own Sass sources, for maintainers
             --theme <f>    a theme.json exported from the chooser
             --src <path>   the v6-dev checkout to patch
             --out <dir>    where to write (default build/v6-dev)
             --in-place     patch the checkout directly
             --verify       compile the patched sources and diff against the consumer route

  import     Read an existing custom.scss back into a theme.json
             <file>         the stylesheet to read
             --out <f>      where to write it (default theme.json)

  init       Scaffold a project that compiles a theme, so the only step left is npm install
             <dir>          where to write it (default ./bootstrap-theme)
             --theme <f>    a theme.json exported from the chooser
             --name <n>     the project name
             --force        write into a non-empty directory
             --bootstrap    the dependency spec (default: the v6-dev branch, since v6 is
                            not yet on npm)

Every command that takes --theme applies recorded renames first, then refuses to run if the
theme still names a token that does not exist — silently dropping an override is how a theme
loses values nobody notices. Pass --skip-unknown to proceed without them.
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
