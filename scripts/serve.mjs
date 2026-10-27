import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { preview } from 'vite'
const scenario = process.argv[2] ?? 'redact-shared'
if (!['react', 'redact-naive', 'redact-shared'].includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`)
process.env.LAB_SCENARIO = scenario
const servers = []
for (const [index, name] of ['counter', 'context', 'portal'].entries()) {
  const root = resolve(`dist/${scenario}/${name}`)
  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    try {
      const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
      if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return }
      const data = await readFile(path)
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html' })[extname(path)] ?? 'application/octet-stream')
      res.end(data)
    } catch { res.writeHead(404).end('Not found') }
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(4101 + index, 'localhost', done) })
  servers.push(server)
}
const host = await preview({ configFile: 'apps/host/vite.config.ts', preview: { host: 'localhost', port: 4100, strictPort: true } })
console.log(`\n${scenario} running at http://localhost:4100`)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  for (const server of servers) server.close()
  host.httpServer.close(() => process.exit(0))
})
