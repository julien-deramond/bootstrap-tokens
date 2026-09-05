import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadTokens } from '../lib/load-fs.mjs'
import { tokensDir, repoRoot } from '../lib/config.mjs'
import { emitTypeScript, emitStyleDictionary, emitTokensStudio } from '../lib/emit-consumers.mjs'

const doc = loadTokens(tokensDir)
const version = '6.0.0-alpha1'

/** A throwaway directory holding one emitted export. */
function stage(files, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bstokens-consumer-'))
  for (const [name, content] of Object.entries({ ...files, ...extra })) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  return dir
}

/*
 * These are fixture tests on purpose. Asserting the shape of what we emit only proves we
 * emitted what we meant to; the question a consumer has is whether their tool accepts it.
 * So each one runs the actual tool.
 */

/** Run the project's own `tsc` over a staged directory, as a consumer would. */
function typecheck(dir) {
  const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc')
  if (!existsSync(tsc)) return null // not installed here; the CI job that installs it runs this
  try {
    execFileSync(tsc, ['--project', dir], { encoding: 'utf8', stdio: 'pipe' })
    return ''
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    allowJs: true,
    skipLibCheck: false
  }
})

test('a consumer file typechecks against the emitted declarations', () => {
  const dir = stage(emitTypeScript(doc, { version }), {
    'tsconfig.json': TSCONFIG,
    'use.ts': `
import { tokens, ref, literal, cssVar } from './tokens.js'

const primary: string = ref('theme-color.primary.bg')
const swatch: string | undefined = literal('color.blue.500', 'dark')
const property: string | null = cssVar('spacing.base')
const described: string | undefined = tokens['bg.body'].description
export { primary, swatch, property, described }
`
  })

  const output = typecheck(dir)
  if (output === null) return
  assert.equal(output.trim(), '', 'a correct consumer file should typecheck cleanly')
})

test('a token path that does not exist is a type error', () => {
  // The union of 1200 paths is the reason to ship declarations at all: without it the
  // export is a plain object and a typo fails silently at runtime, or not at all.
  const dir = stage(emitTypeScript(doc, { version }), {
    'tsconfig.json': TSCONFIG,
    'wrong.ts': `import { ref } from './tokens.js'\nexport const oops = ref('color.blue.501')\n`
  })

  const output = typecheck(dir)
  if (output === null) return
  assert.match(output, /color\.blue\.501/)
})

test('the emitted runtime module resolves tokens the way it says it does', async () => {
  const dir = stage(emitTypeScript(doc, { version }))
  const module = await import(join(dir, 'tokens.js'))

  assert.equal(module.bootstrapVersion, version)
  assert.equal(module.cssVar('color.blue.500'), '--blue-500')
  assert.equal(module.ref('color.blue.500'), 'var(--blue-500)')
  assert.equal(module.ref('color.blue.500', '#0089c9'), 'var(--blue-500, #0089c9)')
  assert.equal(module.literal('color.blue.500'), '#0089c9')
  assert.equal(module.literal('bg.body', 'dark'), '#080a0c')
  assert.equal(Object.keys(module.group('color.blue')).length, 14)
  assert.throws(() => module.ref('color.blue.501'), /Unknown token/)
})

test('Style Dictionary builds the export into CSS custom properties', async () => {
  const StyleDictionary = await import('style-dictionary').catch(() => null)
  if (!StyleDictionary) return

  const dir = stage(emitStyleDictionary(doc, { version }))
  const sd = new (StyleDictionary.default ?? StyleDictionary)({
    source: [join(dir, 'tokens.json')],
    platforms: {
      css: {
        transforms: ['name/kebab'],
        buildPath: `${dir}/out/`,
        files: [{ destination: 'variables.css', format: 'css/variables' }]
      }
    },
    log: { verbosity: 'silent', warnings: 'disabled' }
  })
  await sd.buildAllPlatforms()

  const css = readFileSync(join(dir, 'out', 'variables.css'), 'utf8')
  assert.match(css, /--color-blue-500:/)
  // References resolved rather than printed: that is what makes the graph worth keeping.
  assert.doesNotMatch(css, /\{color\./)
  assert.match(css, /--spacing-base: 1rem;/)
  // Values pass through untouched. Style Dictionary's colour transforms would rewrite
  // `rgb(0 0 0 / 50%)` as `#000000`, dropping the alpha, so the config does not use them.
  assert.match(css, /--dialog-backdrop-bg: rgb\(0 0 0 \/ 50%\);/)
})

test('Style Dictionary reads the emitted configs as written', async () => {
  const StyleDictionary = await import('style-dictionary').catch(() => null)
  if (!StyleDictionary) return

  const files = emitStyleDictionary(doc, { version })
  const dir = stage(files)
  const Constructor = StyleDictionary.default ?? StyleDictionary

  // The configs are used exactly as emitted; only their relative paths are anchored to the
  // staging directory, the way running the CLI from that directory would.
  const anchor = (config) => ({
    ...config,
    source: config.source.map((file) => join(dir, file)),
    ...(config.include ? { include: config.include.map((file) => join(dir, file)) } : {}),
    platforms: { css: { ...config.platforms.css, buildPath: `${dir}/out/` } },
    log: { verbosity: 'silent', warnings: 'disabled' }
  })

  await new Constructor(anchor(JSON.parse(files['config.json']))).buildAllPlatforms()
  const darkConfig = (await import(`file://${join(dir, 'config.dark.mjs')}`)).default
  await new Constructor(anchor(darkConfig)).buildAllPlatforms()

  assert.ok(existsSync(join(dir, 'out', 'variables.css')))
  const dark = readFileSync(join(dir, 'out', 'variables-dark.css'), 'utf8')
  assert.match(dark, /\[data-bs-theme=dark\]/)
  assert.match(dark, /--fg-body: color-mix\(in oklch, #fff 90%/)
  assert.match(dark, /--dialog-backdrop-bg: rgb\(0 0 0 \/ 65%\);/)

  // Only what changes: a dark block that restates the whole document would win every
  // cascade it should not, and would be wrong the moment a light value is overridden.
  assert.doesNotMatch(dark, /--accordion-padding-x/)
  const declarations = dark.split('\n').filter((line) => line.trim().startsWith('--')).length
  assert.ok(declarations > 50 && declarations < 200, `${declarations} declarations in the dark file`)
})

test('the Tokens Studio file is the shape Tokens Studio expects', () => {
  const files = emitTokensStudio(doc, { version })
  const file = JSON.parse(files['tokens.json'])

  assert.deepEqual(file.$metadata.tokenSetOrder, ['light', 'dark'])
  assert.equal(file.$themes.length, 2)
  assert.deepEqual(file.$themes[0].selectedTokenSets, { light: 'enabled' })

  // Types drive which Figma property a token can bind to, so a wrong one is not cosmetic.
  const STUDIO_TYPES = new Set([
    'color', 'sizing', 'spacing', 'borderRadius', 'borderWidth', 'opacity', 'boxShadow',
    'fontFamilies', 'fontWeights', 'fontSizes', 'lineHeights', 'other'
  ])

  let count = 0
  const check = (node, at = []) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      const path = [...at, key].join('.')
      if (value && typeof value === 'object' && 'value' in value) {
        count++
        assert.ok(STUDIO_TYPES.has(value.type), `${path}: unknown Tokens Studio type ${value.type}`)
        assert.equal(typeof value.value, 'string')
        assert.ok(value.value.length > 0, `${path} is empty`)
        // Figma cannot hold a reference, a cascade, or a colour it has to compute.
        assert.doesNotMatch(value.value, /var\(|light-dark\(|color-mix\(|\{[\w.]+\}/, path)
      } else if (value && typeof value === 'object') {
        check(value, [...at, key])
      }
    }
  }
  check(file.light)
  assert.ok(count > 1000, `expected the whole palette, got ${count}`)

  assert.equal(file.light.color.blue['500'].value, '#0089c9')
  assert.equal(file.light.color.blue['500'].type, 'color')
  assert.equal(file.dark.bg.body.value, '#080a0c')
  assert.equal(file.light.radius['5'].type, 'borderRadius')
  assert.equal(file.light.spacing.base.type, 'spacing')
})

test('what Figma cannot hold is listed with a reason, not dropped', () => {
  const dropped = JSON.parse(emitTokensStudio(doc, { version })['not-exported.json'])
  assert.match(dropped.light['badge.color'], /inherit/)
  assert.match(dropped.light['btn.font-weight'], /custom property/)
  for (const reason of Object.values(dropped.light)) assert.ok(reason.length > 0)
})

test('context-dependent values say so in the file a designer opens', () => {
  const file = JSON.parse(emitTokensStudio(doc, { version })['tokens.json'])
  const token = file.light['navbar-nav']['nav-link-color']
  assert.deepEqual(token.$extensions['dev.bootstrap.tokens'].contextual, ['--navbar-color'])
})
