/**
 * An accessibility report you can attach to a pull request.
 *
 * The chooser already warns while you work, which is the right place for it — but a warning
 * that lives in a browser tab cannot be reviewed, cannot be diffed, and cannot block a
 * merge. This is the same audit as a file: every pair a reader has to be able to see,
 * measured by WCAG 2 and by APCA, in both colour schemes.
 *
 * The rendering lives in `tools/lib/report.mjs` so the chooser can produce the identical
 * document from the browser.
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { loadTokens, loadTree } from '../lib/load-fs.mjs'
import { tokensDir } from '../lib/config.mjs'
import { reportFor, markdown, html } from '../lib/report.mjs'
import { sourceVersion } from './build.mjs'

function readTheme(path) {
  if (!path) return { overrides: {}, name: 'Bootstrap defaults' }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed.overrides !== 'object') {
    throw new Error(`${path} is not a theme file — expected an "overrides" object.`)
  }
  return { overrides: parsed.overrides, name: parsed.name ?? path }
}

const FORMATS = { md: markdown, html, json: (data) => `${JSON.stringify(data, null, 2)}\n` }

/** What `--fail-on` can gate on, loosest first. */
const GATES = {
  never: () => false,
  regression: (summary) => summary.regressed > 0,
  introduced: (summary) => summary.introduced > 0 || summary.regressed > 0,
  any: (summary) => summary.wcagFail > 0
}

export async function report({ flags }) {
  const { overrides, name } = readTheme(flags.theme)
  const { tree } = loadTree(tokensDir)
  const data = reportFor(tree, loadTokens(tokensDir), overrides, {
    theme: name,
    version: sourceVersion()
  })

  const format = flags.format ?? (flags.out?.endsWith('.html') ? 'html' : 'md')
  const render = FORMATS[format]
  if (!render) throw new Error(`Unknown format "${format}" — expected md, html or json.`)

  const output = render(data)
  if (flags.out) {
    writeFileSync(flags.out, output)
    console.log(`  ${data.summary.audited} pairs → ${flags.out}`)
  } else {
    process.stdout.write(output)
  }

  const gate = GATES[flags['fail-on'] ?? 'never']
  if (!gate) {
    throw new Error(`Unknown --fail-on "${flags['fail-on']}" — expected ${Object.keys(GATES).join(', ')}.`)
  }

  if (gate(data.summary)) {
    const { introduced, regressed, inherited } = data.summary
    console.error(`\n✗ ${introduced} introduced, ${regressed} regressed, ${inherited} inherited.`)
    return 1
  }
  return 0
}
