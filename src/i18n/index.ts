// ─── 다국어 배틀 로그 ─────────────────────────────────────────
// 이벤트 → describeEvent → 메시지 { key, params } (언어 무관) → createFormatter(...).render → 문장
// 새 언어: registerLocale({ code, messages, terms, fallback: en }) + (이름) loadNames / registerNames
import { registerLocale } from './formatter'
import { ko } from './locales/ko'
import { en } from './locales/en'
import { ja } from './locales/ja'

for (const l of [ko, en, ja]) registerLocale(l)

export { ko, en, ja }
export { fixParticles } from './locales/ko'
export { capitalizeSentences } from './locales/en'
export { createFormatter, registerLocale, getLocale, listLocales } from './formatter'
export type { Formatter, FormatterOptions } from './formatter'
export { describeEvent, SHOWN_VOLATILES } from './describe'
export { loadNames, registerNames, getNames, NAME_PACKS, CONDITION_ENTITY } from './names'
export type { NameLookup, NamePack, EntityKind } from './names'
export type { Arg, Message, Template, Locale, TermGroup, FormatContext, NameResolver } from './types'
