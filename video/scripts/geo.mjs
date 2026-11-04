// ดึงเส้นขอบจังหวัดจริงจากแอป (src/data/thailandPaths.ts) มาใช้ทำแผนที่เคลื่อนไหวในวิดีโอ
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('../src/data/thailandPaths.ts', 'utf8')
const json = src.slice(src.indexOf('{', src.indexOf('PROVINCE_PATHS')), src.lastIndexOf('}') + 1)
const paths = JSON.parse(json)
// กรอบรวมของทุกจังหวัด เพื่อให้ composition คำนวณ viewBox ได้
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
for (const p of Object.values(paths)) for (const [, x, y] of p.d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)) {
  minX = Math.min(minX, +x); maxX = Math.max(maxX, +x); minY = Math.min(minY, +y); maxY = Math.max(maxY, +y)
}
writeFileSync('src/thailand.json', JSON.stringify({ bounds: { minX, minY, maxX, maxY }, paths }))
console.log(Object.keys(paths).length, 'provinces', { minX, minY, maxX, maxY }, ['pattani', 'yala', 'narathiwat'].map((k) => k in paths))
