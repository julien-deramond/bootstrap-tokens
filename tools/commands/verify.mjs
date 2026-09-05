/**
 * The acceptance test for the whole project.
 *
 * Compile upstream `bootstrap.scss` as-is, then compile it again with every token map
 * replaced by what the token document exports. If the token document is a faithful
 * representation, the two stylesheets are identical.
 */

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTokens, loadTree } from '../lib/load-fs.mjs'
import { emitUseWith } from '../lib/emit-scss.mjs'
import { withOverrides, diffResolved, themeCss, themeScss, clone } from '../lib/overrides.mjs'
import { index } from '../lib/tokens.mjs'
import { expandColorScales } from '../lib/color-scale.mjs'
import { resolveBootstrapSource, tokensDir } from '../lib/config.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'
import { sourceVersion } from './build.mjs'

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

export async function verify({ flags }) {
  const source = resolveBootstrapSource(flags.src)
  const doc = loadTokens(tokensDir)
  const version = sourceVersion()

  const work = mkdtempSync(join(tmpdir(), 'bstokens-'))
  const entry = join(work, 'custom.scss')
  writeFileSync(entry, emitUseWith(doc, { version, importPath: join(source, 'scss', 'bootstrap') }))

  console.log(`Compiling upstream (${source})…`)
  const upstream = await compile(join(source, 'scss', 'bootstrap.scss'), [source])

  console.log('Compiling the exported token configuration…')
  const ours = await compile(entry, [source])

  if (upstream !== ours) {
    return reportDifference(upstream, ours, work)
  }

  console.log(`✓ Identical output — ${lines(upstream).length} lines of CSS.`)

  // The full config above is not the path anyone uses. A theme carries only the keys it
  // changed, and that path is where preview and export can silently disagree.
  return verifyPartial(source, work)
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
async function verifyPartial(source, work) {
  const sass = await import('sass')
  const { tree } = loadTree(tokensDir)
  const base = index(expandColorScales(clone(tree)))
  const themed = withOverrides(tree, FIXTURE)

  const entry = join(work, 'partial.scss')
  writeFileSync(
    entry,
    themeScss(themed, FIXTURE, { version: sourceVersion(), importPath: join(source, 'scss', 'bootstrap') })
  )

  console.log('\nCompiling a partial theme export…')
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
    console.log(`✓ All ${predicted.length} previewed properties match the compiled export.`)
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

/**
 * Custom properties grouped by the selector they are declared on, ignoring anything inside a
 * conditional at-rule.
 *
 * Taking the last declaration in the file is wrong and produced a false failure on the first
 * run: upstream re-declares `--shadow-strength` under `[data-bs-theme=light]` and
 * `[data-bs-theme=dark]`, which are different rules, not overrides of `:root`.
 */
function customProperties(css) {
  const bySelector = new Map()
  const stack = []
  const conditionalDepth = []
  let buffer = ''
  let conditional = 0

  for (let i = 0; i < css.length; i++) {
    const ch = css[i]

    if (ch === '{') {
      // Comments accumulate into the prelude, so the banner above `:root, :host` became
      // part of the selector and nothing matched.
      const prelude = buffer.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      buffer = ''

      const atRule = prelude.startsWith('@')
      // `@layer` is not conditional — what is inside it always applies, it just sits lower
      // in the cascade. Treating it as conditional hid every token in `@layer colors`.
      if (atRule) {
        const isConditional = CONDITIONAL.test(prelude)
        conditionalDepth.push(isConditional ? 1 : 0)
        if (isConditional) conditional++
      }
      stack.push(atRule ? null : prelude)
      continue
    }

    if (ch === '}') {
      const prelude = stack.pop()
      if (prelude === null && conditionalDepth.length > 0) conditional -= conditionalDepth.pop()
      buffer = ''
      continue
    }

    if (ch === ';') {
      // Inside an at-rule the top of the stack is null, so walk out to the nearest selector.
      const selector = [...stack].reverse().find((entry) => entry !== null) ?? null
      const declaration = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(buffer.replace(/\/\*[\s\S]*?\*\//g, ''))

      if (selector && declaration && conditional === 0) {
        for (const part of selector.split(',').map((one) => one.trim())) {
          if (!bySelector.has(part)) bySelector.set(part, new Map())
          bySelector.get(part).set(declaration[1], declaration[2].trim())
        }
      }
      buffer = ''
      continue
    }

    buffer += ch
  }

  return bySelector
}

const CONDITIONAL = /^@(media|supports|container)\b/

/** The value a selector actually ends up with, following the base rule for `:root`. */
function valueOn(bySelector, selector, property) {
  return bySelector.get(selector)?.get(property)
}

/**
 * Sass re-serialises numbers on output: `.25rem` becomes `0.25rem` and a bare hue gains
 * `deg`. Both sides are normalised the same way so those differences do not read as bugs,
 * while a genuine value change still does.
 */
function normalise(value) {
  return String(value)
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(\d)deg\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
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
