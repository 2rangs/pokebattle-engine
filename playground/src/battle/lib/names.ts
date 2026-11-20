// ─── 이름·로그 문장 (엔진 createFormatter, ko/en 내장 이름 팩) ──────────
// 이름은 엔진이 가진 PokeAPI 이름표만 쓴다 (도감 데이터를 따로 들고 오지 않는다).
import {
  createFormatter, fixParticles, getSpecies, toId, CONDITION_ENTITY, SHOWN_VOLATILES,
  type BattleEvent, type BattlePokemon, type FormatContext, type Formatter, type PlayerID, type PokemonSet,
} from './engine'
import type { Lang } from './messages'

/** 지금 포맷 중인 프레임의 컨텍스트 (포매터는 동기라서 호출 직전에 바꿔 끼운다) */
let current: FormatContext = { getPokemon: () => undefined }

const formatters = new Map<string, Formatter>()

function formatterFor(lang: Lang, named: boolean): Formatter {
  const key = `${lang}:${named ? 1 : 0}`
  let f = formatters.get(key)
  if (!f) {
    f = createFormatter({
      locale: lang,
      getPokemon: id => current.getPokemon(id),
      sideName: named ? (p: PlayerID) => current.sideName?.(p) ?? p : undefined,
    })
    formatters.set(key, f)
  }
  return f
}

/** 이름표만 쓰는 포매터 */
export const names = (lang: Lang) => formatterFor(lang, false).name

/** 이벤트 → 로그 문장 (보여줄 필요 없으면 null). sideName: 관전 모드의 진영 이름 */
export function formatBattleEvent(event: BattleEvent, ctx: FormatContext, lang: Lang, part?: 0 | 1): string | null {
  const prev = current
  current = ctx
  try {
    const f = formatterFor(lang, !!ctx.sideName)
    // part: 두 문장짜리 이벤트(메가진화 등)를 한 문장씩
    let text: string | null
    if (part === undefined) text = f.format(event)
    else {
      const msgs = f.describe(event)
      const one = msgs?.[part]
      text = one ? f.render([one]) : null
    }
    // 진영 이름(CPU 1 등)을 넣으면 엔진 문장에 '은(는)' 이 남는다 → 조사 보정
    return text === null ? null : particles(text, lang)
  } finally {
    current = prev
  }
}

const prettify = (slug: string) => slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/**
 * 종 이름. 폼은 엔진 이름 팩의 폼 이름 (rotom-wash → 워시로토무, ninetales-alola → 나인테일 (알로라의 모습) / Ninetales-Alola).
 * 팀 빌더·검색·데이터박스·로그가 모두 같은 이름을 쓴다.
 */
export function speciesName(slug: string, lang: Lang): string {
  const n = names(lang).species(slug)
  return n && n !== slug ? n : getSpecies(slug)?.showdown ?? prettify(slug)
}

export const moveName = (slug: string, lang: Lang) => names(lang).move(slug)
export const natureName = (slug: string, lang: Lang) => names(lang).nature(slug)
export const typeName = (slug: string, lang: Lang) => names(lang).type(slug)
export const itemName = (slug: string, lang: Lang) => names(lang).item(slug)
export const abilityName = (slug: string, lang: Lang) => names(lang).ability(slug)

const cap = (s: string, lang: Lang) => (lang === 'en' ? s.replace(/^\p{Ll}/u, c => c.toUpperCase()) : s)

/** 상태이상 짧은 이름 (데이터박스 배지). 게임 표기: 마비/화상/독/맹독/잠듦/얼음 · PAR/BRN/PSN/TOX/SLP/FRZ */
const STATUS_SHORT: Record<Lang, Record<string, string>> = {
  ko: { paralysis: '마비', burn: '화상', poison: '독', toxic: '맹독', sleep: '잠듦', freeze: '얼음' },
  en: { paralysis: 'PAR', burn: 'BRN', poison: 'PSN', toxic: 'TOX', sleep: 'SLP', freeze: 'FRZ' },
}
export const statusShort = (s: string, lang: Lang) => STATUS_SHORT[lang][s] ?? s.toUpperCase()
export const statusLongName = (s: string, lang: Lang) => cap(names(lang).term('status', s), lang)
export const weatherName = (w: string, lang: Lang) => cap(names(lang).term('weather', w), lang)
export const effectName = (c: string, lang: Lang) => cap(names(lang).effect(c), lang)
export const statLabel = (stat: string, lang: Lang) => cap(names(lang).term('stat', stat), lang)

/** 화면에 보여줄 휘발성 상태면 이름, 아니면 null */
export function volatileName(v: string, lang: Lang): string | null {
  if (!SHOWN_VOLATILES.has(v)) return null
  const n = names(lang)
  return cap(CONDITION_ENTITY[v] ? n.effect(v) : n.term('volatile', v), lang)
}

/** 세트 생성기가 붙인 자동 닉네임(종 이름)인지 — 자동 닉네임은 언어를 따라가도록 지운다 */
export function isAutoNickname(species: string, nickname: string | null | undefined, setSpecies?: string): boolean {
  if (!nickname) return true
  const id = toId(nickname)
  const same = (s: string | undefined) => !!s && (id === toId(s) || id === toId(getSpecies(s)?.showdown ?? '') || id === toId(getSpecies(s)?.species_name ?? ''))
  return same(species) || same(setSpecies)
}

export function stripAutoNickname(set: PokemonSet): PokemonSet {
  if (set.nickname === undefined || !isAutoNickname(set.species, set.nickname)) return set
  const next = { ...set }
  delete next.nickname
  return next
}

/** 표시 이름: 직접 붙인 닉네임, 아니면 현재 언어의 종 이름 */
export function pokemonLabel(p: { species: string; nickname?: string | null; setSpecies?: string }, lang: Lang): string {
  return isAutoNickname(p.species, p.nickname, p.setSpecies) ? speciesName(p.species, lang) : p.nickname!
}

/** 한국어 조사 보정 (은(는) → 은/는) */
export const particles = (s: string, lang: Lang) => (lang === 'ko' ? fixParticles(s) : s)

export type { BattlePokemon }
