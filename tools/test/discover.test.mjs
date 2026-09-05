/**
 * The guard that makes coverage claims checkable.
 *
 * Written because two component token maps — `$fade-tokens` and `$collapse-tokens` — were
 * absent from the token document from the first commit, and nothing detected it. The
 * extractor warned when a map it *listed* was missing from the checkout, never when the
 * checkout had a map it did not list, so that class of gap was invisible by construction.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discover, declaredVariables, NOT_TOKENS } from '../lib/discover.mjs'
import { loadTokens, loadOptions } from '../lib/load-fs.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'

/** A checkout-shaped directory with the given `scss/` files. */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'bstokens-discover-'))
  for (const [name, content] of Object.entries(files)) {
    const path = join(root, 'scss', name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

test('only !default variables count as configuration points', () => {
  // Without this filter the check drowns in every loop counter inside every mixin.
  const root = fixture({
    '_a.scss': '$public: 1px !default;\n@function f() {\n  $local: 2;\n  @return $local;\n}\n'
  })
  assert.deepEqual([...declaredVariables(root).keys()], ['$public'])
})

test('the !default flag is found at the end of a multi-line map', () => {
  // $breakpoints and $shadows put the flag pages below the declaration; looking at the
  // first line alone reported them as not configurable.
  const root = fixture({
    '_a.scss': '$map: (\n  xs: 0,\n  sm: 576px\n) !default;\n'
  })
  assert.deepEqual([...declaredVariables(root).keys()], ['$map'])
})

const emptyDoc = { tree: {} }

test('a map the document does not model is reported', () => {
  const root = fixture({ '_a.scss': '$widget-tokens: () !default;\n' })
  const { unaccounted } = discover(root, emptyDoc)
  assert.deepEqual(unaccounted.map((u) => u.name), ['$widget-tokens'])
})

test('a map with a stated reason is not reported', () => {
  const root = fixture({ '_a.scss': '$utilities: () !default;\n' })
  assert.deepEqual(discover(root, emptyDoc).unaccounted, [])
})

test('every ignored variable states a reason', () => {
  for (const [name, reason] of Object.entries(NOT_TOKENS)) {
    assert.equal(typeof reason, 'string', `${name} has no reason`)
    assert.ok(reason.length > 20, `${name}: "${reason}" is not a reason`)
  }
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout — the coverage assertions below are skipped */
}

test('the committed document covers every upstream token map', { skip: !source }, () => {
  // Options count as modelled: they live in config/, not in the DTCG document.
  const { tokenMaps, tokenMapsModelled, unaccounted, stale } = discover(
    source,
    loadTokens(tokensDir),
    loadOptions(tokensDir)
  )

  assert.equal(tokenMapsModelled, tokenMaps, `${tokenMaps - tokenMapsModelled} token map(s) not modelled`)
  assert.deepEqual(unaccounted.map((u) => `${u.name} (${u.file})`), [])
  assert.deepEqual(stale, [], 'we model variables upstream no longer declares')
})
