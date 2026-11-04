import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion'
import { f } from './theme'
import { MUSIC, SCENES, SFX, type Scene } from './timeline.mjs'
import { Backdrop } from './ui'
import { ChapterScene } from './shots'
import { WalkScene } from './walk'
import { ClassroomScene, EndScene, JourneyScene, LogoScene, LoopScene, MapScene, PilotScene, SchoolScene, SignalsScene } from './story'

function SceneSwitch({ s }: { s: Scene }) {
  switch (s.kind) {
    case 'school': return <SchoolScene s={s} />
    case 'classroom': return <ClassroomScene s={s} />
    case 'signals': return <SignalsScene s={s} />
    case 'logo': return <LogoScene s={s} />
    case 'journey': return <JourneyScene s={s} />
    case 'chapter': return <ChapterScene s={s} />
    case 'walk': return <WalkScene s={s} />
    case 'map': return <MapScene s={s} />
    case 'loop': return <LoopScene s={s} />
    case 'pilot': return <PilotScene s={s} />
    case 'end': return <EndScene />
    default: return null
  }
}

const SFX_FILE: Record<string, string> = {
  whoosh: 'audio/whoosh.wav',
  click: 'audio/click.wav',
  tick: 'audio/tick.wav',
  chime: 'audio/chime.wav',
}

/** วิดีโอทั้งเรื่อง: ฉากเรียงตาม timeline.mjs · ดนตรีประกอบตาม MUSIC · เสียงประกอบตาม SFX */
export function Film() {
  const restart = f(MUSIC.restartAt)
  const len2 = f(MUSIC.length) // รอบสองยาวเท่าเพลงเต็ม จบพร้อมวิดีโอพอดี
  const xf = f(3.5) // ครอสเฟดตรงรอยต่อ — เสียงไม่หายเป็นช่วง
  const endFade = f(4)
  const vol = 0.72
  // เสียงบรรยาย (VO) ไทย — ยืดให้พอดีความยาววิดีโอแล้ว · หรี่เพลงลงใต้เสียงพูด (ducking)
  const voStart = f(0.4)
  const voEnd = voStart + f(242)
  const duck = (abs: number) => interpolate(abs, [voStart - f(0.5), voStart + f(0.8), voEnd - f(1.5), voEnd + f(0.4)], [1, 0.34, 0.34, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Backdrop />
      {SCENES.map((s) => (
        <Sequence key={s.id} name={s.id} from={f(s.start)} durationInFrames={f(s.dur)}>
          <SceneSwitch s={s} />
        </Sequence>
      ))}

      {/* เสียงบรรยายภาษาไทย (พากย์จาก Google AI Studio · ยืดพอดีความยาววิดีโอ) */}
      <Sequence name="vo" from={voStart}>
        <Audio src={staticFile('audio/vo-fit.wav')} volume={0.95} />
      </Sequence>

      {/* เพลงรอบแรก: เฟดเข้าเปิดเรื่อง · เล่นเลยรอยต่อไป 3.5 วิ แล้วจางไขว้กับรอบสอง (ไม่ปล่อยให้เงียบ) · หรี่ใต้ VO */}
      <Sequence name="music-1" from={0} durationInFrames={restart + xf}>
        <Audio src={staticFile(MUSIC.src)} volume={(fr) => interpolate(fr, [0, f(1.5), restart, restart + xf], [0, vol, vol * 0.9, 0], { extrapolateRight: 'clamp' }) * duck(fr)} />
      </Sequence>
      {/* เพลงรอบสอง: เฟดเข้าไขว้รอยต่อ · เต็มระหว่างเรื่อง · เฟดออกนุ่ม ๆ ตอนจบ · หรี่ใต้ VO */}
      <Sequence name="music-2" from={restart}>
        <Audio src={staticFile(MUSIC.src)} volume={(fr) => interpolate(fr, [0, xf, len2 - endFade, len2], [0, vol, vol, 0], { extrapolateRight: 'clamp' }) * duck(restart + fr)} />
      </Sequence>

      {/* เสียงประกอบ: whoosh ตอนขึ้นบท · click ตอนเคอร์เซอร์กด · tick ตอนกรอบทองขึ้น · chime ตอนส่งสำเร็จ */}
      {SFX.map((c, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, f(c.t) - (c.kind === 'whoosh' ? 6 : 0))} durationInFrames={f(c.kind === 'chime' ? 2.3 : 1)}>
          <Audio src={staticFile(SFX_FILE[c.kind])} volume={c.vol} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
