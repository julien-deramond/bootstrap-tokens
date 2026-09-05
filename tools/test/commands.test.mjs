/**
 * Every command, actually run.
 *
 * The libraries are well covered and the commands were not, which let a missing import sit
 * in `eject` until someone passed `--theme` by hand: `loadMigrations is not defined`, thrown
 * at the first line that used it. Nothing in the suite had ever reached that line.
 *
 * These are smoke tests on purpose. They assert an exit code and one fact about the output,
 * because the point is that the command runs at all — the interesting behaviour is tested
 * where it lives.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveBootstrapSource } from '../lib/config.mjs'

const work = mkdtempSync(join(tmpdir(), 'bstokens-commands-'))

const THEME = join(work, 'theme.json')
writeFileSync(
  THEME,
  JSON.stringify({
    name: 'Smoke',
    overrides: {
      'radius.base': { value: '.25rem' },
      'theme-color.primary.bg': { value: '{color.green.500}' }
    }
  })
)

/** Run a command with its console output captured, and return `{ code, out }`. */
async function run(name, flags = {}, positional = []) {
  const command = (await import(`../commands/${name}.mjs`))[name === 'import' ? 'importCommand' : name]
  const lines = []
  const { log, warn, error } = console
  const capture = (...parts) => lines.push(parts.join(' '))
  Object.assign(console, { log: capture, warn: capture, error: capture })

  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk) => (lines.push(String(chunk)), true)

  try {
    return { code: await command({ flags, positional }), out: lines.join('\n') }
  } finally {
    Object.assign(console, { log, warn, error })
    process.stdout.write = write
  }
}

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout */
}

test('validate runs and reports the upstream findings', async () => {
  const { code, out } = await run('validate')
  assert.equal(code, 0)
  assert.match(out, /1203 tokens valid/)
  assert.match(out, /upstream finding/)
})

test('report runs, in each format', async () => {
  for (const [format, pattern] of [
    ['md', /# Contrast report — Smoke/],
    ['html', /<title>Contrast report/],
    ['json', /"summary"/]
  ]) {
    const out = join(work, `report.${format}`)
    const result = await run('report', { theme: THEME, format, out })
    assert.equal(result.code, 0, format)
    assert.match(readFileSync(out, 'utf8'), pattern)
  }
})

test('report gates on what the theme introduced', async () => {
  const bad = join(work, 'bad.json')
  writeFileSync(
    bad,
    JSON.stringify({ overrides: { 'theme-color.primary.contrast': { value: '{color.yellow.300}' } } })
  )

  const { code } = await run('report', { theme: bad, out: join(work, 'bad.md'), 'fail-on': 'introduced' })
  assert.equal(code, 1)
})

test('probe writes a self-contained page', async () => {
  const out = join(work, 'probe.html')
  const { code } = await run('probe', { out })
  assert.equal(code, 0)

  const page = readFileSync(out, 'utf8')
  assert.match(page, /<title>Flattened colours vs\. this browser<\/title>/)
  // Self-contained: it has to open from disk with no server and no imports.
  assert.doesNotMatch(page, /\bimport\s+.*\bfrom\s+['"]/)
  assert.match(page, /export function parseComputedColor/)
})

test('every command that takes a theme rejects one naming a token that is gone', async () => {
  const stale = join(work, 'stale.json')
  writeFileSync(stale, JSON.stringify({ overrides: { 'spacing.bass': { value: '1rem' } } }))

  for (const [name, flags, positional] of [
    ['report', { theme: stale, out: join(work, 'stale.md') }, []],
    ['init', { theme: stale }, [join(work, 'stale-project')]],
    ...(source ? [['eject', { theme: stale, src: source, out: join(work, 'stale-eject') }, []]] : [])
  ]) {
    const { code, out } = await run(name, flags, positional)
    assert.equal(code, 1, `${name} should refuse`)
    assert.match(out, /spacing\.bass/, `${name} should name it`)
  }

  assert.ok(!existsSync(join(work, 'stale-project')), 'init must not write a half-theme project')
})

test('eject runs against a checkout and names its edits', { skip: !source }, async () => {
  const out = join(work, 'ejected')
  const { code, out: log } = await run('eject', { theme: THEME, src: source, out })
  assert.equal(code, 0)
  assert.match(log, /\$radius/)
  assert.ok(existsSync(join(out, 'scss', '_config.scss')))
})
