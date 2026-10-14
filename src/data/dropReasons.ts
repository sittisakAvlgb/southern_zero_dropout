// ─────────────────────────────────────────────────────────────
// ตารางรหัสสาเหตุการออกกลางคัน — ของจริงจาก สพฐ. (tblReasonDrop)
//
// ก่อนหน้านี้ระบบใช้ `CauseKey` 17 ค่าที่ตั้งชื่อกันเองในโปรเจกต์ ซึ่งอ่านง่าย
// แต่ไม่ตรงกับอะไรเลยในโลกจริง เมื่อถึงวันที่ต้องรับข้อมูลจาก DMC/สพฐ. จริง
// สาเหตุจะมาเป็น ReasonID สามหลักตามตารางนี้ ไม่ใช่คำว่า 'poverty'
//
// รหัสหลักแรกคือกลุ่มของสาเหตุ และกลุ่มนั้นบอกด้วยว่า "ใครต้องเป็นคนแก้":
//   1xx ตัวเด็กเอง          — ครู/นักจิตวิทยา
//   2xx สุขภาพและความพิการ  — สาธารณสุข
//   3xx ครอบครัวและเศรษฐกิจ — พมจ./ท้องถิ่น  ← กลุ่มใหญ่ที่สุด (10 รหัส)
//   4xx ชุมชนและเพื่อน      — ท้องถิ่น/ผู้นำชุมชน
//   5xx สถานศึกษา           — โรงเรียน/เขตพื้นที่
//   6xx กำลังศึกษาหรือจบแล้ว
//   7xx ติดตามไม่ได้
//   8xx ไม่เข้าข่ายช่วยเหลือ
//
// ⚠️ 6xx–8xx ไม่ใช่ "สาเหตุที่เด็กออก" แต่เป็นสถานะผลการติดตาม การเอาไปนับรวม
// ในกราฟ "สาเหตุที่ทำให้เด็กออก" จะทำให้ "จบการศึกษาภาคบังคับ" กลายเป็นสาเหตุ
// ของการหลุดออกจากระบบ ใช้ `isDropCause()` คัดก่อนเสมอ
// ─────────────────────────────────────────────────────────────
import type { CauseKey } from '@/types'

export type ReasonGroup = 'self' | 'health' | 'family' | 'community' | 'school' | 'studying' | 'untraceable' | 'noNeed'

export interface DropReason {
  /** ReasonID ตามตาราง สพฐ. */
  id: number
  th: string
  /** ย่อให้พอใส่แกนกราฟได้ ของเต็มอยู่ใน `th` */
  shortTh: string
  group: ReasonGroup
  /** IsActive ในตารางต้นทาง — 999 อื่นๆ ถูกปิดไว้ */
  active: boolean
}

export const REASON_GROUP: Record<ReasonGroup, { th: string; en: string; /** หน่วยงานที่เป็นเจ้าภาพแก้กลุ่มนี้ */ ownerTh: string }> = {
  self: { th: 'ตัวเด็กเอง', en: 'The child', ownerTh: 'ครู / นักจิตวิทยาโรงเรียน' },
  health: { th: 'สุขภาพและความพิการ', en: 'Health and disability', ownerTh: 'สาธารณสุข' },
  family: { th: 'ครอบครัวและเศรษฐกิจ', en: 'Family and economics', ownerTh: 'พมจ. / ท้องถิ่น' },
  community: { th: 'ชุมชนและเพื่อน', en: 'Community and peers', ownerTh: 'ท้องถิ่น / ผู้นำชุมชน' },
  school: { th: 'สถานศึกษา', en: 'The school', ownerTh: 'โรงเรียน / เขตพื้นที่' },
  studying: { th: 'กำลังศึกษาหรือจบแล้ว', en: 'Studying or completed', ownerTh: '—' },
  untraceable: { th: 'ติดตามไม่ได้', en: 'Untraceable', ownerTh: 'อำเภอ / ทะเบียนราษฎร' },
  noNeed: { th: 'ไม่เข้าข่ายช่วยเหลือ', en: 'No support needed', ownerTh: '—' },
}

export const DROP_REASONS: DropReason[] = [
  { id: 101, group: 'self', active: true, shortTh: 'ไม่มีแรงจูงใจในการเรียน', th: 'ไม่มีแรงจูงใจในการเรียน/เด็กไม่อยากเรียน/ไม่เห็นความสำคัญของการเรียน' },
  { id: 102, group: 'self', active: true, shortTh: 'แต่งงานสร้างครอบครัว', th: 'แต่งงานสร้างครอบครัว' },
  { id: 103, group: 'self', active: true, shortTh: 'ตั้งครรภ์ในวัยรุ่น', th: 'ตั้งครรภ์ในวัยรุ่น' },
  { id: 104, group: 'self', active: true, shortTh: 'ปัญหาพฤติกรรม', th: 'ปัญหาพฤติกรรม (เด็กแว๊น ติดยา)' },
  { id: 105, group: 'self', active: true, shortTh: 'มีประวัติกระทำผิดกฎหมาย', th: 'มีประวัติการกระทำผิดกฎหมายทำให้เป็นอุปสรรคต่อการไปเรียน' },
  { id: 106, group: 'self', active: true, shortTh: 'อยู่ในสถานพินิจฯ', th: 'อยู่ในสถานพินิจฯ' },
  { id: 107, group: 'self', active: true, shortTh: 'อยู่ในสถานสงเคราะห์', th: 'อยู่ในสถานสงเคราะห์' },

  { id: 201, group: 'health', active: true, shortTh: 'เจ็บป่วยเรื้อรัง', th: 'เจ็บป่วยเรื้อรัง/มีโรคประจำตัวร้ายแรง' },
  { id: 202, group: 'health', active: true, shortTh: 'พิการทางสติปัญญา', th: 'พิการทางสติปัญญา (การเรียนรู้/ออทิสติก)' },
  { id: 203, group: 'health', active: true, shortTh: 'พิการทางร่างกาย', th: 'พิการทางด้านร่างกาย (การเคลื่อนไหว/การได้ยินหรือสื่อความหมาย/การมองเห็น)' },
  { id: 204, group: 'health', active: true, shortTh: 'ได้รับผลกระทบจากอุบัติเหตุ', th: 'ได้รับผลกระทบจากอุบัติเหตุ' },
  { id: 205, group: 'health', active: true, shortTh: 'เสียชีวิต', th: 'เสียชีวิต' },

  { id: 301, group: 'family', active: true, shortTh: 'ผู้ปกครองไม่ทราบว่าต้องส่งเรียน', th: 'ผู้ปกครองไม่ทราบว่าต้องส่งเข้าเรียน' },
  { id: 302, group: 'family', active: true, shortTh: 'ไม่มีเงินค่าใช้จ่ายการศึกษา', th: 'ไม่มีเงินค่าใช้จ่ายที่เกี่ยวข้องกับการศึกษา (ค่าเทอม/ค่าธรรมเนียม/วัสดุอุปกรณ์/เครื่องแบบ)' },
  { id: 303, group: 'family', active: true, shortTh: 'ต้องทำงานหารายได้', th: 'ไม่เรียน-ต้องทำงานเพื่อหาเงินรายได้' },
  { id: 304, group: 'family', active: true, shortTh: 'ต้องช่วยงานบ้าน/ดูแลคนในบ้าน', th: 'ต้องช่วยงานบ้าน (ทำความสะอาด ซักผ้า ดูแลผู้สูงอายุหรือเด็กเล็ก/ต้องออกมาดูแลคนในครอบครัว)' },
  { id: 305, group: 'family', active: true, shortTh: 'เร่ร่อน/ถูกทอดทิ้ง', th: 'เป็นเด็กเร่ร่อน/ถูกทอดทิ้ง/ไร้ที่พึ่ง/พลัดหลง' },
  { id: 306, group: 'family', active: true, shortTh: 'ย้ายถิ่นตามผู้ปกครองบ่อย', th: 'ต้องย้ายถิ่นฐานตามผู้ปกครองบ่อยครั้ง (ย้ายถิ่นรับจ้างตามฤดูกาล)' },
  { id: 307, group: 'family', active: true, shortTh: 'ผู้ปกครองไม่เห็นคุณค่าการศึกษา', th: 'ผู้ปกครองไม่เห็นคุณค่าของการศึกษา' },
  { id: 308, group: 'family', active: true, shortTh: 'ถูกทำร้ายโดยคนในครอบครัว', th: 'ถูกกระทำ/ละเมิด/ทำร้ายโดยคนในครอบครัว' },
  { id: 309, group: 'family', active: true, shortTh: 'ได้รับผลกระทบจากภัยพิบัติ', th: 'ได้รับผลกระทบจากภัยพิบัติ/ภัยธรรมชาติ' },
  { id: 310, group: 'family', active: true, shortTh: 'เข้าเรียนช้า/ไม่มีคนรับส่ง', th: 'ผู้ปกครองคิดว่ายังไม่ถึงเวลาส่งเข้าเรียน/ไม่มีคนไปรับ-ส่งเด็กเยาวชน/เข้าเรียนช้า' },

  { id: 401, group: 'community', active: true, shortTh: 'กลุ่มเพื่อนไม่เรียนหนังสือ', th: 'อยู่ในกลุ่มเพื่อน/คนรอบข้างที่ไม่เข้ารับการศึกษา' },
  { id: 402, group: 'community', active: true, shortTh: 'ถูกทำร้ายโดยคนในชุมชน', th: 'ถูกกระทำ/ละเมิด/ทำร้ายโดยบุคคลในชุมชน' },

  { id: 501, group: 'school', active: true, shortTh: 'ลงทะเบียนเรียนไม่ได้', th: 'ไม่สามารถลงทะเบียนเรียนได้ (ร.ร.ไม่รับ/ไม่มีเอกสารที่ ร.ร. ต้องการ/ไม่มีใบแจ้งเกิด)' },
  { id: 502, group: 'school', active: true, shortTh: 'ถูกทำร้าย/มีปัญหาที่โรงเรียน', th: 'ถูกกระทำ/ละเมิด/ทำร้ายในโรงเรียน/เด็กมีปัญหาที่โรงเรียนกับเพื่อน/ครู' },
  { id: 503, group: 'school', active: true, shortTh: 'โรงเรียนไกล/เดินทางไม่สะดวก', th: 'ไม่สะดวกเข้าเรียน (ร.ร.อยู่ไกล/เดินทางไม่สะดวก)' },
  { id: 504, group: 'school', active: true, shortTh: 'เรียนแล้วไม่ตรงความคาดหวัง', th: 'พบว่าสิ่งที่เรียนรู้ใน ร.ร. ไม่สอดคล้องกับความคาดหวัง' },
  { id: 505, group: 'school', active: true, shortTh: 'ภาษาที่บ้านไม่ใช่ภาษาไทย', th: 'ภาษาที่ใช้ที่บ้านไม่ใช่ภาษาไทย ทำให้เป็นปัญหาในการเข้าใจบทเรียน/เด็กมีปัญหาเรื่องการอ่าน-เขียน' },

  { id: 601, group: 'studying', active: true, shortTh: 'ศึกษาภายในประเทศ', th: 'ศึกษาภายในประเทศ' },
  { id: 602, group: 'studying', active: true, shortTh: 'ศึกษาต่างประเทศ', th: 'ศึกษาต่างประเทศ' },
  { id: 603, group: 'studying', active: true, shortTh: 'การศึกษาทางเลือก ม.12', th: 'อยู่ในการศึกษาทางเลือกตามมาตรา 12' },
  { id: 604, group: 'studying', active: true, shortTh: 'จบการศึกษาภาคบังคับ', th: 'จบการศึกษาภาคบังคับ' },
  { id: 606, group: 'studying', active: true, shortTh: 'จบการศึกษาขั้นพื้นฐาน', th: 'จบการศึกษาขั้นพื้นฐาน' },

  { id: 701, group: 'untraceable', active: true, shortTh: 'หาตัวไม่พบ/ไม่ให้ข้อมูล', th: 'หาบ้านไม่พบ-ไม่มีข้อมูล-ไม่ยินดีให้ข้อมูล-ไม่พบตัว' },
  { id: 702, group: 'untraceable', active: true, shortTh: 'อยู่ในทะเบียนบ้านกลาง', th: 'อยู่ในทะเบียนบ้านกลาง' },
  { id: 703, group: 'untraceable', active: true, shortTh: 'ไม่มีสถานศึกษาเปิด อ.1 (บนเกาะ)', th: 'ไม่มีสถานศึกษาเปิดอนุบาล 1 ให้บริการ (อยู่บนเกาะ)' },
  { id: 704, group: 'untraceable', active: true, shortTh: 'รอเข้าศึกษา อ.2', th: 'รอเข้าศึกษา อ.2 (ไม่มีโรงเรียนเปิด อ.1 ในพื้นที่)' },

  { id: 801, group: 'noNeed', active: true, shortTh: 'ไม่ต้องการความช่วยเหลือ', th: 'ไม่ต้องการความช่วยเหลือ' },
  { id: 802, group: 'noNeed', active: true, shortTh: 'ไม่ตกหล่น-กำลังศึกษา', th: 'ไม่ตกหล่น-กำลังศึกษา' },

  { id: 999, group: 'noNeed', active: false, shortTh: 'อื่นๆ', th: 'อื่นๆ' },
]

export const REASON_BY_ID = new Map(DROP_REASONS.map((r) => [r.id, r]))

/** กลุ่มที่เป็น "สาเหตุที่ทำให้เด็กหลุด" จริง ๆ — 6xx ขึ้นไปเป็นสถานะผลการ
 *  ติดตาม ไม่ใช่สาเหตุ เอาไปนับรวมในกราฟสาเหตุไม่ได้ */
const CAUSE_GROUPS: ReasonGroup[] = ['self', 'health', 'family', 'community', 'school']
export const isDropCause = (r: DropReason): boolean => r.active && CAUSE_GROUPS.includes(r.group)

/** สะพานจากคำที่โปรเจกต์ใช้อยู่ ไปยังรหัสจริงของ สพฐ.
 *
 *  มีไว้เพื่อสองอย่าง: หน้าจอที่เขียนด้วย `CauseKey` อยู่แล้วไม่ต้องรื้อ และ
 *  เมื่อถึงวันต่อข้อมูลจริง การแปลงทำที่ไฟล์เดียว บางคำของเราครอบหลายรหัส
 *  (เช่น 'family' เป็นได้ทั้งภาระงานบ้านและถูกทำร้ายในบ้าน) จึงเลือกรหัสที่
 *  ตรงที่สุดเป็นตัวแทน ส่วน 'absence' กับ 'grades' ไม่มีรหัสคู่เพราะใน
 *  ตาราง สพฐ. สองอย่างนั้นเป็น "อาการ" ไม่ใช่ "สาเหตุ" */
export const CAUSE_TO_REASON: Partial<Record<CauseKey, number>> = {
  poverty: 302,
  childLabour: 303,
  family: 304,
  migration: 306,
  earlyMarriage: 102,
  health: 201,
  travel: 503,
  noDocuments: 501,
  transition: 101,
  noExam: 504,
  failing: 505,
  dualSchooling: 603,
  unrestAffected: 309,
  noContact: 701,
  stateless: 702,
  noDevice: 302,
}

export const reasonFor = (k: CauseKey): DropReason | undefined => {
  const id = CAUSE_TO_REASON[k]
  return id === undefined ? undefined : REASON_BY_ID.get(id)
}

/** หน่วยงานเจ้าภาพของสาเหตุนี้ — ใช้ตอบคำถาม "ส่งต่อใคร" โดยไม่ต้องเดา */
export const ownerOfCause = (k: CauseKey): string | undefined => {
  const r = reasonFor(k)
  return r ? REASON_GROUP[r.group].ownerTh : undefined
}
