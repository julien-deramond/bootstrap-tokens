/**
 * Serialise the extracted tree to `tokens/*.json`.
 *
 * One wrinkle drives most of this file: `JSON.parse` reorders integer-like object keys.
 * `{"body":…,"1":…}` comes back as `{"1":…,"body":…}`, which would change the order of
 * declarations in the emitted `:root` block. Where that happens we record the intended
 * order explicitly instead of pretending JSON preserves it.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NS = 'dev.bootstrap.tokens'

const isToken = (node) => node && typeof node === 'object' && node.$value !== undefined

/** Does a JSON round-trip preserve this object's key order? */
function orderSurvivesJson(keys) {
  const probe = {}
  for (const key of keys) probe[key] = 0
  const roundTripped = Object.keys(JSON.parse(JSON.stringify(probe)))
  return roundTripped.every((key, i) => key === keys[i])
}

/** Add `order` extensions to any group whose key order JSON would scramble. */
export function addOrderHints(node) {
  if (!node || typeof node !== 'object' || isToken(node)) return node

  const keys = Object.keys(node).filter((key) => !key.startsWith('$'))
  if (keys.length > 1 && !orderSurvivesJson(keys)) {
    node.$extensions ??= {}
    node.$extensions[NS] = { ...(node.$extensions[NS] ?? {}), order: keys }
  }

  for (const key of keys) addOrderHints(node[key])
  return node
}

/** Stable, readable JSON: two-space indent, trailing newline. */
export function serialize(tree) {
  return `${JSON.stringify(tree, null, 2)}\n`
}

/** Write the whole document. Returns the list of files that changed. */
export function writeTokenFiles(dir, files, { dryRun = false } = {}) {
  const changed = []

  for (const [relative, tree] of Object.entries(files)) {
    const path = join(dir, relative)
    const next = serialize(addOrderHints(tree))
    const previous = existsSync(path) ? readFileSync(path, 'utf8') : null

    if (previous === next) continue
    changed.push({ file: relative, status: previous === null ? 'added' : 'changed', previous, next })

    if (!dryRun) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, next)
    }
  }

  return changed
}
