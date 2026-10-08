import type { Lang } from '@/i18n/translations'

/** Seeded pseudo-random generator (mulberry32) for stable mock data. */
export function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

/** Deterministic string hash → seed */
export function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function formatNumber(n: number, lang: Lang = 'th'): string {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US').format(n)
}

export function formatPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function formatSignedPct(n: number, digits = 1): string {
  const s = n > 0 ? '+' : ''
  return `${s}${n.toFixed(digits)}%`
}

/** compact e.g. 1,240 -> 1.2K (used on small chips) */
export function compact(n: number, lang: Lang = 'th'): string {
  return new Intl.NumberFormat(lang === 'th' ? 'th-TH' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}
