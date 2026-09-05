/**
 * Keeping saved themes working when upstream renames a token.
 *
 * Bootstrap 6 is an alpha and its token names will move. Without a record of what became
 * what, a `theme.json` saved today silently loses those values tomorrow — the override
 * points at a path that no longer exists, so it is skipped, and the theme quietly comes back
 * a little more like stock Bootstrap than the person left it. Silent partial loss is the
 * worst failure a theme file can have, because nothing tells you to look.
 *
 * A migration is deliberately hand-written. `sync` can *notice* that a path vanished and a
 * similar one appeared, but only a person can say whether that is a rename or a coincidence,
 * so the tooling proposes and a human records.
 */

const CHAIN_LIMIT = 20

/** Follow `from → to` until it stops moving, so chained renames resolve in one pass. */
export function resolvePath(path, migrations) {
  let current = path

  for (let step = 0; step < CHAIN_LIMIT; step++) {
    const next = migrations.find((migration) => migration.from === current)
    if (!next) return current
    if (next.to === null) return null // deliberately removed upstream
    current = next.to
  }

  return current
}

/**
 * Bring a set of overrides up to date.
 *
 * Returns the migrated overrides plus what happened, because an import that quietly changes
 * someone's theme should still be able to say so.
 */
export function applyMigrations(overrides, migrations, doc) {
  const migrated = {}
  const renamed = []
  const dropped = []

  for (const [path, override] of Object.entries(overrides)) {
    const target = resolvePath(path, migrations)

    if (target === null) {
      dropped.push({ path, reason: 'removed upstream' })
      continue
    }

    if (doc && !doc.tokens.has(target)) {
      dropped.push({ path, reason: target === path ? 'no longer exists' : `renamed to ${target}, which is also gone` })
      continue
    }

    if (target !== path) renamed.push({ from: path, to: target })
    migrated[target] = override
  }

  return { overrides: migrated, renamed, dropped }
}

/**
 * Propose renames by comparing two versions of the document.
 *
 * A rename almost always keeps something: the custom property it emits, or its position in a
 * Sass map. Matching on those finds the candidates; deciding is a person's job.
 */
export function detectRenames(before, after) {
  const gone = new Map()
  const arrived = new Map()

  for (const [path, meta] of before) if (!after.has(path)) gone.set(path, meta)
  for (const [path, meta] of after) if (!before.has(path)) arrived.set(path, meta)

  const candidates = []
  const claimed = new Set()

  // Strongest signal first: the same custom property under a different path.
  for (const [path, meta] of gone) {
    if (!meta.cssVar) continue
    for (const [otherPath, otherMeta] of arrived) {
      if (claimed.has(otherPath) || otherMeta.cssVar !== meta.cssVar) continue
      candidates.push({ from: path, to: otherPath, because: `both emit ${meta.cssVar}` })
      claimed.add(otherPath)
      break
    }
  }

  // Then the same slot in the same Sass map.
  for (const [path, meta] of gone) {
    if (candidates.some((candidate) => candidate.from === path)) continue
    for (const [otherPath, otherMeta] of arrived) {
      if (claimed.has(otherPath)) continue
      if (otherMeta.sassMap !== meta.sassMap || otherMeta.sassKey !== meta.sassKey) continue
      candidates.push({ from: path, to: otherPath, because: `both are ${meta.sassMap} key "${meta.sassKey}"` })
      claimed.add(otherPath)
      break
    }
  }

  const unmatched = [...gone.keys()].filter((path) => !candidates.some((candidate) => candidate.from === path))
  return { candidates, unmatched, added: [...arrived.keys()].filter((path) => !claimed.has(path)) }
}

/** The shape `detectRenames` compares: path to the few fields a rename preserves. */
export function migrationFingerprint(doc, ext) {
  const map = new Map()
  for (const [path, token] of doc) {
    const meta = ext(token)
    if (meta.generated) continue
    map.set(path, { cssVar: meta.cssVar ?? null, sassMap: meta.sassMap ?? null, sassKey: meta.sassKey ?? null })
  }
  return map
}
