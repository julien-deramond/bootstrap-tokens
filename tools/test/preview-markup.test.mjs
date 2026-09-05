import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { repoRoot } from '../lib/config.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'

/*
 * The preview is a fidelity claim: "this is what your theme looks like on Bootstrap". It is
 * only true while the markup is Bootstrap's own, and markup drifts silently — a class that
 * no longer exists renders as an unstyled element, which looks like a plain control rather
 * than like a bug.
 *
 * It had drifted. The forms section used v5's `.form-check`, `.form-check-input` and
 * `.form-switch`, none of which v6 styles, so checkboxes, radios and switches rendered as
 * bare browser controls and a theme's check and switch tokens appeared to do nothing at all.
 * `.lead` was there too, which v6's migration guide explicitly removed.
 *
 * The vendored stylesheet is the same one the preview loads, so this needs no checkout.
 */
const vendor = readFileSync(join(repoRoot, 'web', 'vendor', 'bootstrap.css'), 'utf8')
const preview = readFileSync(join(repoRoot, 'web', 'preview.js'), 'utf8')
const previewHtml = readFileSync(join(repoRoot, 'web', 'preview.html'), 'utf8')

/** Every class Bootstrap's stylesheet mentions, escapes undone. */
const defined = new Set(
  [...vendor.matchAll(/\.(-?(?:\\.|[\w-])+)/g)].map(([, name]) => name.replace(/\\/g, ''))
)

/**
 * Classes the preview renders that Bootstrap deliberately does not style.
 *
 * `.card-title` and `.card-text` are in v6's own card documentation — semantic hooks whose
 * spacing comes from `.card-body > *` — so using them is following upstream, not drifting
 * from it. Everything else here belongs to the preview's own chrome.
 */
const NOT_BOOTSTRAP = new Set([
  'card-title',
  'card-text',
  // The preview's own layout, defined in preview.html.
  'preview-section', 'preview-row', 'preview-grid', 'preview-hero', 'preview-empty',
  'board', 'board-label', 'board-swatch', 'board-light', 'board-dark',
  'specimen', 'specimen-tall',
  'artboard', 'pane', 'pane-before', 'pane-after',
  'cluster', 'mt', 'mb', 'surface', 'surface-row',
  'state-grid', 'state-label', 'state-empty',
  'swatch-grid', 'swatch-row', 'elevation-row', 'elevation-box'
])

/** Class names in the preview's templates, skipping anything built by interpolation. */
function classesIn(source) {
  const found = new Set()
  for (const [, list] of source.matchAll(/\bclass="([^"]*)"/g)) {
    if (list.includes('${')) {
      // A template hole can still have literal classes around it; keep those, but not the
      // stem of a name the hole completes — `btn-${size}` leaves `btn-`, which is not a
      // class and would only ever be a false failure.
      for (const part of list.split(/\$\{[^}]*\}/)) {
        for (const name of part.split(/\s+/)) {
          if (/^[a-z][\w-]*[a-z0-9]$/i.test(name)) found.add(name)
        }
      }
      continue
    }
    for (const name of list.split(/\s+/)) if (name) found.add(name)
  }
  return found
}

test('every Bootstrap class the preview renders is one Bootstrap defines', () => {
  const unknown = [...classesIn(preview)]
    .filter((name) => !defined.has(name) && !NOT_BOOTSTRAP.has(name))
    .sort()

  assert.deepEqual(
    unknown,
    [],
    'these render as unstyled elements, which looks like a theme problem rather than a markup one'
  )
})

test('the class families the preview builds by interpolation exist', () => {
  // The check above only sees literal class names, so the families it cannot resolve —
  // `theme-${role}`, `btn-${variant}`, `btn-${size}` — are asserted here by hand.
  for (const name of [
    'theme-primary', 'theme-accent', 'theme-success', 'theme-danger', 'theme-warning',
    'theme-info', 'theme-secondary', 'theme-inverse',
    'btn-outline', 'btn-subtle', 'btn-text', 'btn-xs', 'btn-sm', 'btn-lg'
  ]) {
    assert.ok(defined.has(name), `${name} is not a class Bootstrap defines`)
  }
})

test('the forms section uses v6 markup', () => {
  // Named explicitly because this is the drift that actually happened, and the generic
  // check above would go quiet again the moment someone added them back with a typo.
  for (const gone of ['form-check', 'form-check-input', 'form-check-label', 'form-switch']) {
    assert.doesNotMatch(preview, new RegExp(`class="[^"]*\\b${gone}\\b`), `${gone} is v5 markup`)
  }
  assert.match(preview, /class="check"/)
  assert.match(preview, /class="radio"/)
  assert.match(preview, /<div class="switch">/)
})

test('the artboard carries the typography Bootstrap puts on body', () => {
  /*
   * The preview document has two fonts in it: the canvas chrome's, on `body`, and the
   * theme's, inside the artboard. The chrome's was winning — both rules target `body`, the
   * preview's own stylesheet comes last, and the `font` shorthand resets family, size and
   * line height in one go — so artboards rendered at 13px system sans whatever the theme
   * said, and every typography token was invisible in the one place it should be visible.
   *
   * Anything the `font` shorthand resets has to be re-declared on `.pane` from the token
   * that owns it, or the bug comes back the moment someone touches the canvas font.
   */
  const rule = /\.pane\s*\{([^}]*)\}/.exec(previewHtml)
  assert.ok(rule, 'no .pane rule in preview.html')

  for (const [property, token] of [
    ['font-family', '--body-font-family'],
    ['font-size', '--body-font-size'],
    ['font-weight', '--body-font-weight'],
    ['line-height', '--body-line-height']
  ]) {
    assert.match(rule[1], new RegExp(`${property}:\\s*var\\(${token}\\)`), `${property} on .pane`)
  }
})

test('every component with tokens has something to look at', () => {
  /*
   * A component with no sample is a component whose tokens appear to do nothing. Fourteen
   * of the sixty-two were in that state — every overlay, because they are positioned
   * against the viewport and hidden until JavaScript shows them, plus the OTP, chip input
   * and strength meter, whose markup a plugin builds.
   *
   * Checked against the preview source rather than a rendered page, which means it is
   * coarse: it asks whether the selector appears at all, not whether it renders. The
   * rendered count was measured in a browser at 59 of 62.
   */
  const allowed = new Set([
    // Third-party markup: the calendar and datepicker are vanilla-calendar's own DOM,
    // which we would have to reproduce from its internals rather than from Bootstrap's.
    'calendar',
    'datepicker',
    // `:root` — the body typography, which the artboard carries and every section shows.
    'reboot-type'
  ])

  const unpreviewed = COMPONENTS.filter((component) => {
    if (allowed.has(component.name)) return false
    // The bare class, so `.navbar[data-bs-theme=dark]` matches a `.navbar` in the sample.
    const [first] = component.selector.split(',')
    const anchor = /^[.[]?([\w-]+)/.exec(first.replace(/^\[data-vc=/, ''))?.[1]
    return anchor ? !preview.includes(anchor) : false
  })

  assert.deepEqual(unpreviewed.map((component) => component.name), [])
})
