// ─── 세대(규칙)별 배틀 기믹: 어떤 세대에 무엇이 있는지, 종·도구가 그 세대에 있는지, 모습 ─────
// 규칙은 엔진(Showdown 시뮬레이터)이 정한다. 여기서는 팀 빌더·화면에 필요한 것만 묻는다.
import { getItem, getLearnset, getSpecies, isDataLoaded, listItems, preloadData, type ItemData } from './engine'

export const GENS = [9, 8, 7, 6] as const
export type Gen = typeof GENS[number]
export const DEFAULT_GEN: Gen = 9

export const normalizeGen = (g: unknown): Gen => (GENS.includes(g as Gen) ? (g as Gen) : DEFAULT_GEN)

/** 이 세대의 기믹 */
export interface GenGimmicks { tera: boolean; mega: boolean; zmove: boolean; dynamax: boolean }
export const gimmicksOf = (gen: Gen): GenGimmicks => ({
  tera: gen === 9,
  mega: gen === 6 || gen === 7,
  zmove: gen === 7,
  dynamax: gen === 8,
})

/** 그 세대 데이터 준비 (9세대는 기술표·랜덤 세트만) */
export const loadGen = (gen: Gen) => preloadData(gen === 9 ? {} : { gens: [gen] })
export const genReady = (gen: Gen) => isDataLoaded(gen === 9 ? [] : [gen])

export const randomFormat = (gen: Gen) => `gen${gen}randombattle`

const inGenCache = new Map<string, boolean>()
/**
 * 이 종이 그 세대 배틀에 나올 수 있는지: 그 세대 기술표에 기술이 있으면 (Showdown 검증기 규칙).
 * 9세대는 모든 종 (지금처럼 과거 종도 쓸 수 있다).
 */
export function speciesInGen(slug: string, gen: Gen): boolean {
  if (gen === 9) return true
  const key = `${gen}:${slug}`
  const hit = inGenCache.get(key)
  if (hit !== undefined) return hit
  let ok = false
  try { ok = getLearnset(slug, { gen }).length > 0 } catch { ok = false }
  inGenCache.set(key, ok)
  return ok
}

/** 도구가 그 세대에 있는지 */
export function itemInGen(slug: string, gen: Gen): boolean {
  return genItems(gen).has(slug)
}
const genItemCache = new Map<Gen, Set<string>>()
function genItems(gen: Gen): Set<string> {
  let s = genItemCache.get(gen)
  if (!s) genItemCache.set(gen, (s = new Set(listItems({ gen }).map(i => i.name))))
  return s
}

// ─── 거다이맥스 ───────────────────────────────────────────────
/** 거다이맥스할 수 있으면 그 모습의 종 슬러그 (charizard → charizard-gmax, toxtricity-low-key → toxtricity-low-key-gmax) */
export function gmaxForm(species: string): string | null {
  const sp = getSpecies(`${species}-gmax`)
  if (sp) return sp.name
  // 폼 이름이 붙은 종 (urshifu → urshifu-single-strike-gmax 처럼 대표 폼)
  const base = getSpecies(species)
  const alt = base && getSpecies(`${base.name}-gmax`)
  return alt ? alt.name : null
}

/** 화면에 그릴 모습: 거다이맥스 중이면 거다이맥스 모습 (charizard → charizard-gmax) */
export const spriteSpeciesOf = (p: { species: string; gmax?: boolean }) => (p.gmax ? gmaxForm(p.species) ?? p.species : p.species)

// ─── 이 포켓몬에 맞는 도구 (팀 빌더에서 위로) ──────────────────────
const belongs = (item: ItemData, species: string) => {
  const base = getSpecies(species)?.species_name ?? species
  return !!item.itemUser?.some(u => u === species || u === base || u.startsWith(`${base}-`) || species.startsWith(`${u}-`))
}

/**
 * 그 세대에 이 종이 쓸 수 있는 기믹 도구: 메가스톤·원시회귀 구슬(6·7세대), 전용 Z크리스탈 + 기술 타입의 Z크리스탈(7세대).
 * 앞에서부터 그 종 전용 → 타입 Z.
 */
export function gimmickItemsFor(species: string, moveTypes: readonly string[], gen: Gen): string[] {
  const g = gimmicksOf(gen)
  if (!g.mega && !g.zmove) return []
  const own: string[] = []
  const typed: string[] = []
  for (const it of listItems({ gen })) {
    const mega = !!it.megaStone || /-orb$/.test(it.name) && !!it.itemUser
    if (g.mega && mega && belongs(it, species)) own.push(it.name)
    else if (g.zmove && it.zCrystal) {
      if (it.itemUser) { if (belongs(it, species)) own.push(it.name) }
      else if (it.zMoveType && moveTypes.includes(it.zMoveType)) typed.push(it.name)
    }
  }
  return [...own, ...typed]
}

/** 도구 종류 (목록의 작은 표시) */
export function gimmickItemKind(slug: string): 'mega' | 'z' | 'primal' | null {
  const it = getItem(slug)
  if (!it) return null
  if (it.megaStone) return 'mega'
  if (it.zCrystal) return 'z'
  if (/-orb$/.test(slug) && it.itemUser) return 'primal'
  return null
}
