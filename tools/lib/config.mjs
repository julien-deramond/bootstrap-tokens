import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const tokensDir = join(repoRoot, 'tokens')
export const buildDir = join(repoRoot, 'build')

/**
 * Where the Bootstrap source lives. In order: `--src`, `$BOOTSTRAP_SRC`,
 * `bootstrap-tokens.config.json`, then `node_modules/bootstrap` — the release pinned in
 * `package.json`, which `npm ci` installs.
 *
 * There is deliberately no guessing beyond that. A sibling `../bootstrap` clone used to be
 * picked up on its own, which meant a contributor with a `main` checkout next door built
 * against something other than what CI builds against and never knew it. A checkout is
 * still one flag away — `eject` against `main` is how upstream pull requests are prepared —
 * but it has to be asked for.
 */
export function resolveBootstrapSource(explicit) {
  const isSource = (path) => existsSync(join(path, 'scss', '_root.scss'))

  /*
   * A source you named and that isn't there is an error, not a reason to try the next one.
   * Falling through to the pinned release would answer a question about `main` with the
   * release, and a "no differences" from that comparison would be wrong in a way nobody sees.
   */
  const named = [
    [explicit, '--src'],
    [process.env.BOOTSTRAP_SRC, '$BOOTSTRAP_SRC'],
    [fromConfigFile(), 'bootstrap-tokens.config.json']
  ].find(([value]) => value)
  if (named) {
    const [value, from] = named
    const path = resolve(value)
    if (isSource(path)) return path
    throw new Error(`${path} (from ${from}) is not a Bootstrap source: it has no scss/_root.scss.`)
  }

  /*
   * The installed release: ours, from `npm ci` in this repository, or — when bootstrap-tokens
   * is itself a dependency, as in a scaffolded project — the `bootstrap` npm hoisted next to it.
   */
  const installed = [join(repoRoot, 'node_modules', 'bootstrap')]
  if (basename(dirname(repoRoot)) === 'node_modules') installed.push(join(dirname(repoRoot), 'bootstrap'))
  for (const path of installed) if (isSource(path)) return path

  throw new Error(
    'No Bootstrap source found. Run `npm ci` to install the pinned release, or point at a\n' +
      'checkout with --src <path>, $BOOTSTRAP_SRC, or\n' +
      '  { "bootstrapSource": "<path>" }\n' +
      'in bootstrap-tokens.config.json.'
  )
}

/** The Bootstrap release this repository's `package.json` pins, which `npm ci` installs and CI uses. */
export function pinnedBootstrap() {
  try {
    return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).devDependencies?.bootstrap ?? null
  } catch {
    return null
  }
}

/**
 * One line saying which Bootstrap a command is about to read, and a warning when it is not
 * the pinned release. A warning, not an error: a `main` checkout is a legitimate thing to
 * point at — that is how the next release is previewed — but a result built from it should
 * never be mistaken for one built from the release.
 */
export function describeBootstrapSource(source) {
  let version = 'unknown'
  try {
    version = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {}

  const pinned = pinnedBootstrap()
  const line = `Bootstrap ${version} at ${source}`
  const warning =
    pinned && version !== pinned
      ? `this is Bootstrap ${version}; bootstrap-tokens is built and checked against ${pinned}.`
      : null

  return { version, pinned, line, warning }
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
