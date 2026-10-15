/**
 * Where each component token sits in Bootstrap's cascade, and which later rules re-declare it.
 *
 * `custom.scss` changes a token map value in place: the rule Bootstrap emits the map in keeps
 * its layer and its position, so every later rule of that layer that sets the same property
 * (`.btn-solid`, `.pagination-sm`, a wide-screen `.prose`) still wins, as it does in stock
 * Bootstrap. `theme.css` and the Theme Builder preview cannot edit that rule; they can only add
 * rules after compiled Bootstrap. To land where `custom.scss` lands they need to know the
 * layer, the full selector list of that rule, and the later rules to repeat after the
 * override. Only a compile can say, so `sync` records it in the token document, and
 * `themeCss()` reads it in the browser and the CLI alike.
 *
 * Recorded on each component group, as `cascade`:
 *
 *   { "layer": "components", "rule": ".btn, .btn-link, .btn-icon, …" }
 *
 * (no `layer` when Bootstrap emits the map outside any layer), and on each token that a later
 * rule of the same layer re-declares, as `redeclared`, in Bootstrap's source order:
 *
 *   [{ "selector": ".btn-solid", "value": "var(--theme-contrast)" },
 *    { "selector": ".prose", "at": ["@media (width >= 1024px)"], "value": "var(--font-size-md)" },
 *    { "selector": ".navbar[data-bs-theme=dark]", "token": "navbar-dark.navbar-color" }]
 *
 * `token` marks a rule a token map writes: another map's, or a second `@include` of this
 * one. Its value is that token's, so a theme that edits the token repeats the new value there.
 *
 * No dependencies, no Node built-ins.
 */

import { parseCascade, splitTopLevel } from './css-cascade.mjs'
import { COMPONENTS } from './sass-targets.mjs'

const NS = 'dev.bootstrap.tokens'

const ext = (node) => node?.$extensions?.[NS] ?? {}

function* tokensOf(node, at) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$') || !value || typeof value !== 'object') continue
    const path = `${at}.${key}`
    if (value.$value !== undefined) yield [path, value]
    else yield* tokensOf(value, path)
  }
}

/**
 * The overrides that make every component token show where Bootstrap emits it.
 *
 * Each token gets a value no stylesheet would ever contain, `var(--bstokens-probe-<n>)`, and
 * no dark side. Compiled as a theme, every declaration carrying one is a place `custom.scss`
 * writes that token: its map's rule, and any other rule that `@include`s the same map, as
 * `.form-control-plaintext` does. Matching selectors or values instead gets that second rule
 * wrong, and silently. Returns `{ overrides, tokenOf }`, `tokenOf` mapping a compiled value
 * back to its token path, or null.
 */
export function probeOverrides(paths) {
  const overrides = {}
  paths.forEach((path, n) => {
    overrides[path] = { value: `var(--bstokens-probe-${n})`, dark: null }
  })
  const tokenOf = (value) => {
    const match = /^var\(--bstokens-probe-(\d+)\)$/.exec(String(value).trim())
    return match ? paths[Number(match[1])] ?? null : null
  }
  return { overrides, tokenOf }
}

/** The component tokens a probe covers: every one with a custom property, in a map that is emitted. */
export function probedTokens(files) {
  const out = []
  for (const component of COMPONENTS) {
    const group = files[`component/${component.name}.json`]?.[component.name]
    if (!group || component.inert) continue
    for (const [path, token] of tokensOf(group, component.name)) if (ext(token).cssVar) out.push(path)
  }
  return out
}

/**
 * Annotate the extracted component files in place.
 *
 * `css` is Bootstrap compiled with `probeOverrides()` applied, and `tokenOf` its lookup: every
 * other declaration in it is Bootstrap's own. Returns the problems found, as sentences, which
 * `sync` reports: a map emitted nowhere, or in two layers, which this model does not cover.
 */
export function annotateCascade(files, css, tokenOf) {
  const sheet = parseCascade(css)
  const all = [...sheet.declarations, ...sheet.conditional].sort((a, b) => a.order - b.order)

  const byProperty = new Map()
  const byRule = new Map()
  const emissions = new Map()
  for (const declaration of all) {
    if (!byProperty.has(declaration.property)) byProperty.set(declaration.property, [])
    byProperty.get(declaration.property).push(declaration)
    if (!byRule.has(declaration.rule)) byRule.set(declaration.rule, [])
    byRule.get(declaration.rule).push(declaration)

    const path = tokenOf(declaration.value)
    if (!path) continue
    if (!emissions.has(path)) emissions.set(path, [])
    emissions.get(path).push(declaration)
  }

  const problems = []
  for (const component of COMPONENTS) {
    const group = files[`component/${component.name}.json`]?.[component.name]
    if (!group || component.inert) continue
    const tokens = [...tokensOf(group, component.name)].filter(([, token]) => ext(token).cssVar)
    delete group.$extensions[NS].cascade

    // Where `@include tokens()` first puts the map. Every key lands there, null ones included,
    // since the probe gives each a value.
    const first = tokens
      .map(([path]) => emissions.get(path)?.[0])
      .filter(Boolean)
      .sort((a, b) => a.order - b.order)[0]
    if (!first) {
      problems.push(`${component.sassMap} is emitted on no rule, so theme.css cannot place it in Bootstrap's layers`)
      continue
    }

    const layer = first.layer.join('.')
    group.$extensions[NS].cascade = {
      ...(layer ? { layer } : {}),
      rule: [...new Set(byRule.get(first.rule).map((one) => one.selector))].join(', '),
      ...(first.at.length > 0 ? { at: first.at } : {})
    }

    for (const [path, token] of tokens) {
      const meta = ext(token)
      delete meta.redeclared
      const own = emissions.get(path) ?? []
      if (own.some((one) => one.layer.join('.') !== layer)) {
        problems.push(`${component.sassMap} puts ${meta.cssVar} in two layers, which theme.css cannot reproduce`)
      }
      const anchor = own.find((one) => one.rule === first.rule)?.order
      if (anchor === undefined) {
        problems.push(`${meta.cssVar} is not emitted in the rule the rest of ${component.sassMap} is`)
        continue
      }

      const later = (byProperty.get(meta.cssVar) ?? []).filter(
        (one) =>
          one.order > anchor &&
          // The other selectors of the map's own rule, which the override covers. A second
          // statement in that rule is a later rule like any other.
          !(one.rule === first.rule && tokenOf(one.value) === path) &&
          // An `!important` declaration wins over the override wherever it is.
          !one.important &&
          one.layer.join('.') === layer
      )
      if (later.length === 0) continue

      meta.redeclared = groupByRule(later).map((declarations) => {
        const [one] = declarations
        const owner = tokenOf(one.value)
        return {
          selector: declarations.map((declaration) => declaration.selector).join(', '),
          ...(one.at.length > 0 ? { at: one.at } : {}),
          // A rule a token map writes takes that token's value, which the theme may change.
          ...(owner ? { token: owner } : { value: one.value })
        }
      })
    }
  }

  return problems
}

/**
 * Consecutive declarations of one rule, one per selector of its list, back into one entry. A
 * rule can declare the same property twice — `.strength-bar` sets `--strength-color` from its
 * map, then to `transparent` — and each statement is its own entry.
 */
function groupByRule(declarations) {
  const groups = []
  for (const declaration of declarations) {
    const last = groups.at(-1)
    const same = last && last[0].rule === declaration.rule && !last.some((one) => one.selector === declaration.selector)
    if (same) last.push(declaration)
    else groups.push([declaration])
  }
  return groups
}

/**
 * The selectors of a rule's list, one by one: `.btn, .btn-link` is `['.btn', '.btn-link']`.
 * Shared with the Theme Builder, which names the variants in plain words.
 */
export const selectorsOf = (list) =>
  splitTopLevel(String(list), ',')
    .map((part) => part.trim())
    .filter(Boolean)
