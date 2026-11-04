// ตัวช่วยร่วมของสคริปต์จับภาพ: เปิด Chrome · เข้าบทบาท · แทนชื่อเด็ก/โรงเรียนด้วยนามสมมติ · ถ่ายภาพ
import { chromium } from 'playwright-core'

export const BASE = process.env.SBP_URL ?? 'http://localhost:5173'
export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
export const VIEW = { width: 1600, height: 900 }

export const ACCOUNTS = {
  teacher: 'teacher@zerodropout.go.th',
  school: 'school@zerodropout.go.th',
  esa: 'esa@zerodropout.go.th',
  obec: 'obec@zerodropout.go.th',
}

// ตัวอักษรนามสมมติ — เด็กตัวเดินเรื่องได้ "ก." เสมอ คนอื่นได้ตามลำดับที่พบบนจอ
const LETTERS = 'ขคงจฉชซญฐฑฒณดตถทธนบปผพฟภมยรลวศษสหฬอฮ'.split('')

export async function openBrowser() {
  const browser = await chromium.launch({ executablePath: CHROME })
  // DSF 2 = ภาพ 3200×1800 — ซูมในวิดีโอ Full HD ได้ถึง ~1.6 เท่าโดยยังคม
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: 'th-TH' })
  return { browser, context }
}

export async function login(page, role) {
  await page.goto(`${BASE}/login`)
  await page.evaluate(() => { localStorage.removeItem('sbp-auth') })
  await page.goto(`${BASE}/login`)
  await page.fill('input[type=email]', ACCOUNTS[role])
  await page.fill('input[type=password]', 'demo')
  await page.click('form button[type=submit]')
  await page.waitForURL((u) => !u.pathname.endsWith('/login'))
  await settle(page)
}

export async function settle(page, ms = 1800) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(ms)
}

/** แทนชื่อนักเรียน เด็กนอกระบบ และโรงเรียนจริง ด้วยนามสมมติ — ติดตั้งครั้งเดียวต่อหน้า แล้วคอยแทนซ้ำเมื่อ React วาดใหม่ */
export async function pseudonymize(page, heroId) {
  await page.evaluate(async ({ heroId, letters }) => {
    if (window.__pseudo) return window.__pseudo.run()
    let G
    const [S, O, Sc, R, St] = await Promise.all([
      import('/src/data/students.ts'),
      import('/src/data/oosc.ts'),
      import('/src/data/schools.ts'),
      import('/src/auth/roles.ts'),
      import('/src/data/staff.ts'),
      import('/src/data/geo.ts'),
    ]).then((m) => { G = m[5]; return m })
    // ชื่อบุคลากรและบัญชีสาธิตเป็นตัวละครสมมติ ห้ามถูกแทน แม้ชื่อต้นจะซ้ำกับเด็ก
    const staffWords = new Set(
      [...R.DEMO_USERS.map((u) => u.name), ...S.OWNERS.map((o) => (typeof o === 'string' ? o : o.name)), ...Sc.SCHOOLS.flatMap((sc) => St.staffOf(sc.id))]
        .filter(Boolean).flatMap((n) => String(n).split(/\s+/)).flatMap((w) => [w, w.replace(/^(ครู|ผอ\.|ดร\.|นาย|นางสาว|นาง)/, '')]),
    )
    const map = new Map()
    let next = 0
    const hero = S.STUDENT_BY_ID[heroId]
    const label = (full) => {
      if (!map.has(full)) map.set(full, full === hero?.name ? 'ก.' : `${letters[next++ % letters.length]}.`)
      return map.get(full)
    }
    const people = [hero?.name, ...S.STUDENTS.map((s) => s.name), ...O.OOSC.map((o) => o.name)].filter(Boolean)
    const firstOf = (n) => n.replace(/^(ด\.ช\.|ด\.ญ\.|นาย|นางสาว|น\.ส\.)\s*/, '').split(/\s+/)[0]
    // ชื่อเต็มก่อนชื่อต้น ยาวก่อนสั้น เพื่อไม่ให้แทนซ้อนกัน
    const pairs = []
    const staffFull = [...R.DEMO_USERS.map((u) => u.name), ...S.OWNERS].filter(Boolean).map(String)
    for (const n of new Set(people)) {
      if (staffFull.some((x) => x.includes(n))) continue
      pairs.push([n, () => `นักเรียน ${label(n)}`])
      const f = firstOf(n)
      if (n === hero?.name && f.length >= 3 && !staffWords.has(f)) pairs.push([f, () => `นักเรียน ${label(n)}`])
    }
    for (const sc of Sc.SCHOOLS) {
      const n = sc.name ?? sc.th
      const no = Number(String(sc.id).replace(/\D/g, ''))
      // ชื่อโรงเรียนบางแห่งเป็นชื่อจังหวัด/อำเภอ (เช่น "นราธิวาส") — ชื่อเปล่าต้องไม่ไปแทนชื่อสถานที่
      const isPlace = [...Object.values(G.PROVINCE_NAME), ...Object.values(G.DISTRICT_NAME), ...Object.values(G.TAMBON_NAME)].some((x) => x.th === n)
      for (const pre of isPlace ? ['โรงเรียน', 'ร.ร.', 'รร.'] : ['โรงเรียน', 'ร.ร.', 'รร.', '']) pairs.push([pre + n, () => `โรงเรียนสาธิต ${no}`])
    }
    pairs.sort((a, b) => b[0].length - a[0].length)
    const valid = pairs.filter(([k]) => k && k.length >= 3)
    const run = () => {
      const text = document.body.innerText
      const live = valid.filter(([k]) => text.includes(k))
      if (!live.length) return
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const nodes = []
      while (walker.nextNode()) nodes.push(walker.currentNode)
      for (const node of nodes) {
        let v = node.nodeValue
        if (!v || v.trim().length < 3) continue
        let changed = false
        for (const [k, rep] of live) {
          if (v.includes(k)) { v = v.split(k).join(rep()); changed = true }
        }
        if (changed) node.nodeValue = v
      }
      for (const el of document.querySelectorAll('input,textarea')) {
        for (const [k, rep] of live) if (el.value?.includes(k)) el.value = el.value.split(k).join(rep())
      }
    }
    let busy = false
    new MutationObserver(() => {
      if (busy) return
      busy = true
      requestAnimationFrame(() => { run(); busy = false })
    }).observe(document.body, { subtree: true, childList: true, characterData: true })
    window.__pseudo = { run }
    run()
  }, { heroId, letters: LETTERS })
  await page.waitForTimeout(250)
}

export async function shot(page, file, opts = {}) {
  await page.waitForTimeout(opts.wait ?? 400)
  await page.evaluate(() => window.__pseudo?.run())
  await page.screenshot({ path: file, fullPage: !!opts.fullPage, animations: 'disabled' })
  console.log('✓', file)
}
