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

export type Rule = 'normal' | 'metronome'
export type Mode = 'vs-cpu' | 'spectate'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type SpriteStyle = '2d' | '3d'

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
  /** 지금 세대가 아닌 세대의 팀 */
  otherTeams: Partial<Record<Gen, GenTeams>>
  mode: Mode
  difficulty: Difficulty
  teamSize: TeamSize
  speed: number
  sound: boolean
  /** 내 팀 (자리 순서, 최대 6, 빈 자리 null) */
  myTeam: (PokemonSet | null)[]
  /** 상대(CPU) 팀 (설정 화면에서 시드로 뽑아 두고 자리마다 다시 뽑기·편집, 최대 6) */
  foeTeam: (PokemonSet | null)[]
  metronome: MetronomeForm
  /** 손가락흔들기 랜덤 팀을 정하는 시드 (설정 화면에서 미리 보여 주고 그대로 시작) */
  metroSeed: number
  /** 배틀 스프라이트: 2D 도트 / 3D HOME 렌더 */
  sprites: SpriteStyle
}

const KEY = 'pokebattle-demo-v1'

const DEFAULTS: DemoSettings = {
  rule: 'normal',
  gen: DEFAULT_GEN,
  otherTeams: {},
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
}

function load(): DemoSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const v = JSON.parse(raw) as Partial<DemoSettings>
    return {
      ...DEFAULTS,
      ...v,
      teamSize: normalizeSize(v.teamSize),
      myTeam: Array.isArray(v.myTeam) ? v.myTeam.slice(0, 6) : [],
      foeTeam: Array.isArray(v.foeTeam) ? v.foeTeam.slice(0, 6) : [],
      metronome: { ...DEFAULTS.metronome, ...(v.metronome ?? {}) },
      metroSeed: Number.isInteger(v.metroSeed) && v.metroSeed! >= 0 ? v.metroSeed! : DEFAULTS.metroSeed,
      sprites: v.sprites === '3d' ? '3d' : '2d',
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
  for (const g of GENS) {
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

/** 세대 바꾸기: 지금 팀은 그 세대 칸에 넣어 두고, 새 세대의 팀을 꺼낸다 (처음이면 빈 팀 → CPU 팀은 새로 뽑힌다) */
export function switchGen(gen: Gen) {
  updateSettings(s => {
    if (s.gen === gen) return {}
    const stash = { ...s.otherTeams, [s.gen]: { myTeam: s.myTeam, foeTeam: s.foeTeam } }
    const next = stash[gen] ?? { myTeam: [], foeTeam: [] }
    delete stash[gen]
    return { gen, myTeam: next.myTeam, foeTeam: next.foeTeam, otherTeams: stash }
  })
}

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
