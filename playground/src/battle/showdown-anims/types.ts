// ─── Showdown 애니메이션 표가 부르는 장면 API 의 얇은 타입 (이 저장소 코드) ─────
// 원본 표(battle-animations*.ts)는 jQuery BattleScene 을 받는다. 여기서는 그 중 표가 실제로 쓰는 것만 정의하고
// ./scene.ts 가 우리 장면 위에 구현한다.

/** Showdown 클라이언트 fx 그림 (GitHub 의 원본 저장소 파일) */
export const FX_PREFIX = 'https://raw.githubusercontent.com/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com/fx/'

/** 원본의 Config.routes.client (`https://${client}/fx/…` 꼴로 쓰인다) */
export const Config = { routes: { client: 'raw.githubusercontent.com/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com' } }

export interface ScenePos {
  /** - left, + right */
  x?: number
  /** - down, + up */
  y?: number
  /** - player, + opponent */
  z?: number
  scale?: number
  xscale?: number
  yscale?: number
  opacity?: number
  time?: number
  display?: string
}

export interface SpriteData {
  w: number
  h: number
  y?: number
  gen?: number
  url?: string
  rawHTML?: string
  pixelated?: boolean
}

export interface EffectHandle { readonly __effect: true }

export interface BattleScene {
  timeOffset: number
  battle: { mySide: { x: number; y: number; z: number } }
  $bg: { animate(...a: unknown[]): unknown; delay(...a: unknown[]): unknown }
  showEffect(effect: string | SpriteData, start: ScenePos, end: ScenePos, transition: string, after?: string, additionalCss?: Record<string, string>): EffectHandle
  animateEffect(handle: EffectHandle, effect: string | SpriteData, start: ScenePos, end: ScenePos, transition: string, after?: string, additionalCss?: Record<string, string>): EffectHandle
  backgroundEffect(bg: string, duration: number, opacity?: number, delay?: number): void
  wait(time: number): void
}

export interface PokemonSprite {
  x: number
  y: number
  z: number
  sp: SpriteData
  isFrontSprite: boolean
  isMissedPokemon: boolean
  isSubActive: boolean
  anim(end: ScenePos, transition?: string): PokemonSprite
  delay(time: number): PokemonSprite
  behind(offset: number): number
  behindx(offset: number): number
  behindy(offset: number): number
  leftof(offset: number): number
}
