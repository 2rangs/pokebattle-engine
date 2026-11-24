// ─── 배틀 옵션: 세대별 프리셋 → 엔진 규칙 옵션, 팀 규칙 검사, 한 줄 요약 / 샌드박스 ─────
// 엔진 BattleRuleOptions (= Showdown 규칙 이름, README "Rule options"):
//   pickedTeamSize → 'Picked Team Size' + 팀 프리뷰, teamPreview → 'Team Preview', level → 'Adjust Level',
//   terastal:false → 'Terastal Clause', dynamax:false → 'Dynamax Clause',
//   megaEvolution:false / zMoves:false → 엔진 규칙 'Mega Evolution Clause' / 'Z-Move Clause' (Showdown 에는 없다),
//   speciesClause → 'Species Clause', itemClause → 'Item Clause = 1', sleepClause → 'Sleep Clause Mod',
//   ohkoClause → 'OHKO Clause', evasionClause → 'Evasion Clause', endlessBattleClause → 'Endless Battle Clause',
//   stackGimmicks → 엔진 규칙 'Stack Gimmicks Mod' (샌드박스)
import { getRandomBattleSet, getSpecies, type BattleRuleOptions, type PokemonSet } from './engine'
import { gimmickItemKind, gimmicksOf, itemInGen, type Gen, type GenGimmicks } from './gimmick'
import { TEAM_SIZES, type TeamSize } from './team'
import { abilityName, itemName, moveName, speciesName } from './names'
import type { Lang, MessageKey, Vars } from './messages'

export type LevelRule = 50 | 100 | 'balanced'
export const LEVELS: readonly LevelRule[] = [50, 100, 'balanced']

export const CLAUSES = ['species', 'item', 'sleep', 'ohko', 'evasion', 'endless'] as const
export type Clause = typeof CLAUSES[number]

export const PRESETS = ['free', 'flat', 'smogon'] as const
export type PresetId = typeof PRESETS[number]

export interface BattleOptions {
  /** 마지막으로 고른 프리셋 (세부 설정을 바꾸면 'custom') */
  preset: PresetId | 'custom'
  teamSize: TeamSize
  /** 팀 프리뷰: null = 없음, 숫자 = 그만큼 골라 출전 (teamSize 와 같으면 순서만 정한다) */
  pick: number | null
  level: LevelRule
  /** 켜 둔 기믹 (그 세대에 있는 것만 의미가 있다) */
  gimmicks: GenGimmicks
  clauses: Record<Clause, boolean>
}

const NO_CLAUSES: Record<Clause, boolean> = { species: false, item: false, sleep: false, ohko: false, evasion: false, endless: false }
const ON: GenGimmicks = { tera: true, mega: true, zmove: true, dynamax: true }

/** 프리셋 → 옵션 (세대마다 조금 다르다) */
export function presetOptions(id: PresetId, gen: Gen): BattleOptions {
  switch (id) {
    case 'free':
      return { preset: 'free', teamSize: 3, pick: null, level: 50, gimmicks: { ...ON }, clauses: { ...NO_CLAUSES } }
    case 'flat':
      // 게임 대회(배틀스타디움 싱글) 방식: 6마리를 보여 주고 3마리 선택, Lv.50, 같은 종·같은 도구 금지 (Showdown 'Flat Rules')
      return {
        preset: 'flat', teamSize: 6, pick: 3, level: 50, gimmicks: { ...ON },
        clauses: { ...NO_CLAUSES, species: true, item: gen >= 2 },
      }
    case 'smogon':
      // Smogon 싱글 기본 규칙 (Standard): 같은 종·수면·일격기·회피·끝나지 않는 배틀 금지, Lv.100, 6마리.
      // 팀 프리뷰는 Showdown 처럼 5세대부터, 8세대 OU 는 다이맥스 금지 (Dynamax Clause)
      return {
        preset: 'smogon', teamSize: 6, pick: gen >= 5 ? 6 : null, level: 100,
        gimmicks: { ...ON, dynamax: gen !== 8 },
        clauses: { species: true, item: false, sleep: true, ohko: true, evasion: true, endless: true },
      }
  }
}

export const defaultOptions = (gen: Gen): BattleOptions => presetOptions('free', gen)

/** 저장된 값 → 옵션 (모르는 값은 기본으로) */
export function normalizeOptions(v: unknown, gen: Gen): BattleOptions {
  const d = defaultOptions(gen)
  if (!v || typeof v !== 'object') return d
  const o = v as Partial<BattleOptions>
  const teamSize = TEAM_SIZES.includes(o.teamSize as TeamSize) ? (o.teamSize as TeamSize) : d.teamSize
  const pick = o.pick === null ? null : Number.isInteger(o.pick) && o.pick! >= 1 && o.pick! <= teamSize ? o.pick! : d.pick
  return {
    preset: o.preset === 'custom' || PRESETS.includes(o.preset as PresetId) ? o.preset! : d.preset,
    teamSize,
    pick: teamSize === 1 ? null : pick,
    level: LEVELS.includes(o.level as LevelRule) ? (o.level as LevelRule) : d.level,
    gimmicks: { ...ON, ...(o.gimmicks && typeof o.gimmicks === 'object' ? pickBools(o.gimmicks, Object.keys(ON)) : {}) },
    clauses: { ...NO_CLAUSES, ...(o.clauses && typeof o.clauses === 'object' ? pickBools(o.clauses, CLAUSES) : {}) },
  }
}

function pickBools<T extends string>(o: object, keys: readonly T[]): Partial<Record<T, boolean>> {
  const out: Partial<Record<T, boolean>> = {}
  for (const k of keys) if (typeof (o as Record<string, unknown>)[k] === 'boolean') out[k] = (o as Record<T, boolean>)[k]
  return out
}

/** 세부 설정 하나를 바꾼다 (프리셋과 같아지면 그 프리셋, 아니면 'custom') */
export function withOption(o: BattleOptions, patch: Partial<BattleOptions>, gen: Gen): BattleOptions {
  const next = { ...o, ...patch }
  if (next.teamSize === 1) next.pick = null
  else if (next.pick !== null && next.pick > next.teamSize) next.pick = next.teamSize
  const same = PRESETS.find(id => sameOptions(presetOptions(id, gen), next, gen))
  return { ...next, preset: same ?? 'custom' }
}

function sameOptions(a: BattleOptions, b: BattleOptions, gen: Gen): boolean {
  const ga = gimmicksOf(gen, a.gimmicks)
  const gb = gimmicksOf(gen, b.gimmicks)
  return a.teamSize === b.teamSize && a.pick === b.pick && a.level === b.level
    && (Object.keys(ga) as (keyof GenGimmicks)[]).every(k => ga[k] === gb[k])
    && CLAUSES.every(c => a.clauses[c] === b.clauses[c])
}

/** 옵션 → 엔진 config.options (기본과 같은 것은 빼서 짧게, 그래서 리플레이 링크도 짧다) */
export function engineOptions(o: BattleOptions, gen: Gen): BattleRuleOptions {
  const out: BattleRuleOptions = {}
  if (o.pick !== null) {
    if (o.pick < o.teamSize) out.pickedTeamSize = o.pick
    else out.teamPreview = true
  }
  if (o.level !== 'balanced') out.level = o.level
  const g = gimmicksOf(gen, o.gimmicks)
  const has = gimmicksOf(gen)
  if (has.tera && !g.tera) out.terastal = false
  if (has.dynamax && !g.dynamax) out.dynamax = false
  if (has.mega && !g.mega) out.megaEvolution = false
  if (has.zmove && !g.zmove) out.zMoves = false
  if (o.clauses.species) out.speciesClause = true
  if (o.clauses.item && gen >= 2) out.itemClause = true
  if (o.clauses.sleep) out.sleepClause = true
  if (o.clauses.ohko) out.ohkoClause = true
  if (o.clauses.evasion) out.evasionClause = true
  if (o.clauses.endless) out.endlessBattleClause = true
  return out
}

/** 세트 레벨: 고정(50/100) 또는 랜덤배틀 균형 레벨 (그 세대 랜덤배틀에 없는 종은 종족값 합으로 어림) */
export function levelFor(species: string, level: LevelRule, gen: Gen): number {
  if (level !== 'balanced') return level
  try {
    const lv = getRandomBattleSet(species, gen)?.level
    if (lv) return lv
  } catch { /* 데이터 없음 → 어림 */ }
  const sp = getSpecies(species)
  const bst = sp ? Object.values(sp.base_stats).reduce((a, b) => a + b, 0) : 500
  return Math.max(60, Math.min(100, Math.round(84 - (bst - 500) / 15)))
}

/** 팀 전체에 레벨 규칙 적용 (빈 자리 유지) */
export const applyLevel = (team: readonly (PokemonSet | null)[], level: LevelRule, gen: Gen) =>
  team.map(s => (s ? { ...s, level: levelFor(s.species, level, gen) } : s))

// ─── 팀 규칙 검사 (시작 전에 화면에서): Showdown 검증기와 같은 목록 ─────────
const OHKO = new Set(['fissure', 'guillotine', 'horn-drill', 'sheer-cold'])
const EVASION_MOVES = new Set(['minimize', 'double-team', 'acupressure'])
const EVASION_ITEMS = new Set(['bright-powder', 'lax-incense'])
const EVASION_ABILITIES = new Set(['sand-veil', 'snow-cloak'])

export interface TeamIssue { key: MessageKey; vars: Vars; slot: number }

/** 켜 둔 클로즈를 어긴 곳 (팀의 자리 번호 1부터) */
export function teamRuleIssues(team: readonly (PokemonSet | null)[], o: BattleOptions, gen: Gen, lang: Lang): TeamIssue[] {
  const out: TeamIssue[] = []
  const seenSpecies = new Map<number, number>()
  const seenItem = new Map<string, number>()
  team.forEach((s, i) => {
    if (!s) return
    const slot = i + 1
    if (o.clauses.species) {
      const num = getSpecies(s.species)?.id ?? -1
      const first = seenSpecies.get(num)
      if (first !== undefined) out.push({ key: 'clauseSpeciesIssue', vars: { name: speciesName(s.species, lang), a: first, b: slot }, slot })
      else seenSpecies.set(num, slot)
    }
    if (o.clauses.item && gen >= 2 && s.item) {
      const first = seenItem.get(s.item)
      if (first !== undefined) out.push({ key: 'clauseItemIssue', vars: { item: itemName(s.item, lang), a: first, b: slot }, slot })
      else seenItem.set(s.item, slot)
    }
    for (const m of s.moves) {
      if (!m) continue
      if (o.clauses.ohko && OHKO.has(m)) out.push({ key: 'clauseOhkoIssue', vars: { name: speciesName(s.species, lang), move: moveName(m, lang), b: slot }, slot })
      if (o.clauses.evasion && EVASION_MOVES.has(m)) out.push({ key: 'clauseEvasionIssue', vars: { name: speciesName(s.species, lang), what: moveName(m, lang), b: slot }, slot })
    }
    if (o.clauses.evasion && s.item && EVASION_ITEMS.has(s.item)) out.push({ key: 'clauseEvasionIssue', vars: { name: speciesName(s.species, lang), what: itemName(s.item, lang), b: slot }, slot })
    if (o.clauses.evasion && gen >= 3 && EVASION_ABILITIES.has(s.ability)) out.push({ key: 'clauseEvasionIssue', vars: { name: speciesName(s.species, lang), what: abilityName(s.ability, lang), b: slot }, slot })
  })
  return out
}

const SPARE_ITEMS = [
  'leftovers', 'life-orb', 'choice-scarf', 'focus-sash', 'sitrus-berry', 'assault-vest', 'choice-band', 'choice-specs', 'expert-belt',
  'lum-berry', 'rocky-helmet', 'heavy-duty-boots', 'light-clay', 'shell-bell', 'quick-claw', 'kings-rock', 'scope-lens', 'muscle-band',
  'wise-glasses', 'black-belt', 'charcoal', 'mystic-water', 'miracle-seed', 'magnet', 'never-melt-ice', 'soft-sand', 'sharp-beak',
]

/**
 * 랜덤으로 뽑은 팀을 켜 둔 클로즈에 맞춘다 (같은 도구 → 남는 도구로, 같은 종은 그대로 두고 화면에서 알린다).
 * 사람이 고른 세트는 바꾸지 않는다: 랜덤 팀·다시 뽑기에만 쓴다.
 */
export function fitClauses(team: readonly (PokemonSet | null)[], o: BattleOptions, gen: Gen): (PokemonSet | null)[] {
  if (!o.clauses.item || gen < 2) return [...team]
  const used = new Set<string>()
  return team.map(s => {
    if (!s?.item) return s
    if (!used.has(s.item) || gimmickItemKind(s.item)) { used.add(s.item); return s }
    const spare = SPARE_ITEMS.find(i => !used.has(i) && (gen === 9 || itemInGen(i, gen)))
    if (spare) used.add(spare)
    return { ...s, item: spare }
  })
}

/** 시작 오류(엔진 BattleError, Showdown 검증기 영어 문장) → 보기 좋은 한 줄들 */
export function startErrorLines(message: string): string[] {
  const body = message.replace(/^p[12]:\s*/, '')
  return body.split(/(?<=[.!])\s+(?=[A-Z(])/).map(s => s.trim()).filter(Boolean)
}

// ─── 한 줄 요약 ──────────────────────────────────────────────
export function optionsSummary(o: BattleOptions, gen: Gen, t: (k: MessageKey, v?: Vars) => string): string {
  const parts: string[] = []
  parts.push(o.preset === 'custom' ? t('presetCustom') : t(PRESET_KEY[o.preset]))
  parts.push(o.pick !== null && o.pick < o.teamSize ? t('optPickSummary', { n: o.teamSize, k: o.pick }) : t('sizeOption', { n: o.teamSize }))
  parts.push(o.level === 'balanced' ? t('levelBalanced') : t('level', { n: o.level }))
  const has = gimmicksOf(gen)
  const g = gimmicksOf(gen, o.gimmicks)
  const names = (Object.keys(has) as (keyof GenGimmicks)[]).filter(k => has[k])
  if (names.length) {
    const off = names.filter(k => !g[k])
    parts.push(off.length === 0 ? t('optGimmicksOn') : off.length === names.length ? t('optGimmicksOff') : names.filter(k => g[k]).map(k => t(GIMMICK_KEY[k])).join('·'))
  }
  const n = CLAUSES.filter(c => o.clauses[c] && (c !== 'item' || gen >= 2)).length
  if (n) parts.push(t('optClausesN', { n }))
  return parts.join(' · ')
}

export const PRESET_KEY: Record<PresetId, MessageKey> = { free: 'presetFree', flat: 'presetFlat', smogon: 'presetSmogon' }
export const PRESET_DESC: Record<PresetId, MessageKey> = { free: 'presetFreeDesc', flat: 'presetFlatDesc', smogon: 'presetSmogonDesc' }
export const GIMMICK_KEY: Record<keyof GenGimmicks, MessageKey> = { mega: 'gimmickMega', zmove: 'gimmickZ', dynamax: 'gimmickDynamax', tera: 'gimmickTera' }
export const CLAUSE_KEY: Record<Clause, { label: MessageKey; desc: MessageKey }> = {
  species: { label: 'clauseSpecies', desc: 'clauseSpeciesDesc' },
  item: { label: 'clauseItem', desc: 'clauseItemDesc' },
  sleep: { label: 'clauseSleep', desc: 'clauseSleepDesc' },
  ohko: { label: 'clauseOhko', desc: 'clauseOhkoDesc' },
  evasion: { label: 'clauseEvasion', desc: 'clauseEvasionDesc' },
  endless: { label: 'clauseEndless', desc: 'clauseEndlessDesc' },
}

// ─── 샌드박스 ────────────────────────────────────────────────
export interface SandboxOptions {
  preset: SandboxPreset | 'custom'
  /** 한 포켓몬이 메가진화·Z기술·다이맥스·테라스탈을 함께 (엔진 'Stack Gimmicks Mod') */
  stack: boolean
  /** 모든 기술이 손가락흔들기 (엔진 createMetronomeBattle) */
  metronome: boolean
  /** 기술표·특성·도구 제한 없음 (배울 수 없는 기술, 아무 특성, 지난 세대 도구) */
  freeSets: boolean
  /** 포켓몬마다 실수치 직접 (엔진 'Custom Stats Mod', 1~9999) */
  freeStats: boolean
  /** 포켓몬마다 레벨 1~100 */
  freeLevel: boolean
}
export const SANDBOX_PRESETS = ['allGimmicks', 'metronome', 'freeform'] as const
export type SandboxPreset = typeof SANDBOX_PRESETS[number]
export const SANDBOX_TOGGLES = ['stack', 'freeSets', 'freeStats', 'freeLevel', 'metronome'] as const

export function sandboxPreset(id: SandboxPreset): SandboxOptions {
  switch (id) {
    case 'allGimmicks': return { preset: id, stack: true, metronome: false, freeSets: false, freeStats: false, freeLevel: false }
    case 'metronome': return { preset: id, stack: false, metronome: true, freeSets: false, freeStats: false, freeLevel: false }
    case 'freeform': return { preset: id, stack: true, metronome: false, freeSets: true, freeStats: true, freeLevel: true }
  }
}

export function normalizeSandbox(v: unknown): SandboxOptions {
  const d = sandboxPreset('allGimmicks')
  if (!v || typeof v !== 'object') return d
  const o = v as Partial<SandboxOptions>
  return {
    ...d,
    ...pickBools(o, SANDBOX_TOGGLES),
    preset: o.preset === 'custom' || SANDBOX_PRESETS.includes(o.preset as SandboxPreset) ? o.preset! : d.preset,
  }
}

export function withSandbox(o: SandboxOptions, patch: Partial<SandboxOptions>): SandboxOptions {
  const next = { ...o, ...patch }
  const same = SANDBOX_PRESETS.find(id => SANDBOX_TOGGLES.every(k => sandboxPreset(id)[k] === next[k]))
  return { ...next, preset: same ?? 'custom' }
}

/** 샌드박스 → 엔진 옵션 (손가락흔들기는 별도 배틀이라 여기서는 기믹 겹치기만) */
export const sandboxEngineOptions = (s: SandboxOptions): BattleRuleOptions => (s.stack ? { stackGimmicks: true } : {})

/** 샌드박스 세트 정리: 자유 레벨이 아니면 Lv.50, 자유 능력치가 아니면 customStats 제거 */
export function sandboxSet(set: PokemonSet, s: SandboxOptions): PokemonSet {
  const out = { ...set }
  if (!s.freeLevel) out.level = 50
  if (!s.freeStats) delete out.customStats
  return out
}
