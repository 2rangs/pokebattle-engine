// ─── 저장한 HTML 안의 오프라인 재생기가 읽는 데이터 (엔진·이름표 없이 그대로 그릴 수 있게 저장할 때 다 풀어 둔다) ───
import type { MoveInfo } from '../../gen5fx/recipes'

export type Side = 'p1' | 'p2'

/** 화면에 나와 있는 포켓몬 한 마리의 모습 */
export interface OMon {
  /** 이름 (별명 또는 종 이름, 저장한 언어) */
  n: string
  lv: number
  hp: number
  mx: number
  /** 상태이상 짧은 이름과 종류 ([글자, 'burn' 등]) */
  st: [string, string] | null
  f: boolean
  /** 스프라이트 키 (sprites 의 키, 없으면 이름만) */
  s: string
}

export type OEvent =
  | { k: 'move'; by: Side; self: boolean; mv: MoveInfo }
  | { k: 'hit' | 'crit' | 'faint' | 'enter' | 'heal' | 'status' | 'shimmer'; on: Side; shiny?: boolean }

export interface OStep {
  /** 메시지 (없으면 앞 메시지 유지) */
  t: string | null
  turn: number
  /** mons 표의 번호 [p1, p2] */
  m: [number, number]
  /** 이 장면에 머무는 시간 (1배속 ms) */
  w: number
  ev?: OEvent
}

export interface OSprite {
  /** data: URI */
  src: string
  /** 도트 그림 (픽셀 그대로 확대) */
  px: boolean
  /** 앞모습을 좌우 반전해 뒷모습 대신 */
  flip: boolean
}

export interface OfflineReplay {
  /** 아래(우리) 쪽 */
  me: Side
  names: [string, string]
  mons: OMon[]
  steps: OStep[]
  sprites: Record<string, OSprite>
  result: string | null
  labels: {
    play: string
    pause: string
    restart: string
    prevTurn: string
    nextTurn: string
    speed: string
    turn: string
    start: string
    progress: string
  }
}
