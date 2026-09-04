/** Placeholder until the chooser lands; keeps `build` self-contained. */
export function emitChooserData(doc, { version }) {
  return `${JSON.stringify({ version, tokens: {} }, null, 2)}\n`
}
