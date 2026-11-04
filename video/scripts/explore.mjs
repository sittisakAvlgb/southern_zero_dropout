import { openBrowser, login, settle, pseudonymize, BASE } from './lib.mjs'
const [,, role, path = '/', out = 'x.png', heroId = ''] = process.argv
const { browser, context } = await openBrowser()
const page = await context.newPage()
await login(page, role)
if (path !== '/') { await page.goto(BASE + path); await settle(page) }
await pseudonymize(page, heroId)
// CLICKS="ข้อความ1|ข้อความ2" — คลิกตามลำดับ (ปุ่มที่มีข้อความนั้น)
for (const t of (process.env.CLICKS ?? '').split('|').filter(Boolean)) {
  if (t.startsWith('fill:')) { const [, sel, val] = t.split(':'); await page.fill(sel, val); continue }
  await page.getByText(t, { exact: false }).first().click()
  await page.waitForTimeout(900)
}
await page.screenshot({ path: out, fullPage: process.env.FULL === '1' })
const items = await page.$$eval('button, a[href], h1, h2, h3, [role=tab]', (els) => els.map((e) => `${e.tagName}${e.getAttribute('href') ? '(' + e.getAttribute('href') + ')' : ''}: ${e.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)}`).filter((s) => !/: $/.test(s)))
console.log([...new Set(items)].join('\n'))
console.log('URL', page.url())
await browser.close()
