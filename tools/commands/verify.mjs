/**
 * The acceptance test for the whole project.
 *
 * Compile upstream `bootstrap.scss` as-is, then compile it again with every token map
 * replaced by what the token document exports. If the token document is a faithful
 * representation, the two stylesheets are identical.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTokens, loadTree, loadOptions, loadMigrations } from '../lib/load-fs.mjs'
import { readThemeFile, reportTheme } from '../lib/theme-file.mjs'
import { emitUseWith } from '../lib/emit-scss.mjs'
import { withOverrides, diffResolved, themeCss, themeScss, clone } from '../lib/overrides.mjs'
import { index, walk, ext } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { describeBootstrapSource, resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'
import { customProperties, valueOn } from '../lib/css-parse.mjs'
import { parseCascade, effective, element, elementsFor, matches, compileSelector } from '../lib/css-cascade.mjs'
import { sourceVersion, cssDeclarations } from './build.mjs'

/**
 * A theme that exercises every kind of override the exporter routes differently: a scalar
 * that a whole scale derives from, a flat map key, a nested sub-key, a component token, and
 * one whose dark half is pinned outside any token map.
 */
const FIXTURE = {
  'color.blue.base': { value: 'oklch(58% 0.19 28)' },
  'spacing.base': { value: '1.25rem' },
  'radius.5': { value: '.875rem' },
  'theme-color.primary.bg': { value: '{color.green.500}' },
  'theme-color.warning.fg': { value: '{color.amber.700}', dark: '{color.amber.300}' },
  'alert.border-radius': { value: '{radius.9}' },
  'elevation.strength': { value: '.5' }
}

async function compile(entry, loadPaths) {
  const sass = await import('sass')
  const result = sass.compile(entry, { loadPaths, style: 'expanded', sourceMap: false })
  return result.css
}

/** Split a stylesheet into declaration-level lines for a readable diff. */
const lines = (css) => css.split('\n')

function firstDifferences(a, b, limit = 25) {
  const out = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max && out.length < limit; i++) {
    if (a[i] !== b[i]) out.push({ line: i + 1, upstream: a[i] ?? '<eof>', ours: b[i] ?? '<eof>' })
  }
  return out
}

/**
 * A theme file, or the built-in fixture.
 *
 * The fixture proves the *pipeline* works. It cannot prove that **your** theme works, which
 * is the question anyone about to ship one actually has — and the answer is not obvious,
 * because preview and export reach CSS by different routes. So the same check runs on
 * whatever you hand it.
 */
function themeToVerify(path, doc) {
  if (!path) return { overrides: FIXTURE, name: 'the built-in fixture', renamed: [], dropped: [] }

  const theme = readThemeFile(path, { doc, migrations: loadMigrations(tokensDir) })
  if (Object.keys(theme.overrides).length === 0 && theme.dropped.length === 0) {
    throw new Error(`${path} overrides nothing, so there is nothing to verify.`)
  }
  return theme
}

export async function verify({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const doc = loadTokens(tokensDir)
  const version = sourceVersion()

  const { line, warning } = describeBootstrapSource(source)
  console.log(line)
  if (warning) console.warn(`  warning: ${warning}`)

  const theme = themeToVerify(flags.theme, doc)
  // Before compiling anything: a theme that has quietly lost half its overrides would
  // otherwise be reported as verified, which is the one thing this command must never do.
  if (reportTheme(theme, { skipUnknown: Boolean(flags['skip-unknown']) })) return 1

  const work = mkdtempSync(join(tmpdir(), 'bstokens-'))
  const entry = join(work, 'custom.scss')
  // Options are included at their defaults: if emitting one changes the output, we have
  // captured it wrongly.
  writeFileSync(
    entry,
    emitUseWith(doc, {
      version,
      importPath: join(source, 'scss', 'bootstrap'),
      options: loadOptions(tokensDir)
    })
  )

  console.log('Compiling upstream…')
  const upstream = await compile(join(source, 'scss', 'bootstrap.scss'), [source])

  console.log('Compiling the exported token configuration…')
  const ours = await compile(entry, [source])

  if (upstream !== ours) {
    return reportDifference(upstream, ours, work)
  }

  console.log(`✓ Identical output — ${lines(upstream).length} lines of CSS.`)

  const cssRoute = verifyCssExport(upstream, doc)
  if (cssRoute !== 0) return cssRoute

  // The full config above is not the path anyone uses. A theme carries only the keys it
  // changed, and that path is where preview and export can silently disagree.
  return verifyPartial(source, work, theme, upstream)
}

/**
 * `build/css/tokens.css` never goes through Sass, and nothing was checking it.
 *
 * The Sass export is proved byte-identical, which is a strong result and covers exactly one
 * of the three routes out of this document. The CSS export is assembled here in JavaScript,
 * and it shipped two whole classes of broken value before anything compared it: Sass strings
 * emitted with their quotes, so `font-family` named one family with commas in it and matched
 * nothing; and `#{…}` interpolation left in, so every icon and every box shadow was
 * `#{url(…)}`.
 *
 * Both are invisible unless you look at a browser or at upstream's own output. So compare
 * against upstream's output, per selector, modulo the ways Sass reformats.
 */
function verifyCssExport(upstreamCss, doc) {
  const theirs = customProperties(upstreamCss)
  const { root, scoped } = cssDeclarations(doc)

  const ours = [
    ...root.map((declaration) => [':root, :host', declaration]),
    ...[...scoped].flatMap(([selector, declarations]) =>
      declarations.map((declaration) => [selector, declaration])
    )
  ]

  const mismatches = []
  const unmatched = []
  let compared = 0

  for (const [selector, [property, value]] of ours) {
    const upstreamValue = valueOn(theirs, selector, property)
    // Upstream declares some of these under a compound selector we do not model one-to-one.
    // That is a modeling question rather than a value question — but it is counted and
    // printed, because a check that quietly skips half its subject is how this one reported
    // success while every global token went uncompared.
    if (upstreamValue === undefined) {
      unmatched.push(`${property} (${selector})`)
      continue
    }

    compared++
    if (normalize(upstreamValue) !== normalize(value)) {
      mismatches.push({ selector, property, upstream: upstreamValue, ours: value })
    }
  }

  if (mismatches.length === 0) {
    const skipped = unmatched.length > 0 ? `; ${unmatched.length} not declared there to compare` : ''
    console.log(`✓ The CSS export matches upstream on all ${compared} shared declarations${skipped}.`)
    return 0
  }

  console.error(`\n✗ ${mismatches.length} of ${compared} CSS declarations differ from upstream:`)
  for (const { selector, property, upstream, ours: mine } of mismatches.slice(0, 20)) {
    console.error(`  ${property}  (${selector})`)
    console.error(`    upstream: ${String(upstream).slice(0, 150)}`)
    console.error(`    ours:     ${String(mine).slice(0, 150)}`)
  }
  return 1
}

/**
 * Compile a partial export and assert that a page using it gets what the chooser previewed.
 *
 * Preview and export share a resolver, but they take different routes to CSS: the preview
 * resolves in JavaScript and paints unlayered rules over compiled Bootstrap, the export hands
 * symbolic values to Sass and lets Bootstrap place them inside its layers. Two bugs have
 * already shipped where those routes disagreed — `--spacer`, which upstream used to hardcode,
 * and `--shadow-strength`, which upstream re-declares under `[data-bs-theme]`.
 *
 * The second one passed this check for a long time, because it compared each property at the
 * selector it is declared on, and that selector was right. What was wrong was a later rule
 * with the same specificity, which wins on any page with `data-bs-theme="light"`. So this
 * compares the value that reaches an element on a real page instead, in every page context,
 * for every token — not only the changed ones, so an export that changes more than the
 * preview showed fails too.
 */
async function verifyPartial(source, work, theme, upstreamCss) {
  const sass = await import('sass')
  const { tree } = loadTree(tokensDir)
  const base = index(expandColorScales(clone(tree)))
  const themed = withOverrides(tree, theme.overrides)

  const entry = join(work, 'partial.scss')
  writeFileSync(
    entry,
    themeScss(themed, theme.overrides, {
      version: sourceVersion(),
      importPath: join(source, 'scss', 'bootstrap')
    })
  )

  console.log(`\nCompiling ${theme.name} as a partial theme export…`)
  const compiled = sass.compile(entry, { loadPaths: [source], style: 'expanded', sourceMap: false }).css

  // Exactly what web/preview.html paints: compiled Bootstrap, then the unlayered
  // #token-overrides style. theme.css ships the same rules.
  const reference = `${upstreamCss}\n${themeCss(diffResolved(base, themed))}`

  const result = comparePreview(reference, compiled, themed)
  return reportPreview(result, theme.name)
}

/** The viewport width the failing comparisons use: a phone, where no breakpoint has kicked in. */
const BASELINE_WIDTH = 375

/** Every page a theme can land on: the OS preference, crossed with the attribute or its absence. */
const PAGES = ['light', 'dark'].flatMap((os) =>
  [null, 'light', 'dark'].map((attribute) => ({ os, attribute }))
)

/**
 * Compare what a preview stylesheet and a compiled stylesheet give each token's custom
 * property on a real page. Pure: no Sass, no files, no Bootstrap checkout.
 *
 * Every token with a CSS variable is probed where it is read — global tokens on `<html>`,
 * component tokens on an element built from the component's selector — in each of the six
 * page contexts, and again with `data-bs-theme` light and dark on the element itself, which
 * is how Bootstrap documents a dark navbar. A difference there is a failure.
 *
 * Two more families of probe only warn: the plain element in the same page contexts at
 * every wider viewport width a media query on a custom property starts at, and the
 * component under each modifier class either stylesheet re-declares its properties for
 * (`.btn-solid`, `.pagination-sm`, `.chip.active`…). The preview paints its
 * overrides unlayered, so they beat those modifiers, while the Sass export lands in the
 * layer where the modifiers win. That is a gap in the preview rather than in the export, and
 * failing on it would turn every theme that edits a component token red.
 *
 * Returns `{ failures, warnings, counts }`; each difference carries the property, its token
 * path, where it was probed, and the value and winning selector on each side.
 */
export function comparePreview(referenceCss, compiledCss, doc, { baseline = BASELINE_WIDTH } = {}) {
  const reference = parseCascade(referenceCss)
  const compiled = parseCascade(compiledCss)
  const targets = probeTargets(doc)
  const widths = [...new Set([...reference.widths, ...compiled.widths])].filter((width) => width > baseline)

  const failures = []
  const warnings = []
  const counts = { properties: 0, comparisons: 0, widths, modifiers: 0, extra: 0 }

  // Two tokens can share a custom property on the same element — `navbar.color` and
  // `navbar-dark.navbar-color` both set `--navbar-color` on a dark navbar. One probe, one
  // line in the report, both paths named.
  const seen = new Map()
  const failedAt = (cssVar, label, page) => seen.get(keyOf(cssVar, label, page, baseline)) != null

  const probe = (list, kind, { path, cssVar }, label, nodes, page, width) => {
    const key = keyOf(cssVar, label, page, width)
    if (seen.has(key)) {
      seen.get(key)?.paths.push(path)
      return
    }
    if (kind === 'theme') counts.comparisons++
    else counts.extra++

    const chain = pageChain(page, nodes)
    const env = { colorScheme: page.os, width }
    const ours = effective(reference, cssVar, chain, env)
    const theirs = effective(compiled, cssVar, chain, env)
    const a = ours?.value ?? ''
    const b = theirs?.value ?? ''
    if (a === b || normalize(a) === normalize(b)) {
      seen.set(key, null)
      return
    }

    const difference = { property: cssVar, paths: [path], page, element: label, width: kind === 'width' ? width : null, kind }
    difference.preview = side(ours)
    difference.compiled = side(theirs)
    seen.set(key, difference)
    list.push(difference)
  }

  // What fails: every page context, on the element and with the theme attribute on it.
  for (const target of targets) {
    counts.properties += target.tokens.length
    const probes = probesFor(target)
    for (const { label, nodes } of probes) {
      for (const page of PAGES) {
        for (const token of target.tokens) probe(failures, 'theme', token, label, nodes, page, baseline)
      }
    }
  }

  // What warns: the plain element at wider widths, and the element under its modifiers.
  for (const target of targets) {
    const plain = target.nodes.at(-1).root ? [] : target.nodes
    for (const page of PAGES) {
      for (const token of target.tokens) {
        if (failedAt(token.cssVar, target.label, page)) continue
        for (const width of widths) probe(warnings, 'width', token, target.label, plain, page, width)
      }
    }

    for (const modifier of modifiersOf(target, reference, compiled)) {
      counts.modifiers++
      for (const page of PAGES) {
        for (const token of target.tokens) {
          if (failedAt(token.cssVar, target.label, page)) continue
          probe(warnings, 'modifier', token, modifier.label, modifier.nodes, page, baseline)
        }
      }
    }
  }

  return { failures, warnings, counts }
}

const keyOf = (cssVar, label, page, width) => [cssVar, label, page.os, page.attribute, width].join('|')

const side = (declaration) =>
  declaration ? { value: declaration.value, selector: declaration.selector } : { value: '(not set)', selector: null }

/**
 * Tokens grouped by the element that reads them. Components marked `inert` are skipped:
 * upstream never emits their map, so there is nothing on a page to compare.
 */
function probeTargets(doc) {
  const bySelector = new Map()

  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (!meta.cssVar) continue

    const component = COMPONENTS.find((one) => one.sassMap === meta.sassMap)
    if (component?.inert) continue

    const selector = component ? component.selector.split(',')[0].trim() : ':root'
    if (!bySelector.has(selector)) bySelector.set(selector, [])
    bySelector.get(selector).push({ path, cssVar: meta.cssVar })
  }

  return [...bySelector].map(([selector, tokens]) => {
    const nodes = elementsFor(selector)
    if (!nodes) throw new Error(`verify cannot build an element for the component selector "${selector}".`)
    return { selector, tokens, nodes, label: describe(nodes) }
  })
}

/**
 * Where a target is probed: the element itself, then with `data-bs-theme` light and dark on
 * it — unless its own selector already sets the attribute, as the dark navbar's does.
 * Global tokens are read on `<html>`; for them the themed element is a plain `<div>`.
 */
function probesFor(target) {
  const own = target.nodes.at(-1)
  if (own.root) {
    return [
      { label: target.label, nodes: [] },
      ...['light', 'dark'].map((theme) => {
        const nodes = [{ tag: 'div', classes: [], attributes: { 'data-bs-theme': theme }, root: false }]
        return { label: describe(nodes), nodes }
      })
    ]
  }

  const probes = [{ label: target.label, nodes: target.nodes }]
  if (own.attributes['data-bs-theme'] !== undefined) return probes

  for (const theme of ['light', 'dark']) {
    const nodes = [...target.nodes.slice(0, -1), { ...own, attributes: { ...own.attributes, 'data-bs-theme': theme } }]
    probes.push({ label: describe(nodes), nodes })
  }
  return probes
}

/** `<html>` with the page's attribute, then a `<body>` and the probed elements, if any. */
function pageChain(page, nodes) {
  const html = element({
    tag: 'html',
    root: true,
    attributes: page.attribute ? { 'data-bs-theme': page.attribute } : {}
  })
  if (nodes.length === 0) return [html]
  return [html, element({ tag: 'body' }), ...nodes.map((node) => element({ ...node, tag: node.tag ?? 'div' }))]
}

/**
 * The modifier classes worth probing a component under: every selector, in either
 * stylesheet, that re-declares one of the component's properties and does not already
 * apply to the plain component in some page context. Each becomes the component's own
 * element with the modifier's classes and attributes added.
 */
function modifiersOf(target, reference, compiled) {
  const own = target.nodes.at(-1)
  if (own.root) return []

  const properties = new Set(target.tokens.map(({ cssVar }) => cssVar))
  const seen = new Set()
  const out = []

  for (const sheet of [reference, compiled]) {
    for (const property of properties) {
      for (const declaration of sheet.byProperty.get(property) ?? []) {
        const { compiled: selector } = declaration
        if (!selector.matchable || seen.has(selector.text)) continue
        seen.add(selector.text)

        const plain = PAGES.some((page) => {
          const chain = pageChain(page, target.nodes)
          return matches(selector, chain)
        })
        if (plain) continue

        const nodes = mergeModifier(target.nodes, elementsFor(selector.text))
        if (!nodes) continue
        const chain = pageChain({ attribute: null }, nodes)
        if (!matches(selector, chain)) continue
        if (!matches(compileSelector(target.selector), chain)) continue

        out.push({ label: describe(nodes), nodes })
      }
    }
  }

  return out
}

/** The component's elements with a modifier selector's last compound folded into its own. */
function mergeModifier(base, modifier) {
  if (!modifier || modifier.some((node) => node.root)) return null
  const own = base.at(-1)
  const last = modifier.at(-1)
  if (last.tag && own.tag && last.tag !== own.tag) return null

  const merged = {
    tag: own.tag ?? last.tag,
    classes: [...new Set([...own.classes, ...last.classes])],
    attributes: { ...own.attributes, ...last.attributes },
    root: false
  }
  // A modifier that only adds data-bs-theme is a theme case, and those are probed already.
  return [...modifier.slice(0, -1), ...base.slice(0, -1), merged]
}

/** An element written the way someone would type it: `<div class="btn btn-solid">`. */
function describe(nodes) {
  if (nodes.length === 0) return '<html>'
  return nodes
    .map(({ tag, classes, attributes, root }) => {
      const name = root ? 'html' : tag ?? 'div'
      const parts = [name]
      if (classes.length > 0) parts.push(`class="${[...classes].sort().join(' ')}"`)
      for (const [attribute, value] of Object.entries(attributes)) parts.push(`${attribute}="${value}"`)
      return `<${parts.join(' ')}>`
    })
    .join(' ')
}

/** `<html data-bs-theme="light">`, and the OS preference when it matters. */
function describePages(pages) {
  const byAttribute = new Map()
  for (const page of pages) {
    if (!byAttribute.has(page.attribute)) byAttribute.set(page.attribute, new Set())
    byAttribute.get(page.attribute).add(page.os)
  }
  return [...byAttribute]
    .map(([attribute, systems]) => {
      const html = attribute ? `<html data-bs-theme="${attribute}">` : '<html>'
      return systems.size === 2 ? html : `${html} (OS ${[...systems][0]})`
    })
    .join(', ')
}

const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

/**
 * One line per difference, with the page contexts and widths it shows in gathered together:
 * `--shadow-strength (elevation.strength) on <html data-bs-theme="light">: preview 0.5 from
 * [data-bs-theme="light"], compiled 1 from [data-bs-theme=light]`.
 */
export function describeDifferences(differences) {
  const groups = new Map()
  for (const difference of differences) {
    const { property, paths, element: label, kind, preview, compiled } = difference
    const key = [property, paths.join(), label, kind, preview.value, preview.selector, compiled.value, compiled.selector].join('\u0000')
    if (!groups.has(key)) groups.set(key, { ...difference, pages: new Map(), widths: new Set() })
    const group = groups.get(key)
    group.pages.set(`${difference.page.os}|${difference.page.attribute}`, difference.page)
    if (difference.width) group.widths.add(difference.width)
  }

  return [...groups.values()].map(({ property, paths, element: label, pages, widths, preview, compiled }) => {
    const every = pages.size === PAGES.length
    const where = every
      ? `${label}, in every page context`
      : label === '<html>'
        ? describePages([...pages.values()])
        : `${label} in ${describePages([...pages.values()])}`
    const at = widths.size > 0 ? ` at ${list([...widths].sort((a, b) => a - b).map(String))}px wide` : ''
    const from = ({ value, selector }) => (selector ? `${clip(value)} from ${selector}` : value)
    return `${property} (${[...new Set(paths)].join(', ')}) on ${where}${at}: preview ${from(preview)}, compiled ${from(compiled)}`
  })
}

const clip = (value) => (value.length > 90 ? `${value.slice(0, 87)}…` : value)

function reportPreview({ failures, warnings, counts }, name) {
  const number = (n) => n.toLocaleString('en-US')
  const scope =
    `${number(counts.properties)} properties, each on the element that reads it in ${PAGES.length} page contexts, ` +
    `bare and with data-bs-theme light and dark on it (${number(counts.comparisons)} comparisons at ${BASELINE_WIDTH}px)`
  const extra =
    `  Also compared at ${counts.widths.length} wider ${counts.widths.length === 1 ? 'width' : 'widths'} and under ` +
    `${counts.modifiers} modifier ${counts.modifiers === 1 ? 'selector' : 'selectors'} ` +
    `(${number(counts.extra)} comparisons), which only warn.`

  if (warnings.length > 0) {
    const lines = describeDifferences(warnings)
    console.warn(
      `\n⚠ ${lines.length} ${lines.length === 1 ? 'difference shows' : 'differences show'} only at a wider ` +
        'viewport or under a modifier class. The preview paints a component override on every variant, ' +
        'while the compiled Sass leaves variants on Bootstrap’s own values. These do not fail verify:'
    )
    for (const line of lines.slice(0, 15)) console.warn(`  ${line}`)
    if (lines.length > 15) console.warn(`  …and ${lines.length - 15} more.`)
  }

  if (failures.length === 0) {
    console.log(`✓ ${upperFirst(name)} compiles to what the preview paints: ${scope}.`)
    console.log(extra)
    return 0
  }

  const lines = describeDifferences(failures)
  const properties = new Set(failures.map(({ property }) => property)).size
  console.error(
    `\n✗ ${properties} ${properties === 1 ? 'property compiles' : 'properties compile'} to something other than ` +
      `what the preview paints, over ${scope}:`
  )
  for (const line of lines.slice(0, 20)) console.error(`  ${line}`)
  if (lines.length > 20) console.error(`  …and ${lines.length - 20} more.`)
  return 1
}

const upperFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Sass re-serialises on output, and none of it changes what a browser paints.
 *
 * `.25rem` becomes `0.25rem`, a bare hue gains `deg`, modern color syntax is rewritten as
 * `rgba()`, redundant parentheses inside `calc()` are dropped, and a division of two
 * constants is folded. Both sides are normalized the same way, so none of that reads as a
 * bug — while a genuine value change still does.
 */
function normalize(value) {
  return (
    String(value)
      .replace(/(^|[\s(,\/-])\.(\d)/g, '$10.$2')
      .replace(/(\d)deg\b/g, '$1')
      // `rgb(0 0 0 / 50%)` and `rgba(0, 0, 0, 0.5)` are the same color written twice.
      .replace(
        /\brgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,\/]\s*([\d.]+%?))?\s*\)/g,
        (_, r, g, b, a) => `rgb(${r} ${g} ${b} / ${alphaOf(a)})`
      )
      .replace(/\s*\/\s*/g, ' / ')
      // Sass flattens a `calc()` inside a `calc()`, and drops parentheses a browser would
      // have applied anyway. `calc(a - calc(b * 2))` and `calc(a - b * 2)` are one value.
      .replace(/\bcalc\(\s*(var\(--[\w-]+\)\s*[*/]\s*[\d.]+)\s*\)/g, '$1')
      .replace(/\(\s*(var\(--[\w-]+\)\s*[*/]\s*[\d.]+)\s*\)/g, '$1')
      // Sass folds a division of two constants; CSS leaves it for the browser. Same number.
      .replace(/\bcalc\(\s*([\d.]+)\s*([*/+-])\s*([\d.]+)\s*\)/g, (whole, a, operator, b) => {
        const result = { '*': (x, y) => x * y, '/': (x, y) => x / y, '+': (x, y) => x + y, '-': (x, y) => x - y }
        return round(result[operator](Number(a), Number(b)))
      })
      // Sass rounds to ten decimal places on output, so compare at a precision below that.
      .replace(/\d+\.\d{5,}/g, (number) => round(Number(number)))
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const round = (n) => String(Number(n.toFixed(6)))

/** Alpha as a fraction, whichever of the two ways it was written. */
function alphaOf(text) {
  if (text === undefined) return '1'
  const number = Number.parseFloat(text)
  return String(text.endsWith('%') ? number / 100 : number)
}

function reportDifference(upstream, ours, work) {

  const differences = firstDifferences(lines(upstream), lines(ours))
  const upstreamPath = join(work, 'upstream.css')
  const oursPath = join(work, 'ours.css')
  writeFileSync(upstreamPath, upstream)
  writeFileSync(oursPath, ours)

  console.error(`\n✗ Output differs (${differences.length}+ differing lines).`)
  for (const { line, upstream: a, ours: b } of differences) {
    console.error(`  line ${line}`)
    console.error(`    upstream: ${a.trim()}`)
    console.error(`    ours:     ${b.trim()}`)
  }
  console.error(`\n  ${upstreamPath}\n  ${oursPath}\n  diff them with: diff ${upstreamPath} ${oursPath}`)
  return 1
}
