// ─── 팀 빌더 순수 로직: 마릿수만큼의 자리, 랜덤 팀, Showdown 가져오기 ─────
import {
  generateRandomSet, generateRandomTeam, getLearnset, getSpecies, listPokeApiSpecies, parseShowdownTeam, PRNG, toId,
  type PokemonSet,
} from './engine'
import { DEFAULT_GEN, gimmickItemsFor, gimmicksOf, gmaxForm, itemInGen, randomFormat, speciesInGen, type Gen, type GenGimmicks } from './gimmick'
import { speciesName, stripAutoNickname } from './names'
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

const MAX_EVS = { hp: 252, attack: 252, defense: 252, special_attack: 252, special_defense: 252, speed: 252 }

/**
 * 그 세대에 없는 칸을 세트에서 정리한다 (엔진도 1·2세대 세트를 같은 식으로 정리한다: adaptSetToGen).
 *  - 테라 타입은 9세대만, 거다이맥스는 다이맥스가 켜진 8세대(또는 샌드박스)만
 *  - 1·2세대: 특성·성격 없음, 능력치 경험치는 모두 최대 (Showdown 팀 빌더 기본), 1세대: 지닌 도구 없음
 *  - 3세대 이후: 그 세대에 없는 특성(예: 4세대까지의 숨겨진 특성)은 첫 특성으로
 */
export function forGen(set: PokemonSet, gen: Gen, g: GenGimmicks = gimmicksOf(gen)): PokemonSet {
  const out = { ...set }
  if (gen !== 9) delete out.teraType
  if (!g.dynamax) delete out.gigantamax
  if (gen <= 2) {
    out.ability = ''
    out.nature = 'hardy'
    out.evs = { ...MAX_EVS }
    delete out.ivs
    if (gen === 1) delete out.item
  } else if (gen < 9) {
    const abilities = getSpecies(set.species, { gen })?.abilities.map(a => a.name) ?? []
    if (abilities.length && !abilities.includes(out.ability)) out.ability = abilities[0]!
  }
  return out
}

/**
 * 랜덤 팀: 마릿수만큼 (그 세대 Showdown 랜덤배틀 세트, 레벨 통일, 자동 닉네임 제거).
 * 7세대 세트에는 메가스톤·Z크리스탈, 8세대 세트에는 거다이맥스가 그대로 들어 있다.
 */
export function randomTeam(seed: number, size: number, level: number | 'balanced' = DEFAULT_LEVEL, gen: Gen = DEFAULT_GEN, g: GenGimmicks = gimmicksOf(gen)): PokemonSet[] {
  return generateRandomTeam({ seed, size, ...(level === 'balanced' ? {} : { level }), format: randomFormat(gen) }).map(s => forGen(stripAutoNickname(s), gen, g))
}

/**
 * 고른 종 → 추천 세트 (그 세대 기술표 기반). 그 세대에 없는 도구는 먹다남은음식으로,
 * 메가진화할 수 있는 종(6·7세대)은 메가스톤, 거다이맥스할 수 있는 종(8세대)은 거다이맥스로.
 */
export function suggestedSet(species: string, seed: number, level = DEFAULT_LEVEL, gen: Gen = DEFAULT_GEN, g: GenGimmicks = gimmicksOf(gen)): PokemonSet {
  const learnset = gen === 9 ? undefined : getLearnset(species, { gen })
  let set = stripAutoNickname(generateRandomSet(species, { rng: new PRNG(seed), level, ...(learnset ? { learnset } : {}) }))
  if (gen !== 9 && set.item && !itemInGen(set.item, gen)) set = { ...set, item: 'leftovers' }
  if (g.mega) {
    const stone = gimmickItemsFor(species, [], gen, g).find(i => /ite(-[xy])?$/.test(i) || /-orb$/.test(i))
    if (stone) set = { ...set, item: stone }
  }
  if (g.dynamax && gmaxForm(species)) set = { ...set, gigantamax: true }
  return forGen(set, gen, g)
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
  /** 현재 언어 이름 (폼은 폼 이름) */
  label: string
  /** 검색용: ko·en 이름, 슬러그 */
  haystack: string
}

const optionCache = new Map<string, SpeciesOption[]>()

/** 배틀에 쓸 수 있는 종 (엔진 데이터에 있고 배틀 중에만 되는 폼은 제외, 그 세대에 없는 종 제외) */
export function speciesOptions(lang: Lang, gen: Gen = DEFAULT_GEN): SpeciesOption[] {
  const key = `${lang}:${gen}`
  const hit = optionCache.get(key)
  if (hit) return hit
  const out: SpeciesOption[] = []
  const seen = new Set<string>()
  for (const s of listPokeApiSpecies()) {
    if (/-(mega|gmax|totem|primal)/.test(s.slug) || /-(mega|gmax)$/.test(s.slug)) continue
    const sp = getSpecies(s.slug)
    if (!sp || seen.has(sp.name) || !speciesInGen(sp.name, gen)) continue
    seen.add(sp.name)
    out.push({
      slug: sp.name,
      num: s.num,
      label: speciesName(sp.name, lang),
      // 폼은 기본 종 이름으로도 찾는다 ("로토무" → 워시로토무·히트로토무 …)
      haystack: [speciesName(sp.name, 'ko'), speciesName(sp.name, 'en'), sp.species_name ? speciesName(sp.species_name, 'ko') : '', sp.name, String(s.num)]
        .join(' ').toLowerCase(),
    })
  }
  out.sort((a, b) => a.num - b.num || a.slug.localeCompare(b.slug))
  optionCache.set(key, out)
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
