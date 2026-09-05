/**
 * The colour maths lives in `tools/lib/color.mjs` so the CLI can use it too — the static
 * hex export and the chooser's contrast readouts have to agree, and two implementations of
 * OKLCH would eventually disagree. The dev server serves the repository root for exactly
 * this reason.
 */
export * from '../tools/lib/color.mjs'
