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
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'
import { customProperties, valueOn } from '../lib/css-parse.mjs'
import { sourceVersion, cssDeclarations } from './build.mjs'

/** Where a map's tokens are emitted. Component maps land on their own class. */
const selectorFor = (sassMap) =>
  COMPONENTS.find((component) => component.sassMap === sassMap)?.selector ?? ':root'

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

  console.log(`Compiling upstream (${source})…`)
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
  return verifyPartial(source, work, theme)
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
    // That is a modelling question rather than a value question — but it is counted and
    // printed, because a check that quietly skips half its subject is how this one reported
    // success while every global token went uncompared.
    if (upstreamValue === undefined) {
      unmatched.push(`${property} (${selector})`)
      continue
    }

    compared++
    if (normalise(upstreamValue) !== normalise(value)) {
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
 * Compile a partial export and assert every custom property it produces matches what the
 * chooser previewed for the same overrides.
 *
 * Preview and export share a resolver, but they take different routes to CSS: the preview
 * resolves in JavaScript, the export hands symbolic values to Sass and lets it recompute.
 * Two bugs have already shipped where those routes disagreed — `--spacer`, which upstream
 * hardcodes, and `--shadow-strength`, which dark mode pins outside any token map. Nothing
 * checked for a third.
 */
async function verifyPartial(source, work, theme) {
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
  const css = sass.compile(entry, { loadPaths: [source], style: 'expanded', sourceMap: false }).css
  const compiled = customProperties(css)

  const predicted = diffResolved(base, themed)
  const mismatches = []

  for (const change of predicted) {
    const { cssVar, value, path, sassMap } = change
    const selector = selectorFor(sassMap)
    const actual = valueOn(compiled, selector, cssVar)

    if (actual === undefined) {
      mismatches.push({ cssVar, path, predicted: value, actual: `(not declared on ${selector})` })
      continue
    }
    if (normalise(actual) !== normalise(value)) {
      mismatches.push({ cssVar, path, predicted: value, actual })
    }
  }

  if (mismatches.length === 0) {
    const count = predicted.length
    console.log(`✓ All ${count} previewed ${count === 1 ? 'property matches' : 'properties match'} the compiled export.`)
    return 0
  }

  console.error(`\n✗ ${mismatches.length} of ${predicted.length} previewed properties differ from the compiled export:`)
  for (const { cssVar, path, predicted: want, actual } of mismatches.slice(0, 20)) {
    console.error(`  ${cssVar}  (${path})`)
    console.error(`    preview:  ${want}`)
    console.error(`    compiled: ${actual}`)
  }
  return 1
}


/** The value a selector actually ends up with, following the base rule for `:root`. */
/**
 * Sass re-serialises on output, and none of it changes what a browser paints.
 *
 * `.25rem` becomes `0.25rem`, a bare hue gains `deg`, modern colour syntax is rewritten as
 * `rgba()`, redundant parentheses inside `calc()` are dropped, and a division of two
 * constants is folded. Both sides are normalised the same way, so none of that reads as a
 * bug — while a genuine value change still does.
 */
function normalise(value) {
  return (
    String(value)
      .replace(/(^|[\s(,\/-])\.(\d)/g, '$10.$2')
      .replace(/(\d)deg\b/g, '$1')
      // `rgb(0 0 0 / 50%)` and `rgba(0, 0, 0, 0.5)` are the same colour written twice.
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
