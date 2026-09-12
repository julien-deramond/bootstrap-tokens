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
import { join, relative } from 'node:path'

import { repoRoot, resolveBootstrapSource } from '../lib/config.mjs'

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
  // Not the exact count: it moves whenever upstream adds a token, and it is already
  // pinned in tokens/meta.json and docs/token-inventory.md, which CI fails on if stale.
  assert.match(out, /\d+ tokens valid/)
  assert.match(out, /upstream finding/)
})

test('validate --check sees the committed build output as current', async () => {
  const { code, out } = await run('validate', { check: true })
  assert.equal(code, 0)
  assert.match(out, /build\/ and docs\/token-inventory\.md match/)
})

test('validate --check names what is stale, in CI\'s words', async () => {
  // A different --import changes one generated file and nothing else, which is a stale
  // build/ without having to write over the repository's own to produce one.
  const { code, out } = await run('validate', { check: true, import: 'somewhere/else' })
  assert.equal(code, 1)
  assert.match(out, /stale\s+build\/scss\/bootstrap-custom\.scss/)
  // The same sentence the CI step prints, so the fix reads identically either way.
  assert.match(out, /Run `npm run build` and commit the result\./)
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

test('site carries the link preview to the root, and leaves the dev scripts behind', async () => {
  const out = join(work, 'site')
  const { code } = await run('site', { out: relative(repoRoot, out) })
  assert.equal(code, 0)

  // The root is a redirect, and it is the URL people share. Scrapers do not follow a meta
  // refresh, so tags that reached only /web/ would never be seen.
  const root = readFileSync(join(out, 'index.html'), 'utf8')
  assert.match(root, /property="og:image" content="https:\/\//, 'og:image must be absolute')
  assert.match(root, /property="og:title"/)
  assert.match(root, /name="twitter:card" content="summary_large_image"/)

  // And the image those tags point at has to actually ship.
  assert.ok(existsSync(join(out, 'web', 'og-image.png')), 'og:image must be deployed')

  for (const script of ['dev-server.mjs', 'og-capture.mjs']) {
    assert.ok(!existsSync(join(out, 'web', script)), `${script} has no business on a static host`)
  }
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
