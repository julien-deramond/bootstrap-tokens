/**
 * `bstokens import` — read an existing `custom.scss` into a theme.
 *
 * So that someone who already has a Bootstrap theme can open it here and carry on, rather
 * than being told to start again.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { loadTree, loadMigrations } from '../lib/load-fs.mjs'
import { withOverrides } from '../lib/overrides.mjs'
import { importScss } from '../lib/import-scss.mjs'
import { applyMigrations } from '../lib/migrations.mjs'
import { tokensDir } from '../lib/config.mjs'
import { sourceVersion } from './build.mjs'

export async function importCommand({ flags, positional }) {
  const path = positional[0] ?? flags.file
  if (!path) throw new Error('Which file? Usage: bstokens import <custom.scss> [--out theme.json]')

  const { tree } = loadTree(tokensDir)
  const base = withOverrides(tree, {})

  const read = importScss(readFileSync(path, 'utf8'), base)
  const { overrides, renamed, dropped } = applyMigrations(read.overrides, loadMigrations(tokensDir), base)
  const { options, unmapped } = read

  for (const { from, to } of renamed) console.log(`  renamed   ${from} -> ${to}`)
  for (const { path: gone, reason } of dropped) console.warn(`  dropped   ${gone} - ${reason}`)

  const edits = Object.keys(overrides).length
  const opts = Object.keys(options).length

  console.log(`${path}`)
  console.log(`  ${edits} token override${edits === 1 ? '' : 's'}, ${opts} build option${opts === 1 ? '' : 's'}`)

  for (const [tokenPath, override] of Object.entries(overrides)) {
    console.log(`    ${tokenPath.padEnd(34)} ${override.value}${override.dark ? `  /  dark: ${override.dark}` : ''}`)
  }
  for (const [name, option] of Object.entries(options)) {
    console.log(`    ${name.padEnd(34)} ${option.value}`)
  }

  // Anything unplaceable is named rather than dropped: a half-read theme that looks complete
  // is worse than one that says what it missed.
  for (const { name, reason } of unmapped) {
    console.warn(`  unmapped  ${name} — ${reason}`)
  }

  const out = flags.out ?? 'theme.json'
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        format: 'bootstrap-tokens-theme@1',
        bootstrap: sourceVersion(),
        importedFrom: path,
        overrides,
        options
      },
      null,
      2
    )}\n`
  )

  console.log(`\nWrote ${out}. Load it in the chooser, or pass it to \`bstokens init\`.`)
  return unmapped.length > 0 ? 1 : 0
}
