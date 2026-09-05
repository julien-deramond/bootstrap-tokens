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

import { writeFileSync } from 'node:fs'

import { loadTokens, loadTree, loadMigrations } from '../lib/load-fs.mjs'
import { tokensDir } from '../lib/config.mjs'
import { readThemeFile, reportTheme } from '../lib/theme-file.mjs'
import { reportFor, markdown, html } from '../lib/report.mjs'
import { sourceVersion } from './build.mjs'

const FORMATS = { md: markdown, html, json: (data) => `${JSON.stringify(data, null, 2)}\n` }

/** What `--fail-on` can gate on, loosest first. */
const GATES = {
  never: () => false,
  regression: (summary) => summary.regressed > 0,
  introduced: (summary) => summary.introduced > 0 || summary.regressed > 0,
  // Status roles carry meaning by colour, so two of them collapsing into one is a defect
  // whatever the contrast numbers say — and the contrast numbers will say it is fine.
  vision: (summary) =>
    summary.introduced > 0 || summary.regressed > 0 || summary.statusCollisions > 0,
  any: (summary) => summary.wcagFail > 0 || summary.collisions > 0
}

export async function report({ flags }) {
  const base = loadTokens(tokensDir)
  const theme = readThemeFile(flags.theme, { doc: base, migrations: loadMigrations(tokensDir) })
  if (reportTheme(theme, { skipUnknown: Boolean(flags['skip-unknown']) })) return 1

  const { tree } = loadTree(tokensDir)
  const data = reportFor(tree, base, theme.overrides, {
    theme: theme.name,
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
    const { introduced, regressed, inherited, statusCollisions } = data.summary
    console.error(
      `\n✗ ${introduced} introduced, ${regressed} regressed, ${inherited} inherited` +
        (statusCollisions > 0 ? `, ${statusCollisions} status role pair(s) indistinguishable` : '') +
        '.'
    )
    return 1
  }
  return 0
}
