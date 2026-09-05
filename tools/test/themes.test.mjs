/**
 * Themes as things you can keep.
 *
 * A design tool is used by trying an idea, keeping it, and trying another. Until this
 * existed there was one unnamed theme and the only way to explore a second idea was to
 * destroy the first.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

// themes.js talks to localStorage, which Node does not have.
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
}

const {
  loadStore,
  saveStore,
  activeTheme,
  blankTheme,
  uniqueName,
  toFragment,
  fromFragment
} = await import('../../web/themes.js')

test('a first visit gets one theme, not zero', () => {
  store.clear()
  const loaded = loadStore()

  assert.equal(loaded.themes.length, 1)
  assert.equal(activeTheme(loaded).id, loaded.activeId)
  assert.deepEqual(activeTheme(loaded).overrides, {})
})

test('the oldest storage shape is carried forward, not discarded', () => {
  // Version 0 stored the overrides object directly. Losing someone's work to a refactor is
  // not an acceptable upgrade path.
  store.clear()
  localStorage.setItem(
    'bootstrap-tokens.chooser.v1',
    JSON.stringify({ 'radius.base': { value: '1rem' } })
  )

  const loaded = loadStore()
  assert.equal(loaded.version, 2)
  assert.deepEqual(activeTheme(loaded).overrides, { 'radius.base': { value: '1rem' } })
})

test('the previous storage shape is carried forward too', () => {
  store.clear()
  localStorage.setItem(
    'bootstrap-tokens.chooser.v1',
    JSON.stringify({ overrides: { 'spacing.base': { value: '1.25rem' } }, options: { '$enable-rounded': { value: 'false' } } })
  )

  const loaded = loadStore()
  assert.deepEqual(activeTheme(loaded).overrides, { 'spacing.base': { value: '1.25rem' } })
})

test('a duplicate gets a name of its own', () => {
  const existing = { themes: [{ name: 'Brand' }, { name: 'Brand copy' }] }
  assert.equal(uniqueName(existing, 'Brand copy'), 'Brand copy 2')
  assert.equal(uniqueName(existing, 'Something else'), 'Something else')
})

test('a theme survives a round trip through a share link', async () => {
  const theme = {
    ...blankTheme('Editorial'),
    overrides: {
      'radius.base': { value: '.25rem' },
      'theme-color.primary.fg': { value: '{color.brown.600}', dark: '{color.brown.400}' }
    },
    options: { '$enable-shadows': { value: 'false' } }
  }

  const fragment = await toFragment(theme)
  const back = await fromFragment(fragment)

  assert.equal(back.name, 'Editorial')
  assert.deepEqual(back.overrides, theme.overrides)
  assert.deepEqual(back.options, theme.options)
})

test('a share link stays short enough to paste', async () => {
  // A theme is mostly repeated token paths, which deflate hard. A link nobody can send is
  // not a share feature.
  const overrides = {}
  for (const role of ['primary', 'accent', 'success', 'danger', 'warning', 'info']) {
    for (const key of ['base', 'fg', 'fg-emphasis', 'bg', 'bg-subtle', 'bg-muted', 'border', 'contrast']) {
      overrides[`theme-color.${role}.${key}`] = { value: `{color.green.500}`, dark: `{color.green.400}` }
    }
  }

  const fragment = await toFragment({ ...blankTheme('Big'), overrides })
  assert.ok(fragment.length < 1500, `fragment is ${fragment.length} characters`)
})

test('a malformed link is refused rather than thrown', async () => {
  assert.equal(await fromFragment('not-a-fragment'), null)
  assert.equal(await fromFragment(''), null)
  // Valid base64url, valid deflate, but not a theme.
  const notATheme = await toFragment({ ...blankTheme('x'), overrides: undefined })
  assert.equal(await fromFragment(notATheme), null)
})

test('saving and loading round-trips the whole store', () => {
  store.clear()
  const original = loadStore()
  original.themes.push(blankTheme('Second'))
  saveStore(original)

  const reloaded = loadStore()
  assert.equal(reloaded.themes.length, 2)
  assert.equal(reloaded.themes[1].name, 'Second')
})
