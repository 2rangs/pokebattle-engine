// ─── 데모 설정 (브라우저에 저장) ────────────────────────────────
// Pokestra 는 zustand 스토어였다. 데모는 의존성을 늘리지 않으려고 같은 모양(useBattleStore(selector))의 작은 스토어를 쓴다.
import { useSyncExternalStore } from 'react'
import type { Difficulty } from './useBattleSession'

export type BattleMode = 'vs-cpu' | 'cpu-vs-cpu'
/** random = 랜덤배틀 밸런스 레벨, 아니면 모두 그 레벨 */
export type LevelOption = 'random' | '50' | '100'

interface Prefs {
  mode: BattleMode
  difficulty: Difficulty
  teamSize: number
  level: LevelOption
  /** 프레임 간격 (ms) */
  speed: number
  /** HUD 의 HP 값을 % 로 볼지 (기본: 숫자) */
  hpAsPercent: boolean
  /** 울음소리 (기본: 끔) */
  sound: boolean
}

interface Store extends Prefs {
  setMode: (mode: BattleMode) => void
  setDifficulty: (d: Difficulty) => void
  setTeamSize: (n: number) => void
  setLevel: (l: LevelOption) => void
  setSpeed: (ms: number) => void
  setHpAsPercent: (v: boolean) => void
  setSound: (v: boolean) => void
}

const KEY = 'pokebattle-demo'
const DEFAULTS: Prefs = { mode: 'cpu-vs-cpu', difficulty: 'normal', teamSize: 6, level: '50', speed: 450, hpAsPercent: false, sound: false }

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) }
  } catch { /* 저장소 차단·손상 → 기본값 */ }
  return DEFAULTS
}

const listeners = new Set<() => void>()
let state: Store

function set(patch: Partial<Prefs>) {
  state = { ...state, ...patch }
  try {
    const { mode, difficulty, teamSize, level, speed, hpAsPercent, sound } = state
    localStorage.setItem(KEY, JSON.stringify({ mode, difficulty, teamSize, level, speed, hpAsPercent, sound }))
  } catch { /* 무시 */ }
  for (const l of listeners) l()
}

state = {
  ...load(),
  setMode: mode => set({ mode }),
  setDifficulty: difficulty => set({ difficulty }),
  setTeamSize: teamSize => set({ teamSize }),
  setLevel: level => set({ level }),
  setSpeed: speed => set({ speed }),
  setHpAsPercent: hpAsPercent => set({ hpAsPercent }),
  setSound: sound => set({ sound }),
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export function useBattleStore(): Store
export function useBattleStore<T>(select: (s: Store) => T): T
export function useBattleStore<T>(select?: (s: Store) => T): T | Store {
  return useSyncExternalStore(subscribe, () => (select ? select(state) : state))
}
