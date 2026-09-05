/**
 * Checks that the token document is internally sound before anything is generated from it.
 *
 * The interesting rule is the layer direction: component tokens may reference semantic
 * tokens, semantic tokens may reference primitives, and nothing may reference upward. That
 * is the one property that makes a token system re-skinnable, and it is easy to break by
 * hand, so it is checked rather than trusted.
 */

import { ext, walk, referencesOf, isToken, isGroup } from './tokens.mjs'
import { lintValue } from './css-lint.mjs'
import { COMPONENTS } from './sass-targets.mjs'
import { FILE_FOR_GROUP } from './curation.mjs'

const DTCG_TYPES = new Set([
  'color',
  'dimension',
  'fontFamily',
  'fontWeight',
  'duration',
  'cubicBezier',
  'number',
  'strokeStyle',
  'border',
  'transition',
  'shadow',
  'gradient',
  'typography'
])

const LAYER_RANK = { primitive: 0, semantic: 1, component: 2 }
const componentNames = new Set(COMPONENTS.map((c) => c.name))

/** Which layer a token path belongs to, from its root group. */
export function layerOf(path) {
  const group = path.split('.')[0]
  if (componentNames.has(group)) return 'component'
  const file = FILE_FOR_GROUP[group]
  if (file?.startsWith('semantic/')) return 'semantic'
  return 'primitive'
}

export function validate(doc, { strict = false } = {}) {
  const errors = []
  const warnings = []
  const findings = []
  const seenCssVars = new Map()

  for (const [path, token] of walk(doc.tree)) {
    const meta = ext(token)
    const layer = layerOf(path)

    // --- DTCG shape ---
    if (token.$value === undefined) errors.push(`${path}: missing $value`)
    if (token.$type !== undefined && !DTCG_TYPES.has(token.$type)) {
      errors.push(`${path}: "${token.$type}" is not a DTCG type`)
    }

    /*
     * DTCG requires a resolvable `$type`. A handful of Bootstrap's values have no DTCG type
     * at all — `nowrap`, a `url()` data URI, a property list like "color, background-color",
     * a percentage, an aspect ratio. Rather than lie about those with a wrong type or leave
     * the gap unmarked, they carry `css: true`, which says "raw CSS, pass it through".
     * Everything else must be typed, so the escape hatch cannot quietly become the norm.
     */
    if (!token.$type && !meta.css && !meta.generated) {
      errors.push(`${path}: needs a $type, or \`css: true\` if it is a raw CSS value DTCG cannot express`)
    }
    if (token.$extensions && Object.keys(token.$extensions).some((key) => !key.includes('.'))) {
      errors.push(`${path}: $extensions keys must be reverse-DNS namespaced`)
    }

    // --- custom property uniqueness ---
    if (meta.cssVar) {
      if (seenCssVars.has(meta.cssVar) && !meta.sassMap?.endsWith('-tokens')) {
        errors.push(`${path}: ${meta.cssVar} is already emitted by ${seenCssVars.get(meta.cssVar)}`)
      }
      seenCssVars.set(meta.cssVar, path)
    }

    // --- documentation ---
    // Only the semantic layer is required. A primitive scale step is described by its group
    // ("the spacing scale"), and demanding a line for every component token would buy 676
    // restatements of the token's own name.
    if (layer === 'semantic' && !token.$description && !meta.generated) {
      errors.push(`${path}: a semantic token needs a $description — it is where meaning lives`)
    }

    // --- references ---
    for (const reference of referencesOf(token)) {
      const target = doc.tokens.get(reference)
      if (!target) {
        errors.push(`${path}: references {${reference}}, which does not exist`)
        continue
      }

      const from = LAYER_RANK[layer]
      const to = LAYER_RANK[layerOf(reference)]

      if (to > from) {
        errors.push(`${path} (${layer}) references {${reference}} (${layerOf(reference)}) — layers only reference downward`)
      }
      if (strict && layer === 'component' && layerOf(reference) === 'primitive') {
        warnings.push(`${path} reaches past the semantic layer to {${reference}}`)
      }
    }

    // --- resolution (also catches cycles) ---
    // A resolved value is also the first point at which we can ask whether the CSS actually
    // works, as opposed to whether we copied it correctly. See `css-lint.mjs`.
    try {
      const resolved = doc.cssValueOf(path)
      for (const finding of lintValue(resolved)) findings.push(`${path}: ${finding}`)
    } catch (error) {
      errors.push(`${path}: ${error.message}`)
    }
  }

  // --- structural: a node is a token or a group, never both ---
  const checkShape = (node, at = '') => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('$')) continue
      const path = at ? `${at}.${key}` : key
      if (isToken(value) && Object.keys(value).some((k) => !k.startsWith('$'))) {
        errors.push(`${path}: a token cannot also contain child groups`)
      }
      if (isGroup(value)) checkShape(value, path)
    }
  }
  checkShape(doc.tree)

  return { errors, warnings, findings }
}
