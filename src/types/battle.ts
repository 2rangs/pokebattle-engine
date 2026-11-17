import type { BattlePokemon, PokemonSet } from './pokemon'
import type { Weather, Terrain, SideCondition, FieldCondition, DurationEffect } from './effect'
import type { MoveData } from './move'

// ─── 플레이어 ─────────────────────────────────────────────────
export type PlayerID = 'p1' | 'p2'

// ─── 배틀 형식 ────────────────────────────────────────────────
// Pokémon Showdown 시뮬레이터 기반. singles 는 편의 API(getRequest/submitAction) 지원,
// doubles 는 submitChoice(raw Showdown 선택 문자열) 로 사용한다.
export type BattleFormat = 'singles' | 'doubles'

// ─── 사이드 (플레이어 한 쪽) ──────────────────────────────────
export interface Side {
  id: PlayerID
  name?: string
  team: BattlePokemon[]            // 파티 전체
  active: BattlePokemon[]          // 현재 필드에 나와있는 포켓몬 (team 의 같은 객체 참조)
  conditions: Partial<Record<SideCondition, DurationEffect & { layers?: number; amount?: number }>>
  used_dynamax: boolean
  dynamax_turns: number
  used_tera?: boolean
  fainted_count?: number           // 지금까지 쓰러진 수 (대장의 깃발 등)
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
  seed?: number
  /** 교체 입력이 필요한 플레이어와 사유 (phase === 'switching') */
  pending_switches?: Partial<Record<PlayerID, SwitchReason>>
}

// ─── 배틀 페이즈 ─────────────────────────────────────────────
export type BattlePhase =
  | 'waiting_action'    // 행동 입력 대기
  | 'executing'         // 행동 실행 중
  | 'switching'         // 교체 대기 (기절 후 / 유턴 등)
  | 'ended'             // 배틀 종료

export type SwitchReason = 'faint' | 'self_switch' | 'revival_blessing'

// ─── 플레이어 행동 ────────────────────────────────────────────
export type Action =
  | {
      type: 'move'
      player: PlayerID
      pokemon_id: string          // 행동하는 포켓몬 ID
      move_index: 0 | 1 | 2 | 3 | -1 // -1 = 발버둥 (PP 가 모두 없을 때)
      target_id?: string          // doubles 예약
      terastallize?: boolean      // 이번 턴 테라스탈
    }
  | {
      /** Showdown 선택 문자열을 그대로 전달 (예: 'move 1 terastallize, switch 3') */
      type: 'raw'
      player: PlayerID
      pokemon_id?: string
      choice: string
    }
  | {
      type: 'switch'
      player: PlayerID
      pokemon_id: string          // 현재 필드 포켓몬
      switch_to_id: string        // 교체할 포켓몬
    }

// ─── 플레이어에게 요구되는 입력 ───────────────────────────────
export interface MoveOption {
  index: 0 | 1 | 2 | 3 | -1
  move: MoveData
  pp: number
  max_pp: number
  disabled: boolean
  disabled_reason?: string
}

export type BattleRequest =
  | {
      type: 'move'
      player: PlayerID
      active: BattlePokemon
      moves: MoveOption[]
      switches: BattlePokemon[]    // 교체 가능한 벤치
      can_switch: boolean
      can_terastallize: boolean
      forced?: boolean             // 모으기/난동/반동 등으로 기술이 고정됨
      /** Showdown 원본 요청 */
      raw?: unknown
    }
  | {
      type: 'switch'
      player: PlayerID
      reason: SwitchReason
      active: BattlePokemon
      switches: BattlePokemon[]
      raw?: unknown
    }

// ─── 배틀 이벤트 (이벤트 이미터 + 로그용) ─────────────────────
export type BattleEvent =
  | { type: 'battle_start';   p1: string; p2: string; seed: number }
  | { type: 'turn_start';     turn: number }
  | { type: 'turn_end';       turn: number; state: BattleState }
  | { type: 'move_use';       pokemon_id: string; move: MoveData; target_id: string }
  | { type: 'move_miss';      pokemon_id: string; move: MoveData; target_id?: string }
  | { type: 'move_fail';      pokemon_id: string; move: MoveData; reason: string }
  | { type: 'cant_move';      pokemon_id: string; reason: CantMoveReason; detail?: string }
  | { type: 'damage';         pokemon_id: string; amount: number; source: string; effectiveness?: number; crit?: boolean; hp_after?: number }
  | { type: 'heal';           pokemon_id: string; amount: number; source: string; hp_after?: number }
  | { type: 'immune';         pokemon_id: string; source: string }
  | { type: 'faint';          pokemon_id: string }
  | { type: 'status_apply';   pokemon_id: string; status: string; source?: string }
  | { type: 'status_remove';  pokemon_id: string; status: string }
  | { type: 'volatile_apply'; pokemon_id: string; volatile: string }
  | { type: 'volatile_remove';pokemon_id: string; volatile: string }
  | { type: 'stat_change';    pokemon_id: string; stat: string; stages: number; actual?: number }
  | { type: 'weather_change'; weather: Weather; source: string }
  | { type: 'terrain_change'; terrain: Terrain; source: string }
  | { type: 'side_start';     player: PlayerID; condition: SideCondition; layers?: number }
  | { type: 'side_end';       player: PlayerID; condition: SideCondition }
  | { type: 'field_start';    condition: FieldCondition }
  | { type: 'field_end';      condition: FieldCondition }
  | { type: 'switch';         player: PlayerID; out_id: string; in_id: string; forced?: boolean }
  | { type: 'ability_trigger';pokemon_id: string; ability: string; effect: string }
  | { type: 'item_consume';   pokemon_id: string; item: string }
  | { type: 'item_activate';  pokemon_id: string; item: string; effect: string }
  | { type: 'terastallize';   pokemon_id: string; tera_type: string }
  | { type: 'hit_count';      pokemon_id: string; hits: number }
  | { type: 'activate';       pokemon_id?: string; effect: string; detail?: string }
  | { type: 'forme_change';   pokemon_id: string; species: string }
  | { type: 'message';        text: string }
  | { type: 'battle_end';     winner: PlayerID | 'draw' }

export type CantMoveReason =
  | 'sleep' | 'freeze' | 'paralysis' | 'flinch' | 'confusion' | 'recharge'
  | 'taunt' | 'no_pp' | 'infatuation' | 'truant' | 'other'

export type BattleEventType = BattleEvent['type']

// ─── 배틀 설정 ────────────────────────────────────────────────
export interface BattleConfig {
  format: BattleFormat
  p1: { name: string; team: PokemonSet[] }
  p2: { name: string; team: PokemonSet[] }
  seed?: number           // 랜덤 시드 (재현 가능 배틀용)
  maxTurns?: number       // 이 턴을 넘기면 무승부 (기본 1000)
  /** Showdown 포맷 ID 직접 지정 (기본: gen9customgame / gen9doublescustomgame) */
  formatid?: string
  /** 추가 Showdown 규칙 (예: ['Sleep Clause Mod', 'Species Clause']) */
  rules?: string[]
}
