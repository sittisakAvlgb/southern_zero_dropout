// ลำดับฉากของวิดีโอ — แหล่งเดียวที่ทั้งภาพ (Film.tsx) และดนตรี (scripts/music.mjs) อ่าน
// เวลาเป็นวินาที · ภาพหน้าจอทุกภาพมาจาก scripts/capture.mjs (หน้าจอจริงของแพลตฟอร์ม)
// focus/mark ใช้พิกัดของ viewport 1600×900 ตอนจับภาพ · ปุ่มที่เคอร์เซอร์กด (click) อ้างคีย์ใน boxes.json

export const FPS = 30
// GitHub Pages: เว็บ static ผู้ช่วย AI ตอบจากข้อมูลในระบบ (ไม่มี /api/chat)
export const DEMO_URL = 'https://sittisakavlgb.github.io/southern_zero_dropout/'

const ROLE = {
  teacher: { th: 'ครู', color: '#ef4444' },
  school: { th: 'ผอ.สถานศึกษา', color: '#f97316' },
  esa: { th: 'เขตพื้นที่การศึกษา', color: '#ec4899' },
  obec: { th: 'ผู้บริหาร สพฐ.', color: '#14b8a6' },
}
export { ROLE }

// กรอบกล้องสำเร็จรูปของแผงด้านขวา (drawer) ที่เปิดเต็มจอ
const DRAWER = { x: 980, y: 20, w: 620, h: 620 }
const DRAWER_LOW = { x: 980, y: 300, w: 620, h: 560 }

// หนึ่ง role = หนึ่ง journey ต่อเนื่อง กล้องไม่กระโดด หน้าจออยู่กับที่ มีแต่เคอร์เซอร์เดินไปกดทีละขั้น
// step: img หน้าจอที่ลงจอ · focus บริเวณที่กล้องเล็ง · click คีย์ปุ่มใน boxes.json ที่เคอร์เซอร์จะกด (นำไปหน้าถัดไป)
//       mark กรอบทองเน้นสิ่งที่ต้องดู · done ขั้นสุดท้าย (เสียง chime ไม่มีปุ่มกด)
const walk = (id, role, steps) => ({ id, kind: 'walk', role, steps, dur: steps.reduce((a, s) => a + s.dur, 0) })

const TEACHER = walk('walk-teacher', 'teacher', [
  { img: 't1-home', screen: 'เคสของฉัน', dur: 7,
    title: 'ครูเปิดงานจากคิวที่ระบบจัดให้', sub: 'เรียงจากสัญญาณ: ขาดเรียน · เลยนัด · ความเสี่ยงเพิ่มขึ้น',
    focus: { x: 272, y: 150, w: 1310, h: 480 }, click: 't1.open' },
  { img: 't2-desk', screen: 'ข้อมูลเด็กรายบุคคล', dur: 6.5,
    title: 'เปิดเคสแล้วเห็นสาเหตุ ไม่ใช่แค่คะแนน', sub: 'คะแนนเสี่ยงจาก 6 ด้าน กดดูวิธีคำนวณได้',
    focus: { x: 572, y: 196, w: 1004, h: 400 }, mark: { x: 1405, y: 208, w: 170, h: 168 } },
  // ── หัวใจของตอนนี้: AI แนะนำวิธีช่วยเหลือ ──
  { img: 't6-ai-rec', screen: 'ดูแลช่วยเหลือ · ผู้ช่วย AI', dur: 8.5,
    title: 'AI อ่านสาเหตุรายคน แล้วเสนอวิธีช่วยเป็นขั้น', sub: 'ทุกข้อมีเหตุผลจากข้อมูลเด็กคนนี้ · ครูเป็นผู้เลือกว่าจะใช้',
    focus: { x: 540, y: 430, w: 1010, h: 420 }, mark: { x: 578, y: 402, w: 662, h: 344 } },
  { img: 't7-ai-ask', screen: 'ถาม AI', dur: 7,
    title: 'ถาม AI ต่อได้ — ตอบจากข้อมูลของเคสนี้', sub: 'ทำไมเสี่ยง · ช่วยอะไรไปแล้ว · ควรส่งต่อหน่วยงานไหน',
    focus: { x: 990, y: 110, w: 600, h: 440 }, mark: { x: 1000, y: 124, w: 586, h: 336 } },
  { img: 't3-note', screen: 'บันทึกการช่วยเหลือ', dur: 6, pip: 'm1-note',
    title: 'สิ่งที่ครูเห็นเอง ป้อนกลับให้ AI', sub: 'บันทึกเยี่ยมบ้านลงในเคส AI ใช้ปรับคำแนะนำให้แม่นขึ้น',
    focus: { x: 540, y: 470, w: 1050, h: 380 }, mark: { x: 572, y: 700, w: 480, h: 72 } },
  { img: 't5-request', screen: 'ขอการสนับสนุนจาก ผอ.', dur: 7,
    title: 'งานที่เกินกำลังครู ส่งถึง ผอ. ได้ทันที', sub: 'ระบบดึงสิ่งที่ครูทำแล้วมาให้ ไม่ต้องพิมพ์ซ้ำ',
    focus: DRAWER_LOW, click: 't5.send' },
  { img: 't5-sent', screen: 'ขอการสนับสนุนจาก ผอ.', dur: 5.5, done: true,
    title: 'ส่งคำขอถึง ผอ. แล้ว', sub: 'ครูยังเป็นผู้ดูแลเคส · ผอ. เป็นผู้ตัดสินใจ',
    focus: { x: 990, y: 90, w: 600, h: 220 }, mark: { x: 1000, y: 122, w: 580, h: 84 } },
])

const SCHOOL = walk('walk-school', 'school', [
  { img: 'd1-home', screen: 'ภาพรวมโรงเรียน', dur: 7.5,
    title: 'คำขอของครู ขึ้นเป็นเรื่องแรกที่ ผอ. ต้องตัดสินใจ', sub: 'ไม่ต้องไล่อ่านตาราง ไม่ต้องเรียกประชุมเพื่อถาม',
    focus: { x: 272, y: 180, w: 1300, h: 520 }, mark: { x: 296, y: 292, w: 1256, h: 128 }, click: 'd1.consider' },
  { img: 'd2-sheet', screen: 'พิจารณาคำขอ', dur: 6.5,
    title: 'เปิดคำขอ เห็นสิ่งที่ครูทำมาแล้ว', sub: 'ตัดสินใจบนข้อมูลเดียวกับที่ครูเห็น',
    focus: DRAWER, click: 'd2.escalate' },
  { img: 'd2-escalate', screen: 'ตัดสินใจ', dur: 6.5,
    title: 'อนุมัติ · มอบหมาย · หรือยกระดับถึงเขต', sub: 'ทุกการตัดสินใจกลับไปเป็นงานของครูทันที',
    focus: { x: 980, y: 220, w: 620, h: 560 }, click: 'd2.confirm' },
  { img: 'd3-done', screen: 'ภาพรวมโรงเรียน', dur: 6, done: true,
    title: 'ส่งงานถึงครู และส่งเรื่องถึงเขต ในครั้งเดียว', sub: 'สนับสนุนครูได้ตรงจุด',
    focus: { x: 0, y: 0, w: 1600, h: 900 } },
])

const ESA = walk('walk-esa', 'esa', [
  { img: 'e1-home', screen: 'ภาพรวมเขตพื้นที่', dur: 7.5,
    title: 'เห็นพื้นที่เสี่ยง และคำขอจากโรงเรียนที่เข้ามาวันนี้', sub: 'จัดลำดับด้วยสูตรที่เจ้าหน้าที่คำนวณตามได้',
    focus: { x: 272, y: 80, w: 1310, h: 600 }, click: 'e1.request' },
  { img: 'e2-request', screen: 'คำขอจากโรงเรียน', dur: 6.5,
    title: 'เห็นสิ่งที่โรงเรียนทำแล้ว และสิ่งที่ยังติดอยู่', sub: 'คำขอมาถึงเขตในวันเดียวกับที่โรงเรียนส่ง',
    focus: DRAWER, click: 'e2.decide' },
  { img: 'e3-decide', screen: 'ตัดสินใจ · เขต', dur: 6.5,
    title: 'เขตจัดทีมสนับสนุน ตามภาระงานจริงของทีม', sub: 'AI แนะนำ คนเป็นผู้ตัดสินใจ',
    focus: DRAWER, click: 'e3.send' },
  { img: 'e3-sent', screen: 'ตัดสินใจ · เขต', dur: 5.5, done: true,
    title: 'ส่งทีมสนับสนุนกลับถึงโรงเรียนแล้ว', sub: 'ครูเห็นเป็นงานถัดไป โดยไม่ต้องตามเอง',
    focus: { x: 980, y: 90, w: 600, h: 240 } },
  { img: 'e5-schools', screen: 'โรงเรียนในเขต', dur: 6,
    title: 'ติดตามทุกโรงเรียนในเขตอย่างต่อเนื่อง', sub: 'เรียงตามความจำเป็น ไม่ใช่ตามตัวอักษร',
    focus: { x: 272, y: 80, w: 1310, h: 640 } },
])

const OBEC = walk('walk-obec', 'obec', [
  { img: 'o1-home', screen: 'ภาพรวมชายแดนใต้', dur: 8,
    title: 'ข้อมูลจากงานประจำวันของครู กลายเป็นภาพรวมเชิงนโยบาย', sub: 'เห็นครบทุกเขตพื้นที่ · AI สรุปเรื่องที่ควรจัดการวันนี้',
    focus: { x: 272, y: 150, w: 1310, h: 560 }, mark: { x: 275, y: 160, w: 1278, h: 286 } },
  { img: 'o2-geo', screen: 'แผนที่และเจาะลึกพื้นที่', dur: 6.5,
    title: 'เจาะลงรายพื้นที่ด้วยแผนที่', sub: 'สัดส่วนเสี่ยง · เด็กนอกระบบ · แนวโน้มความเสี่ยง 12 เดือน รายเขต/อำเภอ',
    focus: { x: 1160, y: 80, w: 440, h: 640 }, mark: { x: 1165, y: 230, w: 405, h: 436 } },
])

const RETURN = walk('walk-return', 'teacher', [
  { img: 'r3-teacher-desk', screen: 'ข้อมูลเด็กรายบุคคล', dur: 7,
    title: 'คำตอบย้อนกลับมาถึงครู เป็นงานถัดไปที่ชัดเจน', sub: 'นัดทีมเยี่ยมบ้านภายใน 3 วัน เพราะ ผอ. อนุมัติแล้ว',
    focus: { x: 572, y: 400, w: 1010, h: 260 }, mark: { x: 590, y: 438, w: 975, h: 112 } },
])

export const SCENES = [
  { id: 'school-open', kind: 'school', dur: 7.5, title: 'ทุกเช้า ในโรงเรียนทั่วสามจังหวัดชายแดนใต้', sub: 'ห้องเรียนเริ่มต้นขึ้นอีกวัน' },
  { id: 'open', kind: 'classroom', dur: 13, lines: ['เด็กหนึ่งคนที่หายไปจากห้องเรียน...', 'อาจกำลังรอโอกาสจากใครสักคน'] },
  { id: 'signals', kind: 'signals', dur: 9, title: 'สัญญาณมีอยู่แล้ว', sub: 'แต่กระจายอยู่หลายที่ จนไม่มีใครเห็นทั้งภาพ' },
  { id: 'logo', kind: 'logo', dur: 7, title: 'ทุกการช่วยเหลือ เริ่มต้นจากการมองเห็น' },
  { id: 'journey', kind: 'journey', dur: 6, title: 'ติดตามเคสจำลองหนึ่งเคส', sub: 'ผ่านหน้าจอจริงทั้ง 4 ระดับ — โดยมี AI ช่วยครูหาวิธีช่วยเหลือรายคน' },

  { id: 'ch-teacher', kind: 'chapter', dur: 3.5, no: '01', role: 'teacher', title: 'ครู · จุดเชื่อมแรก', sub: 'เห็นเฉพาะเด็กที่ตนดูแล' },
  TEACHER,

  { id: 'ch-school', kind: 'chapter', dur: 3.5, no: '02', role: 'school', title: 'ผอ.สถานศึกษา · ภาพเดียวทั้งโรงเรียน', sub: 'ตัดสินใจตามคำขอของครู ไม่ทำงานแทนครู' },
  SCHOOL,

  { id: 'ch-esa', kind: 'chapter', dur: 3.5, no: '03', role: 'esa', title: 'เขตพื้นที่การศึกษา · เชื่อมทุกโรงเรียน', sub: 'ดูได้ทั้งเขต แต่ลงมือแก้เคสแทนโรงเรียนไม่ได้' },
  ESA,

  { id: 'ch-obec', kind: 'chapter', dur: 3.5, no: '04', role: 'obec', title: 'ผู้บริหาร สพฐ. · จากข้อมูลสู่นโยบาย', sub: 'ขอบเขตนำร่อง 3 จังหวัดชายแดนภาคใต้' },
  { id: 'map', kind: 'map', dur: 8, title: 'ปัตตานี • ยะลา • นราธิวาส', sub: '33 อำเภอ · 46 โรงเรียนนำร่อง' },
  OBEC,

  { id: 'loop', kind: 'loop', dur: 16, lines: ['เคสเดียวกัน ส่งต่อครบทุกระดับ', 'ทุกระดับช่วยกันดูแลเด็กคนเดียว'] },
  RETURN,
  { id: 'hope', kind: 'classroom', dur: 9, filled: true, lines: ['เพื่อโอกาสของเด็กทุกคน'] },

  { id: 'pilot', kind: 'pilot', dur: 14, title: 'ข้อเสนอทดลองนำร่องในสถานศึกษา', sub: 'เริ่มจากโรงเรียน พร้อมขยายผลสู่เขตพื้นที่' },
  { id: 'end', kind: 'end', dur: 12 },
]

// เวลาเริ่มของแต่ละฉาก และของแต่ละขั้นใน journey (ใช้วางจังหวะเสียงและ SRT)
let t = 0
for (const s of SCENES) {
  s.start = t
  if (s.kind === 'walk') {
    let st = t
    for (const step of s.steps) { step.start = st; st += step.dur }
  }
  t += s.dur
}
export const SCORE_SECONDS = t
const at = (id) => SCENES.find((s) => s.id === id).start

// จังหวะเสียงประกอบทั้งเรื่อง — เคาะที่เดียว ไม่ต้องไล่คำนวณใน Film.tsx
// whoosh เฉพาะการ์ดขึ้นบทและฉากเล่าเรื่อง · click ตอนเคอร์เซอร์กด · tick ตอนกรอบทองขึ้น · chime ตอนส่งสำเร็จ
const CLICK_AT = 0.7 // กดปุ่มที่ 70% ของขั้น แล้วหน้าจอค่อยเปลี่ยนไปขั้นถัดไป
export const SFX = []
for (const s of SCENES) {
  if (s.kind === 'chapter') SFX.push({ t: s.start, kind: 'whoosh', vol: 0.45 })
  else if (s.kind === 'walk') {
    for (const step of s.steps) {
      if (step.click) SFX.push({ t: step.start + step.dur * CLICK_AT, kind: 'click', vol: 0.5 })
      if (step.mark) SFX.push({ t: step.start + 0.95, kind: 'tick', vol: 0.4 })
      if (step.done) SFX.push({ t: step.start + 0.5, kind: 'chime', vol: 0.18 })
    }
  } else if (s.start > 0 && s.id !== 'open') {
    // ฉากเปิด (school-open) และการตัดเข้าห้องเรียน (open) ปล่อยให้ภาพเล่าเอง ไม่ใส่ whoosh
    SFX.push({ t: s.start, kind: 'whoosh', vol: 0.2 })
    if (s.id === 'hope') SFX.push({ t: s.start + 1, kind: 'chime', vol: 0.18 })
  }
}
export { CLICK_AT }

// ดนตรีประกอบ: เพลงยาว 2:29 แต่วิดีโอยาวกว่า จึงเล่นสองรอบ — รอบแรกจางออกช่วง breakdown แล้วเริ่มใหม่ตอนขึ้นบท ผอ.
// รอบสองจบพร้อมวิดีโอพอดี ช่วงพีคของเพลง (นาทีที่ 1:21–2:01 ของเพลง) จึงตกที่ฉาก "เด็กหนึ่งคน"
export const MUSIC = {
  src: 'music/the-epic-hero.mp4',
  length: 149.1,
  credit: 'ดนตรีประกอบ: “The Epic Hero” โดย Keys of Moon',
}
MUSIC.restartAt = SCORE_SECONDS - MUSIC.length

export const CUES = { teacher: at('ch-teacher'), climax: at('loop'), pilot: at('pilot'), end: SCORE_SECONDS }
