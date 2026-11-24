// ─── 세트 편집기 순수 로직: 기술·특성·도구·성격·테라 타입·노력치, 검증 ─────
// 기술 목록은 엔진 getLearnset (Showdown 검증기 규칙), 도구는 listItems, 특성은 getSpecies().abilities.
import {
  calcAllStats, getItem, getLearnset, getMove, getSpecies, listItems, listMoves, listSpecies, NATURE_TABLE,
  type EVs, type Nature, type PokemonSet, type Stats,
} from './engine'
import { abilityName, itemName, moveName, natureName, speciesName, typeName } from './names'
import type { Lang, MessageKey, Vars } from './messages'
import { DEFAULT_GEN, gimmickItemKind, gimmickItemsFor, gmaxForm, itemInGen, speciesInGen, gimmicksOf, type Gen, type GenGimmicks } from './gimmick'

/**
 * 팀 빌더가 따르는 규칙: 세대, 켜 둔 기믹, 샌드박스의 자유 설정.
 * free: 기술표·특성·세대 도구 제한 없음 / freeStats: 자유 능력치 / freeLevel: 레벨 직접
 */
export interface TeamRules {
  gen: Gen
  g: GenGimmicks
  free?: boolean
  freeStats?: boolean
  freeLevel?: boolean
}
export const rulesFor = (gen: Gen, g: GenGimmicks = gimmicksOf(gen)): TeamRules => ({ gen, g })

export const STATS = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'] as const
export type StatId = typeof STATS[number]
export const EV_STAT_MAX = 252
export const EV_TOTAL_MAX = 510
export const MAX_MOVES = 4

/** 노력치 칸의 짧은 라벨 (게임 표기) */
const STAT_SHORT: Record<Lang, Record<StatId, string>> = {
  ko: { hp: 'HP', attack: '공격', defense: '방어', special_attack: '특공', special_defense: '특방', speed: '스피드' },
  en: { hp: 'HP', attack: 'Atk', defense: 'Def', special_attack: 'SpA', special_defense: 'SpD', speed: 'Spe' },
}
export const statShort = (s: StatId, lang: Lang) => STAT_SHORT[lang][s]

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

// ─── 기술 ────────────────────────────────────────────────────
export interface MoveOption {
  slug: string
  label: string
  type: string
  category: 'physical' | 'special' | 'status'
  power: number | null
  accuracy: number | null
  /** 검색용: ko·en 이름, 슬러그 (공백 제거) */
  haystack: string
}

const moveCache = new Map<string, MoveOption[]>()

/** 이 종이 그 세대에 배울 수 있는 기술 (현재 언어 이름순) */
export function moveOptions(species: string, lang: Lang, gen: Gen = DEFAULT_GEN, free = false): MoveOption[] {
  const key = free ? `${lang}:free` : `${lang}:${gen}:${species}`
  const hit = moveCache.get(key)
  if (hit) return hit
  const out: MoveOption[] = []
  // 자유 세트: 모든 기술 (Z·다이맥스 기술 제외 — 그건 기믹으로 쓴다)
  const slugs = free ? listMoves().filter(m => !/^(max-|g-max-)/.test(m.name) && !/--(physical|special)$/.test(m.name) && m.name !== 'struggle').map(m => m.name) : getLearnset(species, { gen })
  for (const slug of slugs) {
    const m = getMove(slug, gen === 9 ? {} : { gen })
    if (!m) continue
    out.push({
      slug, label: moveName(slug, lang), type: m.type, category: m.category as MoveOption['category'],
      power: m.power, accuracy: m.accuracy,
      haystack: [moveName(slug, 'ko'), moveName(slug, 'en'), slug].map(norm).join(' '),
    })
  }
  out.sort((a, b) => a.label.localeCompare(b.label, lang))
  moveCache.set(key, out)
  return out
}

/** 이름 검색: 앞부분 일치 먼저, 그다음 포함. 빈 검색어면 전체 */
export function searchOptions<T extends { label: string; haystack: string }>(options: readonly T[], query: string, limit = 80): T[] {
  const q = norm(query.trim())
  if (!q) return options.slice(0, limit)
  const starts: T[] = []
  const contains: T[] = []
  for (const o of options) {
    if (norm(o.label).startsWith(q) || o.haystack.split(' ').some(w => w.startsWith(q))) starts.push(o)
    else if (o.haystack.includes(q)) contains.push(o)
  }
  return [...starts, ...contains].slice(0, limit)
}

// ─── 도구 ────────────────────────────────────────────────────
export interface ItemOption {
  slug: string
  label: string
  effect: string
  haystack: string
  /** 이 포켓몬의 메가스톤·Z크리스탈 등 (목록 위에, 표시와 함께) */
  gimmick?: boolean
}

const itemCache = new Map<string, ItemOption[]>()

/** 메가스톤·원시회귀 구슬 / Z크리스탈 */
const isMegaItem = (it: { name: string; megaStone?: unknown; itemUser?: unknown }) => !!it.megaStone || (/-orb$/.test(it.name) && !!it.itemUser)
const isZItem = (it: { zCrystal?: unknown }) => !!it.zCrystal

/**
 * 그 세대에서 지닐 수 있는 도구 (현재 언어 이름순).
 * gimmicks: 9세대(샌드박스)에서 켠 기믹의 도구(7세대에만 있던 메가스톤·Z크리스탈)를 더한다.
 */
export function itemOptions(lang: Lang, gen: Gen = DEFAULT_GEN, free = false, gimmicks: Pick<GenGimmicks, 'mega' | 'zmove'> = { mega: false, zmove: false }): ItemOption[] {
  const extraMega = gen === 9 && !free && gimmicks.mega
  const extraZ = gen === 9 && !free && gimmicks.zmove
  const key = `${lang}:${gen}:${free}:${extraMega}:${extraZ}`
  const hit = itemCache.get(key)
  if (hit) return hit
  // 자유 세트(샌드박스, 9세대): 7·8세대에만 있던 도구(메가스톤·Z크리스탈 …)도
  // 자유 세트와 메가진화를 켠 샌드박스는 레전즈 Z-A 의 새 메가스톤(루카리오나이트Z 등)도
  const future = gen === 9 && (free || extraMega) ? listItems({ include: ['Future'] }).filter(isMegaItem) : []
  let items = free ? [...new Map([7, 8, 9].flatMap(g => listItems({ gen: g as Gen })).map(it => [it.name, it])).values()] : listItems({ gen })
  if (extraMega || extraZ || future.length) {
    const have = new Set(items.map(it => it.name))
    const extra = [...listItems({ gen: 7 }).filter(it => (extraMega && isMegaItem(it)) || (extraZ && isZItem(it))), ...future]
    items = [...items, ...extra.filter(it => !have.has(it.name) && have.add(it.name))]
  }
  const out = items.map(it => ({
    slug: it.name, label: itemName(it.name, lang), effect: it.effect,
    haystack: [itemName(it.name, 'ko'), itemName(it.name, 'en'), it.name].map(norm).join(' '),
  }))
  out.sort((a, b) => a.label.localeCompare(b.label, lang))
  itemCache.set(key, out)
  return out
}

/** 도구 목록: 이 포켓몬이 쓸 수 있는 기믹 도구(메가스톤·전용/타입 Z크리스탈)를 맨 위에 */
export function itemOptionsFor(set: PokemonSet, lang: Lang, gen: Gen, rules: TeamRules = rulesFor(gen)): ItemOption[] {
  const all = itemOptions(lang, gen, !!rules.free, rules.g)
  const types = set.moves.map(m => (m ? getMove(m)?.type : undefined)).filter((t): t is string => !!t)
  const order = gimmickItemsFor(set.species, types, gen, rules.g)
  if (!order.length) return all
  const top = new Set(order)
  const bySlug = new Map(all.map(o => [o.slug, o]))
  const first = order.map(slug => bySlug.get(slug)).filter((o): o is ItemOption => !!o).map(o => ({ ...o, gimmick: true }))
  return [...first, ...all.filter(o => !top.has(o.slug))]
}

/**
 * 도구 목록 위의 안내: 이 규칙에서 쓸 수 없는 기믹 도구.
 * - 'gimmickItems': 메가진화·Z기술이 둘 다 없는 규칙 (항상)
 * - 'zItems': 메가진화만 있는 규칙(6세대)에서 Z크리스탈을 찾을 때
 */
export function itemHint(query: string, lang: Lang, rules: TeamRules): 'gimmickItems' | 'zItems' | null {
  if (rules.free || rules.g.mega || rules.g.zmove) {
    if (!rules.g.zmove && !rules.free && query.trim()) {
      try {
        const z = itemOptions(lang, 7).filter(o => isZItem(getItem(o.slug) ?? {}))
        if (searchOptions(z, query, 1).length) return 'zItems'
      } catch {
        // 7세대 데이터가 아직 없으면 이름 꼴로만 본다
        if (/(^|\s)z$|z크리스탈|z-?crystal|ium-?z$/i.test(query.trim())) return 'zItems'
      }
    }
    return null
  }
  return 'gimmickItems'
}

// ─── 특성 · 성격 · 테라 타입 ──────────────────────────────────
export interface AbilityOption { slug: string; label: string; hidden: boolean }

let allAbilities: string[] | null = null
/** 그 세대에 이 종이 가질 수 있는 특성 (1·2세대는 없음). 자유 세트는 모든 특성 (이 종의 것 먼저) */
export function abilityOptions(species: string, lang: Lang, gen: Gen = DEFAULT_GEN, free = false): AbilityOption[] {
  const own = (getSpecies(species, gen === 9 ? {} : { gen })?.abilities ?? []).map(a => ({ slug: a.name, label: abilityName(a.name, lang), hidden: a.hidden }))
  if (!free) return own
  allAbilities ??= [...new Set(listSpecies().flatMap(sp => sp.abilities.map(a => a.name)))]
  const mine = new Set(own.map(a => a.slug))
  const rest = allAbilities.filter(a => !mine.has(a)).map(a => ({ slug: a, label: abilityName(a, lang), hidden: false }))
  rest.sort((a, b) => a.label.localeCompare(b.label, lang))
  return [...own, ...rest]
}

export interface NatureOption { slug: Nature; label: string; plus: StatId | null; minus: StatId | null }

/** 성격: 무보정 5개 먼저, 그다음 올리는 능력치 순 (게임 표 순서) */
export function natureOptions(lang: Lang): NatureOption[] {
  const order = (n: NatureOption) => (n.plus ? STATS.indexOf(n.plus) * 10 + STATS.indexOf(n.minus!) : -1)
  return (Object.keys(NATURE_TABLE) as Nature[])
    .map(slug => {
      const { boosted, hindered } = NATURE_TABLE[slug]
      return { slug, label: natureName(slug, lang), plus: boosted as StatId | null, minus: hindered as StatId | null }
    })
    .sort((a, b) => order(a) - order(b) || a.slug.localeCompare(b.slug))
}

/** "고집 (공격↑ 특공↓)" */
export function natureLabel(n: NatureOption, lang: Lang): string {
  return n.plus && n.minus ? `${n.label} (${statShort(n.plus, lang)}↑ ${statShort(n.minus, lang)}↓)` : n.label
}

export const TERA_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy', 'stellar',
] as const

export const teraOptions = (lang: Lang) => TERA_TYPES.map(t => ({ slug: t, label: typeName(t, lang) }))

// ─── 노력치 ──────────────────────────────────────────────────
export const evTotal = (evs: EVs | undefined) => STATS.reduce((n, s) => n + (evs?.[s] ?? 0), 0)

/** 한 칸 바꾸기: 0~252, 합계 510 을 넘으면 남은 만큼만 */
export function setEv(evs: EVs | undefined, stat: StatId, value: number): EVs {
  const cur = { ...(evs ?? {}) }
  const others = evTotal(cur) - (cur[stat] ?? 0)
  const v = Math.max(0, Math.min(EV_STAT_MAX, EV_TOTAL_MAX - others, Math.floor(Number.isFinite(value) ? value : 0)))
  cur[stat] = v
  return cur
}

export const EV_PRESETS = ['physical', 'special', 'bulkyPhys', 'bulkySpec', 'none'] as const
export type EvPreset = typeof EV_PRESETS[number]

const evs = (o: Partial<Record<StatId, number>>): EVs => ({ hp: 0, attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0, ...o })
export const PRESET_EVS: Record<EvPreset, EVs> = {
  physical: evs({ attack: 252, speed: 252, hp: 4 }),
  special: evs({ special_attack: 252, speed: 252, hp: 4 }),
  bulkyPhys: evs({ hp: 252, defense: 252, special_defense: 4 }),
  bulkySpec: evs({ hp: 252, special_defense: 252, defense: 4 }),
  none: evs({}),
}

/** 지금 노력치가 어느 프리셋과 같은지 (없으면 null = 직접 입력) */
export function presetOf(e: EVs | undefined): EvPreset | null {
  return EV_PRESETS.find(p => STATS.every(s => (PRESET_EVS[p][s] ?? 0) === (e?.[s] ?? 0))) ?? null
}

/** 실수치 (레벨·성격·노력치·개체값) */
export function statsOf(set: PokemonSet, gen: Gen = DEFAULT_GEN): Stats | null {
  const sp = getSpecies(set.species, gen === 9 ? {} : { gen })
  if (!sp) return null
  // 1·2세대: 성격 없음, DV 15 (= 개체값 30)
  const st = calcAllStats(sp.base_stats, set.level ?? 50, gen <= 2 ? 'hardy' : set.nature ?? 'hardy', set.evs ?? {}, gen <= 2 ? { hp: 30, attack: 30, defense: 30, special_attack: 30, special_defense: 30, speed: 30 } : set.ivs ?? {})
  return set.customStats ? { ...st, ...set.customStats } : st
}

// ─── 검증 ────────────────────────────────────────────────────
export type IssueField = 'species' | 'moves' | 'ability' | 'item' | 'evs'
export interface SetIssue {
  field: IssueField
  /** error: 배틀을 시작할 수 없다 · warn: 시작은 되지만 실제 게임에서는 안 되는 조합 */
  level: 'error' | 'warn'
  key: MessageKey
  vars?: Vars
  /** moves: 몇 번째 기술 (0~3) */
  index?: number
}

/** 세트의 문제 (빈 배열이면 문제 없음) */
export function validateSet(set: PokemonSet, lang: Lang, gen: Gen = DEFAULT_GEN, rules: TeamRules = rulesFor(gen)): SetIssue[] {
  const issues: SetIssue[] = []
  const free = !!rules.free
  if (!free && !speciesInGen(set.species, gen)) {
    issues.push({ field: 'species', level: 'error', key: 'issueSpeciesGen', vars: { name: speciesName(set.species, lang), gen } })
    return issues
  }
  const moves = set.moves.map(m => m || '')
  if (!moves.some(Boolean)) issues.push({ field: 'moves', level: 'error', key: 'issueNoMoves' })
  let learn: Set<string> | null = null
  try { learn = free ? null : new Set(getLearnset(set.species, { gen })) } catch { learn = null }
  moves.forEach((m, i) => {
    if (!m) return
    if (moves.indexOf(m) !== i) issues.push({ field: 'moves', level: 'error', key: 'issueDupMove', vars: { move: moveName(m, lang) }, index: i })
    else if (!getMove(m)) issues.push({ field: 'moves', level: 'error', key: 'issueUnknownMove', vars: { move: m }, index: i })
    else if (learn && !learn.has(m)) {
      issues.push({ field: 'moves', level: 'warn', key: 'issueCantLearn', vars: { name: speciesName(set.species, lang), move: moveName(m, lang) }, index: i })
    }
  })
  const abilities = getSpecies(set.species, gen === 9 ? {} : { gen })?.abilities.map(a => a.name) ?? []
  if (!free && gen >= 3 && set.ability && abilities.length && !abilities.includes(set.ability)) {
    issues.push({ field: 'ability', level: 'warn', key: 'issueAbility', vars: { name: speciesName(set.species, lang), ability: abilityName(set.ability, lang) } })
  }
  if (set.item && !getItem(set.item)) issues.push({ field: 'item', level: 'error', key: 'issueUnknownItem', vars: { item: set.item } })
  else if (set.item && gen !== 9 && !free && !itemInGen(set.item, gen)) issues.push({ field: 'item', level: 'error', key: 'issueItemGen', vars: { item: itemName(set.item, lang), gen } })
  else if (set.item) {
    // 켜 둔 기믹이 아니면 그 도구는 쓸모가 없다 (배틀은 시작된다)
    const kind = gimmickItemKind(set.item)
    const off = kind === 'mega' && !rules.g.mega ? 'gimmickMega' : kind === 'z' && !rules.g.zmove ? 'gimmickZ' : null
    if (off && (gen === 9 ? free : gimmicksOf(gen)[kind === 'mega' ? 'mega' : 'zmove'])) {
      issues.push({ field: 'item', level: 'warn', key: 'issueGimmickOff', vars: { item: itemName(set.item, lang), gimmick: off } })
    }
  }
  if (set.gigantamax && rules.g.dynamax && !gmaxForm(set.species)) {
    issues.push({ field: 'item', level: 'warn', key: 'issueNoGmax', vars: { name: speciesName(set.species, lang) } })
  }
  if (gen <= 2) return issues
  const over = STATS.find(s => (set.evs?.[s] ?? 0) > EV_STAT_MAX)
  if (over) issues.push({ field: 'evs', level: 'error', key: 'issueEvStat', vars: { max: EV_STAT_MAX } })
  if (evTotal(set.evs) > EV_TOTAL_MAX) issues.push({ field: 'evs', level: 'error', key: 'issueEvTotal', vars: { n: evTotal(set.evs), max: EV_TOTAL_MAX } })
  return issues
}

export const hasErrors = (issues: readonly SetIssue[]) => issues.some(i => i.level === 'error')

/** i 번째 기술 바꾸기 (빈 값이면 지우고 앞으로 당긴다) */
export function withMove(set: PokemonSet, i: number, slug: string | null): PokemonSet {
  const moves = [...set.moves.map(m => m || '')]
  while (moves.length < MAX_MOVES) moves.push('')
  moves[i] = slug ?? ''
  const packed = moves.filter(Boolean)
  return { ...set, moves: (packed.length ? packed : ['']) as PokemonSet['moves'] }
}
