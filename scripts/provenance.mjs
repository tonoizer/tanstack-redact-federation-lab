import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const ignored = path => /(^|\/)(\.wrangler|\.tanstack)(\/|$)|routeTree\.gen\.ts$|(^|\/)benchmark\.json$/.test(path)
function files(root, directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (ignored(relative(root, path).replaceAll('\\', '/'))) return []
    return entry.isDirectory() ? files(root, path) : [path]
  })
}
function entries(root, paths) {
  return paths.sort().map(path => ({ path: relative(root, path).replaceAll('\\', '/'), sha256: hash(readFileSync(path)) }))
}
export function sourceProvenance(root = process.cwd()) {
  const sourceFiles = ['apps', 'shared', 'scripts'].flatMap(dir => files(root, join(root, dir)))
  sourceFiles.push(...['package.json', 'package-lock.json', 'tsconfig.json'].map(name => join(root, name)).filter(existsSync))
  const sourceEntries = entries(root, sourceFiles)
  let gitHead = null, dirtyFiles = []
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    dirtyFiles = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'apps', 'shared', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json'], { cwd: root, encoding: 'utf8' }).split('\n').filter(line => line && !ignored(line.slice(3)))
  } catch {}
  return { gitHead, sourceCommit: dirtyFiles.length ? null : gitHead, dirtyFiles, sourceDigest: hash(JSON.stringify(sourceEntries)), files: sourceEntries }
}
export function outputProvenance(scenario, root = process.cwd()) {
  const dir = join(root, 'dist', scenario)
  const outputFiles = files(dir, dir).filter(path => !path.endsWith('build.json'))
  const outputEntries = entries(dir, outputFiles)
  return { outputDigest: hash(JSON.stringify(outputEntries)), files: outputEntries }
}
export function validateBuild(scenario, manifest, root = process.cwd()) {
  if (manifest.source?.sourceDigest !== sourceProvenance(root).sourceDigest) throw new Error(`Stale source for ${scenario}. Run npm run build -- all before benchmarking.`)
  const current = outputProvenance(scenario, root)
  if (manifest.outputs?.outputDigest !== current.outputDigest) throw new Error(`Changed build output for ${scenario}. Rebuild before benchmarking.`)
  return current.outputDigest
}
