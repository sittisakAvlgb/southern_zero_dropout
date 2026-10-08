import type { School } from '@/types'
import { hashSeed, makeRng, randInt } from '@/lib/format'
import { DISTRICT_BY_KEY as DISTRICT_GEO } from './geo'

// ─────────────────────────────────────────────────────────────
// โรงเรียนนำร่อง ๔๖ โรงเรียน — TOR ภาคผนวก ค
//
// รายชื่อและการแบ่งตาม สพม. มาจากเอกสาร TOR โดยตรง (สพม.ปัตตานี ๑๗,
// สพม.ยะลา ๑๒, สพม.นราธิวาส ๑๗) — ชื่อโรงเรียนห้ามแก้โดยไม่ตรวจกับ TOR
//
// ⚠️ อำเภอ (districtKey): TOR ระบุถึงระดับจังหวัดเท่านั้น ค่าที่ใส่ไว้ที่นี่
// เป็นการแมป best-effort จากชื่อโรงเรียน/ที่ตั้งที่ทราบ ต้องตรวจสอบกับ
// ข้อมูลสารสนเทศทางการศึกษาปีล่าสุดก่อนใช้งานจริง ตามหมายเหตุท้าย TOR
//
// ⚠️ พิกัดหมุด: ไม่ใช่พิกัดที่รังวัดจริง — คำนวณจากจุดศูนย์กลางอำเภอแล้ว
// กระจายเป็นวงเล็ก ๆ แบบ deterministic เพื่อไม่ให้หมุดทับกันบนแผนที่
//
// ⚠️ ตัวเลขทุกตัว (นักเรียน/เคส/คุณภาพข้อมูล) เป็นข้อมูลจำลองเพื่อการสาธิต
// จะถูกแทนที่ด้วยข้อมูลจริงจาก DMC เมื่อเชื่อมต่อระบบตามข้อ ๔.๓
// ─────────────────────────────────────────────────────────────

/** [ชื่อไทย, romanised, districtKey] */
type Seed = [string, string, string]

const PATTANI: Seed[] = [
  ['เบญจมราชูทิศ จังหวัดปัตตานี', 'Benchamarachuthit Pattani', 'mueangPattani'],
  ['เดชะปัตตนยานุกูล', 'Dechapattanayanukul', 'mueangPattani'],
  ['ท่าข้ามวิทยาคาร', 'Tha Kham Witthayakhan', 'panare'],
  ['วุฒิชัยวิทยา', 'Wutthichai Witthaya', 'nongchik'],
  ['สายบุรี "แจ้งประชาคาร"', 'Sai Buri "Chaeng Prachakhan"', 'saiburi'],
  ['ไม้แก่นกิตติวิทย์', 'Mai Kaen Kittiwit', 'maikaen'],
  ['สุวรรณไพบูลย์', 'Suwan Phaibun', 'yaring'],
  ['วังกะพ้อพิทยาคม', 'Wang Kapho Phitthayakhom', 'kapho'],
  ['ราชมุนีรังสฤษฏ์', 'Ratchamuni Rangsarit', 'khokpho'],
  ['โพธิ์คีรีราชศึกษา', 'Pho Khiri Ratchasuksa', 'khokpho'],
  ['ปทุมคงคาอนุสรณ์', 'Pathum Khongkha Anusorn', 'saiburi'],
  ['ยาบีบรรณวิทย์', 'Yabi Bannawit', 'nongchik'],
  ['ศิริราษฎร์สามัคคี', 'Siri Rat Samakkhi', 'mayo'],
  ['ทุ่งยางแดงพิทยาคม', 'Thung Yang Daeng Phitthayakhom', 'thungyangdaeng'],
  ['ประตูโพธิ์วิทยา', 'Pratu Pho Witthaya', 'yarang'],
  ['สะนอพิทยาคม', 'Sano Phitthayakhom', 'yarang'],
  ['แม่ลานวิทยา', 'Mae Lan Witthaya', 'maelan'],
]

const YALA: Seed[] = [
  ['คณะราษฎรบำรุง จังหวัดยะลา', 'Khana Ratsadonbamrung Yala', 'mueangYala'],
  ['สตรียะลา', 'Satri Yala', 'mueangYala'],
  ['คณะราษฎรบำรุง 2', 'Khana Ratsadonbamrung 2', 'mueangYala'],
  ['เฉลิมพระเกียรติสมเด็จพระศรีนครินทร์ ยะลา', 'Chalermphrakiat Somdet Phra Srinagarindra Yala', 'mueangYala'],
  ['รามันห์ศิริวิทย์', 'Raman Siriwit', 'raman'],
  ['บันนังสตาวิทยา', 'Bannang Sata Witthaya', 'bannangsata'],
  ['นิคมพัฒนวิทย์', 'Nikhom Phatthanawit', 'bannangsata'],
  ['ยะหาศิรยานุกูล', 'Yaha Siriyanukul', 'yaha'],
  ['กาบังพิทยาคม', 'Kabang Phitthayakhom', 'kabang'],
  ['ธารโตวัฒนวิทย์', 'Than To Watthanawit', 'tharto'],
  ['เบตง "วีระราษฎร์ประสาน"', 'Betong "Wira Rat Prasan"', 'betong'],
  ['จันทร์ประภัสสร์อนุสรณ์', 'Chan Praphat Anusorn', 'betong'],
]

const NARATHIWAT: Seed[] = [
  ['นราธิวาส', 'Narathiwat', 'mueangNarathiwat'],
  ['นราสิกขาลัย', 'Narasikkhalai', 'mueangNarathiwat'],
  ['สุไหงโก-ลก', 'Su-ngai Kolok', 'sungaikolok'],
  ['ตากใบ', 'Tak Bai', 'takbai'],
  ['มัธยมสุไหงปาดี', 'Matthayom Su-ngai Padi', 'sungaipadi'],
  ['ธัญธารวิทยา', 'Thanyathan Witthaya', 'sungaipadi'],
  ['บูกิตประชาอุปถัมภ์', 'Bukit Pracha Uppatham', 'chohairong'],
  ['สุคิรินวิทยา', 'Sukhirin Witthaya', 'sukhirin'],
  ['เวียงสุวรรณวิทยาคม', 'Wiang Suwan Witthayakhom', 'waeng'],
  ['ร่มเกล้า นราธิวาส', 'Romklao Narathiwat', 'mueangNarathiwat'],
  ['บาเจาะ', 'Bacho', 'bacho'],
  ['รือเสาะชนูปถัมภ์', 'Rueso Chanuppatham', 'rueso'],
  ['เรียงราษฎร์อุปถัมภ์', 'Riang Rat Uppatham', 'rueso'],
  ['ตันหยงมัส', 'Tanyong Mat', 'ra-ngae'],
  ['สวนพระยาวิทยา', 'Suan Phraya Witthaya', 'chanae'],
  ['ศรีวารินทร์', 'Si Warin', 'sisakhon'],
  ['เฉลิมพระเกียรติบางปอประชารักษ์', 'Chalermphrakiat Bang Po Pracharak', 'mueangNarathiwat'],
]

const SESAO: Record<string, { th: string; en: string }> = {
  pattani: { th: 'สพม.ปัตตานี', en: 'SESAO Pattani' },
  yala: { th: 'สพม.ยะลา', en: 'SESAO Yala' },
  narathiwat: { th: 'สพม.นราธิวาส', en: 'SESAO Narathiwat' },
}

/** golden-angle spread so schools in one district never sit on top of each other */
const GOLDEN = 2.399963
const SPREAD_DEG = 0.038

function build(provinceKey: string, seeds: Seed[], startIndex: number): School[] {
  // how many schools share each district — drives the pin spread radius
  const perDistrict: Record<string, number> = {}
  for (const [, , d] of seeds) perDistrict[d] = (perDistrict[d] ?? 0) + 1
  const seen: Record<string, number> = {}

  return seeds.map(([th, en, districtKey], i) => {
    const geo = DISTRICT_GEO[districtKey]
    const rng = makeRng(hashSeed(`tor-school-${th}`))
    const n = perDistrict[districtKey]
    const slot = (seen[districtKey] = (seen[districtKey] ?? -1) + 1)
    const r = n > 1 ? SPREAD_DEG : 0
    const angle = GOLDEN * slot

    // Secondary schools in the จชต. run from ~300 to ~2,500 students.
    const totalStudents = randInt(rng, 320, 2450)
    const highRiskStudents = Math.round(totalStudents * (rng() * 0.14 + 0.04))
    const openCases = Math.round(highRiskStudents * (0.45 + rng() * 0.45))
    const overdueCases = Math.round(openCases * rng() * 0.38)

    return {
      id: `TOR-${String(startIndex + i + 1).padStart(3, '0')}`,
      name: th,
      nameEn: en,
      provinceKey,
      districtKey,
      tambonKey: geo.tambons[slot % geo.tambons.length].key,
      sesao: SESAO[provinceKey]?.th,
      lon: geo.lon + Math.cos(angle) * r,
      lat: geo.lat + Math.sin(angle) * r * 0.8,
      sector: 'obec' as const,
      totalStudents,
      highRiskStudents,
      openCases,
      overdueCases,
      dataQualityScore: randInt(rng, 58, 99),
      interventionSuccessRate: Math.round((48 + rng() * 48) * 10) / 10,
      responseHours: Math.round((rng() * 52 + 3) * 10) / 10,
      riskReduction: Math.round((rng() * 36 + 1) * 10) / 10,
      needsResources: rng() > 0.58,
    }
  })
}

export const SCHOOLS: School[] = [
  ...build('pattani', PATTANI, 0),
  ...build('yala', YALA, PATTANI.length),
  ...build('narathiwat', NARATHIWAT, PATTANI.length + YALA.length),
]

export const SCHOOL_BY_ID: Record<string, School> = Object.fromEntries(
  SCHOOLS.map((s) => [s.id, s]),
)

export const SESAO_LABEL = SESAO

export const SECTOR_LABEL: Record<School['sector'], { th: string; en: string }> = {
  obec: { th: 'สพฐ. (มัธยมศึกษา)', en: 'OBEC (secondary)' },
  islamicPrivate: { th: 'เอกชนสอนศาสนาอิสลาม', en: 'Islamic private' },
  nfe: { th: 'สกร. / นอกระบบ', en: 'NFE' },
  vocational: { th: 'อาชีวศึกษา', en: 'Vocational' },
}

export const schoolsBy = (
  sel: (s: School) => number,
  dir: 'asc' | 'desc',
  n = 6,
): School[] =>
  [...SCHOOLS]
    .sort((a, b) => (dir === 'desc' ? sel(b) - sel(a) : sel(a) - sel(b)))
    .slice(0, n)

export const schoolsOfDistrict = (districtKey: string): School[] =>
  SCHOOLS.filter((s) => s.districtKey === districtKey)

export const schoolsOfProvince = (provinceKey: string): School[] =>
  SCHOOLS.filter((s) => s.provinceKey === provinceKey)

/** districts that actually host a pilot school — used to focus the map drill-down */
export const PILOT_DISTRICT_KEYS = [...new Set(SCHOOLS.map((s) => s.districtKey))]
