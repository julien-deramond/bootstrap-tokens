#!/usr/bin/env node
/**
 * Re-record the README's motion demo: media/theme-builder.gif.
 *
 * The README hero should show what the Theme Builder does (a few choices re-theming real
 * Bootstrap components, then the Sass they export), and a still cannot. Like the link preview
 * (`web/og-capture.mjs`), it is a capture of the real app, so it is a script rather than a
 * file somebody once made: re-run it when the interface moves and commit the GIF.
 *
 *   npm run demo
 *
 * Needs, on the machine and not as dependencies: Google Chrome or Chromium (`$CHROME`), a full
 * ffmpeg (`$FFMPEG`, `brew install ffmpeg`), and Playwright's small ffmpeg build that records
 * the video (`npx playwright-core install ffmpeg`, once).
 *
 * The storyboard is a loop that ends where it starts, with no text overlay:
 *
 *   brand color to teal, corner radius to Pillowy, typeface to Serif,
 *   open Export to show the Sass, close it, Reset all.
 *
 * The app is served by the ordinary dev server. The first-run intro card is seeded as seen,
 * the preview is Side by side so light and dark re-theme together, and reduced motion is not
 * emulated: the flash on the section that changed is part of the demo.
 */

import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright-core'

import { repoRoot } from '../tools/lib/config.mjs'
import { findChrome } from '../tools/lib/chrome.mjs'
import { findFfmpeg } from '../tools/lib/ffmpeg.mjs'

const WIDTH = 1280
const HEIGHT = 800
const FPS = 15
const MAX_BYTES = 2 * 1024 * 1024
/** GIF widths to try, widest first, until one fits. The README shows it at about 830 px. */
const WIDTHS = [800, 720, 640, 560]

const PORT = Number(process.env.PORT ?? 4000)
const OUT = join(repoRoot, 'media', 'theme-builder.gif')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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

/** Play the storyboard; resolves with the video's path and where in it the demo starts and ends. */
async function record(videoDir) {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--hide-scrollbars'] })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } }
  })
  await context.addInitScript(() => {
    localStorage.setItem('bootstrap-tokens.chooser.intro', 'seen')
  })

  const page = await context.newPage()
  const opened = Date.now()
  await page.goto(`http://localhost:${PORT}/web/`)
  await page.locator('#reset').waitFor()
  await page.locator('[data-scheme="split"]').click()
  await page.locator('[data-scenario="components"]').click()
  // The app fetches tokens and compiles a preview before it has anything to show.
  await page.waitForFunction(() => document.querySelector('#brand-sub')?.textContent !== 'Loading…')
  await wait(1500)

  const start = (Date.now() - opened) / 1000
  const dial = (label) => page.locator(`[role=group][aria-label="${label}"]`)

  await wait(400)
  await page.locator('button.hue[aria-label="teal"]').first().click()
  await wait(1200)
  await dial('Corner radius').getByRole('button', { name: 'Pillowy' }).click()
  await wait(1100)
  await dial('Typeface').getByRole('button', { name: 'Serif' }).click()
  await wait(1000)
  await page.locator('#open-export').click()
  await wait(1800)
  await page.keyboard.press('Escape')
  await wait(300)
  await page.locator('#reset').click()
  // Reset leaves the controls panel wherever the last click scrolled it; bring it home so the loop closes.
  await page.locator('.panel-body').evaluate((element) => element.scrollTo({ top: 0, behavior: 'smooth' }))
  await wait(900)
  const end = (Date.now() - opened) / 1000

  const video = page.video()
  await context.close()
  const path = await video.path()
  await browser.close()
  return { path, start, end }
}

function ffmpeg(args) {
  const run = spawnSync(findFfmpeg(), ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`ffmpeg failed:\n${run.stderr}`)
}

/** Encode the storyboard span as a GIF, narrowing it until it fits the size limit. */
function encode({ path, start, end }, workDir) {
  mkdirSync(join(repoRoot, 'media'), { recursive: true })
  for (const width of WIDTHS) {
    const palette = join(workDir, 'palette.png')
    const filters = `fps=${FPS},scale=${width}:-1:flags=lanczos`
    const span = ['-ss', start.toFixed(2), '-t', (end - start).toFixed(2), '-i', path]
    ffmpeg([...span, '-vf', `${filters},palettegen=max_colors=128:stats_mode=diff`, palette])
    ffmpeg([
      ...span,
      '-i', palette,
      '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      '-loop', '0',
      OUT
    ])
    const bytes = statSync(OUT).size
    if (bytes <= MAX_BYTES) return { width, bytes, seconds: end - start }
  }
  throw new Error(`Even ${WIDTHS.at(-1)} px is over ${MAX_BYTES} bytes: shorten the storyboard or lower the fps.`)
}

findChrome()
findFfmpeg()

const workDir = mkdtempSync(join(tmpdir(), 'bootstrap-tokens-demo-'))
let server
try {
  server = await serve()
  const recording = await record(workDir)
  const { width, bytes, seconds } = encode(recording, workDir)
  console.log(`Wrote media/theme-builder.gif: ${width} px wide, ${seconds.toFixed(1)} s, ${(bytes / 1024).toFixed(0)} KB`)
} finally {
  server?.kill()
  rmSync(workDir, { recursive: true, force: true })
}
