import { defineConfig, loadEnv, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Server-side Claude proxy. The Anthropic API key lives ONLY on the server
 * (read from .env → ANTHROPIC_API_KEY) and is never sent to the browser.
 * The frontend POSTs { system, messages, model } to /api/chat and streams
 * back plain-text deltas.
 */
function claudeApi(apiKey?: string): PluginOption {
  const health = (_req: unknown, res: any) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true, hasKey: !!apiKey }))
  }
  const chat = async (req: any, res: any) => {
    if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return }
    if (!apiKey) { res.statusCode = 503; res.end('ANTHROPIC_API_KEY is not set on the server (.env)'); return }
    let body = ''
    for await (const c of req) body += c
    let payload: any
    try { payload = JSON.parse(body || '{}') } catch { res.statusCode = 400; res.end('bad json'); return }
    const client = new Anthropic({ apiKey })
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
    } catch (e: any) {
      if (!res.headersSent) { res.statusCode = e?.status || 500; res.end(String(e?.message || 'error')) }
      else res.end()
    }
  }
  return {
    name: 'claude-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/health', health)
      server.middlewares.use('/api/chat', chat)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/health', health)
      server.middlewares.use('/api/chat', chat)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  // Netlify และ dev server เสิร์ฟจากรากโดเมน จึงใช้ '/' เป็นค่าปกติ
  // ส่วน GitHub Pages เสิร์ฟใต้ /<repo>/ — workflow จะตั้ง GITHUB_PAGES ให้
  // อย่า hardcode base เป็น subpath เด็ดขาด เพราะจะทำให้ Netlify พังทันที
  const base = process.env.GITHUB_PAGES ? '/southern_zero_dropout/' : '/'
  return {
    base,
    plugins: [react(), claudeApi(apiKey)],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: { port: 5173 },
  }
})
