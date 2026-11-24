import type { BattlePokemon, PokemonSet, StatStages } from './pokemon'
import type { Weather, Terrain, SideCondition, FieldCondition, DurationEffect } from './effect'
import type { MoveData } from './move'

// ─── 플레이어 ─────────────────────────────────────────────────
export type PlayerID = 'p1' | 'p2'

// ─── 배틀 형식 ────────────────────────────────────────────────
// Pokémon Showdown 시뮬레이터 기반. singles / rotation 은 편의 API(getRequest/submitAction) 지원,
// doubles / triples 는 submitChoice(raw Showdown 선택 문자열) 로 사용한다.
// rotation: 양쪽 3마리가 나오고 가운데(앞, 슬롯 1)만 행동·피격. 행동 전에 왼쪽/오른쪽을 앞으로 돌릴 수 있다.
export type BattleFormat = 'singles' | 'doubles' | 'triples' | 'rotation'

/** 세대 */
export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** 로테이션 방향: left = 슬롯 0(a) 이 앞으로, right = 슬롯 2(c) 가 앞으로 */
export type RotateDirection = 'left' | 'right'

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

/**
 * 교체의 원인 (기술·아이템·특성). id 는 PokeAPI 슬러그.
 * 예: { kind: 'move', id: 'u-turn' } · { kind: 'move', id: 'baton-pass' } (랭크·일부 상태가 넘어간다)
 *     { kind: 'move', id: 'shed-tail' } (대타가 넘어간다) · { kind: 'item', id: 'eject-button' }
 *     { kind: 'item', id: 'red-card' } (상대를 끌어낸다) · { kind: 'ability', id: 'emergency-exit' }
 */
export interface SwitchSource {
  kind: 'move' | 'item' | 'ability'
  id: string
}

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
      terastallize?: boolean      // 이번 턴 테라스탈 (9세대)
      mega?: boolean              // 메가진화 (6·7세대)
      ultra_burst?: boolean       // 울트라버스트 (7세대 네크로즈마)
      zmove?: boolean             // Z기술로 사용 (7세대)
      dynamax?: boolean           // 다이맥스 (8세대)
      /**
       * rotation 전용: 이 방향의 뒷줄 포켓몬을 앞으로 돌린 뒤(모든 행동보다 먼저) 그 포켓몬이 기술을 쓴다.
       * move_index 는 돌아 들어오는 포켓몬의 기술 슬롯, pokemon_id 는 그 포켓몬(또는 지금 앞 포켓몬) ID.
       */
      rotate?: RotateDirection
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
  /** 7세대: 이 슬롯으로 쓸 수 있는 Z기술 (슬러그). 없으면 undefined */
  zmove?: string
}

/** 팀 프리뷰 요청 (engine.getTeamPreview). phase 'team_preview' 동안에만 존재 */
export interface TeamPreviewRequest {
  player: PlayerID
  team: BattlePokemon[]        // 고를 수 있는 전체 파티
  pick: number                 // 출전 수 (pickedTeamSize, 없으면 파티 전체)
  raw?: unknown
}

/** rotation: 뒷줄 포켓몬을 앞으로 돌렸을 때 쓸 수 있는 기술 */
export interface RotateOption {
  direction: RotateDirection
  pokemon: BattlePokemon
  moves: MoveOption[]
  can_terastallize: boolean
}

export type BattleRequest =
  | {
      type: 'move'
      player: PlayerID
      /** 앞(행동하는) 포켓몬. rotation 에서 앞이 쓰러진 채 비어 있으면 그 포켓몬 (must_rotate) */
      active: BattlePokemon
      moves: MoveOption[]
      switches: BattlePokemon[]    // 교체 가능한 벤치
      can_switch: boolean
      can_terastallize: boolean
      /** 세대별 기믹 (해당 세대·도구가 있을 때만 true) */
      can_mega_evolve?: boolean
      can_ultra_burst?: boolean
      can_zmove?: boolean
      can_dynamax?: boolean
      forced?: boolean             // 모으기/난동/반동 등으로 기술이 고정됨
      /** rotation: 돌릴 수 있는 방향별 선택지 (앞 포켓몬이 기술에 묶여 있으면 없음) */
      rotate?: RotateOption[]
      /** rotation: 앞 자리가 비어(기절, 교체할 벤치 없음) 반드시 돌려야 함. moves 는 비어 있다 */
      must_rotate?: boolean
      /** Showdown 원본 요청 */
      raw?: unknown
    }
  | {
      type: 'switch'
      player: PlayerID
      reason: SwitchReason
      /** reason 이 self_switch 일 때 무엇 때문에 교체하는지 (유턴·배턴터치·꼬리자르기·탈출버튼·탈출팩·위기회피 등) */
      source?: SwitchSource
      active: BattlePokemon
      switches: BattlePokemon[]
      raw?: unknown
    }

// ─── 배틀 이벤트 (이벤트 이미터 + 로그용) ─────────────────────
export type BattleEvent =
  | { type: 'battle_start';   p1: string; p2: string; seed: number }
  | { type: 'turn_start';     turn: number }
  | { type: 'turn_end';       turn: number; state: BattleState }
  /** zeffect: Z기술 (공격 Z기술은 "전력의 Z기술" 문장이 먼저 나온다) */
  | { type: 'move_use';       pokemon_id: string; move: MoveData; target_id: string; zeffect?: boolean }
  | { type: 'move_miss';      pokemon_id: string; move: MoveData; target_id?: string }
  | { type: 'move_fail';      pokemon_id: string; move: MoveData; reason: string }
  | { type: 'cant_move';      pokemon_id: string; reason: CantMoveReason; detail?: string }
  | { type: 'damage';         pokemon_id: string; amount: number; source: string; effectiveness?: number; crit?: boolean; hp_after?: number }
  /** source 'z-power': 변화 Z기술의 회복, 'dynamax': 다이맥스 시작·끝의 최대 HP 변화 (문장 없음) */
  | { type: 'heal';           pokemon_id: string; amount: number; source: string; hp_after?: number }
  | { type: 'immune';         pokemon_id: string; source: string }
  | { type: 'faint';          pokemon_id: string }
  | { type: 'status_apply';   pokemon_id: string; status: string; source?: string }
  | { type: 'status_remove';  pokemon_id: string; status: string }
  /** count: 멸망의노래 카운트·비축 횟수처럼 숫자가 붙는 상태 */
  /** gmax: 거다이맥스 (dynamax), zeffect: 변화 Z기술의 추가 효과 (Z기충전 등) */
  | { type: 'volatile_apply'; pokemon_id: string; volatile: string; count?: number; gmax?: boolean; zeffect?: boolean }
  | { type: 'volatile_remove';pokemon_id: string; volatile: string }
  /** zeffect: 변화 Z기술의 추가 효과 (Z파워로 랭크 상승) */
  | { type: 'stat_change';    pokemon_id: string; stat: string; stages: number; actual?: number; zeffect?: boolean }
  | { type: 'weather_change'; weather: Weather; source: string }
  | { type: 'terrain_change'; terrain: Terrain; source: string }
  | { type: 'side_start';     player: PlayerID; condition: SideCondition; layers?: number }
  /** pokemon_id: 장판을 없앤 포켓몬 (독압정을 밟은 독타입) */
  | { type: 'side_end';       player: PlayerID; condition: SideCondition; pokemon_id?: string }
  | { type: 'field_start';    condition: FieldCondition }
  | { type: 'field_end';      condition: FieldCondition }
  /** forced: 강제로 끌려 나옴 (날려버리기·드래곤테일·레드카드). source: 교체 원인 (기술·아이템·특성, 일반 교체·기절 후 교체는 없음) */
  | { type: 'switch';         player: PlayerID; out_id: string; in_id: string; forced?: boolean; source?: SwitchSource }
  /** rotation: in_id 가 앞으로 나오고 out_id 가 그 자리(뒷줄)로 간다. 교체가 아니므로 랭크·상태 유지 */
  | { type: 'rotate';         player: PlayerID; direction: RotateDirection; in_id: string; out_id: string }
  | { type: 'ability_trigger';pokemon_id: string; ability: string; effect: string }
  /** target_id: 아이템이 향한 상대 (레드카드) */
  /**
   * 아이템이 없어짐. source: 원인 ('eat' 열매를 먹음, 'weaken' 반감 열매, 'gem' 주얼, 'knock-off', 'stealeat'(벌레먹음·쪼기),
   * 'incinerate', 'corrosive-gas', 'fling', 'trick', 'thief' …, 없으면 아이템 자체 효과로 소모). target_id: 원인 쪽 포켓몬 ([of]).
   * silent: 바로 뒤의 item_activate 가 같은 일을 알린다 (트릭·도둑질로 넘어감)
   */
  | { type: 'item_consume';   pokemon_id: string; item: string; target_id?: string; source?: string; silent?: boolean }
  /** effect: 'reveal' 또는 원인 슬러그 ('trick', 'thief', 'frisk', 'harvest', 'recycle', 'bestow', 'symbiosis' …). target_id: [of] 쪽 */
  | { type: 'item_activate';  pokemon_id: string; item: string; effect: string; target_id?: string }
  | { type: 'terastallize';   pokemon_id: string; tera_type: string }
  /** 메가진화·원시회귀·울트라버스트 (species = 바뀐 모습) */
  | { type: 'mega_evolve';    pokemon_id: string; kind: 'mega' | 'primal' | 'ultra'; species: string; item?: string }
  | { type: 'hit_count';      pokemon_id: string; hits: number }
  /** kind: 효과의 종류 (Showdown 로그의 'ability:' / 'item:' / 'move:' 접두어) */
  | { type: 'activate';       pokemon_id?: string; effect: string; detail?: string; kind?: 'ability' | 'item' | 'move' }
  /** 랭크가 직접 정해짐 (배북·흑안개·뒤집기·스왑 등): 그 포켓몬의 지금 랭크 전체. 이벤트만으로 상태를 재구성할 때 쓴다 */
  | { type: 'stat_set';       pokemon_id: string; stages: StatStages }
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
  /** 세대 (1~9, 기본 9). doubles 는 3세대부터, triples 는 5·6·9세대, rotation 은 9세대만 */
  gen?: Generation
  p1: { name: string; team: PokemonSet[] }
  p2: { name: string; team: PokemonSet[] }
  seed?: number           // 랜덤 시드 (재현 가능 배틀용)
  maxTurns?: number       // 이 턴을 넘기면 무승부 (기본 1000)
  /** Showdown 포맷 ID 직접 지정 (기본: gen9customgame / gen9doublescustomgame / gen9triples) */
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
  /** false 면 다이맥스·거다이맥스 금지 (Showdown 'Dynamax Clause'). 기본 true */
  dynamax?: boolean
  /** false 면 메가진화·울트라버스트 금지 (엔진 규칙 'Mega Evolution Clause', 원시회귀는 그대로). 기본 true */
  megaEvolution?: boolean
  /** false 면 Z기술 금지 (엔진 규칙 'Z-Move Clause'). 기본 true */
  zMoves?: boolean
  /**
   * 기믹 겹치기 (엔진 규칙 'Stack Gimmicks Mod'): 한 포켓몬이 메가진화(울트라버스트)·Z기술·다이맥스·테라스탈을 함께 쓸 수 있다.
   * 각 기믹은 그대로 진영당 한 배틀에 한 번, 지닌 도구는 하나 (메가스톤과 Z크리스탈은 함께 못 지닌다). 9세대에서 쓴다.
   */
  stackGimmicks?: boolean
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
