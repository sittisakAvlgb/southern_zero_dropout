// ─────────────────────────────────────────────────────────────
// Geography for the Southern Border Provinces (จังหวัดชายแดนภาคใต้ / จชต.)
//
// Scope = ปัตตานี + ยะลา + นราธิวาส (ทั้งจังหวัด) — ตรงกับพื้นที่นำร่องที่
// TOR กำหนดไว้ ("ใน ๓ จังหวัดชายแดนภาคใต้ รวม ๔๖ โรงเรียน") สงขลาไม่อยู่ใน
// ขอบเขต TOR ฉบับนี้ จึงไม่นับรวมแม้ ศอ.บต. จะนับ 4 อำเภอของสงขลาในงานอื่น.
//
// District lon/lat are real centroids; the map projects them with the same
// equirectangular transform used by data/thailandPaths.ts, so district pins
// land inside the real province outlines.
//
// Sub-district (ตำบล) lists are real names, encoded compactly as
// 'ไทย|Romanised'. They are used for the tambon dashboard and for generating
// deterministic mock caseloads — the *counts* are mock, the *places* are real.
// ─────────────────────────────────────────────────────────────
import type { AreaKind, Region } from '@/types'

export interface TambonGeo {
  key: string
  th: string
  ro: string // romanised (used for en + ms)
  districtKey: string
  provinceKey: string
}

export interface DistrictGeo {
  key: string
  provinceKey: string
  th: string
  en: string
  ms: string
  lon: number
  lat: number
  kind: AreaKind
  tambons: TambonGeo[]
}

export interface ProvinceGeo {
  key: string
  id: string // ISO 3166-2:TH
  region: Region
  th: string
  en: string
  ms: string
  /** schematic position on a 0–100 grid (kept for non-map fallbacks) */
  x: number
  y: number
  /** relative population tier (affects generated student counts) */
  tier: 1 | 2 | 3 | 4
  /** true when only part of the province is inside the จชต. scope */
  partial: boolean
  /** districts inside scope, for the partial case */
  note?: { th: string; en: string; ms: string }
}

// ── Raw district seed ────────────────────────────────────────
// [key, th, en, ms, lon, lat, kind, tambons('ไทย|Ro')]
type Seed = [string, string, string, string, number, number, AreaKind, string[]]

const PATTANI: Seed[] = [
  ['mueangPattani', 'เมืองปัตตานี', 'Mueang Pattani', 'Kota Patani', 101.25, 6.87, 'urban', [
    'สะบารัง|Sabarang', 'อาเนาะรู|Anoru', 'จะบังติกอ|Chabang Tiko', 'บานา|Bana',
    'ตันหยงลุโละ|Tanyong Lulo', 'คลองมานิง|Khlong Maning', 'กะมิยอ|Kamiyo',
    'บาราโหม|Barahom', 'ปะกาฮะรัง|Paka Harang', 'รูสะมิแล|Rusamilae',
    'ตะลุโบะ|Talubo', 'บาราเฮาะ|Baraho', 'ปุยุด|Puyut',
  ]],
  ['nongchik', 'หนองจิก', 'Nong Chik', 'Nong Chik', 101.13, 6.81, 'coastal', [
    'เกาะเปาะ|Ko Po', 'คอลอตันหยง|Kholo Tanyong', 'ดอนรัก|Don Rak', 'ดาโต๊ะ|Dato',
    'ตุยง|Tuyong', 'ท่ากำชำ|Tha Kamcham', 'บ่อทอง|Bo Thong', 'บางเขา|Bang Khao',
    'บางตาวา|Bang Tawa', 'ปุโละปุโย|Pulo Puyo', 'ยาบี|Yabi', 'ลิปะสะโง|Lipa Sango',
  ]],
  ['khokpho', 'โคกโพธิ์', 'Khok Pho', 'Kok Pho', 101.07, 6.70, 'rural', [
    'โคกโพธิ์|Khok Pho', 'มะกรูด|Makrut', 'บางโกระ|Bang Kro', 'ป่าบอน|Pa Bon',
    'ทรายขาว|Sai Khao', 'นาประดู่|Na Pradu', 'ปากล่อ|Pak Lo', 'ทุ่งพลา|Thung Phla',
    'ท่าเรือ|Tha Ruea', 'นาเกตุ|Na Ket', 'ควนโนรี|Khuan Nori', 'ช้างให้ตก|Chang Hai Tok',
  ]],
  ['maelan', 'แม่ลาน', 'Mae Lan', 'Mae Lan', 101.16, 6.67, 'rural', [
    'แม่ลาน|Mae Lan', 'ม่วงเตี้ย|Muang Tia', 'ป่าไร่|Pa Rai',
  ]],
  ['yarang', 'ยะรัง', 'Yarang', 'Jaring', 101.30, 6.76, 'rural', [
    'ยะรัง|Yarang', 'สะดาวา|Sadawa', 'ประจัน|Prachan', 'สะนอ|Sano', 'ระแว้ง|Rawaeng',
    'ปิตูมุดี|Pitumudi', 'วัด|Wat', 'กระโด|Krado', 'คลองใหม่|Khlong Mai',
    'เมาะมาวี|Mo Mawi', 'กอลำ|Kolam', 'เขาตูม|Khao Tum',
  ]],
  ['yaring', 'ยะหริ่ง', 'Yaring', 'Jambu', 101.37, 6.86, 'coastal', [
    'ตะโละ|Talo', 'ตะโละกาโปร์|Talo Kapo', 'ตันหยงดาลอ|Tanyong Dalo',
    'ตันหยงจึงงา|Tanyong Chueng-nga', 'ตอหลัง|Tolang', 'ตาแกะ|Ta Kae',
    'ตาลีอายร์|Tali Ai', 'ยามู|Yamu', 'บางปู|Bang Pu', 'หนองแรต|Nong Raet',
    'ปิยามุมัง|Piya Mumang', 'ปุลากง|Pula Kong', 'บาโลย|Baloi', 'สาบัน|Saban',
    'มะนังยง|Manang Yong', 'ราตาปันยัง|Rata Panyang', 'จะรัง|Charang',
    'แหลมโพธิ์|Laem Pho',
  ]],
  ['panare', 'ปะนาเระ', 'Panare', 'Panarik', 101.49, 6.83, 'coastal', [
    'ปะนาเระ|Panare', 'ท่าข้าม|Tha Kham', 'บ้านนอก|Ban Nok', 'ดอน|Don', 'ควน|Khuan',
    'ท่าน้ำ|Tha Nam', 'คอกกระบือ|Khok Krabue', 'พ่อมิ่ง|Pho Ming',
    'บ้านกลาง|Ban Klang', 'บ้านน้ำบ่อ|Ban Nam Bo',
  ]],
  ['mayo', 'มายอ', 'Mayo', 'Mayo', 101.40, 6.70, 'rural', [
    'มายอ|Mayo', 'ถนน|Thanon', 'ตรัง|Trang', 'กระหวะ|Krawa', 'ลุโบะยิไร|Lubo Yirai',
    'ลางา|La-nga', 'กระเสาะ|Kraso', 'เกาะจัน|Ko Chan', 'ปะโด|Pado',
    'สาคอบน|Sako Bon', 'สาคอใต้|Sako Tai', 'สะกำ|Sakam', 'ปานัน|Panan',
  ]],
  ['thungyangdaeng', 'ทุ่งยางแดง', 'Thung Yang Daeng', 'Tung Yang Daeng', 101.49, 6.63, 'remote', [
    'ตะโละแมะนา|Talo Maena', 'พิเทน|Phithen', 'น้ำดำ|Nam Dam', 'ปากู|Paku',
  ]],
  ['saiburi', 'สายบุรี', 'Sai Buri', 'Selindung Bayu', 101.62, 6.70, 'coastal', [
    'ตะลุบัน|Taluban', 'ตะบิ้ง|Tabing', 'ปะเสยะวอ|Pase Yawo', 'บางเก่า|Bang Kao',
    'บือเระ|Buere', 'เตราะบอน|Tro Bon', 'กะดุนง|Kadunong', 'ละหาร|Lahan',
    'มะนังดาลำ|Manang Dalam', 'แป้น|Paen', 'ทุ่งคล้า|Thung Khla',
  ]],
  ['maikaen', 'ไม้แก่น', 'Mai Kaen', 'Mai Kaen', 101.69, 6.62, 'coastal', [
    'ไม้แก่น|Mai Kaen', 'ตะโละไกรทอง|Talo Krai Thong', 'ดอนทราย|Don Sai',
    'ไทรทอง|Sai Thong',
  ]],
  ['kapho', 'กะพ้อ', 'Kapho', 'Kapo', 101.56, 6.59, 'remote', [
    'กะรุบี|Karubi', 'ตะโละดือรามัน|Talo Duraman', 'ปล่องหอย|Plong Hoi',
  ]],
]

const YALA: Seed[] = [
  ['mueangYala', 'เมืองยะลา', 'Mueang Yala', 'Kota Jala', 101.28, 6.54, 'urban', [
    'สะเตง|Sateng', 'สะเตงนอก|Sateng Nok', 'บุดี|Budi', 'ยุโป|Yupo', 'ลิดล|Lidon',
    'ยะลา|Yala', 'ท่าสาป|Tha Sap', 'ลำใหม่|Lam Mai', 'หน้าถ้ำ|Na Tham',
    'ลำพะยา|Lam Phaya', 'เปาะเส้ง|Po Seng', 'พร่อน|Phron',
    'บันนังสาเรง|Bannang Sareng', 'ตาเซะ|Ta Se',
  ]],
  ['yaha', 'ยะหา', 'Yaha', 'Jaha', 101.13, 6.50, 'rural', [
    'ยะหา|Yaha', 'ละแอ|La-ae', 'ปะแต|Patae', 'บาโร๊ะ|Baro', 'ตาชี|Ta Chi',
    'บาโงยซิแน|Ba-ngoi Sinae', 'กาตอง|Katong',
  ]],
  ['kabang', 'กาบัง', 'Kabang', 'Kabang', 100.99, 6.42, 'remote', [
    'กาบัง|Kabang', 'บาละ|Bala',
  ]],
  ['krongpinang', 'กรงปินัง', 'Krong Pinang', 'Krong Pinang', 101.31, 6.42, 'rural', [
    'กรงปินัง|Krong Pinang', 'สะเอะ|Sa-e', 'ห้วยกระทิง|Huai Krathing', 'ปุโรง|Purong',
  ]],
  ['raman', 'รามัน', 'Raman', 'Reman', 101.43, 6.48, 'rural', [
    'กายูบอเกาะ|Kayu Boko', 'กาลูปัง|Kalupang', 'กาลอ|Kalo', 'กอตอตือร๊ะ|Koto Tuera',
    'โกตาบารู|Kota Baru', 'เกะรอ|Kero', 'จะกว๊ะ|Chakwa', 'ท่าธง|Tha Thong',
    'เนินงาม|Noen Ngam', 'บาลอ|Balo', 'บาโงย|Ba-ngoi', 'บือมัง|Buemang',
    'ยะต๊ะ|Yata', 'วังพญา|Wang Phaya', 'อาซ่อง|A-song', 'ตะโล๊ะหะลอ|Talo Halo',
  ]],
  ['bannangsata', 'บันนังสตา', 'Bannang Sata', 'Bannang Sata', 101.25, 6.25, 'remote', [
    'บันนังสตา|Bannang Sata', 'บาเจาะ|Bacho', 'ตาเนาะปูเต๊ะ|Tano Pute',
    'ถ้ำทะลุ|Tham Thalu', 'ตลิ่งชัน|Taling Chan', 'เขื่อนบางลาง|Khuean Bang Lang',
  ]],
  ['tharto', 'ธารโต', 'Than To', 'Tan To', 101.21, 6.10, 'remote', [
    'ธารโต|Than To', 'บ้านแหร|Ban Rae', 'แม่หวาด|Mae Wat', 'คีรีเขต|Khiri Khet',
  ]],
  ['betong', 'เบตง', 'Betong', 'Betong', 101.07, 5.78, 'border', [
    'เบตง|Betong', 'ยะรม|Yarom', 'ตาเนาะแมเราะ|Tano Maero', 'อัยเยอร์เวง|Aiyoeweng',
    'ธารน้ำทิพย์|Than Nam Thip',
  ]],
]

const NARATHIWAT: Seed[] = [
  ['mueangNarathiwat', 'เมืองนราธิวาส', 'Mueang Narathiwat', 'Kota Menara', 101.82, 6.42, 'urban', [
    'บางนาค|Bang Nak', 'ลำภู|Lamphu', 'มะนังตายอ|Manang Tayo', 'บางปอ|Bang Po',
    'กะลุวอ|Kaluwo', 'กะลุวอเหนือ|Kaluwo Nuea', 'โคกเคียน|Khok Khian',
  ]],
  ['bacho', 'บาเจาะ', 'Bacho', 'Bacok', 101.65, 6.53, 'coastal', [
    'บาเจาะ|Bacho', 'ลุโบะสาวอ|Lubo Sawo', 'กาเยาะมาตี|Kayo Mati',
    'ปะลุกาสาเมาะ|Paluka Samo', 'บาเระเหนือ|Bare Nuea', 'บาเระใต้|Bare Tai',
  ]],
  ['yingo', 'ยี่งอ', 'Yi-ngo', 'Yi-ngo', 101.70, 6.38, 'rural', [
    'ยี่งอ|Yi-ngo', 'ละหาร|Lahan', 'จอเบาะ|Chobo', 'ลุโบะบายะ|Lubo Baya',
    'ลุโบะบือซา|Lubo Buesa', 'ตะปอเยาะ|Tapo Yo',
  ]],
  ['ra-ngae', 'ระแงะ', 'Ra-ngae', 'Rangae', 101.72, 6.30, 'rural', [
    'ตันหยงมัส|Tanyong Mat', 'ตันหยงลิมอ|Tanyong Limo', 'บองอ|Bo-ngo',
    'กาลิซา|Kalisa', 'บาโงสะโต|Ba-ngo Sato', 'เฉลิม|Chaloem', 'มะรือโบตก|Marue Bo Tok',
  ]],
  ['rueso', 'รือเสาะ', 'Rueso', 'Rusoh', 101.51, 6.37, 'rural', [
    'รือเสาะ|Rueso', 'สาวอ|Sawo', 'เรียง|Riang', 'สามัคคี|Samakkhi', 'บาตง|Batong',
    'ลาโละ|Lalo', 'รือเสาะออก|Rueso Ok', 'โคกสะตอ|Khok Sato', 'สุวารี|Suwari',
  ]],
  ['sisakhon', 'ศรีสาคร', 'Si Sakhon', 'Sri Sakon', 101.50, 6.20, 'remote', [
    'ซากอ|Sako', 'ตะมะยูง|Tama Yung', 'ศรีสาคร|Si Sakhon', 'เชิงคีรี|Choeng Khiri',
    'กาหลง|Kalong', 'ศรีบรรพต|Si Banphot',
  ]],
  ['chanae', 'จะแนะ', 'Chanae', 'Chanae', 101.66, 6.15, 'remote', [
    'จะแนะ|Chanae', 'ดุซงญอ|Dusong Yo', 'ผดุงมาตร|Phadung Mat', 'ช้างเผือก|Chang Phueak',
  ]],
  ['chohairong', 'เจาะไอร้อง', 'Cho-airong', 'Cho-airong', 101.86, 6.28, 'rural', [
    'จวบ|Chuap', 'บูกิต|Bukit', 'มะรือโบออก|Marue Bo Ok',
  ]],
  ['takbai', 'ตากใบ', 'Tak Bai', 'Tak Bai', 102.04, 6.25, 'border', [
    'เจ๊ะเห|Chehe', 'ไพรวัน|Phrai Wan', 'พร่อน|Phron', 'ศาลาใหม่|Sala Mai',
    'บางขุนทอง|Bang Khun Thong', 'เกาะสะท้อน|Ko Sathon', 'นานาค|Na Nak',
    'โฆษิต|Khosit',
  ]],
  ['sungaipadi', 'สุไหงปาดี', 'Su-ngai Padi', 'Sungai Padi', 101.90, 6.13, 'rural', [
    'ปะลุรู|Paluru', 'สุไหงปาดี|Su-ngai Padi', 'โต๊ะเด็ง|To Deng', 'สากอ|Sako',
    'ริโก๋|Riko', 'กาวะ|Kawa',
  ]],
  ['sungaikolok', 'สุไหงโก-ลก', 'Su-ngai Kolok', 'Sungai Golok', 101.97, 6.03, 'border', [
    'สุไหงโก-ลก|Su-ngai Kolok', 'ปาเสมัส|Pasemat', 'มูโนะ|Muno', 'ปูโยะ|Puyo',
  ]],
  ['waeng', 'แว้ง', 'Waeng', 'Weng', 101.85, 5.93, 'border', [
    'แว้ง|Waeng', 'กายูคละ|Kayu Khla', 'ฆอเลาะ|Kholo', 'โละจูด|Lo Chut',
    'แม่ดง|Mae Dong', 'เอราวัณ|Erawan',
  ]],
  ['sukhirin', 'สุคิริน', 'Sukhirin', 'Sukhirin', 101.70, 5.93, 'remote', [
    'มาโมง|Mamong', 'สุคิริน|Sukhirin', 'เกียร์|Kia', 'ภูเขาทอง|Phu Khao Thong',
    'ร่มไทร|Rom Sai',
  ]],
]

// ── Provinces ────────────────────────────────────────────────
export const PROVINCES_GEO: ProvinceGeo[] = [
  {
    key: 'pattani', id: 'TH-94', region: 'south',
    th: 'ปัตตานี', en: 'Pattani', ms: 'Patani',
    x: 52, y: 18, tier: 3, partial: false,
  },
  {
    key: 'yala', id: 'TH-95', region: 'south',
    th: 'ยะลา', en: 'Yala', ms: 'Jala',
    x: 45, y: 45, tier: 3, partial: false,
  },
  {
    key: 'narathiwat', id: 'TH-96', region: 'south',
    th: 'นราธิวาส', en: 'Narathiwat', ms: 'Menara',
    x: 75, y: 50, tier: 3, partial: false,
  },
]

// ── Districts (flattened) ────────────────────────────────────
function expand(provinceKey: string, seeds: Seed[]): DistrictGeo[] {
  return seeds.map(([key, th, en, ms, lon, lat, kind, tambons]) => ({
    key,
    provinceKey,
    th,
    en,
    ms,
    lon,
    lat,
    kind,
    tambons: tambons.map((raw, i) => {
      const [tth, ro] = raw.split('|')
      return {
        key: `${key}-t${i + 1}`,
        th: tth,
        ro,
        districtKey: key,
        provinceKey,
      }
    }),
  }))
}

export const DISTRICTS_GEO: DistrictGeo[] = [
  ...expand('pattani', PATTANI),
  ...expand('yala', YALA),
  ...expand('narathiwat', NARATHIWAT),
]

export const TAMBONS_GEO: TambonGeo[] = DISTRICTS_GEO.flatMap((d) => d.tambons)

export const DISTRICT_BY_KEY: Record<string, DistrictGeo> = Object.fromEntries(
  DISTRICTS_GEO.map((d) => [d.key, d]),
)

export const TAMBON_BY_KEY: Record<string, TambonGeo> = Object.fromEntries(
  TAMBONS_GEO.map((t) => [t.key, t]),
)

export const districtsOf = (provinceKey: string): DistrictGeo[] =>
  DISTRICTS_GEO.filter((d) => d.provinceKey === provinceKey)

// ── Display-name lookups (used by useI18n().pn / dn / tn) ────
export const PROVINCE_NAME: Record<string, { th: string; en: string; ms: string }> =
  Object.fromEntries(PROVINCES_GEO.map((p) => [p.key, { th: p.th, en: p.en, ms: p.ms }]))

export const DISTRICT_NAME: Record<string, { th: string; en: string; ms: string }> =
  Object.fromEntries(DISTRICTS_GEO.map((d) => [d.key, { th: d.th, en: d.en, ms: d.ms }]))

export const TAMBON_NAME: Record<string, { th: string; en: string; ms: string }> =
  Object.fromEntries(TAMBONS_GEO.map((t) => [t.key, { th: t.th, en: t.ro, ms: t.ro }]))

// ── Map projection (must match data/thailandPaths.ts) ────────
// Derived from the province centroids in that file:
//   x = (lon − 97.34) × 71.3 ,  y = (20.03 − lat) × 71.3
export const PROJ = { lon0: 97.34, lat0: 20.03, scale: 71.3 }

export const projectLon = (lon: number) => (lon - PROJ.lon0) * PROJ.scale
export const projectLat = (lat: number) => (PROJ.lat0 - lat) * PROJ.scale

/** viewBox framing the three TOR provinces, with padding.
 *  Bounds measured off their outlines in data/thailandPaths.ts. */
export const SBP_VIEWBOX = (() => {
  const pad = 12
  const x0 = 253.0 - pad
  const y0 = 933.8 - pad
  const x1 = 335.5 + pad
  const y1 = 1024.0 + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, str: `${x0} ${y0} ${x1 - x0} ${y1 - y0}` }
})()

export const SBP_PROVINCE_KEYS = ['pattani', 'yala', 'narathiwat'] as const
