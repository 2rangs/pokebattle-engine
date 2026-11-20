// ─── 배틀 화면 프레임 ─────────────────────────────────────────
// 엔진 이벤트 하나마다 기록하는 화면용 스냅숏. 장면·데이터박스·로그·리플레이가 같이 쓴다.
import type { BattleEvent, PlayerID } from './engine'

export interface PokeView {
  id: string
  species: string
  /** 세트의 원래 종 (폼 체인지 전) */
  setSpecies: string
  nickname: string
  level: number
  gender: 'M' | 'F' | null
  hp: number
  max_hp: number
  status: string | null
  /** toxic: 받은 맹독 데미지 횟수, sleep: 잠들어 움직이지 못한 턴 수 (남은 턴은 게임처럼 숨긴다) */
  statusTurns: number | null
  types: string[]
  tera_type: string | null
  terastallized: boolean
  stages: Record<string, number>
  item: string | null
  ability: string
  fainted: boolean
  volatiles: string[]
  /** 휘발성 상태의 남은 턴 (엔진이 알려 주는 것만) */
  volatileTurns: Record<string, number>
  /** 다이맥스 중 (이벤트 기준: 다이맥스 문장부터 원래 크기로 돌아오는 문장까지) */
  dynamax: boolean
  /** 거다이맥스 중 (다이맥스 + 세트의 거다이맥스 + 거다이맥스 모습이 있는 종) */
  gmax: boolean
  /** 다이맥스 남은 턴 (3 → 1) */
  dynamaxTurns: number | null
  /** 기술 슬러그 + PP (교체 화면·현황용) */
  moves: { id: string; type: string; pp: number; max_pp: number }[]
}

export interface SideView {
  id: PlayerID
  name: string
  active: PokeView
  team: PokeView[]
  /** turns: 남은 턴 (무기한이면 null) */
  conditions: { id: string; layers: number; turns: number | null }[]
  usedTera: boolean
}

export interface Frame {
  index: number
  event: BattleEvent
  /**
   * 한 이벤트가 두 장면이 될 때 몇 번째 문장인지 (메가진화·울트라버스트: 0 = 반응, 1 = 변신).
   * 0 인 프레임은 아직 변하기 전의 모습이다.
   */
  part?: 0 | 1
  /** 로그에 보이지 않는 이벤트 (재생 시 대기 없이 넘김) */
  silent: boolean
  turn: number
  p1: SideView
  p2: SideView
  weather: string | null
  weatherTurns: number | null
  terrain: string | null
  terrainTurns: number | null
  field: { id: string; turns: number | null }[]
}

/** 엔진의 남은 턴 → 화면 값. 0 이하·없음·무한은 null */
export const turnsOf = (d: { turns_remaining?: number | null } | null | undefined): number | null =>
  d && typeof d.turns_remaining === 'number' && Number.isFinite(d.turns_remaining) && d.turns_remaining > 0 ? d.turns_remaining : null

export const foeOf = (p: PlayerID): PlayerID => (p === 'p1' ? 'p2' : 'p1')

/** 프레임에서 포켓몬 찾기 */
export function findPokemon(f: Pick<Frame, 'p1' | 'p2'>, id: string | undefined): PokeView | undefined {
  if (!id) return undefined
  return f.p1.team.find(x => x.id === id) ?? f.p2.team.find(x => x.id === id)
}

export const sideOfId = (id: string): PlayerID => (id.startsWith('p2') ? 'p2' : 'p1')
