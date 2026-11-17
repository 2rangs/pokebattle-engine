import type { BattlePokemon, PokemonSet } from './pokemon'
import type { Weather, Terrain, SideCondition, FieldCondition, DurationEffect } from './effect'
import type { MoveData } from './move'

// ─── 플레이어 ─────────────────────────────────────────────────
export type PlayerID = 'p1' | 'p2'

// ─── 배틀 형식 ────────────────────────────────────────────────
// Pokémon Showdown 시뮬레이터 기반. singles 는 편의 API(getRequest/submitAction) 지원,
// doubles / triples 는 submitChoice(raw Showdown 선택 문자열) 로 사용한다.
export type BattleFormat = 'singles' | 'doubles' | 'triples'

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
  | 'team_preview'      // 팀 프리뷰: 선발 순서 / 출전 포켓몬 선택 대기
  | 'executing'         // 행동 실행 중
  | 'switching'         // 교체 대기 (기절 후 / 유턴 등)
  | 'ended'             // 배틀 종료

export type SwitchReason = 'faint' | 'self_switch' | 'revival_blessing'

// ─── 플레이어 행동 ────────────────────────────────────────────
export type Action =
  | {
      /** 팀 프리뷰: 출전 순서. 앞에서부터 선발, pickedTeamSize 만큼만 출전 */
      type: 'team'
      player: PlayerID
      order: string[]             // 포켓몬 ID (p1_3, p1_0 …)
    }
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

/** 팀 프리뷰 요청 (engine.getTeamPreview). phase 'team_preview' 동안에만 존재 */
export interface TeamPreviewRequest {
  player: PlayerID
  team: BattlePokemon[]        // 고를 수 있는 전체 파티
  pick: number                 // 출전 수 (pickedTeamSize, 없으면 파티 전체)
  raw?: unknown
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
  /** 추가 Showdown 규칙 (예: ['Sleep Clause Mod', 'Species Clause']). options 보다 나중에 적용 */
  rules?: string[]
  /** 자주 쓰는 규칙을 타입 있는 옵션으로 */
  options?: BattleRuleOptions
}

// ─── 규칙 옵션 ────────────────────────────────────────────────
// 각 항목은 Showdown 규칙으로 바뀐다. 팀 단위 규칙(종/도구 클로즈, OHKO/회피 금지, 레벨 제한)은
// 배틀 시작 시 Showdown TeamValidator 로 검사하고, 어기면 BattleError.
export interface BattleRuleOptions {
  /** 팀 프리뷰 (기본 false). 켜면 phase 'team_preview' 에서 { type: 'team' } 행동을 받는다 */
  teamPreview?: boolean
  /** 팀 프리뷰에서 출전시킬 수 (예: 6마리 중 4마리 → 4). teamPreview 를 자동으로 켠다 */
  pickedTeamSize?: number
  /** 모든 포켓몬 레벨을 이 값으로 고정 (Adjust Level) */
  level?: number
  /** 레벨 하한 / 상한 (넘으면 BattleError) */
  minLevel?: number
  maxLevel?: number
  /** false 면 테라스탈 금지 (Terastal Clause). 기본 true */
  terastal?: boolean
  /** 같은 종 1마리 */
  speciesClause?: boolean
  /** 같은 도구 1개 */
  itemClause?: boolean
  /** 상대를 2마리 이상 잠재울 수 없음 (Sleep Clause Mod) */
  sleepClause?: boolean
  /** 일격기 금지 */
  ohkoClause?: boolean
  /** 회피율 올리는 특성·도구·기술 금지 */
  evasionClause?: boolean
  /** 끝나지 않는 배틀 방지 (Endless Battle Clause) */
  endlessBattleClause?: boolean
}
