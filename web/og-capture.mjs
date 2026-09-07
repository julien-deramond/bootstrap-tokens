#!/usr/bin/env node
/**
 * Re-capture the Open Graph image — the screenshot link previews show for the Theme Builder.
 *
 * It is a real screenshot of the real app rather than a drawn card, so it goes stale the
 * moment the interface moves. Making it reproducible is the whole point of this script: run
 * it, commit the PNG, and the preview is the app as it is now rather than as it was.
 *
 * The app is served by the ordinary dev server, so what is captured is the same page the
 * site deploys. Two things are seeded first, because neither is a state anyone arriving via
 * a shared link would care to see:
 *
 *   - the first-run intro card, dismissed, so the panel shows the tool rather than a
 *     welcome message;
 *   - the preview set to Light, because the default side-by-side view puts the fold
 *     through the middle of the dark half.
 *
 * Nothing else is touched. The theme is Bootstrap's own defaults — the state the app opens
 * in — so the capture is deterministic and honest about what the link leads to.
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { repoRoot } from '../tools/lib/config.mjs'

/** 1200x630 is the Open Graph standard; capturing at 2x keeps it sharp on the displays that matter. */
const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2

const OUT = join(repoRoot, 'web', 'og-image.png')

/** Written next to index.html so its relative asset URLs resolve identically, then removed. */
const SEED = join(repoRoot, 'web', '.og-capture.html')

const PORT = Number(process.env.PORT ?? 4173)

/**
 * Chrome renders it. There is no bundled browser here and adding one as a dependency to
 * regenerate a single image would cost more than the image is worth, so this uses whichever
 * Chrome is installed and says so plainly when there is none.
 */
const CHROMES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean)

function findChrome() {
  const found = CHROMES.find((path) => existsSync(path))
  if (found) return found
  throw new Error(
    'No Chrome found. Install Google Chrome or Chromium, or point $CHROME at one:\n' +
      `  CHROME=/path/to/chrome node web/og-capture.mjs\n\nLooked in:\n${CHROMES.map((p) => `  ${p}`).join('\n')}`
  )
}

/** index.html plus the two seeded bits of state, injected ahead of the module that reads them. */
function writeSeedPage() {
  const entry = '<script type="module" src="./app.js"></script>'
  const source = readFileSync(join(repoRoot, 'web', 'index.html'), 'utf8')
  if (!source.includes(entry)) {
    throw new Error(`web/index.html no longer loads app.js as \`${entry}\`, so the seed has nowhere to go.`)
  }

  const seed = `<script>
      localStorage.setItem('bootstrap-tokens.chooser.intro', 'seen')
      addEventListener('load', () => setTimeout(() => document.querySelector('[data-scheme="light"]')?.click(), 1500))
    </script>
    `

  writeFileSync(SEED, source.replace(entry, seed + entry))
}

function serve() {
  const server = spawn(process.execPath, [join(repoRoot, 'web', 'dev-server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit']
  })
  return new Promise((resolve, reject) => {
    server.stdout.once('data', () => resolve(server))
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error(`dev-server exited with ${code} before it was ready.`)))
  })
}

function capture(chrome, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        // Scrollbars are chrome, not content, and they differ per platform.
        '--hide-scrollbars',
        `--force-device-scale-factor=${SCALE}`,
        `--window-size=${WIDTH},${HEIGHT}`,
        // The app fetches tokens and compiles a preview before it has anything to show.
        // Virtual time lets that finish without the capture racing it.
        '--virtual-time-budget=15000',
        `--screenshot=${OUT}`,
        url
      ],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    )
    child.once('error', reject)
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Chrome exited with ${code}.`))))
  })
}

const chrome = findChrome()
let server

try {
  writeSeedPage()
  server = await serve()
  await capture(chrome, `http://localhost:${PORT}/web/.og-capture.html`)
} finally {
  rmSync(SEED, { force: true })
  server?.kill()
}

if (!existsSync(OUT)) throw new Error('Chrome reported success but wrote no file.')

console.log(`Captured ${WIDTH * SCALE}x${HEIGHT * SCALE} into web/og-image.png`)
console.log('If the dimensions changed, update og:image:width / og:image:height in web/index.html.')
