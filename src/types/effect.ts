// ─── 상태이상 (주요) ───────────────────────────────────────────────
export type PrimaryStatus =
  | 'burn'        // 화상
  | 'freeze'      // 빙결
  | 'paralysis'   // 마비
  | 'poison'      // 독
  | 'toxic'       // 맹독 (독의 심화)
  | 'sleep'       // 수면
  | null

// ─── 휘발성 상태 (전투 중만 유지) ────────────────────────────────
export type VolatileStatus =
  | 'confusion'       // 혼란
  | 'flinch'          // 풀죽음
  | 'seeded'          // 씨뿌리기
  | 'bound'           // 감기기
  | 'infatuation'     // 헤롱헤롱
  | 'curse'           // 저주
  | 'nightmare'       // 나쁜꿈
  | 'aqua_ring'       // 아쿠아링
  | 'ingrain'         // 뿌리박기
  | 'magnet_rise'     // 마그넷봄
  | 'taunt'           // 도발
  | 'encore'          // 앙코르
  | 'torment'         // 방해
  | 'disable'         // 풀죽음봉인
  | 'heal_block'      // 회복봉인
  | 'embargo'         // 압수
  | 'yawn'            // 하품 (다음턴 수면)
  | 'protect'         // 방어
  | 'endure'          // 버티기
  | 'focus_energy'    // 기합모으기
  | 'charging'        // 충전 중 (솔라빔 등)
  | 'recharging'      // 반동 (하이퍼빔 등)
  | 'rage'            // 분노
  | 'substitute'      // 대타출동
  | 'paradox_boost'  // ← 추가
  | 'slow_start'     // ← 추가 (stat.ts에서도 쓰임)
  | 'unburden'       // ← 추가


// ─── 날씨 ──────────────────────────────────────────────────────
export type Weather =
  | 'sun'             // 쾌청
  | 'harsh_sun'       // 강한 햇살 (원시그란돈)
  | 'rain'            // 비
  | 'heavy_rain'      // 폭우 (원시카이오가)
  | 'sandstorm'       // 모래바람
  | 'snow'            // 눈 (Gen 9, 우박 대체)
  | 'strong_winds'    // 거센바람 (메가레쿠쟈)
  | null

// ─── 필드 ──────────────────────────────────────────────────────
export type Terrain =
  | 'electric'        // 일렉트릭필드
  | 'grassy'          // 그래스필드
  | 'misty'           // 미스트필드
  | 'psychic'         // 사이코필드
  | null

// ─── 스크린/사이드 이펙트 ─────────────────────────────────────
export type SideCondition =
  | 'reflect'         // 리플렉터
  | 'light_screen'    // 빛의장막
  | 'aurora_veil'     // 오로라베일
  | 'spikes'          // 압정뿌리기 (1~3겹)
  | 'toxic_spikes'    // 독압정 (1~2겹)
  | 'stealth_rock'    // 스텔스록
  | 'sticky_web'      // 끈적끈적네트
  | 'tailwind'        // 순풍
  | 'lucky_chant'     // 행운의주문
  | 'safeguard'       // 신비의베일
  | 'mist'            // 안개

// ─── 필드 전체 이펙트 ────────────────────────────────────────
export type FieldCondition =
  | 'gravity'         // 강력한중력
  | 'magic_room'      // 매직룸
  | 'wonder_room'     // 원더룸
  | 'trick_room'      // 트릭룸
  | 'mud_sport'       // 진흙놀이
  | 'water_sport'     // 물놀이

// ─── 지속 기간 ────────────────────────────────────────────────
export interface DurationEffect {
  turns_remaining: number
  source?: string   // 유발 기술/특성명
}
