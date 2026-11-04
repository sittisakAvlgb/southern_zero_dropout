// สร้าง QR ของเว็บต้นแบบเป็นข้อมูลโมดูล (เมทริกซ์) ให้ composition วาดเองเป็น SVG — คมทุกขนาด
import QRCode from 'qrcode'
import { writeFileSync } from 'node:fs'
import { DEMO_URL } from '../src/timeline.mjs'
const qr = QRCode.create(DEMO_URL, { errorCorrectionLevel: 'M' })
const n = qr.modules.size
const cells = []
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) cells.push([x, y])
writeFileSync('src/qr.json', JSON.stringify({ url: DEMO_URL, size: n, cells }))
console.log('✓ src/qr.json', DEMO_URL, n + '×' + n)
