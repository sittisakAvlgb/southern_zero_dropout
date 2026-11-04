// ไฟล์คำบรรยาย (SRT) จากข้อความบนจอใน timeline — ใช้เมื่อเปิดในเครื่องเล่นที่ซ่อนข้อความได้ หรือแปลเป็นภาษาอื่น
import { writeFileSync, mkdirSync } from 'node:fs'
import { SCENES } from '../src/timeline.mjs'

const ts = (s) => {
  const ms = Math.round(s * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
const cues = []
for (const s of SCENES) {
  const a = s.start + 0.4
  const b = s.start + s.dur - 0.3
  if (s.kind === 'walk') {
    // หนึ่งคำบรรยายต่อหนึ่งขั้นใน journey
    for (const step of s.steps) {
      cues.push([step.start + 0.4, step.start + step.dur - 0.2, step.sub ? `${step.title}\n${step.sub}` : step.title])
    }
  } else if (s.lines?.length === 2 && s.kind === 'loop') {
    cues.push([a, s.start + 7.3, s.lines[0]], [s.start + 7.4, b, s.lines[1]])
  } else if (s.lines) cues.push([a, b, s.lines.join('\n')])
  else if (s.kind === 'end') cues.push([a, b, 'Southern Zero Dropout Platform\nมองเห็นทุกคน ออกแบบโอกาสเฉพาะบุคคล'])
  else if (s.kind === 'logo') cues.push([a, b, `Southern Zero Dropout Platform\n${s.title}`])
  else if (s.title) cues.push([a, b, s.sub ? `${s.title}\n${s.sub}` : s.title])
}
mkdirSync('out', { recursive: true })
writeFileSync('out/sbp-pr-film.th.srt', cues.map(([a, b, t], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${t}\n`).join('\n'), 'utf8')
console.log('✓ out/sbp-pr-film.th.srt', cues.length, 'cues')
