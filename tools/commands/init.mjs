/**
 * `bstokens init` — turn a theme into a project that compiles.
 *
 * The export dialog hands you a `custom.scss` and four numbered steps. That is fine, but the
 * steps are where people fall off: the wrong Bootstrap version, no Sass, the stylesheet
 * linked but never compiled. This writes the whole thing — the entry stylesheet, a
 * package.json with the right dependencies and scripts, and a page that uses it — so the
 * only remaining step is `npm install`.
 *
 * What to write is not decided here. `tools/lib/project.mjs` builds the file map, because
 * the Theme Builder's *Open in StackBlitz* button sends the same one to a sandbox, and the
 * two have to be the same project. This command is the part that touches the disk.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { loadTree, loadOptions, loadMigrations } from '../lib/load-fs.mjs'
import { withOverrides, changedKeysOf, mapsTouched, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { readThemeFile, reportTheme } from '../lib/theme-file.mjs'
import { tokensDir } from '../lib/config.mjs'
import { projectFiles, TEMPLATES, TEMPLATE_NOTES } from '../lib/project.mjs'
import { sourceVersion } from './build.mjs'

/** What to run once `npm install` has finished, per template. */
const NEXT_STEP = { sass: 'npm run watch', vite: 'npm start' }

export async function init({ flags, positional }) {
  const target = resolve(positional[0] ?? flags.out ?? 'bootstrap-theme')
  const name = flags.name ?? target.split(/[\\/\\\\]/).pop()
  const template = flags.template ?? 'sass'

  if (!TEMPLATES.includes(template)) {
    throw new Error(
      `Unknown template "${template}". Pick one of:\n` +
        TEMPLATES.map((one) => `  ${one.padEnd(6)} ${TEMPLATE_NOTES[one]}`).join('\n')
    )
  }

  if (existsSync(target) && readdirSync(target).length > 0 && !flags.force) {
    throw new Error(`${target} already exists and is not empty. Pass --force to write into it anyway.`)
  }

  const { tree } = loadTree(tokensDir)
  const theme = readThemeFile(flags.theme, {
    doc: index(expandColorScales(clone(tree))),
    migrations: loadMigrations(tokensDir)
  })
  if (reportTheme(theme, { skipUnknown: Boolean(flags['skip-unknown']) })) return 1
  const { overrides, options } = theme

  const doc = withOverrides(tree, overrides)

  const files = projectFiles({
    doc,
    overrides,
    options,
    baseOptions: loadOptions(tokensDir),
    name,
    version: sourceVersion(),
    template,
    bootstrap: flags.bootstrap
  })

  for (const [relative, content] of Object.entries(files)) {
    const path = join(target, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
    console.log(`  ${relative}`)
  }

  const touched = mapsTouched(doc, overrides).size
  const keys = [...changedKeysOf(doc, overrides).values()].reduce((sum, set) => sum + set.size, 0)

  console.log(
    `\nWrote a ${template} project to ${target}` +
      (flags.theme
        ? ` carrying ${keys} map key${keys === 1 ? '' : 's'} across ${touched} Sass map${touched === 1 ? '' : 's'}.`
        : '.')
  )
  console.log(`\n  cd ${target}\n  npm install\n  ${NEXT_STEP[template]}`)

  return 0
}
