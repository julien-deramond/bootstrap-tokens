/**
 * Keeping saved themes working when upstream renames a token.
 *
 * Bootstrap 6 is an alpha and its names will move. Without a record of what became what, a
 * theme saved today comes back tomorrow quietly missing those values — the worst failure a
 * theme file can have, because nothing tells you to look.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { resolvePath, applyMigrations, detectRenames, migrationFingerprint } from '../lib/migrations.mjs'
import { loadMigrations, loadTokens } from '../lib/load-fs.mjs'
import { ext, walk } from '../lib/tokens.mjs'
import { tokensDir } from '../lib/config.mjs'

const doc = loadTokens(tokensDir)

test('a chain of renames resolves in one pass', () => {
  const migrations = [{ from: 'a.b', to: 'a.c' }, { from: 'a.c', to: 'a.d' }]
  assert.equal(resolvePath('a.b', migrations), 'a.d')
  assert.equal(resolvePath('a.d', migrations), 'a.d')
  assert.equal(resolvePath('untouched', migrations), 'untouched')
})

test('a token removed upstream resolves to nothing, not to itself', () => {
  assert.equal(resolvePath('x.y', [{ from: 'x.y', to: null }]), null)
})

test('a cycle terminates rather than hanging', () => {
  const migrations = [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }]
  assert.ok(['a', 'b'].includes(resolvePath('a', migrations)))
})

test('an override follows its token to the new name', () => {
  const overrides = { 'theme-color.primary.bg': { value: 'red' } }
  const migrations = [{ from: 'theme-color.primary.bg', to: 'theme-color.primary.base' }]

  const result = applyMigrations(overrides, migrations, doc)

  assert.deepEqual(Object.keys(result.overrides), ['theme-color.primary.base'])
  assert.deepEqual(result.renamed, [{ from: 'theme-color.primary.bg', to: 'theme-color.primary.base' }])
  assert.deepEqual(result.dropped, [])
})

test('an override with nowhere to go is reported, not silently kept', () => {
  const result = applyMigrations({ 'gone.away': { value: 'red' } }, [], doc)

  assert.deepEqual(result.overrides, {})
  assert.equal(result.dropped.length, 1)
  assert.match(result.dropped[0].reason, /no longer exists/)
})

test('an untouched theme passes through unchanged', () => {
  const overrides = { 'radius.base': { value: '1rem' }, 'spacing.base': { value: '1.25rem' } }
  const result = applyMigrations(overrides, loadMigrations(tokensDir), doc)

  assert.deepEqual(result.overrides, overrides)
  assert.deepEqual(result.renamed, [])
  assert.deepEqual(result.dropped, [])
})

test('a rename is proposed when the custom property survives the move', () => {
  const before = new Map([['old.path', { cssVar: '--thing', sassMap: '$m', sassKey: 'k' }]])
  const after = new Map([['new.path', { cssVar: '--thing', sassMap: '$m', sassKey: 'k' }]])

  const { candidates, unmatched } = detectRenames(before, after)
  assert.deepEqual(candidates, [{ from: 'old.path', to: 'new.path', because: 'both emit --thing' }])
  assert.deepEqual(unmatched, [])
})

test('a rename is proposed when only the map slot survives', () => {
  const before = new Map([['old.path', { cssVar: null, sassMap: '$alert-tokens', sassKey: '--alert-bg' }]])
  const after = new Map([['new.path', { cssVar: null, sassMap: '$alert-tokens', sassKey: '--alert-bg' }]])

  const { candidates } = detectRenames(before, after)
  assert.equal(candidates.length, 1)
  assert.match(candidates[0].because, /\$alert-tokens/)
})

test('a token that simply vanished is reported as unmatched, not guessed at', () => {
  const before = new Map([['gone', { cssVar: '--gone', sassMap: null, sassKey: null }]])
  const { candidates, unmatched } = detectRenames(before, new Map())

  assert.deepEqual(candidates, [])
  assert.deepEqual(unmatched, ['gone'])
})

test('the committed document compared against itself proposes nothing', () => {
  const fingerprint = migrationFingerprint(walk(doc.tree), ext)
  const { candidates, unmatched } = detectRenames(fingerprint, fingerprint)

  assert.deepEqual(candidates, [])
  assert.deepEqual(unmatched, [])
})

test('the migrations file is a list of resolvable renames', () => {
  for (const migration of loadMigrations(tokensDir)) {
    assert.ok(migration.from, 'a migration needs a `from`')
    assert.ok(
      migration.to === null || doc.tokens.has(migration.to),
      `${migration.from} points at ${migration.to}, which is not a token`
    )
    assert.ok(!doc.tokens.has(migration.from), `${migration.from} still exists, so it was not renamed`)
  }
})
