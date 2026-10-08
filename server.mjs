// Production server: serves the built dist/ and proxies Claude at /api/chat.
// The Anthropic API key is read from .env on the SERVER and never exposed to
// the browser.  Run:  npm run build && npm start
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

// ── minimal .env loader (no dotenv dependency) ────────────────
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const KEY = process.env.ANTHROPIC_API_KEY
const PORT = process.env.PORT || 4173
const DIST = join(process.cwd(), 'dist')
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.map': 'application/json',
}

async function chat(req, res) {
  if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return }
  if (!KEY) { res.statusCode = 503; res.end('ANTHROPIC_API_KEY is not set on the server (.env)'); return }
  let body = ''
  for await (const c of req) body += c
  let payload
  try { payload = JSON.parse(body || '{}') } catch { res.statusCode = 400; res.end('bad json'); return }
  const client = new Anthropic({ apiKey: KEY })
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-cache')
  try {
    const stream = client.messages.stream({
      model: payload.model || 'claude-opus-4-8',
      max_tokens: 1024,
      system: payload.system,
      messages: payload.messages || [],
    })
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') res.write(ev.delta.text)
    }
    res.end()
  } catch (e) {
    if (!res.headersSent) { res.statusCode = e?.status || 500; res.end(String(e?.message || 'error')) }
    else res.end()
  }
}

const server = http.createServer(async (req, res) => {
  const url = req.url || '/'
  if (url.startsWith('/api/health')) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true, hasKey: !!KEY }))
    return
  }
  if (url.startsWith('/api/chat')) return chat(req, res)

  // static file serving with SPA fallback
  let p = decodeURIComponent(url.split('?')[0])
  if (p.includes('..')) { res.statusCode = 400; res.end('bad path'); return }
  let file = join(DIST, p)
  try {
    const s = await stat(file)
    if (s.isDirectory()) file = join(file, 'index.html')
  } catch {
    file = join(DIST, 'index.html') // SPA fallback
  }
  try {
    const data = await readFile(file)
    res.setHeader('content-type', MIME[extname(file)] || 'application/octet-stream')
    res.end(data)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
})

server.listen(PORT, () => {
  console.log(`\n  OBEC Zero Dropout — http://localhost:${PORT}`)
  console.log(`  Claude API: ${KEY ? 'connected (server-side key)' : 'NO KEY — set ANTHROPIC_API_KEY in .env'}\n`)
})
