/**
 * Load the token document, index it, and resolve tokens down to CSS.
 *
 * Resolution has one rule that matters: a reference to a token that *has* a custom property
 * becomes `var(--that)`, and a reference to one that doesn't is inlined. That is what keeps
 * Bootstrap's runtime theming intact instead of flattening everything at build time.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { expandColorScales } from './color-scale.mjs'
import { refsToCss, referencesIn, typedToCss, formatNumber, splitArgs } from './value.mjs'

export const NS = 'dev.bootstrap.tokens'

export const ext = (node) => node?.$extensions?.[NS] ?? {}
export const isToken = (node) => node !== null && typeof node === 'object' && node.$value !== undefined
export const isGroup = (node) => node !== null && typeof node === 'object' && node.$value === undefined

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

/** Child keys of a group, honouring an explicit `order` extension. */
export function childKeys(node) {
  const keys = Object.keys(node).filter((key) => !key.startsWith('$'))
  const order = ext(node).order
  if (!order) return keys

  const seen = new Set(order)
  return [...order.filter((key) => key in node), ...keys.filter((key) => !seen.has(key))]
}

/** Walk every token in a tree, yielding `[path, token]`. */
export function* walk(node, at = []) {
  for (const key of childKeys(node)) {
    const value = node[key]
    const path = [...at, key]
    if (isToken(value)) yield [path.join('.'), value]
    else if (isGroup(value)) yield* walk(value, path)
  }
}

/** Read `tokens/` into a resolved document. */
export function loadTokens(dir) {
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

  expandColorScales(tree)

  return index(tree, fileOf)
}

/** Build the lookup structures and resolver over a token tree. */
export function index(tree, fileOf = new Map()) {
  const tokens = new Map()
  const byCssVar = new Map()
  const byMap = new Map()

  for (const [path, token] of walk(tree)) {
    tokens.set(path, token)
    const meta = ext(token)
    if (meta.cssVar) byCssVar.set(meta.cssVar, path)
    if (meta.sassMap) {
      if (!byMap.has(meta.sassMap)) byMap.set(meta.sassMap, [])
      byMap.get(meta.sassMap).push(path)
    }
  }

  const doc = { tree, tokens, byCssVar, byMap, fileOf }

  doc.cssValueOf = (path, seen = new Set()) => cssValueOf(doc, path, seen)
  doc.cssRefOf = (path, seen = new Set()) => cssRefOf(doc, path, seen)
  doc.literalOf = (path, seen = new Set()) => cssValueOf(doc, path, seen)

  return doc
}

/** How *other* tokens refer to this one. */
function cssRefOf(doc, path, seen) {
  const token = doc.tokens.get(path)
  if (!token) return null
  const meta = ext(token)
  if (meta.cssVar) return `var(${meta.cssVar})`
  return cssValueOf(doc, path, seen)
}

/** The full CSS value of a token, including its `light-dark()` pairing. */
function cssValueOf(doc, path, seen) {
  const token = doc.tokens.get(path)
  if (!token) return null
  if (seen.has(path)) throw new Error(`Reference cycle through "${path}"`)

  const next = new Set(seen).add(path)
  const meta = ext(token)

  const light = renderSide(doc, token, token.$value, meta, next)
  if (!meta.dark) return light

  const dark = renderSide(doc, token, meta.dark, meta, next)
  return `light-dark(${light}, ${dark})`
}

function renderSide(doc, token, value, meta, seen) {
  if (typeof value !== 'string') return typedToCss({ ...token, $value: value })

  if (meta.arithmetic) {
    return evaluate(refsToCss(value, (target) => doc.literalOf(target, seen)))
  }

  return refsToCss(value, (target) => {
    const resolved = cssRefOf(doc, target, seen)
    if (resolved === null) throw new Error(`Unknown token reference "{${target}}"`)
    return resolved
  })
}

/* --------------------------------------------------------------------------
 * Sass-style arithmetic, just enough for `1rem * .25`.
 * -------------------------------------------------------------------------- */

const TERM = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)$/i

/** Evaluate a flat `a op b op c` expression over dimensions and numbers. */
export function evaluate(expression) {
  const parts = expression.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]

  const terms = []
  const operators = []

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      const term = TERM.exec(parts[i])
      if (!term) return expression // not arithmetic we understand — leave it alone
      terms.push({ n: Number(term[1]), unit: term[2] })
    } else {
      if (!'+-*/'.includes(parts[i])) return expression
      operators.push(parts[i])
    }
  }

  // Multiplication and division first.
  for (let i = 0; i < operators.length; ) {
    if (operators[i] === '*' || operators[i] === '/') {
      const a = terms[i]
      const b = terms[i + 1]
      terms.splice(i, 2, {
        n: operators[i] === '*' ? a.n * b.n : a.n / b.n,
        unit: a.unit || b.unit
      })
      operators.splice(i, 1)
      continue
    }
    i++
  }

  for (let i = 0; i < operators.length; ) {
    const a = terms[i]
    const b = terms[i + 1]
    terms.splice(i, 2, { n: operators[i] === '+' ? a.n + b.n : a.n - b.n, unit: a.unit || b.unit })
    operators.splice(i, 1)
  }

  const result = terms[0]
  return `${formatNumber(round(result.n))}${result.unit}`
}

const round = (n) => Number(n.toFixed(10))

/** Paths a token points at, light and dark side both. */
export function referencesOf(token) {
  const meta = ext(token)
  const out = new Set(referencesIn(String(token.$value ?? '')))
  if (meta.dark) for (const ref of referencesIn(meta.dark)) out.add(ref)
  return [...out]
}

export { splitArgs }
