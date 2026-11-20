// ─── 배틀 HUD 표시용 순수 헬퍼 (Pokestra 에서 옮김 + 게임식 화면용) ─────
import type { BattleEvent, PlayerID } from './engine'
import { msg, type Lang } from './messages'
import type { Frame } from './frame'

export const ratioOf = (p: { hp: number; max_hp: number }) => (p.max_hp ? Math.max(0, Math.min(1, p.hp / p.max_hp)) : 0)
/** HP % (살아 있으면 최소 1%, 100% 는 가득 찼을 때만 — 399/400 은 99%) */
export const pctOf = (p: { hp: number; max_hp: number }) =>
  p.hp <= 0 ? 0 : p.hp >= p.max_hp ? 100 : Math.min(99, Math.max(1, Math.ceil(ratioOf(p) * 100)))

/** 게임의 HP 막대 색: 절반 초과 초록, 1/5 초과 노랑, 그 아래 빨강 */
export function hpTone(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio > 0.5) return 'green'
  if (ratio > 0.2) return 'yellow'
  return 'red'
}

const hko = (n: number) => (n === 1 ? 'OHKO' : `${n}HKO`)

/** 확정/난수 n타 라벨. 타수가 없거나 확률이 0이면 null */
export function koLabel(r: { koChance?: number | null; koHits?: number | null } | null | undefined, lang: Lang): string | null {
  const n = r?.koHits ?? 0
  const chance = r?.koChance ?? 0
  if (!n || n < 1 || chance <= 0) return null
  if (chance >= 1) return msg(lang, 'koGuaranteed', { n, hko: hko(n) })
  const pct = Math.min(99, Math.max(1, Math.round(chance * 100)))
  return msg(lang, 'koChance', { n, hko: hko(n), pct })
}

const effNum = (x: number) => String(Number(x.toFixed(2)))

/** 상성 라벨. 보통(×1)이면 null */
export function effectivenessLabel(eff: number, lang: Lang): string | null {
  if (eff === 0) return msg(lang, 'effNone')
  if (eff >= 2) return msg(lang, 'effLabel', { label: msg(lang, 'effSuper'), x: effNum(eff) })
  if (eff < 1) return msg(lang, 'effLabel', { label: msg(lang, 'effWeak'), x: effNum(eff) })
  return null
}

export function effectivenessTone(eff: number): 'super' | 'weak' | 'none' | 'neutral' {
  if (eff === 0) return 'none'
  if (eff >= 2) return 'super'
  if (eff < 1) return 'weak'
  return 'neutral'
}

/** 랭크 배수. 명중·회피는 3 기준, 나머지는 2 기준 */
export function stageFactor(stat: string, stage: number): number {
  const s = Math.max(-6, Math.min(6, Math.trunc(stage)))
  const base = stat === 'accuracy' || stat === 'evasion' ? 3 : 2
  return s >= 0 ? (base + s) / base : base / (base - s)
}

/** "×1.5", "×2.0", "×0.67" */
export function stageMultiplier(stat: string, stage: number): string {
  const r = Number(stageFactor(stat, stage).toFixed(2))
  return `×${Number.isInteger(r) ? r.toFixed(1) : String(r)}`
}

export type FieldItemKind = 'weather' | 'terrain' | 'field' | 'side'

export interface FieldItem {
  key: string
  kind: FieldItemKind
  side?: PlayerID
  id: string
  turns: number | null
  layers: number
}

const HIDDEN_SIDE = new Set(['wish'])

/** 필드 줄 항목 (날씨 → 필드 → 전체 효과 → 상대 진영 → 우리 진영) */
export function fieldItems(f: Pick<Frame, 'weather' | 'weatherTurns' | 'terrain' | 'terrainTurns' | 'field' | 'p1' | 'p2'>, me: PlayerID = 'p1'): FieldItem[] {
  const out: FieldItem[] = []
  if (f.weather) out.push({ key: `w:${f.weather}`, kind: 'weather', id: f.weather, turns: f.weatherTurns, layers: 1 })
  if (f.terrain) out.push({ key: `t:${f.terrain}`, kind: 'terrain', id: f.terrain, turns: f.terrainTurns, layers: 1 })
  for (const c of f.field) out.push({ key: `f:${c.id}`, kind: 'field', id: c.id, turns: c.turns, layers: 1 })
  const order = me === 'p1' ? [f.p2, f.p1] : [f.p1, f.p2]
  for (const s of order) {
    for (const c of s.conditions) {
      if (HIDDEN_SIDE.has(c.id)) continue
      out.push({ key: `s:${s.id}:${c.id}`, kind: 'side', side: s.id, id: c.id, turns: c.turns, layers: c.layers })
    }
  }
  return out
}

// ─── 로그: 턴 묶음·강조 ─────────────────────────────────────────

export type LogTone = 'key' | 'accent' | 'move' | 'called' | 'dim' | 'normal'

export function logTone(e: BattleEvent, called = false): LogTone {
  if (e.type === 'faint') return 'key'
  if (e.type === 'damage') {
    if (e.crit || (e.effectiveness ?? 1) > 1) return 'key'
    if ((e.effectiveness ?? 1) < 1) return 'dim'
    return 'normal'
  }
  if (e.type === 'terastallize' || e.type === 'battle_end') return 'accent'
  if (e.type === 'move_use') return called ? 'called' : 'move'
  return 'normal'
}

export interface LogSummary { faints: number; crits: number; supers: number }

export interface LogGroup<F> {
  key: string
  turn: number
  items: F[]
  summary: LogSummary
}

/** 프레임을 턴 단위로 묶는다 (turn_start 가 새 묶음의 머리) */
export function groupLogByTurn<F extends { index: number; turn: number; event: BattleEvent }>(frames: readonly F[]): LogGroup<F>[] {
  const groups: LogGroup<F>[] = []
  let cur: LogGroup<F> | null = null
  const open = (key: string, turn: number) => {
    const g: LogGroup<F> = { key, turn, items: [], summary: { faints: 0, crits: 0, supers: 0 } }
    groups.push(g)
    return g
  }
  for (const f of frames) {
    const e = f.event
    if (e.type === 'turn_start') {
      cur = open(`t${f.index}`, e.turn)
      continue
    }
    cur ??= open('start', 0)
    cur.items.push(f)
    if (e.type === 'faint') cur.summary.faints++
    if (e.type === 'damage') {
      if (e.crit) cur.summary.crits++
      if ((e.effectiveness ?? 1) > 1) cur.summary.supers++
    }
  }
  return groups
}

// ─── 손가락흔들기: 불려 나온 기술 ─────────────────────────────────

export const METRONOME = 'metronome'

/**
 * 손가락흔들기로 불려 나온 기술의 move_use 프레임 인덱스.
 * 엔진은 "X의 손가락흔들기!" 다음에 같은 포켓몬의 move_use 로 실제 기술을 알린다.
 */
export function calledMoveIndexes(frames: readonly Pick<Frame, 'index' | 'event'>[]): Set<number> {
  const out = new Set<number>()
  const pending = new Set<string>()
  for (const f of frames) {
    const e = f.event
    if (e.type === 'turn_start') pending.clear()
    if (e.type !== 'move_use') continue
    if (pending.has(e.pokemon_id) && e.move.name !== METRONOME) {
      out.add(f.index)
      pending.delete(e.pokemon_id)
    } else if (e.move.name === METRONOME) {
      pending.add(e.pokemon_id)
    }
  }
  return out
}

/** 포켓몬별로 마지막에 불려 나온 기술 (첫 n 프레임 기준) */
export function lastCalledMoves(frames: readonly Pick<Frame, 'index' | 'event'>[], upto = frames.length): Map<string, { move: string; type: string; turnIndex: number }> {
  const slice = frames.slice(0, upto)
  const called = calledMoveIndexes(slice)
  const out = new Map<string, { move: string; type: string; turnIndex: number }>()
  for (const f of slice) {
    const e = f.event
    if (e.type === 'move_use' && called.has(f.index)) out.set(e.pokemon_id, { move: e.move.name, type: e.move.type, turnIndex: f.index })
  }
  return out
}

/** 메시지 상자에 보여줄 프레임 (드러난 n개 중 마지막으로 글이 있는 것) */
export function messageFrameIndex(frames: readonly Pick<Frame, 'silent'>[], revealed: number): number | null {
  for (let i = Math.min(revealed, frames.length) - 1; i >= 0; i--) if (!frames[i]!.silent) return i
  return null
}

/** 재생 속도 (프레임 간격 ms) */
export const SPEEDS = [
  { value: 1100, label: 'speedSlow' },
  { value: 650, label: 'speedNormal' },
  { value: 300, label: 'speedFast' },
  { value: 60, label: 'speedVeryFast' },
] as const
