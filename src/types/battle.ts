import type { BattlePokemon, PokemonSet } from './pokemon'
import type { Weather, Terrain, SideCondition, FieldCondition, DurationEffect } from './effect'
import type { MoveData } from './move'

// ─── 플레이어 ─────────────────────────────────────────────────
export type PlayerID = 'p1' | 'p2'

// ─── 배틀 형식 ────────────────────────────────────────────────
export type BattleFormat = 'singles' | 'doubles'

// ─── 사이드 (플레이어 한 쪽) ──────────────────────────────────
export interface Side {
  id: PlayerID
  team: BattlePokemon[]            // 파티 전체
  active: BattlePokemon[]          // 현재 필드에 나와있는 포켓몬 (singles: 1, doubles: 2)
  conditions: Partial<Record<SideCondition, DurationEffect & { layers?: number }>>
  used_dynamax: boolean
  dynamax_turns: number
}

// ─── 필드 전체 상태 ───────────────────────────────────────────
export interface Field {
  weather: Weather
  weather_turns: DurationEffect | null
  terrain: Terrain
  terrain_turns: DurationEffect | null
  conditions: Partial<Record<FieldCondition, DurationEffect>>
  turn: number
}

// ─── 배틀 상태 ────────────────────────────────────────────────
export interface BattleState {
  format: BattleFormat
  sides: Record<PlayerID, Side>
  field: Field
  turn: number
  phase: BattlePhase
  winner: PlayerID | 'draw' | null
  log: BattleEvent[]
}

// ─── 배틀 페이즈 ─────────────────────────────────────────────
export type BattlePhase =
  | 'waiting_action'    // 행동 입력 대기
  | 'executing'         // 행동 실행 중
  | 'switching'         // 교체 대기 (기절 후)
  | 'ended'             // 배틀 종료

// ─── 플레이어 행동 ────────────────────────────────────────────
export type Action =
  | {
      type: 'move'
      player: PlayerID
      pokemon_id: string          // 행동하는 포켓몬 ID
      move_index: 0 | 1 | 2 | 3
      target_id?: string          // doubles에서 타겟 지정
    }
  | {
      type: 'switch'
      player: PlayerID
      pokemon_id: string          // 현재 필드 포켓몬
      switch_to_id: string        // 교체할 포켓몬
    }
  | {
      type: 'mega'
      player: PlayerID
      pokemon_id: string
    }

// ─── 배틀 이벤트 (이벤트 이미터 + 로그용) ─────────────────────
export type BattleEvent =
  | { type: 'turn_start';     turn: number }
  | { type: 'turn_end';       turn: number; state: BattleState }
  | { type: 'move_use';       pokemon_id: string; move: MoveData; target_id: string }
  | { type: 'move_miss';      pokemon_id: string; move: MoveData }
  | { type: 'move_fail';      pokemon_id: string; move: MoveData; reason: string }
  | { type: 'damage';         pokemon_id: string; amount: number; source: string; effectiveness?: number }
  | { type: 'heal';           pokemon_id: string; amount: number; source: string }
  | { type: 'faint';          pokemon_id: string }
  | { type: 'status_apply';   pokemon_id: string; status: string }
  | { type: 'status_remove';  pokemon_id: string; status: string }
  | { type: 'volatile_apply'; pokemon_id: string; volatile: string }
  | { type: 'volatile_remove';pokemon_id: string; volatile: string }
  | { type: 'stat_change';    pokemon_id: string; stat: string; stages: number }
  | { type: 'weather_change'; weather: Weather; source: string }
  | { type: 'terrain_change'; terrain: Terrain; source: string }
  | { type: 'switch';         player: PlayerID; out_id: string; in_id: string }
  | { type: 'ability_trigger';pokemon_id: string; ability: string; effect: string }
  | { type: 'item_consume';   pokemon_id: string; item: string }
  | { type: 'battle_end';     winner: PlayerID | 'draw' }

// ─── 배틀 설정 ────────────────────────────────────────────────
export interface BattleConfig {
  format: BattleFormat
  p1: { name: string; team: PokemonSet[] }
  p2: { name: string; team: PokemonSet[] }
  seed?: number           // 랜덤 시드 (재현 가능 배틀용)
}
