// POST /api/chat → streams Claude's reply as plain text.
// Mirrors the /api/chat route in vite.config.ts (dev) and server.mjs (self-hosted).
// ANTHROPIC_API_KEY is read from the Netlify site's environment variables —
// it never reaches the browser.
import Anthropic from '@anthropic-ai/sdk'

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response('ANTHROPIC_API_KEY is not set on the server (Netlify env vars)', { status: 503 })
  }

  let payload
  try {
    payload = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        const claudeStream = client.messages.stream({
          model: payload.model || 'claude-opus-4-8',
          max_tokens: 1024,
          system: payload.system,
          messages: payload.messages || [],
        })
        for await (const ev of claudeStream) {
          if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(ev.delta.text))
          }
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' },
  })
}
