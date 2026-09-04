/**
 * The maintainer-facing export: rewrite `twbs/bootstrap@v6-dev`'s own Sass sources.
 *
 * A consumer wants `@use "bootstrap" with (…)`. A maintainer wants the opposite — the
 * project's own files, changed in place, so the result is a normal pull request. That rules
 * out regenerating the files: upstream's `_config.scss` says `1: $spacer * .25`, carries
 * section comments and `scss-docs` markers, and calls `escape-svg()`. Re-emitting all of it
 * from resolved values would reformat every map and bury three changed numbers in a
 * two-thousand-line diff.
 *
 * So we locate the byte range of each individual value and splice. Everything a maintainer
 * did not change stays identical, and `git diff` shows exactly the edits they made.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { ext } from './tokens.mjs'
import { sourceValueOf } from './source-value.mjs'
import { locateDeclarations, mapDeclarationOf, locateEntries, indentAt, applyEdits } from './sass-locate.mjs'

/* ------------------------------------------------------------------ sources */

function scssFiles(root) {
  const base = join(root, 'scss')
  const out = []
  const walkDir = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walkDir(path)
      else if (entry.endsWith('.scss')) out.push(path)
    }
  }
  walkDir(base)
  return out
}

/** Read every stylesheet once and index its declarations. */
export function readSources(root) {
  const files = new Map()
  for (const path of scssFiles(root)) {
    const relativePath = relative(root, path).split(sep).join('/')
    const text = readFileSync(path, 'utf8')
    files.set(relativePath, { text, declarations: locateDeclarations(text) })
  }
  return files
}

/* ------------------------------------------------------------------ finding */

/**
 * Where a scalar `$name` is declared.
 *
 * The range deliberately stops before `!default`. That flag is what makes the variable
 * configurable through `@use ... with ()`; overwriting it would silently break every
 * downstream consumer of the ejected sources.
 */
function findScalar(files, name) {
  for (const [file, source] of files) {
    const entry = source.declarations.get(name)
    if (!entry) continue

    const declaration = entry.all.at(-1)
    const text = source.text.slice(declaration.valueStart, declaration.valueEnd)
    const bang = text.search(/\s*!default\s*$/)
    const valueEnd = bang === -1 ? declaration.valueEnd : declaration.valueStart + bang

    return { file, source, label: name, valueStart: declaration.valueStart, valueEnd }
  }
  return null
}

/** Where a key inside a Sass map is declared, descending one level for nested maps. */
function findMapEntry(files, mapName, key, subKey) {
  for (const [file, source] of files) {
    const located = mapDeclarationOf(source.text, source.declarations, mapName)
    if (!located) continue

    const entries = locateEntries(source.text, located.body)
    const entry = entries.find((candidate) => candidate.key === key)
    if (!entry) return { file, source, body: located.body, entries, missing: true, label: key }

    if (!subKey) return { file, source, body: located.body, entries, entry, label: entry.key }

    const child = entry.entries?.find((candidate) => candidate.key === subKey)
    return child
      ? { file, source, body: entry.body, entries: entry.entries, entry: child, label: `${entry.key}.${child.key}` }
      : { file, source, body: entry.body, entries: entry.entries ?? [], missing: true, label: subKey }
  }
  return null
}

const BARE_VAR = /^#?\{?\s*(\$[\w-]+)\s*\}?$/

/**
 * `$colors: ("blue": $blue)` and `--white: #{$white}` do not hold a value — they point at
 * one. Editing the map entry there would be wrong: the real declaration is the scalar, and
 * that is where a maintainer expects the change to land.
 */
function followIndirection(files, target, depth = 0) {
  if (!target || depth > 4) return target

  const text = target.source.text.slice(
    target.entry ? target.entry.valueStart : target.valueStart,
    target.entry ? target.entry.valueEnd : target.valueEnd
  )

  const bare = BARE_VAR.exec(text.trim())
  if (!bare) return target

  const scalar = findScalar(files, bare[1])
  return scalar ? followIndirection(files, scalar, depth + 1) : target
}

/* ------------------------------------------------------------------ planning */

/**
 * Work out the source edits a set of overrides implies.
 * Returns the patched files plus a per-change report, and never writes anything.
 */
export function planEject(root, doc, overrides) {
  const files = readSources(root)
  const editsByFile = new Map()
  const changes = []
  const skipped = []

  for (const path of Object.keys(overrides)) {
    const token = doc.tokens.get(path)
    if (!token) {
      skipped.push({ path, reason: 'not in the token document' })
      continue
    }

    const meta = ext(token)
    if (meta.readonly) {
      skipped.push({ path, reason: meta.readonly })
      continue
    }
    if (meta.generated) {
      skipped.push({ path, reason: `generated by ${meta.generated}; edit its source token instead` })
      continue
    }

    const target = resolveTarget(files, token, meta, path, skipped)
    if (!target) continue

    const next = sourceValueOf(doc, path)
    const edit = editFor(target, next)
    if (!edit) continue

    if (!editsByFile.has(target.file)) editsByFile.set(target.file, [])
    editsByFile.get(target.file).push(edit)

    changes.push({
      path,
      file: target.file,
      declaration: meta.sassVar ?? meta.sassMap ?? null,
      key: target.label ?? meta.sassKey ?? path.split('.').at(-1),
      from: edit.previous,
      to: next,
      inserted: Boolean(target.missing)
    })
  }

  const patched = new Map()
  for (const [file, edits] of editsByFile) {
    const source = files.get(file)
    patched.set(file, applyEdits(source.text, edits))
  }

  return { files, patched, changes, skipped }
}

function resolveTarget(files, token, meta, path, skipped) {
  if (meta.sassVar) {
    const scalar = findScalar(files, meta.sassVar)
    if (scalar) return scalar
    skipped.push({ path, reason: `no declaration of ${meta.sassVar} in the checkout` })
    return null
  }

  if (!meta.sassMap) {
    skipped.push({ path, reason: 'the token belongs to no Sass map' })
    return null
  }

  const found = findMapEntry(files, meta.sassMap, meta.sassKey ?? path.split('.').at(-1), meta.sassSubKey)
  if (!found) {
    skipped.push({ path, reason: `no declaration of ${meta.sassMap} in the checkout` })
    return null
  }

  return found.missing ? found : followIndirection(files, found)
}

/** Turn a located target plus a new value into a single splice. */
function editFor(target, text) {
  if (target.missing) return insertion(target, text)

  const start = target.entry ? target.entry.valueStart : target.valueStart
  const end = target.entry ? target.entry.valueEnd : target.valueEnd
  const previous = target.source.text.slice(start, end)

  return previous === text ? null : { start, end, text, previous }
}

/** Append a key that upstream does not have yet, matching the map's own indentation. */
function insertion(target, text) {
  const { source, body, entries } = target
  const last = entries.at(-1)
  const indent = last ? indentAt(source.text, last.entryStart) : `${indentAt(source.text, body.start)}  `

  const line = `${indent}${target.label}: ${text},\n`

  // Insert just after the final entry so the trailing comma style is preserved.
  const at = last ? last.entryEnd : body.start
  const needsBreak = last && !source.text.slice(last.entryStart, last.entryEnd).trimEnd().endsWith(',')

  return { start: at, end: at, text: `${needsBreak ? ',\n' : '\n'}${line}`.replace(/\n$/, ''), previous: null }
}
