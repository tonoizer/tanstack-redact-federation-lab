import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import scenarios from '../shared/scenarios.json' with { type: 'json' }

// One transport policy for all four builds: HTTP loopback, gzip, no cache.
export async function startBenchmarkServers(scenario) {
  if (!scenarios.includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`)
  process.env.NODE_ENV = 'production'
  const host = (await import(pathToFileURL(resolve(`dist/${scenario}/host/server/server.js`)).href)).default
  const servers = []
  const cache = new Map()
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }
  try {
    for (const [index, app] of ['host', 'counter', 'context', 'portal'].entries()) {
      const root = resolve(`dist/${scenario}/${app}${app === 'host' ? '/client' : ''}`)
      const server = createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Vary', 'Accept-Encoding')
        try {
          const url = new URL(req.url, 'http://localhost:4100')
          const path = resolve(root, '.' + decodeURIComponent(url.pathname))
          if (!path.startsWith(root + sep) && path !== root) { res.writeHead(403).end(); return }
          let body, type, status = 200
          if (await stat(path).then(s => s.isFile()).catch(() => false)) {
            if (!cache.has(path)) cache.set(path, await readFile(path))
            body = cache.get(path)
            type = mime[extname(path)] ?? 'application/octet-stream'
          } else if (app === 'host' && url.pathname === '/') {
            const response = await host.fetch(new Request(url))
            status = response.status
            type = response.headers.get('content-type') ?? 'text/html'
            body = Buffer.from(await response.arrayBuffer())
          } else { res.writeHead(404).end('Not found'); return }
          const compress = /gzip/.test(req.headers['accept-encoding'] ?? '') && /javascript|css|html|json/.test(type)
          if (compress) { body = gzipSync(body); res.setHeader('Content-Encoding', 'gzip') }
          res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length })
          res.end(body)
        } catch (error) { console.error(error); res.writeHead(500).end('Benchmark server error') }
      })
      await new Promise((done, reject) => { server.once('error', reject); server.listen(4100 + index, 'localhost', done) })
      servers.push(server)
    }
  } catch (error) { for (const server of servers) server.close(); throw error }
  return async () => {
    for (const server of servers) server.closeAllConnections()
    await Promise.all(servers.map(server => new Promise(done => server.close(done))))
  }
}

if (process.argv[2]) {
  const close = await startBenchmarkServers(process.argv[2])
  process.send?.({ ready: true })
  process.on('message', async message => { if (message === 'close') { await close(); process.exit(0) } })
}
