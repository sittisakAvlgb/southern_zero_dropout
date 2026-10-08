import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { dictionaries, FALLBACK_CHAIN, LANG_META, type Lang } from './translations'
import { DISTRICT_NAME, PROVINCE_NAME, TAMBON_NAME } from '@/data/geo'

interface I18nContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  /** cycle th → en → ms → th */
  toggle: () => void
  /** translate a dot-key; missing Malay keys fall back to English */
  t: (key: string) => string
  /** province display name in the active language */
  pn: (key: string) => string
  /** district display name */
  dn: (key: string) => string
  /** tambon display name */
  tn: (key: string) => string
  /** pick from a th/en(/ms) object carried on a data record */
  pick: (o: { th: string; en: string; ms?: string } | undefined) => string
  langs: Lang[]
  meta: typeof LANG_META
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = 'sbp-lang'
const LANGS: Lang[] = ['th', 'en', 'ms']

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved =
      typeof window !== 'undefined'
        ? (localStorage.getItem(STORAGE_KEY) as Lang | null)
        : null
    return saved && LANGS.includes(saved) ? saved : 'th'
  })

  // Reflect language on <body> so CSS can switch the font family.
  useEffect(() => {
    const body = document.body
    body.classList.remove('lang-th', 'lang-en', 'lang-ms')
    body.classList.add(`lang-${lang}`)
    document.documentElement.lang = lang
    localStorage.setItem(STORAGE_KEY, lang)
  }, [lang])

  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const toggle = useCallback(
    () => setLangState((p) => LANGS[(LANGS.indexOf(p) + 1) % LANGS.length]),
    [],
  )

  const t = useCallback(
    (key: string) => {
      for (const l of FALLBACK_CHAIN[lang]) {
        const hit = dictionaries[l][key]
        if (hit !== undefined) return hit
      }
      return key
    },
    [lang],
  )

  const nameIn = useCallback(
    (table: Record<string, { th: string; en: string; ms: string }>, key: string) =>
      table[key]?.[lang] ?? table[key]?.en ?? key,
    [lang],
  )

  const pn = useCallback((key: string) => nameIn(PROVINCE_NAME, key), [nameIn])
  const dn = useCallback((key: string) => nameIn(DISTRICT_NAME, key), [nameIn])
  const tn = useCallback((key: string) => nameIn(TAMBON_NAME, key), [nameIn])

  const pick = useCallback(
    (o: { th: string; en: string; ms?: string } | undefined) =>
      !o ? '' : lang === 'th' ? o.th : lang === 'ms' ? (o.ms ?? o.en) : o.en,
    [lang],
  )

  const value = useMemo(
    () => ({ lang, setLang, toggle, t, pn, dn, tn, pick, langs: LANGS, meta: LANG_META }),
    [lang, setLang, toggle, t, pn, dn, tn, pick],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider')
  return ctx
}
