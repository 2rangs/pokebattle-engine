// ─── 데모 언어 (ko / en / ja) ───────────────────────────────────
// 문서 사이트는 ko/en 이지만, 데모는 엔진 다국어 포매터를 보여주려고 ja 도 고를 수 있다.
// 처음에는 사이트 언어를 따르고, 데모 안에서 바꾸면 화면·이름·로그가 모두 그 언어로 바뀐다.
import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLang as useSiteLang } from '../i18n'

export const LANGS = ['ko', 'en', 'ja'] as const
export type Lang = (typeof LANGS)[number]
export const LANG_LOCALE: Record<Lang, string> = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' }

interface DemoLangCtx { lang: Lang; setLang: (l: Lang) => void }
const Ctx = createContext<DemoLangCtx | null>(null)

export function DemoLangProvider({ children }: { children: ReactNode }) {
  const site = useSiteLang().lang
  const [lang, setLangState] = useState<Lang>(site)
  // 헤더에서 사이트 언어를 바꾸면 데모도 따라간다
  const [siteOf, setSiteOf] = useState(site)
  if (siteOf !== site) {
    setSiteOf(site)
    setLangState(site)
  }
  const setLang = useCallback((l: Lang) => setLangState(l), [])
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return createElement(Ctx.Provider, { value: { lang, setLang } }, children)
}

export function useDemoLang(): DemoLangCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('DemoLangProvider missing')
  return v
}

/** 현재 데모 언어 */
export function useLang(): Lang {
  return useDemoLang().lang
}

// ── 메시지 ──
export type Vars = Record<string, string | number>
export type Messages<K extends string> = { ko: Record<K, string>; en: Record<K, string>; ja: Record<K, string> }

/** ko 를 기준으로 en/ja 에 같은 키가 빠짐없이 있는지 타입 검사 */
export function defineMessages<const K extends string>(m: {
  ko: Record<K, string>
  en: NoInfer<Record<K, string>>
  ja: NoInfer<Record<K, string>>
}): Messages<K> {
  return m
}

export function format(template: string, vars: Vars | undefined, lang: Lang): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k]
    if (v == null) return `{${k}}`
    return typeof v === 'number' ? v.toLocaleString(LANG_LOCALE[lang]) : v
  })
}

export function translate<K extends string>(messages: Messages<K>, key: K, vars: Vars | undefined, lang: Lang): string {
  return format(messages[lang][key] ?? messages.ko[key] ?? key, vars, lang)
}

export function useT<K extends string>(messages: Messages<K>) {
  const lang = useLang()
  return useCallback((key: K, vars?: Vars) => translate(messages, key, vars, lang), [messages, lang])
}

/** 페이지 제목 ("{title} · pokebattle-engine") */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} · pokebattle-engine` : 'pokebattle-engine'
    return () => { document.title = prev }
  }, [title])
}

