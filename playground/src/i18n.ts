import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type Lang = 'ko' | 'en'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
]

const KEY = 'pokebattle-docs-lang'

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'ko' || saved === 'en') return saved
  } catch { /* 저장소 차단 */ }
  return navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  /** 두 언어 중 현재 언어 값을 고른다 */
  t: <T>(ko: T, en: T) => T
}

const Ctx = createContext<LangCtx | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(KEY, l) } catch { /* 무시 */ }
  }, [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const t = useCallback(<T,>(ko: T, en: T): T => (lang === 'ko' ? ko : en), [lang])
  return createElement(Ctx.Provider, { value: { lang, setLang, t } }, children)
}

export function useLang(): LangCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('LangProvider missing')
  return v
}
