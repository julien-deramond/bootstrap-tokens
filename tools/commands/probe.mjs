/**
 * Write a self-contained page that measures the flattened colours against a real browser.
 *
 * `verify` proves the exported Sass compiles to the same CSS as upstream. That says nothing
 * about the *flat* export, whose whole job is to compute what a browser would have computed
 * — `color-mix()` in OKLCH, `light-dark()` resolved, `var()` chased — for tools that cannot
 * do any of it. The only honest way to check that is to ask a browser.
 *
 * The page inlines everything it needs, so it can be opened from disk with no server, and
 * prints a table plus a JSON block ready to paste into
 * `tools/test/fixtures/chrome-colors.json`.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { tokensDir, repoRoot } from '../lib/config.mjs'
import { ext, walk } from '../lib/tokens.mjs'
import { flattenColors } from '../lib/flatten.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'
import { cssDeclarations } from './build.mjs'

const escapeForScript = (json) => json.replace(/</g, '\\u003c')

export async function probe({ flags }) {
  const doc = loadTokens(tokensDir)
  const { root, scoped } = cssDeclarations(doc)
  const light = flattenColors(doc, { mode: 'light' })
  const dark = flattenColors(doc, { mode: 'dark' })

  const tokens = []
  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (!meta.cssVar || !light.colors.has(path)) continue
    const component = COMPONENTS.find((candidate) => candidate.sassMap === meta.sassMap)
    tokens.push({
      path,
      cssVar: meta.cssVar,
      selector: component?.selector ?? null,
      light: light.colors.get(path),
      dark: dark.colors.get(path)
    })
  }

  const data = { root, scoped: [...scoped], tokens }
  const colorSource = readFileSync(join(repoRoot, 'tools', 'lib', 'color.mjs'), 'utf8')
  const out = flags.out ?? join(repoRoot, 'build', 'probe.html')

  writeFileSync(out, page(data, colorSource))
  console.log(`  ${tokens.length} colour tokens × 2 schemes → ${out}`)
  console.log('\nOpen it in a browser. It compares every value against getComputedStyle and')
  console.log('prints a fixture block for tools/test/fixtures/chrome-colors.json.')
  return 0
}

const page = (data, colorSource) => `<!doctype html>
<meta charset="utf-8">
<title>Flattened colours vs. this browser</title>
<style>
  :root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif }
  body { margin: 2rem; max-width: 60rem }
  h1 { font-size: 1.25rem }
  .verdict { padding: .75rem 1rem; border-radius: .5rem; font-weight: 600 }
  .pass { background: #e7f6ec; color: #10431f }
  .fail { background: #fdeaea; color: #5a1414 }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem }
  th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid #8883 }
  td.sw span { display: inline-block; width: 1rem; height: 1rem; vertical-align: -2px;
               border: 1px solid #8886; border-radius: 3px }
  textarea { width: 100%; height: 14rem; margin-top: 1rem; font: 12px/1.4 ui-monospace, monospace }
  #stage { position: absolute; visibility: hidden; pointer-events: none }
</style>
<h1>Flattened colours vs. this browser</h1>
<div id="verdict" class="verdict">Measuring…</div>
<div id="report"></div>
<div id="stage"></div>
<script type="module">
${colorSource}

const data = ${escapeForScript(JSON.stringify(data))}
const byBox = new Map(data.scoped)
const stage = document.getElementById('stage')
const results = []
const SENTINELS = ['rgb(1, 2, 3)', 'rgb(253, 252, 251)']

for (const mode of ['light', 'dark']) {
  const host = document.createElement('div')
  host.style.colorScheme = mode
  for (const [name, value] of data.root) host.style.setProperty(name, value)
  stage.appendChild(host)

  const boxes = new Map()
  const boxFor = (selector) => {
    if (selector === null) return host
    if (!boxes.has(selector)) {
      const box = document.createElement('div')
      for (const [name, value] of byBox.get(selector) ?? []) box.style.setProperty(name, value)
      host.appendChild(box)
      boxes.set(selector, box)
    }
    return boxes.get(selector)
  }

  /*
   * Whether a var() chain resolved cannot be read off the computed value: when it fails,
   * the colour becomes invalid at computed-value time and inherits, and the inherited value
   * is a perfectly ordinary colour. So measure twice against two different parents.
   * A value that follows the parent both times did not resolve — the declaration referenced
   * a custom property that a real ancestor would have supplied, which an isolated box has
   * no way to provide. A value that is the same both times resolved.
   */
  for (const token of data.tokens) {
    const box = boxFor(token.selector)
    const readings = SENTINELS.map((sentinel) => {
      const carrier = document.createElement('span')
      carrier.style.color = sentinel
      box.appendChild(carrier)
      const probe = document.createElement('span')
      probe.style.color = \`var(\${token.cssVar})\`
      carrier.appendChild(probe)
      const raw = getComputedStyle(probe).color
      carrier.remove()
      return raw
    })
    results.push({ mode, ...token, raw: readings[0], inherited: readings[0] !== readings[1] })
  }
  host.remove()
}

const channel = (hex, i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
const ALPHA = /\\/\\s*([\\d.]+)\\s*\\)|rgba\\([^)]*,\\s*([\\d.]+)\\s*\\)/

const mismatches = []
const measured = { light: {}, dark: {} }
let compared = 0
let unresolvable = 0

for (const result of results) {
  const ours = result[result.mode]
  if (result.inherited) { unresolvable++; continue }
  const rgb = parseComputedColor(result.raw)
  if (!rgb) { unresolvable++; continue }

  const found = ALPHA.exec(result.raw)
  const browserAlpha = found ? Number(found[1] ?? found[2]) : 1
  const ourAlpha = ours.length > 7 ? Number.parseInt(ours.slice(7), 16) / 255 : 1
  const browserHex = rgbToHex(rgb)
  measured[result.mode][result.path] =
    browserAlpha >= 1 ? browserHex : browserHex + Math.round(browserAlpha * 255).toString(16).padStart(2, '0')

  compared++
  const delta = Math.max(...[0, 1, 2].map((i) => Math.abs(channel(ours, i) - channel(browserHex, i))))
  // One level of 8-bit rounding is not a disagreement about the colour.
  if (delta > 1 || Math.abs(browserAlpha - ourAlpha) > 0.01) {
    mismatches.push({ ...result, browserHex, ours, delta })
  }
}

const verdict = document.getElementById('verdict')
verdict.className = 'verdict ' + (mismatches.length === 0 ? 'pass' : 'fail')
verdict.textContent = mismatches.length === 0
  ? \`\${compared} values match this browser exactly (\${unresolvable} need an ancestor and were skipped).\`
  : \`\${mismatches.length} of \${compared} values differ from this browser.\`

const report = document.getElementById('report')
if (mismatches.length > 0) {
  report.innerHTML =
    '<table><tr><th>Token</th><th>Mode</th><th>Browser</th><th></th><th>Ours</th><th></th><th>Δ</th></tr>' +
    mismatches.map((m) => \`<tr><td>\${m.path}</td><td>\${m.mode}</td><td>\${m.browserHex}</td>\` +
      \`<td class="sw"><span style="background:\${m.browserHex}"></span></td><td>\${m.ours}</td>\` +
      \`<td class="sw"><span style="background:\${m.ours}"></span></td><td>\${m.delta}</td></tr>\`).join('') +
    '</table>'
}

const fixture = document.createElement('textarea')
fixture.readOnly = true
fixture.value = JSON.stringify(
  { browser: (navigator.userAgent.match(/(Chrome|Firefox|Version)\\/[\\d.]+/) ?? ['unknown'])[0],
    measured: new Date().toISOString().slice(0, 10), ...measured }, null, 2)
report.appendChild(fixture)
</script>
`
