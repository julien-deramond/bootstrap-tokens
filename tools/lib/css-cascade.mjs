/**
 * Which custom property value an element on a real page ends up with.
 *
 * `css-parse.mjs` answers a narrower question — what does this selector declare? — and that
 * is not what a page paints. A later rule, a higher layer, a more specific selector or a
 * matching `@media` can shadow a value on the element that reads it, and none of that shows
 * up at the selector it was declared on. That is how `verify` once printed a green check for
 * a Shadow depth that no page with `data-bs-theme="light"` ever received.
 *
 * This file models just enough of the cascade to answer it for Bootstrap's own output:
 *
 * - `@layer` order, from the `@layer a, b;` statement and first appearance, nested layers
 *   included; unlayered rules above every layer, reversed for `!important`.
 * - Specificity, then source order.
 * - `@media` for `prefers-color-scheme` and viewport width. Every other condition —
 *   `@supports`, `@container`, `@starting-style`, any other media feature — is treated as
 *   false, so what it declares never wins.
 * - Selectors built from tags, classes (CSS escapes included, `.\32 xl\:drawer`),
 *   attributes and `:root`, joined by descendant or child combinators. Anything else —
 *   `:hover`, `::before`, `:not()`, `:host`, `+`, `~` — never matches a probe.
 * - Inheritance: custom properties inherit unless an `@property` rule says they do not.
 *
 * `var()` is not substituted. Two values are compared as written, which is what both sides of
 * every comparison here have in common.
 *
 * No dependencies, no Node built-ins.
 */

/* ------------------------------------------------------------------ parse -- */

/**
 * Read a stylesheet into the custom property declarations it makes.
 *
 * Returns `{ declarations, byProperty, registered, widths }`: `byProperty` maps a property
 * name to its declarations in source order, `registered` maps a property named by
 * `@property` to `{ inherits, initial }`, and `widths` lists the viewport widths (in px) that
 * some `@media` condition on a custom property turns on.
 */
export function parseCascade(css) {
  const text = stripComments(String(css))
  const layers = new LayerOrder()
  const declarations = []
  const registered = new Map()
  const frames = []
  let buffer = ''
  let order = 0

  const flushStatement = () => {
    const statement = buffer.trim()
    buffer = ''
    if (!statement) return

    const at = /^@layer\s+([^{]+)$/i.exec(statement)
    if (at) {
      const parent = currentLayer(frames)
      for (const name of splitTopLevel(at[1], ',')) layers.register(parent, name.trim())
      return
    }

    const frame = frames.at(-1)
    if (!frame) return

    if (frame.type === 'property') {
      const descriptor = /^([\w-]+)\s*:\s*([\s\S]*)$/.exec(statement)
      if (descriptor) frame.descriptors[descriptor[1].toLowerCase()] = descriptor[2].trim()
      return
    }

    if (frame.type !== 'style' || !frame.live) return

    const declaration = /^(--[^\s:]+)\s*:([\s\S]*)$/.exec(statement)
    if (!declaration) return

    let value = declaration[2].trim()
    const important = /!\s*important\s*$/i.test(value)
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim()

    const layer = currentLayer(frames)
    const media = frames.filter((one) => one.type === 'media').map((one) => one.query)

    for (const selector of frame.selectors) {
      declarations.push({
        property: declaration[1],
        value,
        important,
        selector: selector.text,
        compiled: selector,
        layer,
        media,
        order: order++
      })
    }
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i)
      buffer += text.slice(i, end + 1)
      i = end
      continue
    }

    if (ch === '(') {
      const end = endOfParens(text, i)
      buffer += text.slice(i, end + 1)
      i = end
      continue
    }

    if (ch === '\\') {
      buffer += text.slice(i, i + 2)
      i++
      continue
    }

    if (ch === ';') {
      flushStatement()
      continue
    }

    if (ch === '{') {
      frames.push(openFrame(buffer.trim(), frames, layers))
      buffer = ''
      continue
    }

    if (ch === '}') {
      // The last declaration of a block may have no semicolon.
      flushStatement()
      const frame = frames.pop()
      if (frame?.type === 'property') registerProperty(registered, frame)
      continue
    }

    buffer += ch
  }

  const byProperty = new Map()
  for (const declaration of declarations) {
    declaration.rank = layers.rankOf(declaration.layer)
    if (!byProperty.has(declaration.property)) byProperty.set(declaration.property, [])
    byProperty.get(declaration.property).push(declaration)
  }

  return { declarations, byProperty, registered, widths: widthsOf(declarations) }
}

function openFrame(prelude, frames, layers) {
  const parent = frames.at(-1)
  const live = !frames.some((frame) => frame.type === 'dead')

  if (prelude.startsWith('@')) {
    const [, name = '', rest = ''] = /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude) ?? []
    const keyword = name.toLowerCase()

    if (keyword === 'layer') {
      const outer = currentLayer(frames)
      const own = rest.trim() || layers.anonymous()
      layers.register(outer, own)
      return { type: 'layer', path: [...outer, ...own.split('.')] }
    }
    if (keyword === 'media') return { type: 'media', query: rest.trim() }
    if (keyword === 'property') return { type: 'property', name: rest.trim(), descriptors: {} }
    // `@supports`, `@container`, `@starting-style`, `@keyframes`, `@font-face`, `@scope`…
    // Whatever they declare is either conditional on something a probe cannot know, or not
    // a declaration on an element at all.
    return { type: 'dead' }
  }

  const parentSelectors = parent?.type === 'style' ? parent.selectors : null
  const selectors = splitTopLevel(prelude, ',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => (parentSelectors ? parentSelectors.map((outer) => nest(outer.text, part)) : [part]))
    .map(compileSelector)

  return { type: 'style', selectors, live }
}

/** CSS nesting, in case it ever reaches compiled output: `&` is the parent, else a descendant. */
const nest = (outer, inner) => (inner.includes('&') ? inner.replaceAll('&', outer) : `${outer} ${inner}`)

function currentLayer(frames) {
  const frame = [...frames].reverse().find((one) => one.type === 'layer')
  return frame ? frame.path : []
}

function registerProperty(registered, frame) {
  const inherits = String(frame.descriptors.inherits ?? 'true').trim().toLowerCase() !== 'false'
  registered.set(frame.name, { inherits, initial: frame.descriptors['initial-value'] ?? null })
}

/**
 * Layer order as a tree: each layer is ranked among its siblings by first appearance, and a
 * declaration directly inside a layer ranks above that layer's own sub-layers — which is
 * what an `Infinity` at the end of every rank says. Unlayered is `[Infinity]`, above all.
 */
class LayerOrder {
  constructor() {
    this.children = new Map()
    this.count = 0
  }

  anonymous() {
    return `\u0000anonymous-${this.count++}`
  }

  register(parent, dotted) {
    let path = parent
    for (const part of dotted.split('.')) {
      const key = path.join('.')
      if (!this.children.has(key)) this.children.set(key, [])
      const siblings = this.children.get(key)
      if (!siblings.includes(part)) siblings.push(part)
      path = [...path, part]
    }
  }

  rankOf(path) {
    const rank = []
    for (let i = 0; i < path.length; i++) {
      rank.push(this.children.get(path.slice(0, i).join('.'))?.indexOf(path[i]) ?? 0)
    }
    rank.push(Infinity)
    return rank
  }
}

/* --------------------------------------------------------------- selectors -- */

/**
 * Parse one complex selector into compounds, right to left, with its specificity.
 *
 * A selector that uses anything the matcher does not model is kept, with `matchable: false`,
 * so it still shows up in a report — it just never matches a probe.
 */
export function compileSelector(text) {
  const compounds = []
  let matchable = true
  let current = emptyCompound()
  let combinator = null
  let i = 0
  const specificity = [0, 0, 0]

  const push = () => {
    if (current.empty) return
    compounds.push({ ...current, combinator })
    current = emptyCompound()
    combinator = null
  }

  while (i < text.length) {
    const ch = text[i]

    if (/\s/.test(ch) || ch === '>' || ch === '+' || ch === '~') {
      let j = i
      let explicit = null
      while (j < text.length && /[\s>+~]/.test(text[j])) {
        if (text[j] !== ' ' && !/\s/.test(text[j])) explicit = text[j]
        j++
      }
      if (!current.empty) {
        push()
        combinator = explicit ?? ' '
        if (combinator === '+' || combinator === '~') matchable = false
      }
      i = j
      continue
    }

    if (ch === '.') {
      const [name, end] = readIdent(text, i + 1)
      current.classes.push(name)
      current.empty = false
      specificity[1]++
      i = end
      continue
    }

    if (ch === '#') {
      const [, end] = readIdent(text, i + 1)
      // Probes never carry an id.
      matchable = false
      current.empty = false
      specificity[0]++
      i = end
      continue
    }

    if (ch === '[') {
      const end = endOfBrackets(text, i)
      const attribute = parseAttribute(text.slice(i + 1, end))
      if (attribute) current.attributes.push(attribute)
      else matchable = false
      current.empty = false
      specificity[1]++
      i = end + 1
      continue
    }

    if (ch === ':') {
      const element = text[i + 1] === ':'
      const [name, afterName] = readIdent(text, i + (element ? 2 : 1))
      let end = afterName
      if (text[end] === '(') end = endOfParens(text, end) + 1

      const lower = name.toLowerCase()
      if (!element && lower === 'root') {
        current.root = true
        specificity[1]++
      } else {
        matchable = false
        if (element || ['before', 'after', 'first-line', 'first-letter'].includes(lower)) specificity[2]++
        else if (lower !== 'where') specificity[1]++
      }
      current.empty = false
      i = end
      continue
    }

    if (ch === '*') {
      current.empty = false
      i++
      continue
    }

    if (ch === '&') {
      matchable = false
      current.empty = false
      i++
      continue
    }

    const [tag, end] = readIdent(text, i)
    if (end === i) {
      matchable = false
      i++
      continue
    }
    current.tag = tag.toLowerCase()
    current.empty = false
    specificity[2]++
    i = end
  }
  push()

  return { text: text.trim(), compounds, matchable, specificity }
}

const emptyCompound = () => ({ tag: null, classes: [], attributes: [], root: false, empty: true })

function parseAttribute(inner) {
  const match = /^\s*([\w-]+)\s*(?:([~|^$*]?=)\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s\]]+)\s*([iIsS])?)?\s*$/.exec(inner)
  if (!match) return null
  const [, name, operator = null, raw = null, flag = null] = match
  let value = raw
  if (value && (value[0] === '"' || value[0] === "'")) value = decodeEscapes(value.slice(1, -1))
  else if (value) value = decodeEscapes(value)
  return { name: name.toLowerCase(), operator, value, insensitive: flag?.toLowerCase() === 'i' }
}

/** An identifier at `start`, with CSS escapes decoded: `\32 xl\:drawer` is `2xl:drawer`. */
function readIdent(text, start) {
  let i = start
  let out = ''
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      const hex = /^[0-9a-fA-F]{1,6}/.exec(text.slice(i + 1, i + 7))
      if (hex) {
        out += String.fromCodePoint(Number.parseInt(hex[0], 16))
        i += 1 + hex[0].length
        if (/\s/.test(text[i] ?? '')) i++
      } else {
        out += text[i + 1] ?? ''
        i += 2
      }
      continue
    }
    if (/[\w-]/.test(ch) || ch.codePointAt(0) > 0x7f) {
      out += ch
      i++
      continue
    }
    break
  }
  return [out, i]
}

function decodeEscapes(value) {
  return value.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex, char) =>
    hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : char
  )
}

/* ---------------------------------------------------------------- elements -- */

/**
 * A probe element: `{ tag, classes, attributes, root }`. A probe is a chain of them from
 * `<html>` down to the element being asked about.
 */
export function element({ tag = 'div', classes = [], attributes = {}, root = false } = {}) {
  return { tag, classes: new Set(classes), attributes: new Map(Object.entries(attributes)), root }
}

/**
 * The elements a simple selector describes, outermost first: `.tab-content > .tab-pane`
 * becomes a `.tab-content` with a `.tab-pane` inside. Returns null for a selector the
 * matcher cannot reproduce.
 */
export function elementsFor(selectorText) {
  const compiled = compileSelector(selectorText)
  if (!compiled.matchable) return null
  return compiled.compounds.map((compound) => ({
    tag: compound.tag,
    classes: [...compound.classes],
    attributes: Object.fromEntries(
      compound.attributes.map(({ name, operator, value }) => [name, operator === '=' ? value : value ?? ''])
    ),
    root: compound.root
  }))
}

/** Does the compiled selector match `chain[index]`, given its ancestors? */
export function matches(selector, chain, index = chain.length - 1) {
  if (!selector.matchable) return false
  return matchFrom(selector.compounds, selector.compounds.length - 1, chain, index)
}

function matchFrom(compounds, at, chain, index) {
  if (!matchCompound(compounds[at], chain[index])) return false
  if (at === 0) return true

  const { combinator } = compounds[at]
  if (combinator === '>') return index > 0 && matchFrom(compounds, at - 1, chain, index - 1)
  for (let j = index - 1; j >= 0; j--) {
    if (matchFrom(compounds, at - 1, chain, j)) return true
  }
  return false
}

function matchCompound(compound, node) {
  if (!node) return false
  if (compound.root && !node.root) return false
  if (compound.tag && compound.tag !== node.tag) return false
  for (const name of compound.classes) if (!node.classes.has(name)) return false
  for (const attribute of compound.attributes) if (!matchAttribute(attribute, node)) return false
  return true
}

function matchAttribute({ name, operator, value, insensitive }, node) {
  if (!node.attributes.has(name)) return false
  if (!operator) return true

  let actual = String(node.attributes.get(name))
  let wanted = value
  if (insensitive) {
    actual = actual.toLowerCase()
    wanted = wanted.toLowerCase()
  }

  switch (operator) {
    case '=':
      return actual === wanted
    case '~=':
      return actual.split(/\s+/).includes(wanted)
    case '|=':
      return actual === wanted || actual.startsWith(`${wanted}-`)
    case '^=':
      return wanted !== '' && actual.startsWith(wanted)
    case '$=':
      return wanted !== '' && actual.endsWith(wanted)
    case '*=':
      return wanted !== '' && actual.includes(wanted)
    default:
      return false
  }
}

/* ------------------------------------------------------------------- media -- */

/**
 * Evaluate a media query list against `{ colorScheme: 'light' | 'dark', width }`.
 *
 * Only what decides a custom property in Bootstrap is modeled: `prefers-color-scheme` and
 * the viewport width, in range syntax or as `min-width`/`max-width`. Anything else is false.
 */
export function mediaMatches(query, env) {
  return splitTopLevel(query, ',').some((one) => queryMatches(one.trim(), env))
}

function queryMatches(query, env) {
  let text = query
  let negate = false
  const prefix = /^(not|only)\s+/i.exec(text)
  if (prefix) {
    negate = prefix[1].toLowerCase() === 'not'
    text = text.slice(prefix[0].length)
  }

  const parts = text.split(/\s+and\s+/i).map((part) => part.trim()).filter(Boolean)
  const result = parts.every((part) => {
    if (/^(all|screen)$/i.test(part)) return true
    if (/^print$/i.test(part)) return false
    const feature = /^\(([\s\S]*)\)$/.exec(part)
    return feature ? featureMatches(feature[1].trim(), env) : false
  })
  return negate ? !result : result
}

function featureMatches(feature, env) {
  const scheme = /^prefers-color-scheme\s*:\s*(light|dark)$/i.exec(feature)
  if (scheme) return (env.colorScheme ?? 'light') === scheme[1].toLowerCase()

  const legacy = /^(min|max)-width\s*:\s*([\d.]+)(px|em|rem)$/i.exec(feature)
  if (legacy) {
    const px = toPx(legacy[2], legacy[3])
    return legacy[1].toLowerCase() === 'min' ? env.width >= px : env.width <= px
  }

  const range = /^width\s*(<=|>=|<|>|=)\s*([\d.]+)(px|em|rem)$/i.exec(feature)
  if (range) return compare(env.width, range[1], toPx(range[2], range[3]))

  const reversed = /^([\d.]+)(px|em|rem)\s*(<=|>=|<|>|=)\s*width$/i.exec(feature)
  if (reversed) return compare(toPx(reversed[1], reversed[2]), reversed[3], env.width)

  const between = /^([\d.]+)(px|em|rem)\s*(<=|<)\s*width\s*(<=|<)\s*([\d.]+)(px|em|rem)$/i.exec(feature)
  if (between) {
    return (
      compare(toPx(between[1], between[2]), between[3], env.width) &&
      compare(env.width, between[4], toPx(between[5], between[6]))
    )
  }

  return false
}

const toPx = (number, unit) => Number(number) * (unit.toLowerCase() === 'px' ? 1 : 16)

function compare(a, operator, b) {
  if (operator === '<') return a < b
  if (operator === '<=') return a <= b
  if (operator === '>') return a > b
  if (operator === '>=') return a >= b
  return a === b
}

/** Every width a media condition on a custom property starts or stops at. */
function widthsOf(declarations) {
  const widths = new Set()
  for (const { media } of declarations) {
    for (const query of media) {
      for (const match of query.matchAll(/([\d.]+)(px|em|rem)/gi)) widths.add(toPx(match[1], match[2]))
    }
  }
  return [...widths].sort((a, b) => a - b)
}

/* ----------------------------------------------------------------- cascade -- */

/**
 * The declaration that decides `property` on the last element of `chain`, or null.
 *
 * Walks up the chain: the first element with a matching declaration decides, because custom
 * properties inherit — unless `@property` registered this one with `inherits: false`, in
 * which case the element's own declarations or the initial value are all there is.
 */
export function effective(sheet, property, chain, env = {}) {
  const candidates = sheet.byProperty.get(property) ?? []
  const registration = sheet.registered.get(property)
  const media = mediaCache(sheet, env)
  const applies = (declaration) =>
    declaration.media.length === 0 || declaration.media.every((query) => media(query))

  for (let index = chain.length - 1; index >= 0; index--) {
    let winner = null
    for (const declaration of candidates) {
      if (!applies(declaration) || !matches(declaration.compiled, chain, index)) continue
      if (!winner || outranks(declaration, winner)) winner = declaration
    }
    if (winner) return winner
    if (registration && !registration.inherits) break
  }

  if (registration?.initial != null) {
    return { property, value: registration.initial, selector: '@property', initial: true }
  }
  return null
}

/** Media results per stylesheet and environment: thousands of probes ask the same few queries. */
function mediaCache(sheet, env) {
  const environment = { colorScheme: env.colorScheme ?? 'light', width: env.width ?? 1024 }
  const key = `${environment.colorScheme}|${environment.width}`
  sheet.media ??= new Map()
  if (!sheet.media.has(key)) sheet.media.set(key, new Map())
  const results = sheet.media.get(key)
  return (query) => {
    if (!results.has(query)) results.set(query, mediaMatches(query, environment))
    return results.get(query)
  }
}

/** Cascade order: importance and layer, then specificity, then source order. */
export function outranks(a, b) {
  if (a.important !== b.important) return a.important
  const layer = compareRank(a.rank, b.rank)
  if (layer !== 0) return a.important ? layer < 0 : layer > 0
  for (let i = 0; i < 3; i++) {
    if (a.compiled.specificity[i] !== b.compiled.specificity[i]) {
      return a.compiled.specificity[i] > b.compiled.specificity[i]
    }
  }
  return a.order > b.order
}

function compareRank(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity
    const y = b[i] ?? -Infinity
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/* ------------------------------------------------------------------ helpers -- */

function stripComments(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i)
      out += text.slice(i, end + 1)
      i = end
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    out += ch
  }
  return out
}

function endOfString(text, start) {
  const quote = text[start]
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++
    else if (text[i] === quote || text[i] === '\n') return i
  }
  return text.length - 1
}

function endOfParens(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'") i = endOfString(text, i)
    else if (ch === '\\') i++
    else if (ch === '(') depth++
    else if (ch === ')' && --depth === 0) return i
  }
  return text.length - 1
}

function endOfBrackets(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'") i = endOfString(text, i)
    else if (ch === '\\') i++
    else if (ch === ']') return i
  }
  return text.length - 1
}

/** Split on `separator` where it is not inside parentheses, brackets or a string. */
export function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"' || ch === "'") i = endOfString(text, i)
    else if (ch === '\\') i++
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}
