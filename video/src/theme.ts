import { loadFont as loadDisplay } from '@remotion/google-fonts/BaiJamjuree'
import { loadFont as loadBody } from '@remotion/google-fonts/NotoSansThaiLooped'
import { Easing } from 'remotion'
import { FPS } from './timeline.mjs'

// ฟอนต์ชุดเดียวกับในแพลตฟอร์ม ข้อความบนจอจึงกลืนกับภาพหน้าจอ
export const DISPLAY = loadDisplay('normal', { weights: ['600', '700'], subsets: ['thai', 'latin'] }).fontFamily
export const BODY = loadBody('normal', { weights: ['400', '500', '600', '700'], subsets: ['thai', 'latin'] }).fontFamily

export const C = {
  navy: '#0B1736',
  navy2: '#13224a',
  royal: '#2563EB',
  teal: '#14B8A6',
  gold: '#F2C66D',
  white: '#ffffff',
  soft: 'rgba(255,255,255,0.78)',
  faint: 'rgba(255,255,255,0.5)',
  line: 'rgba(255,255,255,0.14)',
}

export const f = (s: number) => Math.round(s * FPS)
export const EASE = Easing.bezier(0.65, 0, 0.35, 1)
export const OUT = Easing.bezier(0.16, 1, 0.3, 1)
