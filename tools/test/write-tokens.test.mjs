/**
 * Writing the extracted document back to `tokens/`.
 *
 * Upstream deletes files as well as changing them — `_calendar.scss` was folded into
 * `_datepicker.scss` — and a component file left behind keeps serving tokens Bootstrap no
 * longer has.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeTokenFiles } from '../lib/write-tokens.mjs'

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'write-tokens-'))
  mkdirSync(join(dir, 'component'))
  writeFileSync(join(dir, 'component', 'calendar.json'), '{}\n')
  writeFileSync(join(dir, 'component', 'notes.txt'), 'not ours\n')
  writeFileSync(join(dir, 'migrations.json'), '{"migrations":[]}\n')
  return dir
}

const files = { 'meta.json': {}, 'component/datepicker.json': { datepicker: {} } }

test('a generated file upstream no longer produces is removed', (t) => {
  const dir = scratch()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const changed = writeTokenFiles(dir, files)

  assert.deepEqual(
    changed.map(({ file, status }) => `${status} ${file}`),
    ['added meta.json', 'added component/datepicker.json', 'removed component/calendar.json']
  )
  assert.ok(!existsSync(join(dir, 'component', 'calendar.json')))
  assert.ok(existsSync(join(dir, 'component', 'notes.txt')), 'only .json files are swept')
  assert.ok(existsSync(join(dir, 'migrations.json')), 'hand-written top-level files are kept')
})

test('a dry run reports the removal without touching the file', (t) => {
  const dir = scratch()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const changed = writeTokenFiles(dir, files, { dryRun: true })

  assert.ok(changed.some(({ file, status }) => file === 'component/calendar.json' && status === 'removed'))
  assert.ok(existsSync(join(dir, 'component', 'calendar.json')))
})
