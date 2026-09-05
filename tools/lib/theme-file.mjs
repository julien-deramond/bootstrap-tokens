/**
 * Reading a theme file, once, for every command that takes one.
 *
 * Each command used to parse `theme.json` itself and take `parsed.overrides` at face value.
 * `withOverrides` ignores a path the document does not have, so a theme naming a token that
 * has been renamed — or misspelled — lost those values in silence. `init` scaffolded a
 * project missing them, `report` audited a theme nobody wrote, and `verify` announced that
 * "all 1 previewed property matches" for a three-token theme. The last is the worst: that
 * command exists to say "this is what you will get".
 *
 * Bootstrap 6 is an alpha and token names move, so this is not hypothetical. Migrations are
 * applied first, and whatever is still unplaceable is named rather than dropped.
 */

import { readFileSync } from 'node:fs'

import { applyMigrations } from './migrations.mjs'

/**
 * Read and migrate a theme file.
 *
 * Returns `{ name, overrides, options, renamed, dropped }`. `dropped` is the point: each
 * entry says which path could not be placed and why.
 */
export function readThemeFile(path, { doc, migrations = [] } = {}) {
  if (!path) return { name: 'Bootstrap defaults', overrides: {}, options: {}, renamed: [], dropped: [] }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read ${path}: ${error.message}`)
  }

  if (!parsed || typeof parsed.overrides !== 'object' || parsed.overrides === null) {
    throw new Error(`${path} is not a theme file — expected an "overrides" object.`)
  }

  const { overrides, renamed, dropped } = applyMigrations(parsed.overrides, migrations, doc)

  return {
    name: parsed.name ?? path,
    overrides,
    options: parsed.options ?? {},
    renamed,
    dropped
  }
}

/**
 * Print what moved and what could not be placed. Returns true when the caller should stop.
 *
 * Stopping is the default because the alternative is producing an artefact that quietly
 * differs from what was asked for, and the person who finds out is whoever ships it.
 */
export function reportTheme(theme, { skipUnknown = false, label = 'theme' } = {}) {
  for (const { from, to } of theme.renamed) {
    console.log(`  migrated  ${from} → ${to}`)
  }

  if (theme.dropped.length === 0) return false

  for (const { path, reason } of theme.dropped) {
    console.error(`  unknown   ${path} — ${reason}`)
  }

  if (skipUnknown) {
    console.warn(`\n  ${theme.dropped.length} override(s) skipped.`)
    return false
  }

  console.error(
    `\n✗ ${theme.dropped.length} of ${theme.dropped.length + Object.keys(theme.overrides).length} ` +
      `override(s) in this ${label} name tokens that do not exist.\n` +
      '  Rerun with --skip-unknown to proceed without them, or fix the paths — ' +
      '`bstokens validate` lists every token there is.'
  )
  return true
}
