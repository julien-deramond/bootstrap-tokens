/**
 * The contrast audit, and the two ways it is rendered.
 *
 * Kept out of the command because the chooser runs it too: this file imports nothing from
 * Node, so the browser generates the same report the CLI does rather than a second,
 * drifting approximation of it.
 */

import { withOverrides, clone } from './overrides.mjs'
import { auditContrast, roleCollisions, HOW_COMMON } from './contrast.mjs'

const MODES = ['light', 'dark']

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

/** Role pairs nobody can tell apart, with the ones Bootstrap already had marked as such. */
export function collisions(doc, base) {
  const before = new Set()
  for (const mode of MODES) {
    for (const row of roleCollisions(base, { mode })) {
      before.add(`${mode}:${row.roles.join('/')}:${row.vision}:${row.colors.join('/')}`)
    }
  }

  /*
   * Most semantic roles have no dark variant, so the same collision turns up twice and the
   * table doubles in length without saying anything twice as useful. Merge a pair that is
   * identical in both schemes into one row and say so; keep them apart when the colours
   * actually differ, because then they are two findings.
   */
  const merged = new Map()
  for (const mode of MODES) {
    for (const row of roleCollisions(doc, { mode })) {
      const identity = `${row.roles.join('/')}:${row.vision}:${row.colors.join('/')}`
      const seen = merged.get(identity)
      if (seen) {
        seen.mode = 'both'
        continue
      }
      merged.set(identity, {
        ...row,
        inherited: before.has(`${mode}:${identity}`)
      })
    }
  }

  return [...merged.values()]
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

/**
 * The second half of the report, and the half a contrast check cannot give you.
 *
 * Luminance barely moves under colour blindness, so every pair here can pass WCAG and APCA
 * and still be two buttons of the same colour.
 */
function colourVisionMarkdown(collided) {
  if (collided.length === 0) {
    return ['## Colour vision', '', 'Every semantic role stays distinct under simulated protanopia, deuteranopia, tritanopia and achromatopsia.']
  }

  const lines = [
    '## Colour vision',
    '',
    '| Roles | Scheme | Seen as | Colours | How common | Source |',
    '| --- | --- | --- | --- | --- | --- |'
  ]

  for (const row of collided) {
    lines.push(
      `| ${row.status ? '**' : ''}\`${row.roles[0]}\` / \`${row.roles[1]}\`${row.status ? '**' : ''} | ${row.mode} | ` +
        `${row.vision ?? 'the same colour already'} | \`${row.colors[0]}\` \`${row.colors[1]}\` | ` +
        `${row.vision ? HOW_COMMON[row.vision].note : 'everyone'} | ${row.inherited ? 'unchanged' : 'this theme'} |`
    )
  }

  lines.push(
    '',
    'Bold pairs are status roles, which carry meaning by colour alone — two of those looking',
    'alike is a bug rather than a style choice. The rest is branding, and worth knowing about',
    'rather than fixing.'
  )
  return lines
}

export function markdown({ rows, summary, theme, version, collisions: collided = [] }) {
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

  // Beside the contrast headline, because it is the finding a contrast check cannot make and
  // therefore the one a reader is least expecting.
  if (summary.statusCollisions > 0) {
    lines.push(
      `**${summary.statusCollisions} pair(s) of status roles cannot be told apart** — colours that ` +
        'carry meaning, seen as one. Details under Colour vision.',
      ''
    )
  }

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

  lines.push('', ...colourVisionMarkdown(collided))

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

function colourVisionHtml(collided) {
  if (collided.length === 0) {
    return '<h2>Colour vision</h2><p>Every semantic role stays distinct under simulated protanopia, deuteranopia, tritanopia and achromatopsia.</p>'
  }

  const rows = collided
    .map(
      (row) => `<tr class="${row.status ? 'fail' : ''}">
  <td><code>${escapeHtml(row.roles[0])}</code> / <code>${escapeHtml(row.roles[1])}</code>${row.status ? '<small>status roles — meaning is carried by the colour</small>' : ''}</td>
  <td>${row.mode}</td>
  <td>${row.vision ?? 'the same colour already'}</td>
  <td class="sw"><i style="background:${row.colors[0]}"></i><i style="background:${row.colors[1]}"></i>
      <code>${row.colors[0]}</code> <code>${row.colors[1]}</code></td>
  <td>${row.vision ? escapeHtml(HOW_COMMON[row.vision].note) : 'everyone'}</td>
  <td>${row.inherited ? 'unchanged' : 'this theme'}</td>
</tr>`
    )
    .join('\n')

  return `<h2>Colour vision</h2>
<p>Luminance barely moves under colour blindness, so every pair here can pass WCAG and APCA
and still be two buttons of the same colour. Highlighted pairs are status roles, which carry
meaning by colour alone.</p>
<div class="scroll"><table>
  <tr><th>Roles</th><th>Scheme</th><th>Seen as</th><th>Colours</th><th>How common</th><th>Source</th></tr>
${rows}
</table></div>`
}

export function html({ rows, summary, theme, version, collisions: collided = [] }) {
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
${colourVisionHtml(collided)}
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
  const collided = collisions(doc, base)
  return {
    rows,
    collisions: collided,
    summary: {
      ...summarise(rows),
      collisions: collided.filter((row) => !row.inherited).length,
      collisionsInherited: collided.filter((row) => row.inherited).length,
      statusCollisions: collided.filter((row) => row.status && !row.inherited).length
    },
    theme,
    version
  }
}
