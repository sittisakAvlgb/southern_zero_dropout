// จับภาพหน้าจอจริงของแพลตฟอร์มตาม workflow: ครู → ผอ. → เขต → สพฐ. → กลับถึงครู
// ทั้งหมดอยู่ใน browser context เดียว คำขอที่ส่งระหว่างบทบาทจึงไปถึงอีกฝั่งจริง (เก็บใน localStorage)
// นอกจากภาพ ยังเก็บ "พิกัดปุ่มที่เคอร์เซอร์จะกด" ลง boxes.json (พิกัด viewport ตรงกับภาพที่ลงจอขั้นนั้น)
// ใช้: เปิด `npm run dev` ที่ราก repo แล้ว `npm run capture` ในโฟลเดอร์ video/
import { openBrowser, login, settle, pseudonymize, shot, BASE } from './lib.mjs'

const HERO = 'STD-0107' // เคสแรกในคิวของครูสาธิต — แสดงบนจอเป็น "นักเรียน ก."
const OUT = 'public/shots'
const only = process.argv[2] // ระบุ teacher|school|esa|obec|return เพื่อถ่ายเฉพาะส่วน (ต้องมีสถานะจากส่วนก่อนหน้า)

const { browser, context } = await openBrowser()
const page = await context.newPage()
const go = async (path) => { await page.goto(BASE + path); await settle(page); await pseudonymize(page, HERO) }
const click = async (text, opts = {}) => {
  const loc = opts.role ? page.getByRole(opts.role, { name: text, exact: !!opts.exact }) : page.getByText(text, { exact: !!opts.exact })
  await loc.first().click()
  await page.waitForTimeout(opts.wait ?? 900)
}

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
const BOXES = 'src/boxes.json'
const boxes = existsSync(BOXES) ? JSON.parse(readFileSync(BOXES, 'utf8')) : {}
// พิกัดของปุ่ม/รายการในภาพ (viewport 1600×900) — ใช้ให้เคอร์เซอร์ในวิดีโอเดินไปกดตรงจุด
const box = async (key, loc) => {
  const b = await loc.first().boundingBox().catch(() => null)
  if (b) boxes[key] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  else console.warn('! ไม่พบปุ่มสำหรับ box:', key)
}
const reveal = async (loc, offset = 160) => {
  await loc.first().evaluate((el, off) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - off) }, offset).catch(() => {})
  await page.waitForTimeout(500)
}
const dump = async (label) => {
  const items = await page.$$eval('button, a[href], h1, h2, h3, label, textarea, input', (els) =>
    els.map((e) => `${e.tagName}: ${(e.innerText || e.placeholder || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 90)}`).filter((s) => !/: $/.test(s)))
  console.log(`--- ${label}\n` + [...new Set(items)].join('\n'))
}
// ปุ่มตามข้อความ (ครอบด้วย role=button ก่อน แล้วค่อย fallback เป็นข้อความ)
const btn = (text, exact = false) => page.getByRole('button', { name: text, exact }).or(page.getByText(text, { exact }))

async function teacher() {
  await login(page, 'teacher')
  await pseudonymize(page, HERO)
  // ขั้น 1: เปิดแฟ้มเด็กจากคิว (เคสแรกคือนักเรียน ก.)
  await box('t1.open', btn('เปิดแฟ้มเด็ก'))
  await shot(page, `${OUT}/t1-home.png`)
  await shot(page, `${OUT}/t1-home-full.png`, { fullPage: true })

  // ขั้น 2: หน้าเด็กรายบุคคล — เห็นคะแนนเสี่ยงและที่มา
  await go(`/student?id=${HERO}`)
  await shot(page, `${OUT}/t2-desk.png`)

  // ขั้น (AI): "แนวทางที่อาจช่วยได้" — AI อ่านสาเหตุรายคน เสนอเป็นขั้นพร้อมเหตุผล
  const aiRec = page.getByRole('heading', { name: 'แนวทางที่อาจช่วยได้' })
  await aiRec.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(500)
  await pseudonymize(page, HERO)
  await box('t6.head', aiRec)
  await shot(page, `${OUT}/t6-ai-rec.png`)

  // ขั้น (AI): ถาม AI ต่อ — AI ตอบจากข้อมูลเคส (เลือกคำถามเรื่องการส่งต่อ)
  await page.getByRole('button', { name: 'ถาม AI' }).first().click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: /ควรส่งต่อ/ }).first().click()
  await page.waitForTimeout(1700)
  await pseudonymize(page, HERO)
  await shot(page, `${OUT}/t7-ai-ask.png`)
  // ปิดแผงถาม AI (ปุ่มปิดในหัวแผง) ไม่งั้นแผงจะบังปุ่มในขั้นถัดไป
  const chat = page.locator('div.fixed.inset-0').filter({ hasText: 'ถาม AI เรื่อง' })
  await chat.getByLabel('ปิด').first().click().catch(() => {})
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))

  // ขั้น 3: บันทึกเยี่ยมบ้าน (บันทึกจริงลงเคส)
  const note = page.getByLabel('บันทึกสั้น')
  await reveal(note, 300)
  await note.fill('เยี่ยมบ้านแล้ว — ผู้ปกครองพร้อมให้ความร่วมมือ นักเรียนต้องช่วยงานที่บ้านช่วงเช้า')
  await shot(page, `${OUT}/t3-note.png`)
  await click('บันทึก', { role: 'button', exact: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  if (process.env.DEBUG) { await page.screenshot({ path: process.env.DEBUG }); await dump('after save') }

  // ขั้น 4: ไทม์ไลน์การช่วยเหลือ
  const tab = page.locator('button').filter({ hasText: 'ไทม์ไลน์' })
  await reveal(tab, 120)
  await tab.click()
  await page.waitForTimeout(900)
  await shot(page, `${OUT}/t3-timeline.png`)

  await go(`/plan?child=${HERO}`)
  await shot(page, `${OUT}/t4-plan.png`)

  // ขั้น 5: ขอการสนับสนุนจาก ผอ. — เลือกเหตุผลแล้วเตรียมส่ง
  await go(`/student?id=${HERO}`)
  await click('ขอการสนับสนุนจาก ผอ.', { role: 'button' })
  await click('ต้องการช่วยประสานผู้ปกครอง', { role: 'button' })
  const send = page.getByRole('button', { name: 'ส่งคำขอถึง ผอ.' })
  await send.first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  await box('t5.send', send)
  await shot(page, `${OUT}/t5-request.png`)
  await send.first().click()
  await page.waitForTimeout(900)
  // ขั้น 6: ส่งแล้ว
  await shot(page, `${OUT}/t5-sent.png`)
}

async function school() {
  await login(page, 'school')
  await pseudonymize(page, HERO)
  // ขั้น 1: ภาพรวมโรงเรียน — คำขอของครูขึ้นก่อน
  const consider = btn('พิจารณาคำขอ')
  await box('d1.consider', consider)
  await shot(page, `${OUT}/d1-home.png`)
  await shot(page, `${OUT}/d1-home-full.png`, { fullPage: true })

  // ขั้น 2: เปิดคำขอ เห็นสิ่งที่ครูทำมาแล้ว
  await consider.first().click()
  await page.waitForTimeout(900)
  const escalate = btn('ยกระดับไปเขตพื้นที่')
  await box('d2.escalate', escalate)
  await shot(page, `${OUT}/d2-sheet.png`)

  // ขั้น 3: ตัดสินใจ — ยกระดับถึงเขต
  await escalate.first().click()
  await page.waitForTimeout(900)
  const confirm = btn('ยืนยันและส่งงานถึงครู')
  await confirm.first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  await box('d2.confirm', confirm)
  await shot(page, `${OUT}/d2-escalate.png`)

  // ขั้น 4: ส่งงานถึงครู + ส่งเรื่องถึงเขต
  await confirm.first().click()
  await page.waitForTimeout(1000)
  await shot(page, `${OUT}/d3-done.png`)
}

async function esa() {
  await login(page, 'esa')
  await pseudonymize(page, HERO)
  // ขั้น 1: ภาพรวมเขต — คำขอจากโรงเรียนที่เข้ามาวันนี้
  const req = page.locator('button, a, [role=button]').filter({ hasText: 'นักเรียน ก.' }).filter({ hasText: 'ส่งมาวันนี้' })
  await reveal(req, 320)
  await box('e1.request', req)
  await shot(page, `${OUT}/e1-home.png`)
  await shot(page, `${OUT}/e1-home-full.png`, { fullPage: true })

  // ขั้น 2: คำขอจากโรงเรียน
  await req.first().click()
  await page.waitForTimeout(1000)
  const decide = btn('ตัดสินใจตามนี้')
  await box('e2.decide', decide)
  await shot(page, `${OUT}/e2-request.png`)

  // ขั้น 3: เขตจัดทีมสนับสนุน
  await decide.first().click()
  await page.waitForTimeout(900)
  const send = page.getByRole('button', { name: /ส่งถึง ผอ\. โรงเรียน/ })
  await send.first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  await box('e3.send', send)
  await shot(page, `${OUT}/e3-decide.png`)

  // ขั้น 4: ส่งทีมสนับสนุนกลับถึงโรงเรียน
  await send.first().click()
  await page.waitForTimeout(1200)
  await shot(page, `${OUT}/e3-sent.png`)

  // ขั้น 5: โรงเรียนในเขต
  await go('/school')
  await shot(page, `${OUT}/e5-schools.png`)
}

async function obec() {
  await login(page, 'obec')
  await pseudonymize(page, HERO)
  await shot(page, `${OUT}/o1-home.png`)
  await shot(page, `${OUT}/o1-home-full.png`, { fullPage: true })
  // "รายงาน" ถูกตัดออกแล้ว — ใช้ "แผนที่และเจาะลึกพื้นที่" เป็นภาพเจาะลงรายพื้นที่ (มี AI แนะนำด้วย)
  await go('/geo')
  await page.waitForTimeout(600)
  await shot(page, `${OUT}/o2-geo.png`)
}

// ปลายทางของวง: ครูเห็นงานที่ ผอ./เขต ส่งกลับมา เป็นงานถัดไป
async function back() {
  await login(page, 'teacher')
  await pseudonymize(page, HERO)
  await go(`/student?id=${HERO}`)
  await shot(page, `${OUT}/r3-teacher-desk.png`)
}

process.on('exit', () => writeFileSync(BOXES, JSON.stringify(boxes, null, 2)))
// รันทั้งชุด = เริ่มจาก seed สะอาด (ล้างสถานะที่ค้างใน localStorage จากรอบก่อน ไม่ให้คำขอซ้ำ)
if (!only) { await page.goto(BASE); await page.evaluate(() => localStorage.clear()).catch(() => {}) }
const stages = { teacher, school, esa, obec, back }
for (const [k, fn] of Object.entries(stages)) if (!only || only === k) await fn()
await browser.close()
