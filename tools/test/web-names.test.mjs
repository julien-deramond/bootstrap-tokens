import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { repoRoot } from '../lib/config.mjs'

// The Theme Builder is plain browser modules with no bundler, so nothing resolves its names
// before a browser runs it — and the stale ones sit in the rarer branches clicking around
// misses. `ratioFor` was deleted while the role contrast warning still called it, and every
// check passed. `tsc` over the module graph is the resolver we already have; its type errors
// are noise here, so only the diagnostics that mean "this name or import goes nowhere" count.
const UNRESOLVED = new Set([
  2304, // Cannot find name 'x'.
  2552, // Cannot find name 'x'. Did you mean 'y'?
  2580, 2582, 2583, 2584, 2591, // Cannot find name 'x' — a Node or newer-lib global.
  2662, 2663, // Cannot find name 'x'. Did you mean the member 'this.x'?
  2305, 2724, 2614, // Module has no exported member 'x'.
  2307 // Cannot find module.
])

const webDir = join(repoRoot, 'web')

/** The module scripts the pages load; `tsc` follows their imports from there. */
function entryPoints() {
  return readdirSync(webDir)
    .filter((name) => name.endsWith('.html'))
    .flatMap((name) =>
      [...readFileSync(join(webDir, name), 'utf8').matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)]
        .map((match) => join(webDir, match[1]))
    )
}

/**
 * Names and imports in the graph under `entries` that resolve to nothing, as
 * `file(line,col): message`, or `null` when `tsc` is not installed here.
 */
function unresolved(entries) {
  const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc')
  if (!existsSync(tsc)) return null

  const dir = mkdtempSync(join(tmpdir(), 'bstokens-web-names-'))
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      noEmit: true,
      allowJs: true,
      checkJs: true,
      target: 'ESNext',
      module: 'ESNext',
      moduleResolution: 'bundler',
      // What a browser page has, and nothing else: no @types/node leaking `process` in.
      lib: ['ESNext', 'DOM', 'DOM.Iterable'],
      types: [],
      skipLibCheck: true
    },
    files: entries
  }))

  let output = ''
  try {
    output = execFileSync(tsc, ['--project', dir, '--pretty', 'false'], { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }

  return output.split('\n').flatMap((line) => {
    // A diagnostic with no file is `tsc` itself failing — a bad option, a missing entry —
    // and would otherwise pass as "nothing unresolved".
    if (/^error TS\d+/.test(line)) return [line]
    const match = line.match(/^(.+)\((\d+),(\d+)\): error TS(\d+): (.*)$/)
    if (!match || !UNRESOLVED.has(Number(match[4]))) return []
    return [`${match[1]}(${match[2]},${match[3]}): ${match[5]}`]
  })
}

test('every name and import in the Theme Builder resolves to something', (t) => {
  const entries = entryPoints()
  assert.ok(entries.some((path) => path.endsWith('app.js')), 'web/index.html should load app.js')

  const found = unresolved(entries)
  if (found === null) return t.skip('tsc is not installed')
  assert.deepEqual(found, [])
})

test('a call to a deleted function, and an import of a missing export, are reported', (t) => {
  // The check is only worth having if it fails on the shape of bug it exists for.
  const dir = mkdtempSync(join(tmpdir(), 'bstokens-web-names-fixture-'))
  writeFileSync(join(dir, 'lib.js'), 'export function kept() { return 1 }\n')
  writeFileSync(join(dir, 'app.js'), [
    "import { kept, removed } from './lib.js'",
    'document.title = String(kept() + ratioFor(1, 2) + removed)',
    ''
  ].join('\n'))

  const found = unresolved([join(dir, 'app.js')])
  if (found === null) return t.skip('tsc is not installed')
  assert.equal(found.length, 2, found.join('\n'))
  assert.match(found.join('\n'), /'removed'/)
  assert.match(found.join('\n'), /'ratioFor'/)
})
