/**
 * Find a full ffmpeg to encode with.
 *
 * Like Chrome (see `chrome.mjs`), there is no bundled copy: adding one as a dependency would
 * cost more than the one script that needs it is worth. `web/demo-capture.mjs` uses it to
 * turn a recording into the README's GIF; this says plainly when there is none.
 *
 * Playwright's own ffmpeg build is no substitute: it only writes the WebM it records.
 */
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

const FIXED = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg'
]

export function findFfmpeg() {
  const onPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, 'ffmpeg'))
  const candidates = [process.env.FFMPEG, ...onPath, ...FIXED].filter(Boolean)
  const found = candidates.find((path) => existsSync(path))
  if (found) return found
  throw new Error(
    'No ffmpeg found. Install it (macOS: `brew install ffmpeg`), or point $FFMPEG at one:\n' +
      '  FFMPEG=/path/to/ffmpeg ...'
  )
}
