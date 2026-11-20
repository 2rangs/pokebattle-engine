// ─── 엔진 → 화면 프레임, 배틀 준비, 리플레이 재현 ─────────────────
// 실시간 배틀(useBattleSession)과 리플레이(simulateReplay)가 같은 코드를 쓴다 (Pokestra 에서 옮김).
// 로그 문장은 프레임에 저장하지 않고 화면을 그릴 때 현재 언어로 만든다 (frameText).
import {
  BattleEngine, createAI, getSpecies, createMetronomeBattle, exportShowdownTeam, parseShowdownTeam,
  type Action, type BattleAI, type BattleEvent, type BattlePokemon, type FormatContext, type PlayerID,
  type PokemonSet, type Side, type MetronomeBattleOptions,
} from './engine'
import { formatBattleEvent } from './names'
import { findPokemon, turnsOf, type Frame, type PokeView, type SideView } from './frame'
import { gmaxForm } from './gimmick'
import type { BattleRule, MetronomeSetup, ReplayController, ReplayData, ReplayGen } from './replay'
import type { Lang } from './messages'

/** 다이맥스 중인 포켓몬 (이벤트로 센다: 엔진 상태는 문장보다 한 줄 늦게 풀린다) */
type DynamaxTrack = ReadonlyMap<string, { gmax: boolean; turns: number }>

function viewPokemon(p: BattlePokemon, slept: ReadonlyMap<string, number>, dmax: DynamaxTrack): PokeView {
  const stages: Record<string, number> = {}
  for (const [k, v] of Object.entries(p.stages)) if (v !== 0) stages[k] = v
  // 다이맥스는 데이터박스에 따로 (남은 턴 포함)
  const volatiles = Object.keys(p.volatile_statuses).filter(v => v !== 'protect_streak' && v !== 'dynamax')
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
    dynamax: dmax.has(p.id),
    gmax: !!dmax.get(p.id)?.gmax,
    dynamaxTurns: dmax.get(p.id)?.turns ?? null,
    moves: p.moves.filter(m => !!m).map(m => ({ id: m!.move.name, type: m!.move.type, pp: m!.pp, max_pp: m!.max_pp })),
  }
}

function viewSide(side: Side, slept: ReadonlyMap<string, number>, dmax: DynamaxTrack): SideView {
  return {
    id: side.id,
    name: side.name ?? side.id,
    active: viewPokemon(side.active[0]!, slept, dmax),
    team: side.team.map(p => viewPokemon(p, slept, dmax)),
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
  return formatBattleEvent(f.event, frameContext(f, sideName), lang, f.part)
}

/** 프레임 안의 그 포켓몬 모습을 바꾼다 (자리·팀 목록 둘 다). 테라스탈 중이면 타입은 그대로 */
function setForm(f: Pick<Frame, 'p1' | 'p2'>, id: string, species: string) {
  const types = getSpecies(species)?.types
  for (const side of [f.p1, f.p2]) {
    for (const v of [side.active, ...side.team]) {
      if (v.id !== id || v.species === species) continue
      v.species = species
      if (types && !v.terastallized) v.types = [...types]
    }
  }
}

const formIn = (f: Pick<Frame, 'p1' | 'p2'>, id: string) => (f.p1.team.find(x => x.id === id) ?? f.p2.team.find(x => x.id === id))?.species

/** 거다이맥스할 수 있는지 (세트에 거다이맥스 + 그 모습이 있는 종) */
function canGmax(engine: BattleEngine, id: string): boolean {
  const p = engine.getPokemon(id)
  return !!p?.set.gigantamax && !!gmaxForm(p.species)
}

/**
 * 엔진의 모든 이벤트를 프레임으로 만들어 push 한다 (index 는 0 부터 차례로). 엔진 start() 전에 붙인다.
 * 받은 프레임 객체는 그대로 보관한다: 시작할 때 한꺼번에 읽은 로그는 뒤 이벤트(원시회귀·날씨 등)를 보고 앞 프레임을 고친다.
 */
export function attachFrameCapture(engine: BattleEngine, push: (frame: Frame) => void): () => void {
  // 잠든 턴 수: 엔진은 남은 턴만 세므로 '잠들어 움직이지 못함'을 직접 센다
  const slept = new Map<string, number>()
  const dmax = new Map<string, { gmax: boolean; turns: number }>()
  // 폼 변화: 마지막으로 바뀐 프레임 위치와 그때의 모습 (그 뒤로만 되돌려 고친다)
  const pushed: Frame[] = []
  const emit = (f: Omit<Frame, 'index'>) => {
    const frame = { ...f, index: pushed.length }
    pushed.push(frame)
    push(frame)
  }
  const lastChange = new Map<string, number>()
  const formBefore = new Map<string, string>()
  const lastField = new Map<'weather' | 'terrain', number>()
  return engine.on('*', (ev: BattleEvent) => {
    if (ev.type === 'status_apply' && ev.status === 'sleep') slept.set(ev.pokemon_id, 0)
    else if (ev.type === 'cant_move' && ev.reason === 'sleep') slept.set(ev.pokemon_id, (slept.get(ev.pokemon_id) ?? 0) + 1)
    // 다이맥스: 시작 문장부터 끝 문장 전까지 (교체·기절하면 끝), 턴 끝마다 1 줄어든다
    if (ev.type === 'volatile_apply' && ev.volatile === 'dynamax') dmax.set(ev.pokemon_id, { gmax: !!ev.gmax || canGmax(engine, ev.pokemon_id), turns: 3 })
    else if (ev.type === 'volatile_remove' && ev.volatile === 'dynamax') dmax.delete(ev.pokemon_id)
    else if (ev.type === 'faint') dmax.delete(ev.pokemon_id)
    else if (ev.type === 'switch' && ev.out_id) dmax.delete(ev.out_id)
    else if (ev.type === 'turn_end') for (const [id, d] of dmax) dmax.set(id, { ...d, turns: Math.max(1, d.turns - 1) })
    const st = engine.getState()
    if (!st.sides.p1.active[0] || !st.sides.p2.active[0]) return
    const p1 = viewSide(st.sides.p1, slept, dmax)
    const p2 = viewSide(st.sides.p2, slept, dmax)
    // 폼 변화(메가진화·원시회귀·배틀 폼): 엔진이 시작할 때 첫 로그를 한꺼번에 읽으면 앞 프레임도 이미 바뀐 모습이다
    // → 이 포켓몬이 마지막으로 바뀐 뒤의 프레임 중 새 모습인 것을 이전 모습으로 되돌린다
    if (ev.type === 'forme_change') {
      const id = ev.pokemon_id
      const from = lastChange.get(id) ?? -1
      let prev: string | undefined
      for (let i = pushed.length - 1; i > from; i--) {
        const sp = formIn(pushed[i]!, id)
        if (sp !== ev.species) { prev = sp; break }
      }
      prev ??= findPokemon(pushed.at(-1) ?? { p1, p2 }, id)?.setSpecies
      for (let i = pushed.length - 1; i > from; i--) {
        if (formIn(pushed[i]!, id) !== ev.species) break
        if (prev) setForm(pushed[i]!, id, prev)
      }
      lastChange.set(id, pushed.length)
      if (prev) formBefore.set(id, prev)
    }
    // 날씨·필드도 같은 이유로 (원시회귀 → 강한 비, 첫 등장의 잔비·일렉트릭메이커 등): 바뀌기 전 프레임은 이전 상태로
    if (ev.type === 'weather_change' || ev.type === 'terrain_change') {
      const key = ev.type === 'weather_change' ? 'weather' : 'terrain'
      const now = ev.type === 'weather_change' ? ev.weather : ev.terrain
      const from = lastField.get(key) ?? -1
      let prev: string | null = null
      for (let i = pushed.length - 1; i > from; i--) if (pushed[i]![key] !== now) { prev = pushed[i]![key]; break }
      for (let i = pushed.length - 1; i > from; i--) {
        const f = pushed[i]!
        if (f[key] !== now) break
        f[key] = prev as never
        f[key === 'weather' ? 'weatherTurns' : 'terrainTurns'] = null
      }
      lastField.set(key, pushed.length)
    }
    const base = { p1, p2 }
    // 메가진화·울트라버스트: 폼 변화 프레임과 "반응" 문장까지는 이전 모습, "변신" 문장에서 바뀐다
    const twoPart = ev.type === 'mega_evolve' && ev.kind !== 'primal'
    const before = twoPart ? formBefore.get(ev.pokemon_id) : undefined
    if (twoPart && before && before !== ev.species) {
      const fc = pushed.at(-1)
      if (fc?.event.type === 'forme_change' && fc.event.pokemon_id === ev.pokemon_id) setForm(fc, ev.pokemon_id, before)
      const pre = structuredClone(base)
      setForm(pre, ev.pokemon_id, before)
      emit(frameOf(ev, pre, st, 0))
      emit(frameOf(ev, base, st, 1))
      return
    }
    emit(frameOf(ev, base, st))
  })
}

function frameOf(ev: BattleEvent, { p1, p2 }: Pick<Frame, 'p1' | 'p2'>, st: ReturnType<BattleEngine['getState']>, part?: 0 | 1): Omit<Frame, 'index'> {
  return {
    event: ev,
    ...(part !== undefined ? { part } : {}),
    silent: formatBattleEvent(ev, frameContext({ p1, p2 }), 'en', part) === null,
    turn: st.turn,
    p1,
    p2,
    weather: st.field.weather,
    weatherTurns: st.field.weather ? turnsOf(st.field.weather_turns) : null,
    terrain: st.field.terrain,
    terrainTurns: st.field.terrain ? turnsOf(st.field.terrain_turns) : null,
    field: Object.entries(st.field.conditions).map(([id, c]) => ({ id, turns: turnsOf(c) })),
  }
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
  | { rule: 'normal'; seed: number; p1Team: PokemonSet[]; p2Team: PokemonSet[]; gen?: ReplayGen }
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
    ...(setup.gen && setup.gen !== 9 ? { gen: setup.gen } : {}),
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
    ...(setup.rule === 'normal' && setup.gen && setup.gen !== 9 ? { gen: setup.gen } : {}),
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
  // Showdown 내보내기는 Lv.100 이면 Level 줄을 뺀다 → 줄이 없으면 100 (Lv.50 등은 늘 줄이 있다)
  return {
    rule: 'normal', seed: data.seed, p1Team: parseShowdownTeam(data.p1.team, 100), p2Team: parseShowdownTeam(data.p2.team, 100),
    ...(data.gen && data.gen !== 9 ? { gen: data.gen } : {}),
  }
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
    attachFrameCapture(engine, f => frames.push(f))
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
