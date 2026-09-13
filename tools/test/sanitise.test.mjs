/**
 * The pasted-markup sanitiser (`web/sanitise.mjs`) parses with `DOMParser`, which `node --test`
 * does not have. Rather than add a DOM implementation as a dependency for one function, this
 * asks a real browser: it generates the same page `bstokens probe` writes for a maintainer to
 * open by hand, points headless Chrome at it, and reads back the verdict its sanitiser section
 * computes against a battery of hostile markup (see `tools/commands/probe.mjs`).
 *
 * That verdict used to exist only for a human who thought to open the page. This is the same
 * check, run on every `npm test`, so a regression fails the build instead of waiting to be
 * noticed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { probe } from '../commands/probe.mjs'
import { findChrome } from '../lib/chrome.mjs'

let chrome = null
try {
  chrome = findChrome()
} catch {
  /* no local Chrome — CI has one; see the skip reason below */
}

test('the pasted-markup sanitiser defeats known-hostile input in a real browser', { skip: !chrome && 'no local Chrome/Chromium found; set $CHROME to run this locally' }, async () => {
  const work = mkdtempSync(join(tmpdir(), 'bstokens-sanitise-'))
  const out = join(work, 'probe.html')
  assert.equal(await probe({ flags: { out } }), 0)

  const result = spawnSync(
    chrome,
    ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=8000', '--dump-dom', pathToFileURL(out).href],
    { encoding: 'utf8' }
  )
  assert.equal(result.status, 0, result.stderr)

  const dom = result.stdout
  const verdict = /<div id="sanitiser-verdict" class="verdict (pass|fail)">([^<]*)<\/div>/.exec(dom)
  assert.ok(verdict, 'no #sanitiser-verdict in the dumped page — did the probe page layout change?')

  const [, outcome, message] = verdict
  if (outcome === 'fail') {
    const report = /<div id="sanitiser-report">([\s\S]*?)<\/div>\s*<div id="stage">/.exec(dom)
    assert.fail(`${message}\n${report?.[1] ?? '(no detail)'}`)
  }
})
