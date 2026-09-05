import test from 'node:test'
import assert from 'node:assert/strict'

import { loadTokens, loadTree } from '../lib/load-fs.mjs'
import { tokensDir } from '../lib/config.mjs'
import { apcaLc, apcaLevel, contrastPartner, auditContrast } from '../lib/contrast.mjs'
import { audit, summarise, markdown, html, reportFor } from '../lib/report.mjs'

const doc = loadTokens(tokensDir)
const { tree } = loadTree(tokensDir)

test('APCA matches the published reference values', () => {
  // From the APCA-W3 0.1.9 reference set. Getting these wrong by a little is the failure
  // mode that matters: the number still looks plausible.
  assert.equal(apcaLc([0, 0, 0], [255, 255, 255]).toFixed(2), '106.04')
  assert.equal(apcaLc([255, 255, 255], [0, 0, 0]).toFixed(2), '-107.88')
  assert.equal(apcaLc([136, 136, 136], [255, 255, 255]).toFixed(2), '63.06')
})

test('the sign of an APCA score carries the polarity', () => {
  // Dark-on-light and light-on-dark are not equivalent to the eye, which is the main thing
  // WCAG 2's symmetric ratio gets wrong. Discarding the sign would discard that.
  assert.ok(apcaLc([0, 0, 0], [255, 255, 255]) > 0)
  assert.ok(apcaLc([255, 255, 255], [0, 0, 0]) < 0)
  assert.equal(apcaLc([120, 120, 120], [120, 120, 120]), 0)
})

test('APCA levels name the smallest thing a pair can carry', () => {
  assert.equal(apcaLevel(106).use, 'any text, including thin weights')
  assert.equal(apcaLevel(-76).use, 'body text')
  assert.equal(apcaLevel(61).use, 'large or bold text only')
  assert.equal(apcaLevel(10).ok, false)
})

test('only pairs a reader actually looks at are audited', () => {
  assert.deepEqual(contrastPartner('theme-color.primary.contrast'), {
    partner: 'theme-color.primary.bg',
    label: 'on fill'
  })
  assert.deepEqual(contrastPartner('theme-color.primary.fg'), {
    partner: 'bg.body',
    label: 'on page'
  })
  assert.equal(contrastPartner('theme-color.primary.bg'), null)
  assert.equal(contrastPartner('accordion.padding-x'), null)
})

test('the audit finds Bootstrap’s own weak pairs', () => {
  const rows = auditContrast(doc, { mode: 'light' })
  assert.ok(rows.length > 20)

  const onPrimary = rows.find((row) => row.path === 'theme-color.primary.contrast')
  assert.equal(onPrimary.foreground, '#ffffff')
  assert.equal(onPrimary.background, '#0089c9')
  assert.equal(onPrimary.ratio.toFixed(2), '3.87')
  // WCAG calls this "AA large"; APCA agrees it is not body text. They do not always.
  assert.equal(onPrimary.wcag.level, 'AA large')
  assert.ok(Math.abs(onPrimary.lc) < 75)
})

test('WCAG and APCA disagree, and both are reported', () => {
  // fg.4 on a dark page clears WCAG's 3:1 large-text bar and is nearly invisible by APCA.
  // Reporting only one of them would hide exactly the case that motivated APCA.
  const row = auditContrast(doc, { mode: 'dark' }).find((r) => r.path === 'fg.4')
  assert.ok(row.ratio > 3)
  assert.ok(Math.abs(row.lc) < 30)
})

/* -------------------------------------------------------------------------- */

const SUNSHINE = {
  'theme-color.primary.bg': { value: '{color.yellow.400}' },
  'theme-color.primary.contrast': { value: '{color.white}' },
  'type.link.color': { value: '{color.yellow.500}' }
}

test('a theme is judged on what it changed, not on what it inherited', () => {
  const themed = reportFor(tree, doc, SUNSHINE, { theme: 'Sunshine', version: 'test' })

  const broke = themed.rows.find(
    (row) => row.path === 'theme-color.primary.contrast' && row.mode === 'light'
  )
  assert.equal(broke.inherited, false, 'the theme repainted this pair')
  assert.ok(broke.ratio < 2)

  const untouched = themed.rows.find(
    (row) => row.path === 'theme-color.success.contrast' && row.mode === 'light'
  )
  assert.equal(untouched.inherited, true, "Bootstrap's own weak pair, unchanged")

  assert.ok(themed.summary.introduced >= 3)
  assert.ok(themed.summary.inherited > 0)
})

test('a pair dragged below the line by a change elsewhere is a regression', () => {
  // `type.link.hover-color` derives from `type.link.color`; nothing overrides it directly.
  const { rows } = reportFor(tree, doc, SUNSHINE, { theme: 'Sunshine', version: 'test' })
  const dragged = rows.find((row) => row.path === 'type.link.hover-color' && row.mode === 'light')
  assert.equal(dragged.regressed, true)
})

test('inherited is about the colours, not the verdict', () => {
  // Every pair of an unthemed document is Bootstrap's, including the ones that pass. Judging
  // by the WCAG result instead files every untouched passing pair under "this theme".
  const rows = audit(doc, doc)
  assert.ok(rows.length > 40)
  assert.ok(rows.every((row) => row.inherited), 'nothing was changed, so nothing is ours')
  assert.equal(summarise(rows).introduced, 0)
})

test('the report renders in both formats and says what it found', () => {
  const data = reportFor(tree, doc, SUNSHINE, { theme: 'Sunshine', version: '6.0.0-alpha1' })

  const md = markdown(data)
  assert.match(md, /# Contrast report — Sunshine/)
  assert.match(md, /fail WCAG AA because of this theme/)
  assert.match(md, /theme-color\.primary\.contrast/)
  assert.match(md, /\*\*regression\*\*/)
  assert.match(md, /Lc -?\d+/)

  const page = html(data)
  assert.match(page, /<title>Contrast report — Sunshine<\/title>/)
  assert.match(page, /class="verdict bad"/)
  assert.doesNotMatch(page, /<script/)
})

test('a clean report says so rather than showing an empty table', () => {
  const md = markdown(reportFor(tree, doc, {}, { theme: 'Bootstrap defaults', version: 'test' }))
  assert.match(md, /\*\*No contrast problems introduced by this theme\.\*\*/)
  assert.match(md, /already failed in Bootstrap's defaults/)
})
