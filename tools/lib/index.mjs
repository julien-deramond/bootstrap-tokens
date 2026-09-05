/**
 * The package entry point.
 *
 * Exposes the parts of the pipeline that are useful outside this repository: loading the
 * token document, resolving a token to CSS, applying a theme, and emitting Sass. The
 * extractor and the CLI commands are deliberately not re-exported — they only make sense
 * against a Bootstrap checkout.
 */

export { loadTokens, loadTree, loadOptions } from './load-fs.mjs'
export { index, walk, childKeys, ext, isToken, isGroup, authoredValue, NS } from './tokens.mjs'
export { expandColorScales } from './color-scale.mjs'
export {
  withOverrides,
  diffResolved,
  themeCss,
  themeScss,
  themeJson,
  mapsTouched,
  changedKeysOf,
  createHue,
  createRole,
  validateNewName,
  clone
} from './overrides.mjs'
export { emitTokensModule, emitUseWith } from './emit-scss.mjs'
export { sourceValueOf, sourceEdits } from './source-value.mjs'
export { OPTIONS, renderOption, changedOptions } from './config-surface.mjs'
export { validate } from './validate.mjs'
export { COMPONENTS, GROUPS, SCALARS } from './sass-targets.mjs'
