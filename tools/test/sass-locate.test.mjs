import test from 'node:test'
import assert from 'node:assert/strict'

import { locateDeclarations, mapDeclarationOf, locateEntries, applyEdits } from '../lib/sass-locate.mjs'

const locate = (src, name) => {
  const found = mapDeclarationOf(src, locateDeclarations(src), name)
  return locateEntries(src, found.body)
}

test('finds entries in a defaults() map', () => {
  const src = `
$m: () !default;
$m: defaults(
  (
    a: 1,
    "b": 2,
  ),
  $m
);
`
  assert.deepEqual(locate(src, '$m').map((e) => [e.key, e.value]), [['a', '1'], ['b', '2']])
})

test('comments before an entry are not part of its key', () => {
  // Upstream writes explanatory comments inside its token maps; folding them into the key
  // made `--body-font-family` unfindable, so an eject appended a duplicate instead.
  const src = `
$m: (
  // scss-docs-start something
  // A note that wraps
  // onto several lines.
  --body-font-family: "Georgia, serif",
  /* and a block comment */
  --other: 1,
);
`
  const entries = locate(src, '$m')
  assert.deepEqual(entries.map((e) => e.key), ['--body-font-family', '--other'])
  assert.equal(entries[0].value, '"Georgia, serif"')
})

test('the value range of a scalar stops before !default', () => {
  const src = '$spacer: 1rem !default;\n'
  const declaration = locateDeclarations(src).get('$spacer').all[0]
  assert.equal(src.slice(declaration.valueStart, declaration.valueEnd), '1rem !default')
})

test('nested maps carry their own located entries', () => {
  const src = `
$m: (
  "primary": (
    "base": var(--blue-500),
    "fg": light-dark(var(--blue-600), var(--blue-400))
  )
);
`
  const [role] = locate(src, '$m')
  assert.equal(role.key, 'primary')
  assert.deepEqual(role.entries.map((e) => e.key), ['base', 'fg'])
  assert.equal(role.entries[1].value, 'light-dark(var(--blue-600), var(--blue-400))')
})

test('edits apply back to front and refuse to overlap', () => {
  const src = 'abcdef'
  assert.equal(applyEdits(src, [{ start: 0, end: 1, text: 'X' }, { start: 4, end: 6, text: 'YZ!' }]), 'XbcdYZ!')
  assert.throws(
    () => applyEdits(src, [{ start: 0, end: 3, text: 'X' }, { start: 2, end: 4, text: 'Y' }]),
    /Overlapping/
  )
})
