// GET /api/health → { ok: true, hasKey: boolean }
// Mirrors the /api/health route in vite.config.ts (dev) and server.mjs (self-hosted).
export default async () => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY
  return new Response(JSON.stringify({ ok: true, hasKey }), {
    headers: { 'content-type': 'application/json' },
  })
}
