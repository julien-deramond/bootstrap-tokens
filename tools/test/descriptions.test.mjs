/**
 * A token document nobody can read is a config file with extra syntax. These check that the
 * descriptions exist where meaning lives, and that they say something the name does not.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTokens } from '../lib/load-fs.mjs'
import { walk, ext } from '../lib/tokens.mjs'
import { layerOf } from '../lib/validate.mjs'
import { tokensDir } from '../lib/config.mjs'
import { describe, describeRole, describeThemeHook, SUB_KEYS, ROLES } from '../lib/descriptions.mjs'

const doc = loadTokens(tokensDir)

const semanticTokens = [...walk(doc.tree)].filter(([path, token]) => layerOf(path) === 'semantic' && !ext(token).generated)

test('every semantic token is described', () => {
  const missing = semanticTokens.filter(([, token]) => !token.$description).map(([path]) => path)
  assert.deepEqual(missing, [])
})

test('the nine theme sub-keys are templated, not written 72 times', () => {
  // Written out, they would drift: `primary.bg-subtle` and `success.bg-subtle` mean the same
  // thing, and only the role name should differ.
  for (const key of Object.keys(SUB_KEYS)) {
    const primary = describe(`theme-color.primary.${key}`)
    const success = describe(`theme-color.success.${key}`)

    assert.ok(primary, `no description for sub-key ${key}`)
    // Case-insensitive: some templates open the sentence with the role name.
    assert.equal(
      primary.replace(/primary/gi, 'ROLE'),
      success.replace(/success/gi, 'ROLE')
    )
  }
})

test('every role and every sub-key resolves for every combination', () => {
  for (const role of Object.keys(ROLES)) {
    assert.ok(describeRole(role), `no description for role ${role}`)
    for (const key of Object.keys(SUB_KEYS)) {
      assert.ok(describe(`theme-color.${role}.${key}`), `theme-color.${role}.${key}`)
    }
  }
})

test('control metrics name their size', () => {
  assert.match(describe('control.field.sm.min-height'), /at the small size/)
  assert.match(describe('control.field.lg.padding-x'), /at the large size/)
  // The default size has no suffix, and must not read as "…field at the  size".
  assert.doesNotMatch(describe('control.field.padding-x'), /at the\s+size/)
})

test('a theme hook explains behaviour the name cannot', () => {
  const note = describeThemeHook('var(--theme-bg-subtle, var(--bg-1))')
  assert.match(note, /--theme-bg-subtle/)
  assert.match(note, /fallback/)
  assert.equal(describeThemeHook('var(--bg-1)'), null)
})

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'it', 'is', 'and', 'or', 'for', 'that', 'this',
  'so', 'its', 'use', 'when', 'you', 'not', 'at', 'by', 'with', 'be', 'has', 'are', 'than'
])

test('no description merely restates the token path', () => {
  // "The alert's horizontal padding" costs a line and teaches nothing. The test for that is
  // not word overlap — a good description often repeats the name — but whether it adds
  // anything beyond it.
  for (const [path, token] of walk(doc.tree)) {
    if (!token.$description) continue

    const fromPath = new Set(path.toLowerCase().split(/[.-]/))
    const added = token.$description
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !fromPath.has(word))

    // Four, not five. At five the test started rejecting good short descriptions —
    // "Fill of a control while it is being pressed" is worth saying, because in CSS
    // *active* means pressed rather than selected — and a test that rewards padding is
    // working against the thing it is meant to protect.
    assert.ok(
      new Set(added).size >= 4,
      `${path}: "${token.$description}" adds nothing the path does not already say`
    )
  }
})

test('group descriptions cover the primitive scales', () => {
  // Individual scale steps do not need a line each; their group carries the meaning.
  for (const group of ['spacing', 'radius', 'font-size', 'z-index', 'color']) {
    assert.ok(doc.tree[group]?.$description, `${group} has no group description`)
  }
})
