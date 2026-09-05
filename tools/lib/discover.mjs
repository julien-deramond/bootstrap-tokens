/**
 * Find every configurable surface in a Bootstrap checkout, and hold it against what we model.
 *
 * The extractor warns when a map we *list* is missing from the checkout. It never warned when
 * the checkout had a map we did not list — so a gap in coverage was invisible by
 * construction. That is not hypothetical: `$fade-tokens` and `$collapse-tokens` were absent
 * from the token document from the first commit until this check was written, and nothing —
 * not `sync`, not `validate`, not `verify`, not CI — noticed.
 *
 * Everything upstream declares with `!default` is either modelled, or listed below with a
 * reason. There is no third option.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { ext, walk } from './tokens.mjs'
import { scan } from './sass-parser.mjs'

/**
 * Upstream variables that are deliberately not tokens. Each needs a reason, because "we
 * forgot" and "we decided" look identical in a diff six months later.
 */
export const NOT_TOKENS = {
  // --- generated, or an alias of something we do model ---
  '$color-tokens': 'Generated from $colors by the tint/shade loop in scss/_colors.scss.',
  '$-color-defaults': 'Internal accumulator for the colour-scale loop.',
  '$shadow-opacities': 'Generated from $util-opacity (×2) in scss/_utilities.scss.',
  $gutters: 'Aliases $spacers; changing $spacers moves it.',
  '$original-enable-shadows': 'Internal save/restore around a mixin in scss/mixins/_box-shadow.scss.',

  /*
   * Declared in scss/mixins/, which scss/bootstrap.scss does not @forward. They carry
   * !default, so they look configurable, but no consumer can reach them through the
   * documented entrypoint. Modelling them would produce an export that fails to compile.
   * Raised as backlog item U1 — this is an upstream gap, not one of ours.
   */
  '$caret-width': 'In scss/mixins/, which bootstrap.scss does not forward. See BACKLOG U1.',
  '$caret-spacing': 'In scss/mixins/, which bootstrap.scss does not forward. See BACKLOG U1.',
  '$caret-vertical-align': 'In scss/mixins/, which bootstrap.scss does not forward. See BACKLOG U1.',
  '$transition-base': 'In scss/mixins/, which bootstrap.scss does not forward. See BACKLOG U1.',

  /*
   * Build configuration that is deliberately *not* modelled, even as an option. These are
   * nested definitions of what Bootstrap generates rather than values anyone tunes; editing
   * them is editing the framework, not theming it.
   */
  $utilities: 'The utility API is a code structure, not a set of design values.',
  '$escaped-characters': 'Input to escape-svg(), which we evaluate at extraction time.',
  '$button-variants': 'Which button variants are generated. Configuration — PLAN.md A2.',
  '$badge-variants': 'Which badge variants are generated. Configuration — PLAN.md A2.',
  '$btn-variant-selectors': 'Selector list for the button variant loop. Configuration.',
  '$navbar-breakpoints': 'Aliases $breakpoints; changing those moves it.',

  // --- dead or test-only ---
  '$border-color': 'Declared in _config.scss but referenced nowhere outside it.',
  '$test-breakpoints': 'Used only by scss/tests/.',
  '$true-terminal-output': 'Used only by scss/tests/.',
  $file: 'Loop variable in scss/tests/, not a configuration point.'
}

/** Every `.scss` file in a checkout. */
function scssFiles(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (entry.endsWith('.scss')) out.push(path)
    }
  }
  walk(join(root, 'scss'))
  return out
}

const DECLARATION = /(^|\n)[ \t]*(\$[\w-]+)[ \t]*:/g
const ENABLE_FLAG = /^\$enable-/

/**
 * Every variable upstream offers as a configuration point, with the file it lives in.
 *
 * `!default` is the marker: it is what makes a variable overridable through
 * `@use … with ()`. Without that filter this finds every loop counter inside every mixin.
 * A name counts if *any* of its declarations carries the flag, because the token maps are
 * declared twice — `$x: () !default;` then `$x: defaults(…);`.
 */
export function declaredVariables(root) {
  const found = new Map()
  const configurable = new Set()

  for (const path of scssFiles(root)) {
    const relativePath = relative(root, path).split(sep).join('/')
    const source = readFileSync(path, 'utf8')

    for (const match of source.matchAll(DECLARATION)) {
      const name = match[2]
      // Scan to the terminating semicolon: on a multi-line map the flag is pages away from
      // the declaration, so looking at the first line alone misses $breakpoints and $shadows.
      const start = match.index + match[0].length
      const value = source.slice(start, scan(source, start, ';'))

      if (!found.has(name)) found.set(name, relativePath)
      if (/!default\s*$/.test(value.trim())) configurable.add(name)
    }
  }

  return new Map([...found].filter(([name]) => configurable.has(name)))
}

/**
 * What the project actually claims to cover, read from the documents rather than the routing
 * table. The table is an implementation detail; the documents are the claim being checked.
 */
function modelled(doc, options) {
  const known = new Set(['$root-tokens', ...Object.keys(options ?? {})])

  for (const [, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (meta.sassVar) known.add(meta.sassVar)
    if (meta.sassMap) known.add(meta.sassMap)
  }

  return known
}

/**
 * Compare the checkout against the model.
 *
 * `unaccounted` is the finding that matters: a surface upstream offers that we neither model
 * nor have a stated reason for ignoring.
 */
export function discover(root, doc, options = {}) {
  const declared = declaredVariables(root)
  const known = modelled(doc, options)

  const unaccounted = []
  const flags = []
  const stale = []

  for (const [name, file] of declared) {
    if (ENABLE_FLAG.test(name)) flags.push({ name, file })
    if (known.has(name) || name in NOT_TOKENS) continue
    unaccounted.push({ name, file })
  }

  // A map we list that upstream no longer declares is drift in the other direction.
  for (const name of known) {
    if (!declared.has(name)) stale.push(name)
  }

  const tokenMaps = [...declared.keys()].filter((name) => name.endsWith('-tokens'))

  return {
    declared: declared.size,
    tokenMaps: tokenMaps.length,
    tokenMapsModelled: tokenMaps.filter((name) => known.has(name)).length,
    unaccounted: unaccounted.sort((a, b) => a.name.localeCompare(b.name)),
    stale: stale.sort(),
    // `$enable-*` is a known, deliberate omission tracked as one item rather than twelve.
    flags: flags.sort((a, b) => a.name.localeCompare(b.name))
  }
}
