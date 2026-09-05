/**
 * Build options — the things that are configurable but are not design values.
 *
 * `$enable-rounded: false` squares every corner in the system and `$button-sizes` decides
 * which classes exist at all. Both belong in an exported theme; neither belongs in a DTCG
 * document, so they live beside it.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OPTIONS, optionByName, renderOption, changedOptions } from '../lib/config-surface.mjs'
import { loadOptions, loadTree } from '../lib/load-fs.mjs'
import { withOverrides, themeScss, clone } from '../lib/overrides.mjs'
import { tokensDir, resolveBootstrapSource } from '../lib/config.mjs'

const stored = loadOptions(tokensDir)

test('every modelled option was found in the checkout', () => {
  const missing = OPTIONS.map((option) => option.name).filter((name) => !stored[name])
  assert.deepEqual(missing, [])
})

test('every option states what it does', () => {
  for (const option of OPTIONS) {
    assert.ok(option.describe?.length > 30, `${option.name} has no useful description`)
    assert.ok(option.group, `${option.name} has no group`)
  }
})

test('the twelve enable flags are all captured', () => {
  const flags = Object.keys(stored).filter((name) => name.startsWith('$enable-'))
  assert.equal(flags.length, 12)
  for (const name of flags) assert.match(stored[name].value, /^(true|false)$/)
})

test('a list option is emitted in the map form defaults() can merge', () => {
  // `defaults()` converts its *defaults* argument from a list to a map but never the
  // override, so passing a list back reaches map.merge(map, list) and fails to compile.
  const rendered = renderOption('$button-sizes', { value: '("xs", "sm", "lg")' })
  assert.equal(rendered, '("xs": true, "sm": true, "lg": true)')
})

test('dropping a size emits an explicit null', () => {
  // The merge is additive, so omitting a key keeps it. Upstream's documented way to remove
  // one is to set it null.
  const rendered = renderOption('$button-sizes', { value: '("sm", "lg")', base: '("xs", "sm", "lg")' })
  assert.match(rendered, /"xs": null/)
  assert.match(rendered, /"sm": true/)
})

test('a bare comma list is parenthesised so with() does not read it as two arguments', () => {
  assert.equal(
    renderOption('$strength-levels', { value: 'weak, fair, good, strong' }),
    '(weak, fair, good, strong)'
  )
})

test('a map option is passed through untouched', () => {
  const value = '( "valid": "success", "invalid": "danger", )'
  assert.equal(renderOption('$validation-states', { value }), value)
})

test('changedOptions reports only what moved, and carries the default it moved from', () => {
  const base = { '$enable-rounded': { value: 'true' }, '$enable-shadows': { value: 'true' } }
  const changed = changedOptions(base, {
    '$enable-rounded': { value: 'false' },
    '$enable-shadows': { value: 'true' }
  })

  assert.deepEqual(Object.keys(changed), ['$enable-rounded'])
  assert.equal(changed['$enable-rounded'].base, 'true')
})

test('options reach the exported Sass', () => {
  const { tree } = loadTree(tokensDir)
  const doc = withOverrides(clone(tree), {})
  const scss = themeScss(doc, {}, {
    version: 'test',
    options: { '$enable-rounded': { value: 'false' } }
  })

  assert.match(scss, /\$enable-rounded: false/)
})

let source = null
try {
  source = resolveBootstrapSource()
} catch {
  /* no checkout */
}

test('a changed option actually changes the compiled CSS', { skip: !source }, async () => {
  const sass = await import('sass')
  const { tree } = loadTree(tokensDir)
  const doc = withOverrides(clone(tree), {})

  const work = mkdtempSync(join(tmpdir(), 'bstokens-options-'))
  const entry = join(work, 'custom.scss')

  writeFileSync(
    entry,
    themeScss(doc, {}, {
      version: 'test',
      importPath: join(source, 'scss', 'bootstrap'),
      options: { '$button-sizes': { value: '("sm", "lg")', base: '("xs", "sm", "lg")' } }
    })
  )

  const { css } = sass.compile(entry, { loadPaths: [source], style: 'expanded' })

  assert.doesNotMatch(css, /\.btn-xs\b/, 'the dropped size still generated classes')
  assert.match(css, /\.btn-sm\b/, 'a kept size stopped generating classes')
})
