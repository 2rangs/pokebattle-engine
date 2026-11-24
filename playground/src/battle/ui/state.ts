// ─── 배틀 데모 설정 저장소 (localStorage, 실패하면 메모리) ─────────────
// 팀·규칙·속도 같은 "이 브라우저의 편의 설정"만 둔다. 배틀 자체는 저장하지 않는다 (리플레이 링크로 공유).
import { useCallback, useSyncExternalStore } from 'react'
import { useLang } from '../../i18n'
import { msg, type MessageKey, type Vars } from '../lib/messages'
import { particles } from '../lib/names'
import type { PokemonSet } from '../lib/engine'
import type { MetronomeSetup } from '../lib/replay'
import { normalizeSize, type TeamSize } from '../lib/team'
import { DEFAULT_GEN, GENS, normalizeGen, type Gen } from '../lib/gimmick'
import { defaultOptions, normalizeOptions, normalizeSandbox, sandboxPreset, type BattleOptions, type SandboxOptions } from '../lib/options'

/** 일반 배틀 (세대 규칙) / 샌드박스 (9세대 + 규칙 풀기, 손가락흔들기 포함) */
export type Rule = 'normal' | 'sandbox'
/** 팀을 따로 보관하는 칸: 세대마다 + 샌드박스 */
export type TeamSlot = Gen | 'sb'
export type Mode = 'vs-cpu' | 'spectate'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type SpriteStyle = '2d' | '3d'
/** 기술 연출: Showdown 애니메이션 / 5세대풍 도트 연출 (../gen5fx) */
export type MoveFxStyle = 'showdown' | 'gen5'

export interface MetronomeForm {
  p1Mode: 'random' | 'picked'
  p2Mode: 'random' | 'picked'
  /** 고른 종 (자리 순서, 빈 자리는 null) */
  p1Pick: (string | null)[]
  p2Pick: (string | null)[]
  level: number
  /** 빈 문자열 = 덮어쓰지 않음 */
  stats: Partial<Record<keyof NonNullable<MetronomeSetup['stats']>, string>>
}

/** 세대마다 따로 보관하는 팀 (세대를 바꿔도 그 세대의 팀이 돌아온다) */
export interface GenTeams { myTeam: (PokemonSet | null)[]; foeTeam: (PokemonSet | null)[] }

export interface DemoSettings {
  rule: Rule
  /** 일반 배틀의 세대 (규칙·기믹·도감) */
  gen: Gen
  /** 지금 칸(세대 / 샌드박스)이 아닌 칸의 팀 */
  otherTeams: Partial<Record<TeamSlot, GenTeams>>
  /** 세대마다 배틀 옵션 (프리셋·마릿수·팀 프리뷰·레벨·기믹·클로즈) */
  options: Partial<Record<Gen, BattleOptions>>
  /** 샌드박스 설정 */
  sandbox: SandboxOptions
  mode: Mode
  difficulty: Difficulty
  teamSize: TeamSize
  speed: number
  sound: boolean
  /** 마릿수 (샌드박스·손가락흔들기. 일반 배틀은 배틀 옵션의 teamSize) */
  /** 내 팀 (자리 순서, 최대 6, 빈 자리 null) */
  myTeam: (PokemonSet | null)[]
  /** 상대(CPU) 팀 (설정 화면에서 시드로 뽑아 두고 자리마다 다시 뽑기·편집, 최대 6) */
  foeTeam: (PokemonSet | null)[]
  metronome: MetronomeForm
  /** 손가락흔들기 랜덤 팀을 정하는 시드 (설정 화면에서 미리 보여 주고 그대로 시작) */
  metroSeed: number
  /** 배틀 스프라이트: 2D 도트 / 3D HOME 렌더 */
  sprites: SpriteStyle
  moveFx: MoveFxStyle
}

const KEY = 'pokebattle-demo-v1'

const DEFAULTS: DemoSettings = {
  rule: 'normal',
  gen: DEFAULT_GEN,
  otherTeams: {},
  options: {},
  sandbox: sandboxPreset('allGimmicks'),
  mode: 'vs-cpu',
  difficulty: 'normal',
  teamSize: 3,
  speed: 650,
  sound: false,
  myTeam: [],
  foeTeam: [],
  metronome: { p1Mode: 'random', p2Mode: 'random', p1Pick: [], p2Pick: [], level: 100, stats: {} },
  metroSeed: Math.floor(Math.random() * 1e9),
  sprites: '2d',
  moveFx: 'showdown',
}

function load(): DemoSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw) as Omit<Partial<DemoSettings>, 'rule'> & { rule?: string }
    // 예전 '손가락흔들기' 규칙 → 샌드박스의 손가락흔들기
    const wasMetronome = v.rule === 'metronome'
    const options: DemoSettings['options'] = {}
    for (const g of GENS) {
      const o = (v.options as Record<string, unknown> | undefined)?.[g]
      if (o) options[g] = normalizeOptions(o, g)
    }
    // 예전 마릿수 설정은 지금 세대의 옵션으로
    if (!v.options && v.teamSize) options[normalizeGen(v.gen)] = { ...defaultOptions(normalizeGen(v.gen)), teamSize: normalizeSize(v.teamSize) }
    return {
      ...DEFAULTS,
      ...v,
      rule: wasMetronome || v.rule === 'sandbox' ? 'sandbox' : 'normal',
      options,
      sandbox: wasMetronome ? sandboxPreset('metronome') : normalizeSandbox(v.sandbox),
      teamSize: normalizeSize(v.teamSize),
      myTeam: Array.isArray(v.myTeam) ? v.myTeam.slice(0, 6) : [],
      foeTeam: Array.isArray(v.foeTeam) ? v.foeTeam.slice(0, 6) : [],
      metronome: { ...DEFAULTS.metronome, ...(v.metronome ?? {}) },
      metroSeed: Number.isInteger(v.metroSeed) && v.metroSeed! >= 0 ? v.metroSeed! : DEFAULTS.metroSeed,
      sprites: v.sprites === '3d' ? '3d' : '2d',
      moveFx: v.moveFx === 'gen5' ? 'gen5' : 'showdown',
      gen: normalizeGen(v.gen),
      otherTeams: otherTeams(v.otherTeams),
    }
  } catch {
    return DEFAULTS
  }
}

function otherTeams(v: unknown): DemoSettings['otherTeams'] {
  const out: DemoSettings['otherTeams'] = {}
  if (!v || typeof v !== 'object') return out
  for (const g of [...GENS, 'sb'] as TeamSlot[]) {
    const t = (v as Record<string, Partial<GenTeams> | undefined>)[g]
    if (t && typeof t === 'object') {
      out[g] = {
        myTeam: Array.isArray(t.myTeam) ? t.myTeam.slice(0, 6) : [],
        foeTeam: Array.isArray(t.foeTeam) ? t.foeTeam.slice(0, 6) : [],
      }
    }
  }
  return out
}

export const teamSlotOf = (s: Pick<DemoSettings, 'rule' | 'gen'>): TeamSlot => (s.rule === 'sandbox' ? 'sb' : s.gen)

/** 팀 칸 바꾸기: 지금 팀은 그 칸에 넣어 두고, 새 칸의 팀을 꺼낸다 (처음이면 빈 팀 → CPU 팀은 새로 뽑힌다) */
function switchSlot(s: DemoSettings, next: Pick<DemoSettings, 'rule' | 'gen'>): Partial<DemoSettings> {
  const from = teamSlotOf(s)
  const to = teamSlotOf(next)
  if (from === to) return next
  const stash = { ...s.otherTeams, [from]: { myTeam: s.myTeam, foeTeam: s.foeTeam } }
  const teams = stash[to] ?? { myTeam: [], foeTeam: [] }
  delete stash[to]
  return { ...next, myTeam: teams.myTeam, foeTeam: teams.foeTeam, otherTeams: stash }
}

/** 세대 바꾸기 (세대마다 팀·배틀 옵션을 따로 기억한다) */
export function switchGen(gen: Gen) {
  updateSettings(s => switchSlot(s, { rule: s.rule, gen }))
}

/** 일반 배틀 ↔ 샌드박스 (샌드박스 팀은 따로) */
export function switchRule(rule: Rule) {
  updateSettings(s => switchSlot(s, { rule, gen: s.gen }))
}

/** 그 세대의 배틀 옵션 */
export const optionsOf = (s: DemoSettings, gen: Gen = s.gen): BattleOptions => s.options[gen] ?? defaultOptions(gen)

let state: DemoSettings | null = null
const listeners = new Set<() => void>()

const get = () => (state ??= load())

export function updateSettings(patch: Partial<DemoSettings> | ((s: DemoSettings) => Partial<DemoSettings>)) {
  const cur = get()
  state = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* 저장소 차단 → 메모리만 */ }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useSettings(): DemoSettings {
  return useSyncExternalStore(subscribe, get, get)
}

/** 배틀 데모 문구 (ko 는 조사 보정) */
export function useBT() {
  const { lang } = useLang()
  const t = useCallback((key: MessageKey, vars?: Vars) => particles(msg(lang, key, vars), lang), [lang])
  return { t, lang }
}
