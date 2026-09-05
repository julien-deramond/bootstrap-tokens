import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { tokensDir } from '../lib/config.mjs'
import { readThemeFile, reportTheme } from '../lib/theme-file.mjs'

const doc = loadTokens(tokensDir)

function themeFile(contents) {
  const path = join(mkdtempSync(join(tmpdir(), 'bstokens-theme-')), 'theme.json')
  writeFileSync(path, JSON.stringify(contents))
  return path
}

/** Run `reportTheme` without printing, and say whether it wanted to stop. */
function quietly(theme, options) {
  const { log, warn, error } = console
  console.log = console.warn = console.error = () => {}
  try {
    return reportTheme(theme, options)
  } finally {
    Object.assign(console, { log, warn, error })
  }
}

test('a theme that names a token that does not exist is not silently thinned', () => {
  /*
   * `withOverrides` ignores a path the document does not have, so this used to cost you the
   * value with no sign at all: `init` scaffolded a project missing it, and `verify` — the
   * command whose whole job is to say what you will get — reported success on what was left.
   */
  const theme = readThemeFile(
    themeFile({
      name: 'Stale',
      overrides: {
        'theme-color.primary.bg': { value: '{color.green.500}' },
        'colour.blue.base': { value: 'oklch(50% 0.2 120)' },
        'spacing.bass': { value: '1.5rem' }
      }
    }),
    { doc }
  )

  assert.deepEqual(Object.keys(theme.overrides), ['theme-color.primary.bg'])
  assert.deepEqual(
    theme.dropped.map((entry) => entry.path).sort(),
    ['colour.blue.base', 'spacing.bass']
  )
  assert.equal(quietly(theme), true, 'the caller should stop')
  assert.equal(quietly(theme, { skipUnknown: true }), false, 'unless told to carry on')
})

test('a rename is applied rather than reported', () => {
  const migrations = [{ from: 'colour.blue.base', to: 'color.blue.base' }]
  const theme = readThemeFile(
    themeFile({ overrides: { 'colour.blue.base': { value: 'oklch(50% 0.2 120)' } } }),
    { doc, migrations }
  )

  assert.deepEqual(theme.overrides, { 'color.blue.base': { value: 'oklch(50% 0.2 120)' } })
  assert.deepEqual(theme.renamed, [{ from: 'colour.blue.base', to: 'color.blue.base' }])
  assert.deepEqual(theme.dropped, [])
  assert.equal(quietly(theme), false)
})

test('a token upstream removed is named, not resurrected', () => {
  const migrations = [{ from: 'gone.token', to: null }]
  const theme = readThemeFile(themeFile({ overrides: { 'gone.token': { value: '1px' } } }), {
    doc,
    migrations
  })

  assert.deepEqual(theme.dropped, [{ path: 'gone.token', reason: 'removed upstream' }])
})

test('a good theme passes through unchanged, name and options included', () => {
  const theme = readThemeFile(
    themeFile({
      name: 'Editorial',
      overrides: { 'radius.5': { value: '.25rem' } },
      options: { '$enable-shadows': { value: 'false' } }
    }),
    { doc }
  )

  assert.equal(theme.name, 'Editorial')
  assert.deepEqual(theme.overrides, { 'radius.5': { value: '.25rem' } })
  assert.deepEqual(theme.options, { '$enable-shadows': { value: 'false' } })
  assert.equal(quietly(theme), false)
})

test('no theme at all is a theme of nothing, not an error', () => {
  const theme = readThemeFile(undefined, { doc })
  assert.deepEqual(theme.overrides, {})
  assert.equal(quietly(theme), false)
})

test('a file that is not a theme says so', () => {
  assert.throws(() => readThemeFile(themeFile({ tokens: {} }), { doc }), /not a theme file/)
  assert.throws(() => readThemeFile('/nowhere/theme.json', { doc }), /Could not read/)
})
