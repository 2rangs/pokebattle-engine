import type { PrimaryStatus, VolatileStatus, DurationEffect } from './effect'
import type { MoveSlot } from './move'

// ─── 스탯 ────────────────────────────────────────────────────
export interface Stats {
  hp: number
  attack: number
  defense: number
  special_attack: number
  special_defense: number
  speed: number
}

// ─── 스탯 랭크 (-6 ~ +6) ─────────────────────────────────────
export interface StatStages {
  attack: number
  defense: number
  special_attack: number
  special_defense: number
  speed: number
  accuracy: number
  evasion: number
}

// ─── 노력치 / 개체값 ─────────────────────────────────────────
export type EVs = Partial<Stats>
export type IVs = Partial<Stats>

// ─── 포켓몬 빌드 (세트 구성) ─────────────────────────────────
export interface PokemonSet {
  species: string
  nickname?: string
  level: number
  gender: 'M' | 'F' | null
  ability: string
  nature: Nature
  item?: string
  moves: [string, string?, string?, string?]
  evs?: EVs
  ivs?: IVs
  teraType?: string   // 추가
  shiny?: boolean     // 추가
}
// ─── 성격 ─────────────────────────────────────────────────────
export type Nature =
  | 'hardy' | 'lonely' | 'brave' | 'adamant' | 'naughty'
  | 'bold' | 'docile' | 'relaxed' | 'impish' | 'lax'
  | 'timid' | 'hasty' | 'serious' | 'jolly' | 'naive'
  | 'modest' | 'mild' | 'quiet' | 'bashful' | 'rash'
  | 'calm' | 'gentle' | 'sassy' | 'careful' | 'quirky'

// ─── 성격 보정값 ──────────────────────────────────────────────
export interface NatureEffect {
  boosted: keyof Stats | null   // 1.1배 스탯
  hindered: keyof Stats | null  // 0.9배 스탯
}

// ─── 전투 중 포켓몬 상태 ──────────────────────────────────────
export interface BattlePokemon {
  // 기본 정보
  id: string                    // 고유 ID (p1_0, p2_3 …)
  side?: 'p1' | 'p2'            // 소속 진영
  set: PokemonSet
  species: string
  nickname: string
  level: number
  gender: 'M' | 'F' | null
  ability: string               // 현재 활성화된 특성 (변경 가능)
  base_ability?: string         // 원래 특성
  item: string | null           // 현재 지닌물건 (소비/교체 반영)
  types: [string, string?]      // 현재 타입 (테라스탈/타입변화 반영)
  original_types?: [string, string?] // 원래 타입 (STAB 판정용)
  weight?: number               // 무게 (hg, 1/10 kg)

  // 테라스탈
  tera_type?: string | null
  terastallized?: boolean

  // HP
  hp: number                    // 현재 HP
  max_hp: number                // 최대 HP

  // 스탯 (실수치)
  stats: Stats

  // 전투 중 랭크
  stages: StatStages

  // 기술
  moves: [MoveSlot, MoveSlot?, MoveSlot?, MoveSlot?]

  // 상태이상
  status: PrimaryStatus
  status_turns: number          // 수면 남은 턴 / 맹독 경과 턴

  // 휘발성 상태 (여러 개 동시 가능)
  volatile_statuses: Partial<Record<VolatileStatus, DurationEffect>>

  // 기타 전투 정보
  substitute_hp: number         // 대타출동 HP (0이면 없음)
  last_move_used: string | null
  last_move_target: string | null
  must_recharge: boolean        // 반동턴 여부
  trapped: boolean              // 교체 불가 여부
  transformed: boolean          // 변신 여부
  fainted: boolean

  // 확장 전투 정보 (엔진이 관리)
  active_turns?: number         // 필드에 나온 후 지난 턴 수 (속이다/첫인상 판정)
  choice_lock?: string | null   // 구애 아이템으로 고정된 기술
  locked_move?: { index: number; turns: number; kind: 'charge' | 'rampage' } | null
  moved_this_turn?: boolean
  damaged_this_turn?: number
  item_consumed?: string | null // 소비한 아이템 (열매/풍선 등)
}
