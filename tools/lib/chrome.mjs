/**
 * Find a local Chrome or Chromium to drive headlessly.
 *
 * There is no bundled browser here and adding one as a dependency would cost more than the
 * odd script that needs one is worth, so this uses whichever Chrome is installed and says so
 * plainly when there is none. Shared by anything that asks a real browser a question the
 * resolver cannot answer alone: `web/og-capture.mjs` for the link-preview screenshot,
 * `tools/commands/probe.mjs` for flattened colours, and its automated check on the pasted-
 * markup sanitiser.
 */
import { existsSync } from 'node:fs'

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean)

export function findChrome() {
  const found = CANDIDATES.find((path) => existsSync(path))
  if (found) return found
  throw new Error(
    'No Chrome found. Install Google Chrome or Chromium, or point $CHROME at one:\n' +
      `  CHROME=/path/to/chrome ...\n\nLooked in:\n${CANDIDATES.map((path) => `  ${path}`).join('\n')}`
  )
}
