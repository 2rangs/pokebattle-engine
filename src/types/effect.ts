// ─── 상태이상 (주요) ───────────────────────────────────────────────
export type PrimaryStatus =
    | 'burn'
    | 'freeze'
    | 'paralysis'
    | 'poison'
    | 'toxic'
    | 'sleep'
    | null

// ─── 휘발성 상태 (전투 중만 유지) ────────────────────────────────
export type VolatileStatus =
    | 'confusion'
    | 'dynamax'
    | 'flinch'
    | 'seeded'
    | 'bound'
    | 'infatuation'
    | 'curse'
    | 'nightmare'
    | 'aqua_ring'
    | 'ingrain'
    | 'magnet_rise'
    | 'taunt'
    | 'encore'
    | 'torment'
    | 'disable'
    | 'heal_block'
    | 'embargo'
    | 'yawn'
    // ─── 보호 계열 ──────────────────────────────────────────
    | 'protect'           // 방어 / 막기 / 와이드가드 / 패스트가드 / 트릭가드 / 마룻바닥세워막기
    | 'kings_shield'      // 킹실드
    | 'spiky_shield'      // 니들가드
    | 'baneful_bunker'    // 독방울폭탄 (토치카)
    | 'silk_trap'         // 스레드트랩
    | 'burning_bulwark'   // 화염의수호
    | 'obstruct'          // 블로킹
    | 'protect_streak'    // 연속 보호 횟수 추적
    // ─── 기타 ───────────────────────────────────────────────
    | 'endure'
    | 'focus_energy'
    | 'charging'
    | 'recharging'
    | 'rage'
    | 'substitute'
    | 'paradox_boost'
    | 'slow_start'
    | 'unburden'
    | 'flash_fire'
    | 'wish'
    | 'telekinesis'
    | 'roost'
    | 'salt_cure'
    | 'destiny_bond'
    | 'stockpile'
    | 'charge'
    | 'minimize'
    | 'defense_curl'

// ─── 날씨 ──────────────────────────────────────────────────────
export type Weather =
    | 'sun'
    | 'harsh_sun'
    | 'rain'
    | 'heavy_rain'
    | 'sandstorm'
    | 'snow'
    | 'strong_winds'
    | null

// ─── 필드 ──────────────────────────────────────────────────────
export type Terrain =
    | 'electric'
    | 'grassy'
    | 'misty'
    | 'psychic'
    | null

// ─── 스크린/사이드 이펙트 ─────────────────────────────────────
export type SideCondition =
    | 'reflect'
    | 'light_screen'
    | 'aurora_veil'
    | 'spikes'
    | 'toxic_spikes'
    | 'stealth_rock'
    | 'sticky_web'
    | 'tailwind'
    | 'lucky_chant'
    | 'safeguard'
    | 'mist'
    | 'wish'

// ─── 필드 전체 이펙트 ────────────────────────────────────────
export type FieldCondition =
    | 'gravity'
    | 'magic_room'
    | 'wonder_room'
    | 'trick_room'
    | 'mud_sport'
    | 'water_sport'

// ─── 지속 기간 ────────────────────────────────────────────────
export interface DurationEffect {
  turns_remaining: number
  source?: string
}