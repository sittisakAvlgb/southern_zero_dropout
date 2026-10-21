import { FILTERS, STALE_DAYS, insightOf, type FollowCase } from '@/lib/followOps'
import type { DirectorWork } from '@/components/director/useDirectorWork'

/**
 * คำตอบของช่องถามตอบสำหรับคนที่ทำงานกับเด็กรายคน (ครู · ผอ.)
 *
 * ทำไมไม่อยู่ใน `localAnswer()` — `localAnswer` เป็นฟังก์ชันบริสุทธิ์ที่รู้จักแค่
 * `user` จึงอ่านได้แต่ข้อมูลดิบ การติดต่อที่ครูเพิ่งบันทึกจะไม่ถูกนับ และคำตอบจะ
 * เถียงกับหน้าจอที่ครูเพิ่งกดเสร็จ ที่นี่รับ `FollowCase[]` ชุดเดียวกับที่หน้า
 * ติดตามการช่วยเหลือและโต๊ะทำงานรายเด็กใช้ (ผ่าน `useFollowCases`) คำตอบจึงตรงกับ
 * หน้าจอโดยโครงสร้าง ไม่ใช่โดยความบังเอิญ — กฎเดิมของโปรเจกต์: lib คำนวณ
 * ตัวตอบแค่เล่า
 *
 * เดิมชิปของครูตกไปที่สาขาผู้บริหารใน `localAnswer()` — กด "ทำไมเด็กคนนี้ถึงเสี่ยง"
 * แล้วได้ "ปัตตานี 9.2% (865 คน)" ซึ่งไม่ใช่คำตอบของคำถามนั้นและไม่ใช่หน่วยที่ครู
 * ทำงานด้วย คืน `null` เมื่อไม่เข้าสาขาไหน ผู้เรียกจะได้ส่งต่อให้ `localAnswer`
 */
export interface CaseReply {
  text: string
  action?: { label: string; to: string }
}

const studentLink = (c: FollowCase) => `/student?id=${c.s.id}`

/** เรียงแบบเดียวกับที่หน้าติดตามเรียง — `sortFollow()` จัดมาให้แล้ว
 *  ตัวแรกของรายการคือเคสที่หน้านั้นวางไว้บนสุดเช่นกัน */
const pickFocus = (list: FollowCase[]): FollowCase | undefined =>
  list.find((c) => c.today) ?? list.find((c) => c.open) ?? list[0]

const nameOf = (c: FollowCase) => c.s.name

export function caseAnswer(
  q: string,
  list: FollowCase[],
  th: boolean,
  work?: DirectorWork | null,
): CaseReply | null {
  const s = q.toLowerCase()
  const has = (...ws: string[]) => ws.some((w) => s.includes(w.toLowerCase()))
  const pick = (k: 'today' | 'stale' | 'closing' | 'all') =>
    list.filter(FILTERS.find((f) => f.k === k)!.test)

  if (!list.length && !work) return null

  // ── คิวงานที่รอ ผอ. ────────────────────────
  // ตัวเลขชุดเดียวกับป้ายบนเมนูของ ผอ. (`useDirectorWork`) — หน้านั้น
  // นิยามคำว่า "รอ ผอ." ไว้แล้ว ถ้าคำนวณใหม่ที่นี่ก็จะได้อีกนิยามหนึ่ง
  // "ครูขอให้ช่วยอะไร" กับ "อะไรรอ ผอ. อยู่" เป็นคนละคำถาม — คำขอจากครูคือเรื่อง
  // ที่มีคนรออยู่ปลายสาย ส่วนคิวรวมคือภาระงานทั้งหมด ถ้าตอบเหมือนกันทั้งสองชิป
  // ก็เท่ากับมีชิปเดียวแต่โชว์สองอัน (เคยเป็นปัญหาแบบนี้ที่บรรทัด AI รายโรงเรียน)
  if (work && has('ครูขอ', 'คำขอจากครู', 'ครูขอให้', 'teachers asking')) {
    if (!work.asks)
      return {
        text: th
          ? `ตอนนี้ไม่มีคำขอจากครูที่รอคุณ${work.found ? ` — แต่ระบบพบเรื่องที่ค้างเอง ${work.found} เรื่อง` : ''}`
          : 'No teacher requests are waiting on you right now.',
        action: work.found
          ? { label: th ? 'เปิดเรื่องที่ต้องตัดสินใจ' : 'Open your decision queue', to: '/decisions' }
          : undefined,
      }
    return {
      text: th
        ? `ครูขอให้ ผอ. ช่วย ${work.asks} เรื่อง${work.found ? ` และระบบพบเรื่องที่ค้างอีก ${work.found} เรื่อง รวมเป็น ${work.decisions} เรื่องที่รอการตัดสินใจ` : ''}${work.lateBack ? `\n\nอีก ${work.lateBack} เรื่องที่ ผอ. ตัดสินใจแล้วและส่งกลับไปให้ครู เลยกำหนดที่นัดไว้ — ควรตามกลับ` : ''}`
        : `Teachers are asking you for ${work.asks} things.`,
      action: { label: th ? 'เปิดเรื่องที่ต้องตัดสินใจ' : 'Open your decision queue', to: '/decisions' },
    }
  }

  if (work && has('รอ ผอ', 'รอผอ', 'ตัดสินใจ', 'waiting on me', 'my queue')) {
    const rows = [
      { n: work.decisions, th: 'เรื่องที่รอการตัดสินใจ', en: 'decisions waiting' },
      { n: work.plans, th: 'เส้นทางโอกาสที่รออนุมัติ', en: 'plans to approve' },
      { n: work.referrals, th: 'การส่งต่อที่รอ ผอ.', en: 'referrals waiting' },
      { n: work.oosc, th: 'เด็กนอกระบบที่รอ ผอ.', en: 'out-of-school children waiting' },
    ].filter((r) => r.n > 0)
    if (!rows.length)
      return {
        text: th
          ? 'ตอนนี้ไม่มีเรื่องที่รอ ผอ. — คำขอจากครูถูกตอบกลับหมดแล้ว'
          : 'Nothing is waiting on you right now.',
      }
    const lines = rows.map((r) => `${th ? r.th : r.en} ${r.n}`).join('\n')
    return {
      text: th
        ? `งานที่รอ ผอ. รวม ${work.total} เรื่อง:\n${lines}${work.lateBack ? `\n\nเรื่องที่ส่งกลับไปให้ครูแล้วเลยกำหนด ${work.lateBack} เรื่อง — ควรตามกลับ` : ''}`
        : `${work.total} items are waiting on you:\n${lines}`,
      action: { label: th ? 'เปิดเรื่องที่ต้องตัดสินใจ' : 'Open your decision queue', to: '/decisions' },
    }
  }

  if (!list.length) return null

  // ── วันนี้ต้องตามใครก่อน ───────────────────────────────
  if (has('ตามใคร', 'ใครก่อน', 'วันนี้ต้องตาม', 'chase first', 'who should i')) {
    const today = pick('today')
    if (!today.length)
      return {
        text: th
          ? 'วันนี้ไม่มีเคสที่ถึงกำหนดต้องติดตาม — เคสที่เหลือยังอยู่ในกำหนด'
          : 'Nothing is due today — the rest of your cases are still within their follow-up window.',
        action: { label: th ? 'เปิดศูนย์ติดตาม' : 'Open the follow-up centre', to: '/intervention' },
      }
    const top = today.slice(0, 3)
    const lines = top
      .map((c, i) => `${i + 1}. ${nameOf(c)} — ${c.because} · ${th ? 'ขั้นถัดไป' : 'next'}: ${c.next.th}`)
      .join('\n')
    return {
      text: th
        ? `วันนี้มี ${today.length} เคสที่ถึงกำหนด เริ่มจาก:\n${lines}\n\n${insightOf(today)}`
        : `${today.length} cases are due today. Start here:\n${lines}`,
      action: { label: th ? `เปิดเคสของ${nameOf(top[0])}` : 'Open that case', to: studentLink(top[0]) },
    }
  }

  // ── ทำไมเด็กคนนี้ถึงเสี่ยง ─────────────────────────────
  // ช่องนี้ไม่ผูกกับเด็กที่เปิดอยู่ (ตัวลอยไม่ขึ้นบนโต๊ะทำงานรายเด็ก) จึงตอบ
  // ด้วยเคสที่อยู่บนสุดของวันนี้ และบอกให้ชัดว่ากำลังพูดถึงใคร
  if (has('เด็กคนนี้', 'คนนี้', 'this child')) {
    const c = pickFocus(list)
    if (!c) return null
    const who = th ? `เคสบนสุดของวันนี้คือ${nameOf(c)}` : `Your top case today is ${nameOf(c)}`
    if (has('ช่วย', 'อย่างไร', 'ทำอะไร', 'how', 'help')) {
      return {
        text: th
          ? `${who}\n\nขั้นถัดไป: ${c.next.th}\nเพราะ ${c.next.whyTh}\n\nสิ่งที่ควรทำต่อจากนั้น: ${c.summary.recommend}`
          : `${who}\n\nNext step: ${c.next.th} — ${c.next.whyTh}`,
        action: { label: th ? `เปิดเคสของ${nameOf(c)}` : 'Open that case', to: studentLink(c) },
      }
    }
    const reasons = c.reasons.length ? c.reasons.join(' · ') : c.summary.risk
    return {
      text: th
        ? `${who} — คะแนนความเสี่ยง ${c.s.riskScore}/100\n\n${reasons}\n\n${c.because}`
        : `${who} — risk ${c.s.riskScore}/100\n\n${reasons}`,
      action: { label: th ? `เปิดเคสของ${nameOf(c)}` : 'Open that case', to: studentLink(c) },
    }
  }

  // ── ใครขาดเรียนต่อเนื่อง ───────────────────────────────
  if (has('ขาดเรียน', 'absent', 'absence')) {
    const streak = list
      .filter((c) => c.open && c.s.absenceStreak > 0)
      .sort((a, b) => b.s.absenceStreak - a.s.absenceStreak)
    // นับก่อนตัด — เคยบอก "5 คน" เพราะนับจากรายการที่ตัดมาแสดงแล้ว
    const out = streak.slice(0, 5)
    if (!out.length)
      return {
        text: th
          ? 'ไม่มีเด็กในความดูแลของคุณที่ขาดเรียนต่อเนื่องอยู่ตอนนี้'
          : 'No child in your care is on an absence streak right now.',
      }
    const lines = out
      .map((c) => `${nameOf(c)} — ${th ? 'ขาดต่อเนื่อง' : 'absent'} ${c.s.absenceStreak} ${th ? 'วัน' : 'days'} · ${c.next.th}`)
      .join('\n')
    return {
      text: th
        ? `เด็กที่ขาดเรียนต่อเนื่อง ${streak.length} คน${streak.length > out.length ? ` (แสดง ${out.length} คนที่ขาดนานที่สุด)` : ''}:\n${lines}`
        : `${streak.length} children on an absence streak:\n${lines}`,
      action: { label: th ? `เปิดเคสของ${nameOf(out[0])}` : 'Open that case', to: studentLink(out[0]) },
    }
  }

  // ── เคสไหนยังไม่ได้ลงมือ ───────────────────────────────
  if (has('ยังไม่ได้ลงมือ', 'ไม่ได้ลงมือ', 'ไม่มีการอัปเดต', 'no action', 'nothing done')) {
    const stale = pick('stale')
    if (!stale.length)
      return {
        text: th
          ? `ทุกเคสมีการอัปเดตภายใน ${STALE_DAYS} วัน — ไม่มีเคสที่ค้างไม่ได้แตะ`
          : `Every case has been updated within ${STALE_DAYS} days.`,
      }
    const lines = stale
      .slice(0, 5)
      .map((c) => `${nameOf(c)} — ${th ? 'อัปเดตล่าสุด' : 'last update'} ${c.updatedDaysAgo} ${th ? 'วันก่อน' : 'days ago'} · ${c.next.th}`)
      .join('\n')
    return {
      text: th
        ? `เคสที่ไม่มีการอัปเดตเกิน ${STALE_DAYS} วัน ${stale.length} เคส:\n${lines}`
        : `${stale.length} cases with no update in over ${STALE_DAYS} days:\n${lines}`,
      action: { label: th ? 'เปิดศูนย์ติดตาม' : 'Open the follow-up centre', to: '/intervention' },
    }
  }

  // ── เคสไหนปิดได้แล้ว ───────────────────────────────────
  if (has('ปิดได้', 'ปิดเคส', 'close')) {
    const closing = pick('closing')
    if (!closing.length)
      return {
        text: th
          ? 'ยังไม่มีเคสที่เข้าเกณฑ์ปิด — เกณฑ์คือความเสี่ยงลดลงต่อเนื่อง มาเรียนสม่ำเสมอ และติดต่อผู้ปกครองได้'
          : 'No case meets the closing criteria yet.',
      }
    const lines = closing
      .slice(0, 5)
      .map((c) => `${nameOf(c)} — ${c.summary.change}`)
      .join('\n')
    return {
      text: th
        ? `เคสที่ใกล้ปิดได้ ${closing.length} เคส:\n${lines}\n\nการปิดเคสยังเป็นการตัดสินใจของครูเจ้าของเคส ระบบแค่ยกขึ้นมาให้ดู`
        : `${closing.length} cases look ready to close:\n${lines}`,
      action: { label: th ? `เปิดเคสของ${nameOf(closing[0])}` : 'Open that case', to: studentLink(closing[0]) },
    }
  }

  // ── เคสเกิน SLA / ค้างอยู่ ──────────────────────────────
  // บัญชีที่ทำงานกับเด็กรายคนต้องได้เลขเดียวกับหน้าติดตามของตัวเอง ไม่ใช่
  // ยอดเคสเกิน SLA ของพื้นที่ซึ่งเป็นตัวเลขของผู้กำกับดูแล
  if (has('sla', 'เกินกำหนด', 'เกิน sla', 'ค้าง', 'overdue')) {
    const over = list.filter(FILTERS.find((f) => f.k === 'sla')!.test)
    const today = pick('today')
    if (!over.length)
      return {
        text: th
          ? `ไม่มีเคสเกิน SLA ในความดูแลของคุณ — วันนี้ถึงกำหนดติดตาม ${today.length} เคส`
          : `No case in your care is past SLA. ${today.length} are due today.`,
        action: { label: th ? 'เปิดศูนย์ติดตาม' : 'Open the follow-up centre', to: '/intervention' },
      }
    const lines = over
      .slice(0, 5)
      .map((c) => `${nameOf(c)} — ${c.sla.text} · ${c.next.th}`)
      .join('\n')
    return {
      text: th
        ? `เคสเกิน SLA ${over.length} เคส จาก ${pick('all').length} เคสที่เปิดอยู่:\n${lines}`
        : `${over.length} of your ${pick('all').length} open cases are past SLA:\n${lines}`,
      action: { label: th ? `เปิดเคสของ${nameOf(over[0])}` : 'Open that case', to: studentLink(over[0]) },
    }
  }

  return null
}
