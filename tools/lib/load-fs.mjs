/**
 * Filesystem entry point for the token document.
 *
 * Kept apart from `tokens.mjs` on purpose: everything the resolver needs is pure ES modules
 * with no Node built-ins, so the web chooser imports the exact same resolution code that
 * the Sass exporter uses instead of a second, drifting implementation.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { expandColorScales } from './color-scale.mjs'
import { index, walk, isToken } from './tokens.mjs'

/** Every `.json` file under `dir`, sorted for stable output. */
function jsonFiles(dir) {
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (entry.endsWith('.json')) out.push(path)
    }
  }
  walk(dir)
  return out
}

/** Merge `source` into `target`, refusing to overwrite an existing token. */
function mergeTree(target, source, origin, at = '') {
  for (const [key, value] of Object.entries(source)) {
    const path = at ? `${at}.${key}` : key

    if (key.startsWith('$')) {
      target[key] = value
      continue
    }

    if (isToken(value)) {
      if (target[key] !== undefined) throw new Error(`${origin}: duplicate token "${path}"`)
      target[key] = value
      continue
    }

    if (target[key] === undefined) target[key] = {}
    if (isToken(target[key])) throw new Error(`${origin}: "${path}" is both a token and a group`)
    mergeTree(target[key], value, origin, path)
  }
}

/** Read `tokens/` into one merged tree, before the colour scale is expanded. */
export function loadTree(dir) {
  const tree = {}
  const fileOf = new Map()

  for (const file of jsonFiles(dir)) {
    const origin = relative(dir, file).split(sep).join('/')
    if (origin === 'meta.json') continue
    let parsed
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      throw new Error(`${origin}: invalid JSON — ${error.message}`)
    }
    mergeTree(tree, parsed, origin)
    for (const [path] of walk(parsed)) fileOf.set(path, origin)
  }

  return { tree, fileOf }
}

/** Read `tokens/` into a resolved document. */
export function loadTokens(dir) {
  const { tree, fileOf } = loadTree(dir)
  expandColorScales(tree)
  return index(tree, fileOf)
}
