// Roda o Worker localmente (http://localhost:8787) para desenvolvimento, sem Cloudflare.
// Uso: GITHUB_CLIENT_SECRET=... node scripts/dev-proxy.mjs
import { createServer } from 'node:http'
import worker from '../worker/index.js'

const env = {
  GITHUB_CLIENT_ID: 'Ov23lieSJoRLk2tDkKDa',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? '',
  ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:4173',
}
const port = Number(process.env.PORT ?? 8787)

createServer(async (req, res) => {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const body = chunks.length ? Buffer.concat(chunks) : undefined
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  })
  const response = await worker.fetch(request, env)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  if (response.body) for await (const chunk of response.body) res.write(chunk)
  res.end()
}).listen(port, () => console.log(`Batide dev proxy em http://localhost:${port}`))
