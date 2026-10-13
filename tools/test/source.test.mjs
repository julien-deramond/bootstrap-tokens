/**
 * Which Bootstrap the tooling reads, and what `meta.json` says about it.
 *
 * The default is the release `package.json` pins, installed in `node_modules/bootstrap`. Two
 * ways that goes quietly wrong are pinned down here: a source you named falling through to
 * the release, and the release being recorded with this repository's own git commit, because
 * `node_modules/` sits inside this repository's checkout.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describeBootstrapSource, pinnedBootstrap, repoRoot, resolveBootstrapSource } from '../lib/config.mjs'
import { provenance } from '../commands/sync.mjs'

const installed = join(repoRoot, 'node_modules', 'bootstrap')

/** Run `fn` with `$BOOTSTRAP_SRC` set to `value`, or unset when `value` is undefined. */
function withEnv(value, fn) {
  const previous = process.env.BOOTSTRAP_SRC
  if (value === undefined) delete process.env.BOOTSTRAP_SRC
  else process.env.BOOTSTRAP_SRC = value
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.BOOTSTRAP_SRC
    else process.env.BOOTSTRAP_SRC = previous
  }
}

/** A minimal Bootstrap-shaped directory, optionally a git checkout of its own. */
function fakeSource({ version = '6.0.0-alpha.99', git = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bstokens-source-'))
  mkdirSync(join(dir, 'scss'))
  writeFileSync(join(dir, 'scss', '_root.scss'), '')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'bootstrap', version }))
  if (git) {
    const run = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
    run('init', '-q', '-b', 'main')
    run('add', '.')
    run('-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init')
  }
  return dir
}

test('package.json pins Bootstrap to one exact version', () => {
  assert.match(pinnedBootstrap(), /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/)
})

test('with nothing named, the source is the installed release', { skip: !existsSync(installed) }, () => {
  withEnv(undefined, () => assert.equal(resolveBootstrapSource(), installed))
})

test('a named source that is not there is an error, not a fall-through to the release', () => {
  withEnv(undefined, () => {
    assert.throws(() => resolveBootstrapSource('/nonexistent/bootstrap'), /from --src.*not a Bootstrap source/)
  })
  withEnv('/nonexistent/bootstrap', () => {
    assert.throws(() => resolveBootstrapSource(), /from \$BOOTSTRAP_SRC/)
  })
})

test('--src wins over $BOOTSTRAP_SRC', () => {
  const dir = fakeSource()
  withEnv('/nonexistent/bootstrap', () => assert.equal(resolveBootstrapSource(dir), dir))
})

test('the installed release is recorded as npm, not with this repository\'s commit', { skip: !existsSync(installed) }, () => {
  // node_modules/bootstrap is inside this checkout, so `git rev-parse HEAD` there answers
  // with bootstrap-tokens' own HEAD. That commit must never end up in meta.json.
  assert.deepEqual(provenance(installed), { source: 'npm', commit: null })
})

test('a git checkout is recorded with the branch and commit it is on', () => {
  const dir = fakeSource({ git: true })
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  assert.deepEqual(provenance(dir), { source: 'git', branch: 'main', commit: head })
})

test('a source other than the pinned release is named, with a warning', () => {
  const info = describeBootstrapSource(fakeSource({ version: '6.0.0-alpha.99' }))
  assert.equal(info.version, '6.0.0-alpha.99')
  assert.match(info.line, /^Bootstrap 6\.0\.0-alpha\.99 at /)
  assert.match(info.warning, /checked against/)

  const pinned = describeBootstrapSource(fakeSource({ version: pinnedBootstrap() }))
  assert.equal(pinned.warning, null)
})
