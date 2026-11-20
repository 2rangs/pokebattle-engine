// ─── 팀 빌더 순수 로직: 마릿수만큼의 자리, 랜덤 팀, Showdown 가져오기 ─────
import {
  generateRandomSet, generateRandomTeam, getSpecies, listPokeApiSpecies, parseShowdownTeam, PRNG, toId,
  type PokemonSet,
} from './engine'
import { speciesFormName, speciesName, stripAutoNickname } from './names'
import type { Lang } from './messages'

export const TEAM_SIZES = [1, 3, 6] as const
export type TeamSize = typeof TEAM_SIZES[number]
export const MAX_TEAM = 6
export const DEFAULT_LEVEL = 50

export const normalizeSize = (n: unknown): TeamSize => (TEAM_SIZES.includes(n as TeamSize) ? (n as TeamSize) : 3)

/**
 * 화면에 보일 자리: 정확히 size 개 (빈 자리는 null).
 * 팀 목록은 순서를 지키며 최대 6마리까지 보관한다 → 마릿수를 줄였다 늘려도 앞에서 고른 포켓몬이 돌아온다.
 */
export function slotsFor<T>(team: readonly (T | null)[], size: number): (T | null)[] {
  return Array.from({ length: size }, (_, i) => team[i] ?? null)
}

/** 배틀에 나갈 포켓몬 (앞에서부터 size 마리, 빈 자리 제외) */
export const activeTeam = <T>(team: readonly (T | null)[], size: number): T[] =>
  slotsFor(team, size).filter((x): x is T => x !== null)

/** i 번 자리에 넣기 (빈 칸은 null 로 채움, 6마리까지) */
export function placeAt<T>(team: readonly (T | null)[], i: number, v: T | null): (T | null)[] {
  if (i < 0 || i >= MAX_TEAM) return [...team]
  const next = [...team]
  while (next.length <= i) next.push(null)
  next[i] = v
  // 끝의 빈 칸은 잘라 낸다
  while (next.length && next[next.length - 1] === null) next.pop()
  return next
}

/** i 번 자리를 앞으로 (1번과 맞바꾸면 선발이 된다) */
export function moveUp<T>(team: readonly (T | null)[], i: number): (T | null)[] {
  if (i <= 0 || i >= team.length) return [...team]
  const next = [...team]
  ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
  return next
}

/** 랜덤 팀: 마릿수만큼 (Showdown 랜덤배틀 세트, 레벨 통일, 자동 닉네임 제거) */
export function randomTeam(seed: number, size: number, level = DEFAULT_LEVEL): PokemonSet[] {
  return generateRandomTeam({ seed, size, level }).map(stripAutoNickname)
}

/** 고른 종 → 추천 세트 (엔진 기술표 기반) */
export function suggestedSet(species: string, seed: number, level = DEFAULT_LEVEL): PokemonSet {
  return stripAutoNickname(generateRandomSet(species, { rng: new PRNG(seed), level }))
}

/** Showdown 텍스트 → 세트 (종 이름을 엔진 슬러그로, 6마리까지) */
export function importTeam(text: string, unknown: (name: string) => string): PokemonSet[] {
  return parseShowdownTeam(text).slice(0, MAX_TEAM).map(s => {
    const sp = getSpecies(s.species) ?? getSpecies(toId(s.species))
    if (!sp) throw new Error(unknown(s.species))
    return stripAutoNickname({ ...s, species: sp.name, ability: s.ability || sp.abilities[0]?.name || '' })
  })
}

// ─── 종 검색 ─────────────────────────────────────────────────
export interface SpeciesOption {
  slug: string
  num: number
  /** 현재 언어 이름 (폼 표기 포함) */
  label: string
  /** 검색용: ko·en 이름, 슬러그 */
  haystack: string
}

const optionCache = new Map<Lang, SpeciesOption[]>()

/** 배틀에 쓸 수 있는 종 (엔진 데이터에 있고 배틀 중에만 되는 폼은 제외) */
export function speciesOptions(lang: Lang): SpeciesOption[] {
  const hit = optionCache.get(lang)
  if (hit) return hit
  const out: SpeciesOption[] = []
  const seen = new Set<string>()
  for (const s of listPokeApiSpecies()) {
    if (/-(mega|gmax|totem|primal)/.test(s.slug) || /-(mega|gmax)$/.test(s.slug)) continue
    const sp = getSpecies(s.slug)
    if (!sp || seen.has(sp.name)) continue
    seen.add(sp.name)
    out.push({
      slug: sp.name,
      num: s.num,
      label: speciesFormName(sp.name, lang),
      haystack: [speciesName(sp.name, 'ko'), speciesName(sp.name, 'en'), sp.name, String(s.num)].join(' ').toLowerCase(),
    })
  }
  out.sort((a, b) => a.num - b.num || a.slug.localeCompare(b.slug))
  optionCache.set(lang, out)
  return out
}

/** 검색: 번호는 정확히, 이름은 앞부분 일치 먼저 */
export function searchSpecies(options: readonly SpeciesOption[], query: string, limit = 8): SpeciesOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  if (/^\d+$/.test(q)) return options.filter(o => String(o.num) === q).slice(0, limit)
  const starts: SpeciesOption[] = []
  const contains: SpeciesOption[] = []
  for (const o of options) {
    if (o.label.toLowerCase().startsWith(q) || o.haystack.split(' ').some(w => w.startsWith(q))) starts.push(o)
    else if (o.haystack.includes(q)) contains.push(o)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}
