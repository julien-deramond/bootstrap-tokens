/**
 * Themes as things you can keep, rather than one implicit blob in local storage.
 *
 * A design tool is used by trying an idea, keeping it, and trying another — which needs a
 * theme to have a name, an identity and a neighbour to be compared against. Until now there
 * was exactly one, unnamed, and the only way to explore a second idea was to destroy the
 * first.
 */

const KEY = 'bootstrap-tokens.chooser.v1'
const VERSION = 2

const now = () => new Date().toISOString()

/** A theme is its edits plus enough identity to tell it from another one. */
export function blankTheme(name = 'Untitled theme') {
  return { id: crypto.randomUUID(), name, overrides: {}, options: {}, updatedAt: now() }
}

/**
 * Read the store, migrating older shapes forward.
 *
 * Version 1 stored `{ overrides, options }`, and before that the overrides object directly.
 * Both are still out there in people's browsers, and losing someone's work to a refactor is
 * not an acceptable upgrade path.
 */
export function loadStore() {
  let raw
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
  } catch {
    raw = null
  }

  if (!raw) return fresh()
  if (raw.version === VERSION && Array.isArray(raw.themes) && raw.themes.length > 0) return raw

  const carried = blankTheme('My theme')
  carried.overrides = raw.overrides ?? (raw.options || raw.themes ? {} : raw) ?? {}
  carried.options = raw.options ?? {}

  return { version: VERSION, themes: [carried], activeId: carried.id }
}

function fresh() {
  const theme = blankTheme('My theme')
  return { version: VERSION, themes: [theme], activeId: theme.id }
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* private browsing — the session still works, it just will not persist */
  }
}

export const activeTheme = (store) =>
  store.themes.find((theme) => theme.id === store.activeId) ?? store.themes[0]

/** A name that is not already taken, so duplicates do not become indistinguishable. */
export function uniqueName(store, base) {
  const taken = new Set(store.themes.map((theme) => theme.name))
  if (!taken.has(base)) return base

  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/* --------------------------------------------------------------- sharing -- */

const bytes = (text) => new TextEncoder().encode(text)

const toBase64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const fromBase64Url = (text) => {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function through(stream, data) {
  const response = new Response(new Blob([data]).stream().pipeThrough(stream))
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Pack a theme into a URL fragment.
 *
 * Deflate then base64url, using the platform's own CompressionStream so this stays
 * dependency-free. A theme is mostly repeated token paths, which compresses hard — the
 * fragment stays short enough to paste into a message.
 */
export async function toFragment(theme) {
  const payload = JSON.stringify({ n: theme.name, o: theme.overrides, c: theme.options })
  const compressed = await through(new CompressionStream('deflate-raw'), bytes(payload))
  return toBase64Url(compressed)
}

/** Unpack a shared theme. Returns null rather than throwing on anything malformed. */
export async function fromFragment(fragment) {
  try {
    const raw = await through(new DecompressionStream('deflate-raw'), fromBase64Url(fragment))
    const parsed = JSON.parse(new TextDecoder().decode(raw))
    if (!parsed || typeof parsed.o !== 'object') return null

    return {
      ...blankTheme(typeof parsed.n === 'string' ? parsed.n : 'Shared theme'),
      overrides: parsed.o,
      options: parsed.c ?? {}
    }
  } catch {
    return null
  }
}
