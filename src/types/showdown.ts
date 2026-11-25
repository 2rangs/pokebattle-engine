// ─── 공개 API 에 나오는 Showdown 객체의 타입 ────────────────────
// Showdown 시뮬레이터는 패키지 안에 필요한 부분만 묶여 있고 @pkmn/sim 은 설치되지 않는다 (선택 의존성).
// 그래서 공개 타입에는 @pkmn/sim 의 타입 대신 이 모양들을 쓴다.
// 원본 객체의 자세한 타입이 필요하면 @pkmn/sim 을 설치하고 캐스팅한다:
//   const battle = engine.battle as unknown as import('@pkmn/sim').Battle

export interface ShowdownStats { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }

/** Showdown 팀 세트 (@pkmn/sim 의 PokemonSet 과 같은 모양) */
export interface ShowdownSet {
  name: string
  species: string
  item: string
  ability: string
  moves: string[]
  nature: string
  gender: string
  evs: ShowdownStats
  ivs: ShowdownStats
  level: number
  shiny?: boolean
  happiness?: number
  pokeball?: string
  hpType?: string
  dynamaxLevel?: number
  gigantamax?: boolean
  teraType?: string
}

/** Showdown 원본 Battle (@pkmn/sim) */
export interface ShowdownBattle {
  readonly ended: boolean
  readonly turn: number
  readonly winner: string
  /** 재생용 입력 기록 (replayInputLog 에 넘긴다) */
  readonly inputLog: string[]
  /** 프로토콜 로그 */
  readonly log: string[]
  readonly [key: string]: unknown
}

/** Showdown 원본 Pokemon (@pkmn/sim) */
export interface ShowdownPokemon {
  readonly name: string
  readonly hp: number
  readonly maxhp: number
  readonly [key: string]: unknown
}

/** Showdown 원본 Species (@pkmn/sim) */
export interface ShowdownSpecies {
  readonly id: string
  readonly name: string
  readonly num: number
  readonly types: readonly string[]
  readonly baseStats: ShowdownStats
  readonly [key: string]: unknown
}
