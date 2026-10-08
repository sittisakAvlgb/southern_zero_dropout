// ─────────────────────────────────────────────────────────────
// เขตพื้นที่การศึกษา (สพท.) — the tier between province and district.
//
// จังหวัด กับ เขต เป็นคนละแกนกัน: จังหวัดคือพื้นที่ปกครองของรัฐ ส่วนเขตคือพื้นที่
// บริหารจัดการการศึกษา ระบบจึงเก็บ `esaKey` แยกจาก `provinceKey` แทนที่จะอนุมาน
// เขตจากจังหวัด
//
// ⚠️ การแบ่งเขตในตารางนี้เป็นการแมป best-effort ตามแนวเขต สพท. ที่ใช้จริง
// (จังหวัดละ ๓ เขต) — TOR ไม่ได้ระบุการแบ่งเขตไว้ ต้องตรวจกับประกาศแบ่งเขต
// พื้นที่การศึกษาฉบับล่าสุดก่อนใช้งานจริง แก้ได้ที่ตารางเดียวในไฟล์นี้
//
// ⚠️ ข้อควรระวังเรื่องสังกัด: ป้ายชื่อจงใจใช้ "สพท." กลาง ๆ ไม่ระบุ สพป./สพม.
// เพราะโรงเรียนนำร่อง ๔๖ แห่งตาม TOR ภาคผนวก ค เป็นโรงเรียนมัธยมซึ่งสังกัด สพม.
// (จังหวัดละหนึ่งเขต) ขณะที่การแบ่ง ๓ เขตต่อจังหวัดเป็นแนวของ สพป. ตารางนี้จึงเป็น
// เขต "เชิงภูมิศาสตร์" — โรงเรียนหนึ่งแห่งอยู่เขตใด ตัดสินจากอำเภอที่ตั้ง
// ─────────────────────────────────────────────────────────────
import { DISTRICT_BY_KEY } from './geo'

export interface EsaArea {
  key: string
  provinceKey: string
  /** เขต ๑ / ๒ / ๓ ภายในจังหวัด */
  no: 1 | 2 | 3
  th: string
  en: string
  ms: string
  districtKeys: string[]
}

export const ESA_AREAS: EsaArea[] = [
  // ── ปัตตานี (12 อำเภอ) ──────────────────────────────────
  {
    key: 'pattani-1', provinceKey: 'pattani', no: 1,
    th: 'สพท.ปัตตานี เขต 1', en: 'Pattani ESAO 1', ms: 'PPD Pattani 1',
    districtKeys: ['mueangPattani', 'nongchik', 'yaring', 'panare'],
  },
  {
    key: 'pattani-2', provinceKey: 'pattani', no: 2,
    th: 'สพท.ปัตตานี เขต 2', en: 'Pattani ESAO 2', ms: 'PPD Pattani 2',
    districtKeys: ['khokpho', 'maelan', 'yarang', 'mayo'],
  },
  {
    key: 'pattani-3', provinceKey: 'pattani', no: 3,
    th: 'สพท.ปัตตานี เขต 3', en: 'Pattani ESAO 3', ms: 'PPD Pattani 3',
    districtKeys: ['saiburi', 'maikaen', 'thungyangdaeng', 'kapho'],
  },
  // ── ยะลา (8 อำเภอ) ──────────────────────────────────────
  {
    key: 'yala-1', provinceKey: 'yala', no: 1,
    th: 'สพท.ยะลา เขต 1', en: 'Yala ESAO 1', ms: 'PPD Yala 1',
    districtKeys: ['mueangYala', 'yaha', 'krongpinang', 'kabang'],
  },
  {
    key: 'yala-2', provinceKey: 'yala', no: 2,
    th: 'สพท.ยะลา เขต 2', en: 'Yala ESAO 2', ms: 'PPD Yala 2',
    districtKeys: ['bannangsata', 'raman'],
  },
  {
    key: 'yala-3', provinceKey: 'yala', no: 3,
    th: 'สพท.ยะลา เขต 3', en: 'Yala ESAO 3', ms: 'PPD Yala 3',
    districtKeys: ['betong', 'tharto'],
  },
  // ── นราธิวาส (13 อำเภอ) ─────────────────────────────────
  {
    key: 'narathiwat-1', provinceKey: 'narathiwat', no: 1,
    th: 'สพท.นราธิวาส เขต 1', en: 'Narathiwat ESAO 1', ms: 'PPD Narathiwat 1',
    districtKeys: ['mueangNarathiwat', 'bacho', 'yingo', 'rueso', 'sisakhon'],
  },
  {
    key: 'narathiwat-2', provinceKey: 'narathiwat', no: 2,
    th: 'สพท.นราธิวาส เขต 2', en: 'Narathiwat ESAO 2', ms: 'PPD Narathiwat 2',
    districtKeys: ['sungaikolok', 'sungaipadi', 'waeng', 'sukhirin', 'takbai'],
  },
  {
    key: 'narathiwat-3', provinceKey: 'narathiwat', no: 3,
    th: 'สพท.นราธิวาส เขต 3', en: 'Narathiwat ESAO 3', ms: 'PPD Narathiwat 3',
    districtKeys: ['ra-ngae', 'chanae', 'chohairong'],
  },
]

export const ESA_BY_KEY: Record<string, EsaArea> = Object.fromEntries(
  ESA_AREAS.map((e) => [e.key, e]),
)

/** districtKey → esaKey. Built from the table above, so the table stays the
 *  single place to correct a boundary. */
export const ESA_BY_DISTRICT: Record<string, string> = Object.fromEntries(
  ESA_AREAS.flatMap((e) => e.districtKeys.map((d) => [d, e.key])),
)

export const esaOfDistrict = (districtKey?: string): string | undefined =>
  districtKey ? ESA_BY_DISTRICT[districtKey] : undefined

export const esasOf = (provinceKey: string): EsaArea[] =>
  ESA_AREAS.filter((e) => e.provinceKey === provinceKey)

export const ESA_NAME: Record<string, { th: string; en: string; ms: string }> =
  Object.fromEntries(ESA_AREAS.map((e) => [e.key, { th: e.th, en: e.en, ms: e.ms }]))

/** Every district must land in exactly one เขต — a district missing here would
 *  silently vanish from an ESA account's scope instead of erroring. */
if (import.meta.env.DEV) {
  const unassigned = Object.keys(DISTRICT_BY_KEY).filter((d) => !ESA_BY_DISTRICT[d])
  if (unassigned.length) {
    console.warn('[esa] districts with no เขต assigned:', unassigned.join(', '))
  }
}
