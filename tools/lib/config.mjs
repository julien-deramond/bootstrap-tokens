import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const tokensDir = join(repoRoot, 'tokens')
export const buildDir = join(repoRoot, 'build')

/**
 * Where the Bootstrap v6-dev checkout lives. In order: `--src`, `$BOOTSTRAP_SRC`,
 * `bootstrap-tokens.config.json`, then a few conventional sibling paths.
 */
export function resolveBootstrapSource(explicit) {
  const candidates = [explicit, process.env.BOOTSTRAP_SRC, fromConfigFile()].filter(Boolean)

  candidates.push(
    join(repoRoot, '..', 'bootstrap'),
    join(repoRoot, 'vendor', 'bootstrap'),
    join(repoRoot, 'node_modules', 'bootstrap')
  )

  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (existsSync(join(path, 'scss', '_root.scss'))) return path
  }

  throw new Error(
    'No Bootstrap v6-dev checkout found. Pass --src <path>, set BOOTSTRAP_SRC, or add\n' +
      '  { "bootstrapSource": "<path>" }\n' +
      'to bootstrap-tokens.config.json. Clone it with:\n' +
      '  git clone --depth 1 -b v6-dev https://github.com/twbs/bootstrap.git ../bootstrap'
  )
}

function fromConfigFile() {
  const path = join(repoRoot, 'bootstrap-tokens.config.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')).bootstrapSource ?? null
  } catch {
    return null
  }
}

/** Minimal flag parsing: `--key value`, `--key=value`, `--flag`. */
export function parseArgs(argv) {
  const flags = {}
  const positional = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s)
    if (inline !== undefined) {
      flags[key] = inline
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      flags[key] = argv[++i]
    } else {
      flags[key] = true
    }
  }

  return { flags, positional }
}
