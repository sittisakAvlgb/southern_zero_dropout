/** URL ของไฟล์ใน `public/` ที่ถูกต้องไม่ว่าเว็บจะถูกเสิร์ฟจากรากโดเมน
 *  (Netlify, dev) หรือจาก subpath (GitHub Pages ที่ /<repo>/)
 *
 *  `import.meta.env.BASE_URL` คือค่า `base` ใน vite.config.ts ตอน build
 *  และลงท้ายด้วย '/' เสมอ
 *
 *  ห้ามเขียน src="/logo.png" ตรง ๆ — มันจะชี้ไปรากโดเมนและ 404 บน Pages
 */
export const assetUrl = (file: string): string =>
  `${import.meta.env.BASE_URL}${file.replace(/^\//, '')}`
