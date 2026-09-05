/**
 * The contrast audit, and the two ways it is rendered.
 *
 * Kept out of the command because the chooser runs it too: this file imports nothing from
 * Node, so the browser generates the same report the CLI does rather than a second,
 * drifting approximation of it.
 */

import { withOverrides, clone } from './overrides.mjs'
import { auditContrast } from './contrast.mjs'

const MODES = ['light', 'dark']

function readTheme(path) {
  if (!path) return { overrides: {}, name: 'Bootstrap defaults' }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (!parsed || typeof parsed.overrides !== 'object') {
    throw new Error(`${path} is not a theme file — expected an "overrides" object.`)
  }
  return { overrides: parsed.overrides, name: parsed.name ?? path }
}

/** Every pair in both schemes, with what the same pair scored before the theme. */
export function audit(doc, base) {
  const before = new Map()
  for (const mode of MODES) {
    for (const row of auditContrast(base, { mode })) before.set(`${mode}:${row.path}`, row)
  }

  const rows = []
  for (const mode of MODES) {
    for (const row of auditContrast(doc, { mode })) {
      const previous = before.get(`${mode}:${row.path}`)
      /*
       * "Inherited" is about the colours, not the score. A pair whose two ends are exactly
       * what Bootstrap ships is Bootstrap's to answer for however it scores — including
       * under APCA, where plenty of the defaults fall short of Lc 75 and none of that is
       * the theme's doing. Defining it by the WCAG verdict instead would file every
       * untouched pair that merely passes AA under "this theme".
       */
      const untouched = Boolean(
        previous && previous.foreground === row.foreground && previous.background === row.background
      )

      rows.push({
        ...row,
        was: previous ?? null,
        inherited: untouched,
        improved: Boolean(previous && previous.ratio < 4.5 && row.ratio >= 4.5),
        regressed: Boolean(previous && previous.ratio >= 4.5 && row.ratio < 4.5)
      })
    }
  }
  return rows
}

export const summarise = (rows) => ({
  audited: rows.length,
  wcagFail: rows.filter((row) => !row.wcag.ok).length,
  introduced: rows.filter((row) => !row.wcag.ok && !row.inherited).length,
  inherited: rows.filter((row) => !row.wcag.ok && row.inherited).length,
  inheritedApca: rows.filter((row) => Math.abs(row.lc) < 75 && row.inherited).length,
  regressed: rows.filter((row) => row.regressed).length,
  improved: rows.filter((row) => row.improved).length,
  apcaBelowBody: rows.filter((row) => Math.abs(row.lc) < 75).length
})

/* -------------------------------------------------------------------------- */

const grade = (row) => (row.wcag.ok === true ? 'pass' : row.wcag.ok === false ? 'fail' : 'large only')

export function markdown({ rows, summary, theme, version }) {
  const lines = [
    `# Contrast report — ${theme}`,
    '',
    `Bootstrap \`${version}\` · ${summary.audited} pairs across light and dark.`,
    ''
  ]

  if (summary.introduced === 0 && summary.regressed === 0) {
    lines.push('**No contrast problems introduced by this theme.**', '')
  } else {
    lines.push(
      `**${summary.introduced} pair(s) fail WCAG AA because of this theme**` +
        (summary.regressed > 0 ? `, ${summary.regressed} of them by regression.` : '.'),
      ''
    )
  }

  if (summary.inherited > 0) {
    lines.push(
      `${summary.inherited} further pair(s) already failed in Bootstrap's defaults and are unchanged here.`,
      ''
    )
  }
  if (summary.improved > 0) lines.push(`${summary.improved} pair(s) were repaired by this theme.`, '')

  lines.push(
    `APCA: ${summary.apcaBelowBody} pair(s) score below Lc 75, the level APCA asks for body text` +
      (summary.inheritedApca > 0 ? ` — ${summary.inheritedApca} of them unchanged from Bootstrap.` : '.'),
    '',
    '| Pair | Scheme | Colours | WCAG 2 | APCA | Source |',
    '| --- | --- | --- | --- | --- | --- |'
  )

  const interesting = rows
    .filter((row) => !row.wcag.ok || Math.abs(row.lc) < 75 || row.improved || row.regressed)
    .sort((a, b) => a.ratio - b.ratio)

  for (const row of interesting) {
    const source = row.improved
      ? 'repaired'
      : row.regressed
        ? '**regression**'
        : row.inherited
          ? 'unchanged'
          : 'this theme'
    lines.push(
      `| \`${row.path}\` ${row.label} \`${row.partner}\` | ${row.mode} | ` +
        `\`${row.foreground}\` on \`${row.background}\` | ` +
        `${row.ratio.toFixed(2)}:1 ${grade(row)} | ` +
        `Lc ${row.lc.toFixed(0)} — ${row.apca.use} | ${source} |`
    )
  }

  if (interesting.length === 0) lines.push('| _nothing to report_ | | | | | |')

  lines.push(
    '',
    '---',
    '',
    'WCAG 2 is the rule conformance is measured against. APCA is the model WCAG 3 is built',
    "on, and judges light-on-saturated text — the case WCAG 2 handles worst — more usefully.",
    'Both are reported because they disagree, and knowing where they disagree is the point.',
    '',
    'Generated by `bstokens report`.'
  )

  return `${lines.join('\n')}\n`
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

export function html({ rows, summary, theme, version }) {
  const swatch = (hex) => `<i style="background:${hex}"></i><code>${hex}</code>`
  const body = rows
    .filter((row) => !row.wcag.ok || Math.abs(row.lc) < 75 || row.improved || row.regressed)
    .sort((a, b) => a.ratio - b.ratio)
    .map(
      (row) => `<tr class="${row.wcag.ok === false ? 'fail' : row.wcag.ok === null ? 'warn' : ''}">
  <td><code>${escapeHtml(row.path)}</code><small>${row.label} <code>${escapeHtml(row.partner)}</code></small></td>
  <td>${row.mode}</td>
  <td class="sw">${swatch(row.foreground)} on ${swatch(row.background)}</td>
  <td>${row.ratio.toFixed(2)}:1 <small>${grade(row)}</small></td>
  <td>Lc ${row.lc.toFixed(0)} <small>${escapeHtml(row.apca.use)}</small></td>
  <td>${row.improved ? 'repaired' : row.regressed ? 'regression' : row.inherited ? 'unchanged' : 'this theme'}</td>
</tr>`
    )
    .join('\n')

  return `<!doctype html>
<meta charset="utf-8">
<title>Contrast report — ${escapeHtml(theme)}</title>
<style>
  :root { color-scheme: light dark; font: 15px/1.55 system-ui, sans-serif }
  body { margin: 2.5rem auto; max-width: 64rem; padding: 0 1.5rem }
  h1 { font-size: 1.4rem; margin-bottom: .25rem }
  .lede { color: color-mix(in oklch, currentcolor 60%, transparent); margin-top: 0 }
  .verdict { padding: .8rem 1rem; border-radius: .5rem; margin: 1.5rem 0 }
  .ok { background: #e7f6ec; color: #10431f }
  .bad { background: #fdeaea; color: #5a1414 }
  /* The table is wide by nature; let it scroll in its own box rather than crushing the
     columns, which is what makes a narrow window unreadable. */
  .scroll { overflow-x: auto; margin-top: 1rem }
  table { border-collapse: collapse; width: 100%; min-width: 52rem }
  th, td { text-align: left; padding: .5rem .6rem; border-bottom: 1px solid #8883; vertical-align: top }
  th { font-size: .85rem; letter-spacing: .02em; text-transform: uppercase; opacity: .7 }
  small { display: block; opacity: .65; font-size: .8rem }
  code { font: 12px/1.4 ui-monospace, monospace }
  .sw { white-space: nowrap }
  .sw i { display: inline-block; width: .9rem; height: .9rem; border: 1px solid #8886;
          border-radius: 3px; vertical-align: -2px; margin-right: .25rem }
  tr.fail td:first-child { box-shadow: inset 3px 0 #d33 }
  tr.warn td:first-child { box-shadow: inset 3px 0 #e90 }
  footer { margin-top: 2rem; font-size: .9rem; opacity: .75 }
</style>
<h1>Contrast report — ${escapeHtml(theme)}</h1>
<p class="lede">Bootstrap <code>${escapeHtml(version)}</code> · ${summary.audited} pairs across light and dark.</p>
<div class="verdict ${summary.introduced === 0 && summary.regressed === 0 ? 'ok' : 'bad'}">
  ${
    summary.introduced === 0 && summary.regressed === 0
      ? 'No contrast problems introduced by this theme.'
      : `${summary.introduced} pair(s) fail WCAG AA because of this theme.`
  }
  ${summary.inherited > 0 ? `<br>${summary.inherited} further pair(s) already failed in Bootstrap's defaults.` : ''}
  ${summary.improved > 0 ? `<br>${summary.improved} pair(s) were repaired by this theme.` : ''}
</div>
<div class="scroll">
<table>
  <tr><th>Pair</th><th>Scheme</th><th>Colours</th><th>WCAG 2</th><th>APCA</th><th>Source</th></tr>
${body || '<tr><td colspan="6">Nothing to report.</td></tr>'}
</table>
</div>
<footer>
  WCAG 2 is the rule conformance is measured against. APCA is the model WCAG 3 is built on,
  and judges light-on-saturated text — the case WCAG 2 handles worst — more usefully. Both
  are reported because they disagree, and knowing where they disagree is the point.
  <br>Generated by <code>bstokens report</code>.
</footer>
`
}

/**
 * Audit a theme's overrides against the document they came from.
 *
 * One entry point so the CLI and the chooser cannot disagree about what "introduced" means.
 */
export function reportFor(tree, base, overrides, { theme, version }) {
  const doc = Object.keys(overrides).length > 0 ? withOverrides(clone(tree), overrides) : base
  const rows = audit(doc, base)
  const summary = summarise(rows)
  return { rows, summary, theme, version }
}
