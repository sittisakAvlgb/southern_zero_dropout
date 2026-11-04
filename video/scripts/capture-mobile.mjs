// จับภาพหน้าจอ "โหมดมือถือ" ของครู — ใช้ซ้อนเป็นภาพ PiP ในบทครู (ครูบันทึกเยี่ยมบ้านผ่านมือถือ)
// ใช้: เปิด `npm run dev` ที่ราก repo แล้ว `node scripts/capture-mobile.mjs` ในโฟลเดอร์ video/
import { chromium } from 'playwright-core'
import { login, settle, pseudonymize, shot, BASE, CHROME } from './lib.mjs'

const HERO = 'STD-0107'
const browser = await chromium.launch({ executablePath: CHROME })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, locale: 'th-TH', isMobile: true, hasTouch: true })
const page = await context.newPage()

await login(page, 'teacher')
await pseudonymize(page, HERO)

// หน้าเด็กรายบุคคล + ช่องบันทึกเยี่ยมบ้าน (ภาพหลักของ PiP)
await page.goto(`${BASE}/student?id=${HERO}`)
await settle(page)
await pseudonymize(page, HERO)
try {
  const note = page.getByLabel('บันทึกสั้น')
  await note.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await note.fill('เยี่ยมบ้านแล้ว — ผู้ปกครองพร้อมให้ความร่วมมือ')
  await page.waitForTimeout(300)
} catch (e) { console.warn('! note field:', e.message) }
await pseudonymize(page, HERO)
await shot(page, 'public/shots/m1-note.png')

// หน้าแรกของครู (เคสของฉัน) บนมือถือ — สำรองไว้
await page.goto(`${BASE}/`)
await settle(page)
await pseudonymize(page, HERO)
await shot(page, 'public/shots/m2-home.png')

await browser.close()
