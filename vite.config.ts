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

/**
 * ไลบรารีที่บังคับให้อยู่ก้อนไหน — ระบุเป็น "ชื่อแพ็กเกจ" ไม่ใช่ regex บนพาธ
 *
 * **กับดักที่เสียเวลาไปแล้วหนึ่งรอบ:** ถ้าแบ่งผิด จะได้ *วงจรระหว่าง chunk*
 * ซึ่งพังเฉพาะตอน build จริง — `npm run dev` ไม่ bundle จึงไม่มีอาการ
 * ครั้งก่อนเขียน `return 'vendor'` ดักทุกอย่างที่เหลือ ผลคือ
 * `@remix-run/router` ไปอยู่ `vendor` แต่ `react-router` ที่เรียกมันอยู่ก้อน
 * `react` (react → vendor) ขณะที่ `react-smooth` ใน `vendor` ก็เรียก React
 * (vendor → react) สองก้อนอ้างกันไปกลับ ก้อนหนึ่งจึงถูกรันก่อนอีกก้อนพร้อม
 * ได้จอขาวกับ `Cannot read properties of undefined (reading 'PureComponent')`
 *
 * กฎที่ได้มา: **แพ็กเกจกับสิ่งที่มันเรียกต้องอยู่ก้อนเดียวกัน** และอะไรที่ไม่
 * แน่ใจให้ `return undefined` ปล่อย Rollup คิดลำดับเอง อย่าดักท้ายด้วยก้อนรวม
 * ถ้าแตะตรงนี้ ต้อง build + preview จริงทุกครั้ง อย่าเชื่อ dev server
 */
const VENDOR_CHUNKS: Record<string, string[]> = {
  // react-dom/router อ้าง react ภายใน ถ้าแยกจะได้ react คนละชุดใน runtime
  react: ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router'],
  apexcharts: ['apexcharts', 'react-apexcharts'],
  // react-smooth / recharts-scale / victory-vendor ใช้โดย recharts เท่านั้น
  recharts: ['recharts', 'react-smooth', 'recharts-scale', 'victory-vendor'],
  motion: ['framer-motion', 'motion-dom', 'motion-utils'],
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
    build: {
      rollupOptions: {
        output: {
          /**
           * แยกไลบรารีก้อนใหญ่ออกจากโค้ดแอป เพื่อให้สองอย่างนี้เกิดขึ้น
           *
           * 1. หน้าที่ไม่ได้ใช้กราฟหรือแผนที่ก็ไม่ต้องโหลดมันตามมา — หน้าแรก
           *    ของครูเป็นรายการเคส ไม่มีกราฟ ไม่มีแผนที่ จึงไม่ต้องจ่ายค่า
           *    ApexCharts (~870 kB) กับ Recharts (~350 kB)
           * 2. ไฟล์ที่ไม่ค่อยเปลี่ยน (react, router) มี hash คงที่ข้าม deploy
           *    ครูที่เคยเปิดเว็บแล้วจึงได้จาก cache ไม่ต้องโหลดใหม่ทุกครั้งที่
           *    เราแก้โค้ดหน้าใด ๆ
           *
           * ชื่อไฟล์ทุกก้อนถูกอ้างผ่าน base ที่ Vite ฝังให้ จึงโหลดถูกทั้งบน
           * Netlify (`/`) และ GitHub Pages (`/southern_zero_dropout/`)
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            const pkg = id.split('node_modules/').pop()?.replace(/\\/g, '/') ?? ''
            const name = pkg.startsWith('@')
              ? pkg.split('/').slice(0, 2).join('/')
              : pkg.split('/')[0]
            for (const [chunk, members] of Object.entries(VENDOR_CHUNKS)) {
              if (members.includes(name)) return chunk
            }
            // ที่เหลือปล่อยให้ Rollup จัดเอง — ดูคำเตือนเรื่องวงจรด้านบน
            return undefined
          },
        },
      },
    },
    server: { port: 5173 },
  }
})
