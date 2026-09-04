#!/usr/bin/env node
/**
 * A static server for the chooser. It serves the repository root, because the page imports
 * the same modules the CLI uses (`../tools/lib/*.mjs`) rather than a bundled copy — one
 * implementation of token resolution, not two.
 */

import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

import { repoRoot } from '../tools/lib/config.mjs'

const PORT = Number(process.env.PORT ?? 4000)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
}

createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)

  // Redirect rather than rewrite: the page uses relative URLs, so the browser has to know
  // it is at /web/ or every ./asset resolves against the root.
  if (pathname === '/') {
    response.writeHead(302, { location: '/web/' })
    response.end()
    return
  }
  if (pathname.endsWith('/')) pathname += 'index.html'

  const path = join(repoRoot, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))

  try {
    if (statSync(path).isDirectory()) throw new Error('directory')
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' })
    response.end(`Not found: ${pathname}`)
    return
  }

  response.writeHead(200, {
    'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
    'cache-control': 'no-cache'
  })
  createReadStream(path).pipe(response)
}).listen(PORT, () => {
  console.log(`Token chooser: http://localhost:${PORT}/`)
})
