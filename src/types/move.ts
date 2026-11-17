// ─── 기술 카테고리 ────────────────────────────────────────────
export type MoveCategory = 'physical' | 'special' | 'status'

// ─── 기술 타겟 ────────────────────────────────────────────────
export type MoveTarget =
  | 'selected-pokemon'
  | 'all-opponents'
  | 'all-other-pokemon'
  | 'entire-field'
  | 'user'
  | 'user-and-allies'
  | 'all-allies'
  | 'users-field'
  | 'opponents-field'
  | 'random-opponent'
  | 'specific-move'
  | 'fainting-pokemon'
  | 'ally'
  | 'user-or-ally'

// ─── 기술 메타 데이터 ─────────────────────────────────────────
export interface MoveMeta {
  ailment: string | null         // 상태이상 유발 종류
  ailment_chance: number         // 상태이상 확률 (0~100)
  drain: number                  // 흡수 비율 (양수: 흡수, 음수: 반동)
  healing: number                // 회복 비율
  crit_rate: number              // 급소 랭크 보정 (0~4)
  flinch_chance: number          // 풀죽음 확률
  stat_chance: number            // 스탯 변화 확률
  min_hits: number | null        // 최소 히트 수
  max_hits: number | null        // 최대 히트 수
  category: string | null        // 메타 카테고리 (damage, damage+ailment 등)
}

// ─── 스탯 변화 ────────────────────────────────────────────────
export interface StatChange {
  stat: string    // 'attack' | 'defense' | 'speed' | ...
  change: number  // -6 ~ +6
}

// ─── 기술 데이터 (JSON에서 로드되는 원본) ────────────────────
export interface MoveData {
  id: number
  name: string
  type: string
  category: MoveCategory
  power: number | null
  accuracy: number | null
  pp: number
  priority: number
  target: MoveTarget
  effect_chance: number | null
  effect: string
  meta: MoveMeta | null
  stat_changes: StatChange[]
  /** Showdown 이름 (예: "King's Shield") */
  showdown?: string
  /** Showdown 기술 플래그 (contact, sound, punch …) */
  flags?: string[]
  nameKo?: string | null
}

// ─── 전투 중 기술 슬롯 (PP 소모 반영) ────────────────────────
export interface MoveSlot {
  move: MoveData
  pp: number
  max_pp: number
  disabled: boolean     // disable 기술에 의해 봉인됨
  encore_locked: boolean
}
