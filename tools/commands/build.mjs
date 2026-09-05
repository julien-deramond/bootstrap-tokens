import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { ext, walk } from '../lib/tokens.mjs'
import { loadTokens, loadTree } from '../lib/load-fs.mjs'
import { emitTokensModule, emitUseWith, mapEntries } from '../lib/emit-scss.mjs'
import { emitTypeScript, emitStyleDictionary, emitTokensStudio } from '../lib/emit-consumers.mjs'
import { tokensDir, buildDir, repoRoot } from '../lib/config.mjs'
import { COMPONENTS } from '../lib/sass-targets.mjs'

/** The Bootstrap version the token document was extracted from. */
export function sourceVersion() {
  try {
    return JSON.parse(readFileSync(join(repoRoot, 'tokens', 'meta.json'), 'utf8')).bootstrap
  } catch {
    return '6.0.0-alpha1'
  }
}

/** Every token as a flat `--custom-property: value` list, in emission order. */
export function cssDeclarations(doc) {
  const root = []
  const scoped = new Map()

  const maps = mapEntries(doc)
  for (const [mapName, entries] of maps) {
    const component = COMPONENTS.find((c) => c.sassMap === mapName)
    for (const entry of entries) {
      const token = doc.tokens.get(entry.path)
      if (!token) continue
      const meta = ext(token)
      if (!meta.cssVar) continue

      const declaration = [meta.cssVar, doc.cssValueOf(entry.path)]
      if (component) {
        if (!scoped.has(component.selector)) scoped.set(component.selector, [])
        scoped.get(component.selector).push(declaration)
      } else {
        root.push(declaration)
      }
    }
  }

  // The generated colour scale is emitted on :root ahead of everything else, as upstream does.
  const scale = []
  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    if (meta.generated === 'color-scale' && meta.cssVar) scale.push([meta.cssVar, doc.cssValueOf(path)])
  }

  return { root: [...scale, ...root], scoped }
}

function emitCss(doc) {
  const { root, scoped } = cssDeclarations(doc)
  const lines = [':root,', ':host {']
  for (const [name, value] of root) lines.push(`  ${name}: ${value};`)
  lines.push('}')

  for (const [selector, declarations] of scoped) {
    lines.push('', `${selector} {`)
    for (const [name, value] of declarations) lines.push(`  ${name}: ${value};`)
    lines.push('}')
  }

  return `${lines.join('\n')}\n`
}

/** Fully resolved DTCG: every `$value` replaced by the CSS it compiles to. */
function emitResolvedJson(doc) {
  const out = {}
  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    out[path] = {
      $type: token.$type ?? null,
      $value: doc.cssValueOf(path),
      ...(token.$description ? { $description: token.$description } : {}),
      ...(meta.cssVar ? { cssVar: meta.cssVar } : {}),
      ...(meta.sassMap ? { sassMap: meta.sassMap } : {})
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

export async function build({ flags }) {
  const doc = loadTokens(tokensDir)
  const version = sourceVersion()
  const importPath = flags.import ?? 'bootstrap/scss/bootstrap'

  const outputs = {
    'scss/_tokens.scss': emitTokensModule(doc, { version }),
    'scss/bootstrap-custom.scss': emitUseWith(doc, { version, importPath }),
    'css/tokens.css': emitCss(doc),
    'json/tokens.resolved.json': emitResolvedJson(doc)
  }

  // The web chooser loads the unexpanded tree and runs the very same resolver in the browser.
  outputs['json/tokens.tree.json'] = `${JSON.stringify(loadTree(tokensDir).tree)}\n`

  // Three more shapes, for consumers that are not Sass. See tools/lib/emit-consumers.mjs
  // for why each is different rather than one export renamed three times.
  for (const [file, content] of Object.entries(emitTypeScript(doc, { version }))) {
    outputs[`ts/${file}`] = content
  }
  for (const [file, content] of Object.entries(emitStyleDictionary(doc, { version }))) {
    outputs[`style-dictionary/${file}`] = content
  }
  for (const [file, content] of Object.entries(emitTokensStudio(doc, { version }))) {
    outputs[`figma/${file}`] = content
  }

  for (const [relative, content] of Object.entries(outputs)) {
    const path = join(buildDir, relative)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
    console.log(`  ${String(content.length).padStart(8)} B  build/${relative}`)
  }

  const { emitInventory } = await import('../lib/emit-docs.mjs')
  const inventory = join(repoRoot, 'docs', 'token-inventory.md')
  writeFileSync(inventory, emitInventory(doc, { version }))
  console.log(`  ${String(0).padStart(8)} -  docs/token-inventory.md`)

  console.log(`\nBuilt ${doc.tokens.size} tokens for Bootstrap ${version}.`)
  return 0
}
