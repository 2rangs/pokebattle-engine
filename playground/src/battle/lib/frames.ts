// ─── 엔진 → 화면 프레임, 배틀 준비, 리플레이 재현 ─────────────────
// 실시간 배틀(useBattleSession)과 리플레이(simulateReplay)가 같은 코드를 쓴다 (Pokestra 에서 옮김).
// 로그 문장은 프레임에 저장하지 않고 화면을 그릴 때 현재 언어로 만든다 (frameText).
import {
  BattleEngine, createAI, createMetronomeBattle, exportShowdownTeam, parseShowdownTeam,
  type Action, type BattleAI, type BattleEvent, type BattlePokemon, type FormatContext, type PlayerID,
  type PokemonSet, type Side, type MetronomeBattleOptions,
} from './engine'
import { formatBattleEvent } from './names'
import { turnsOf, type Frame, type PokeView, type SideView } from './frame'
import type { BattleRule, MetronomeSetup, ReplayController, ReplayData } from './replay'
import type { Lang } from './messages'

function viewPokemon(p: BattlePokemon, slept: ReadonlyMap<string, number>): PokeView {
  const stages: Record<string, number> = {}
  for (const [k, v] of Object.entries(p.stages)) if (v !== 0) stages[k] = v
  const volatiles = Object.keys(p.volatile_statuses).filter(v => v !== 'protect_streak')
  const volatileTurns: Record<string, number> = {}
  for (const v of volatiles) {
    const n = turnsOf(p.volatile_statuses[v as keyof typeof p.volatile_statuses])
    if (n !== null) volatileTurns[v] = n
  }
  const statusTurns = p.status === 'toxic' ? Math.max(0, p.status_turns ?? 0)
    : p.status === 'sleep' ? slept.get(p.id) ?? 0
      : null
  return {
    id: p.id, species: p.species, setSpecies: p.set?.species ?? p.species, nickname: p.nickname, level: p.level,
    gender: p.gender === 'M' || p.gender === 'F' ? p.gender : null,
    hp: p.hp, max_hp: p.max_hp, status: p.status, statusTurns, types: p.types.filter(Boolean) as string[],
    tera_type: p.tera_type ?? null, terastallized: !!p.terastallized, stages,
    item: p.item, ability: p.ability, fainted: p.fainted,
    volatiles, volatileTurns,
    moves: p.moves.filter(m => !!m).map(m => ({ id: m!.move.name, type: m!.move.type, pp: m!.pp, max_pp: m!.max_pp })),
  }
}

function viewSide(side: Side, slept: ReadonlyMap<string, number>): SideView {
  return {
    id: side.id,
    name: side.name ?? side.id,
    active: viewPokemon(side.active[0]!, slept),
    team: side.team.map(p => viewPokemon(p, slept)),
    conditions: Object.entries(side.conditions).map(([id, c]) => ({ id, layers: c?.layers ?? 1, turns: turnsOf(c) })),
    usedTera: !!side.used_tera,
  }
}

/** 프레임 시점의 포켓몬 정보로 로그 포매터 컨텍스트를 만든다 */
function frameContext(f: Pick<Frame, 'p1' | 'p2'>, sideName?: (p: PlayerID) => string): FormatContext {
  return {
    getPokemon: id => {
      const p = f.p1.team.find(x => x.id === id) ?? f.p2.team.find(x => x.id === id)
      // 포매터는 species / nickname / max_hp 만 읽는다
      return p ? ({ ...p, set: { species: p.setSpecies } } as unknown as BattlePokemon) : undefined
    },
    sideName,
  }
}

/** 프레임의 로그 문장 (현재 언어). sideName 은 관전 모드처럼 진영 이름을 직접 보여줄 때만 */
export function frameText(f: Frame, lang: Lang, sideName?: (p: PlayerID) => string): string | null {
  return formatBattleEvent(f.event, frameContext(f, sideName), lang)
}

/** 엔진의 모든 이벤트를 프레임으로 만들어 push 한다. 엔진 start() 전에 붙인다 */
export function attachFrameCapture(engine: BattleEngine, push: (frame: Omit<Frame, 'index'>) => void): () => void {
  // 잠든 턴 수: 엔진은 남은 턴만 세므로 '잠들어 움직이지 못함'을 직접 센다
  const slept = new Map<string, number>()
  return engine.on('*', (ev: BattleEvent) => {
    if (ev.type === 'status_apply' && ev.status === 'sleep') slept.set(ev.pokemon_id, 0)
    else if (ev.type === 'cant_move' && ev.reason === 'sleep') slept.set(ev.pokemon_id, (slept.get(ev.pokemon_id) ?? 0) + 1)
    const st = engine.getState()
    if (!st.sides.p1.active[0] || !st.sides.p2.active[0]) return
    const p1 = viewSide(st.sides.p1, slept)
    const p2 = viewSide(st.sides.p2, slept)
    push({
      event: ev,
      silent: formatBattleEvent(ev, frameContext({ p1, p2 }), 'en') === null,
      turn: st.turn,
      p1,
      p2,
      weather: st.field.weather,
      weatherTurns: st.field.weather ? turnsOf(st.field.weather_turns) : null,
      terrain: st.field.terrain,
      terrainTurns: st.field.terrain ? turnsOf(st.field.terrain_turns) : null,
      field: Object.entries(st.field.conditions).map(([id, c]) => ({ id, turns: turnsOf(c) })),
    })
  })
}

// ─── 컨트롤러 ────────────────────────────────────────────────

const DIFFICULTY_AI: Record<Exclude<ReplayController, 'human'>, 'random' | 'heuristic' | 'strong'> = {
  easy: 'random', normal: 'heuristic', hard: 'strong',
}

/**
 * 손가락흔들기 CPU: 고를 게 기술 하나뿐이라 항상 그 기술, 교체 요청이면 첫 번째 대기 포켓몬.
 * (일반 AI 는 데미지 미리보기가 없는 기술을 피해 교체를 고르기도 한다)
 */
export const metronomeAI: BattleAI = {
  name: 'metronome',
  chooseAction(engine, player) {
    const req = engine.getRequest(player)
    if (!req) return null
    if (req.type === 'move') {
      const opt = req.moves.find(m => !m.disabled) ?? req.moves[0]
      return { type: 'move', player, pokemon_id: req.active.id, move_index: opt ? opt.index : -1 }
    }
    const next = req.switches[0]
    return next ? { type: 'switch', player, pokemon_id: req.active.id, switch_to_id: next.id } : null
  },
}

/** 규칙·난이도별 CPU (시드 고정: 배틀 시드 + 진영별 오프셋) */
export function controllerAI(rule: BattleRule, difficulty: Exclude<ReplayController, 'human'>, battleSeed: number, player: PlayerID): BattleAI {
  if (rule === 'metronome') return metronomeAI
  return createAI(DIFFICULTY_AI[difficulty], battleSeed + (player === 'p1' ? 11 : 23))
}

/** 엔진에 넘기는 진영 이름 (화면에는 언어별 이름을 따로 그린다) */
export function engineSideNames(p1: ReplayController, p2: ReplayController): { p1: string; p2: string } {
  const spectate = p1 !== 'human' && p2 !== 'human'
  return spectate ? { p1: 'CPU 1', p2: 'CPU 2' } : { p1: 'Player', p2: 'CPU' }
}

// ─── 배틀 준비 ───────────────────────────────────────────────

export type BattleSetup =
  | { rule: 'normal'; seed: number; p1Team: PokemonSet[]; p2Team: PokemonSet[] }
  | { rule: 'metronome'; seed: number; metronome: MetronomeSetup }

export interface Controllers { p1: ReplayController; p2: ReplayController }

/** 손가락흔들기 설정 → 엔진 옵션 */
export function metronomeOptions(seed: number, m: MetronomeSetup, ctrl: Controllers): MetronomeBattleOptions {
  const names = engineSideNames(ctrl.p1, ctrl.p2)
  return {
    seed,
    format: 'singles',
    teamSize: m.teamSize,
    level: m.level,
    ...(m.stats && Object.keys(m.stats).length ? { stats: m.stats } : {}),
    p1: { name: names.p1, team: m.p1Team },
    p2: { name: names.p2, team: m.p2Team },
  }
}

/** 설정 → start() 전의 엔진 */
export function createEngine(setup: BattleSetup, ctrl: Controllers): BattleEngine {
  if (setup.rule === 'metronome') return createMetronomeBattle(metronomeOptions(setup.seed, setup.metronome, ctrl))
  const names = engineSideNames(ctrl.p1, ctrl.p2)
  return new BattleEngine({
    format: 'singles',
    seed: setup.seed,
    p1: { name: names.p1, team: setup.p1Team },
    p2: { name: names.p2, team: setup.p2Team },
  })
}

/** 설정 + 컨트롤러 + 기록한 행동 → 리플레이 데이터 */
export function buildReplayData(setup: BattleSetup, ctrl: Controllers, actions: readonly Action[], forfeit?: PlayerID): ReplayData {
  const data: ReplayData = {
    v: 1,
    rule: setup.rule,
    seed: setup.seed,
    format: 'singles',
    p1: { team: setup.rule === 'normal' ? exportShowdownTeam(setup.p1Team) : '', ctrl: ctrl.p1 },
    p2: { team: setup.rule === 'normal' ? exportShowdownTeam(setup.p2Team) : '', ctrl: ctrl.p2 },
    actions: [...actions],
  }
  if (setup.rule === 'metronome') data.metronome = setup.metronome
  if (forfeit) data.forfeit = forfeit
  return data
}

/** 리플레이 데이터 → 설정 */
export function replaySetup(data: ReplayData): BattleSetup {
  if (data.rule === 'metronome' && data.metronome) return { rule: 'metronome', seed: data.seed, metronome: data.metronome }
  return { rule: 'normal', seed: data.seed, p1Team: parseShowdownTeam(data.p1.team), p2Team: parseShowdownTeam(data.p2.team) }
}

export interface SimulatedReplay {
  frames: Frame[]
  winner: PlayerID | 'draw' | null
  /** 마지막 턴 */
  turns: number
  /** mismatch: 기록한 행동을 이 엔진이 받아들이지 못했다 (재현 실패) — frames 는 멈춘 지점까지 */
  error?: 'mismatch'
  /** 받아들인 행동 수 */
  applied: number
}

/** 엔진을 새로 만들어 기록한 행동을 차례로 넣는다 (AI 는 다시 돌리지 않는다) */
export function simulateReplay(data: ReplayData): SimulatedReplay {
  const frames: Frame[] = []
  let engine: BattleEngine
  try {
    engine = createEngine(replaySetup(data), { p1: data.p1.ctrl, p2: data.p2.ctrl })
    attachFrameCapture(engine, f => frames.push({ ...f, index: frames.length }))
    engine.start()
  } catch {
    return { frames, winner: null, turns: 0, error: 'mismatch', applied: 0 }
  }
  let applied = 0
  let error: SimulatedReplay['error']
  for (const a of data.actions) {
    if (engine.getState().phase === 'ended') { error = 'mismatch'; break }
    if ((a.type === 'move' || a.type === 'switch') && !engine.getRequest(a.player)) { error = 'mismatch'; break }
    try {
      engine.submitAction(a)
    } catch {
      error = 'mismatch'
      break
    }
    applied++
  }
  if (!error && data.forfeit && engine.getState().phase !== 'ended') engine.forfeit(data.forfeit)
  const st = engine.getState()
  return { frames, winner: st.winner, turns: frames.at(-1)?.turn ?? 0, error, applied }
}
