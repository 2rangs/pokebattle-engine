// ─── "직접 확인": Showdown 직접 vs pokebattle-engine, 같은 배틀을 두 번 ─────────
// 루트 scripts/bench-compare.ts 의 싱글 부분을 브라우저(웹 워커)로 옮긴 것.
//  1. 기록: 엔진(빠른 경로 끔)으로 시드 배틀을 끝까지 돌리고, Showdown 에 실제로 들어간 입력(inputLog)을 남긴다.
//  2. Showdown 직접: 그 inputLog 를 Showdown 의 Battle 에 그대로 넣는다 (엔진 코드·패치 없이 원본 경로).
//  3. 엔진: 같은 설정으로 BattleEngine(기본값 = 빠른 경로)을 만들고 같은 선택을 넣는다.
//  4. 두 프로토콜 로그(|t:| 시각 줄 제외)를 SHA-256 으로 비교하고, 2·3 의 시간을 턴 수로 나눈다.
// 시간은 워밍업 한 번 뒤 번갈아 여러 번 재서 각자 가장 빠른 값. 해시·기록은 시간에 넣지 않는다.
import { BattleEngine, generateRandomTeam, PRNG, replayInputLog, comparableLog } from '../../../dist-web/index.js'
import type { BattleConfig } from '../../../dist-web/index.js'

export interface Recorded {
  seed: number
  config: BattleConfig
  /** Showdown 입력 로그 (>start, >player, >p1 …, >p2 …) */
  inputLog: string[]
  turns: number
}

/** 시드 하나로 싱글 랜덤배틀 하나를 기록한다 (팀·선택 모두 시드에서) */
export function recordBattle(seed: number): Recorded {
  const rng = new PRNG(seed * 7919 + 13)
  const config: BattleConfig = {
    format: 'singles', seed, maxTurns: 300,
    p1: { name: 'P1', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: 'gen9randombattle' }) },
    p2: { name: 'P2', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: 'gen9randombattle' }) },
  }
  const engine = new BattleEngine(config, { fast: false, turnSnapshots: false })
  // inputLog 는 정규화된 선택을 남기므로, 실제로 choose() 에 들어간 문자열을 기록한다 (bench-compare 와 같음)
  const inputs: string[] = []
  const b = engine.battle as unknown as { choose: (s: string, c: string) => boolean; tie: () => void }
  const choose = b.choose.bind(b), tie = b.tie.bind(b)
  b.choose = (side, choice) => { const ok = choose(side, choice); if (ok) inputs.push(`>${side} ${choice}`); return ok }
  b.tie = () => { inputs.push('>forcetie'); tie() }
  engine.start()
  const header = engine.battle.inputLog.filter(l => !/^>p[12] /.test(l))
  for (let guard = 0; !engine.battle.ended && guard < 5000; guard++) {
    for (const player of ['p1', 'p2'] as const) {
      if (engine.battle.ended || !engine.getRequest(player)) continue
      engine.submitAction(rng.pick(engine.getAvailableActions(player)))
    }
  }
  return { seed, config, inputLog: [...header, ...inputs], turns: engine.battle.turn }
}

/** inputLog → 비교용 프로토콜 로그 */
export type ShowdownRunner = (inputLog: readonly string[]) => string

/** Showdown 직접: 엔진에 함께 들어 있는 @pkmn/sim 의 Battle 에 입력을 그대로 넣는다 (fast: false = 원본 코드 경로) */
export const showdownDirect: ShowdownRunner = inputLog => comparableLog(replayInputLog(inputLog))

/** 같은 배틀을 pokebattle-engine (기본 설정) 으로 */
export function engineRun(r: Recorded): string {
  const engine = new BattleEngine(r.config, { turnSnapshots: false })
  engine.start()
  for (const line of r.inputLog) {
    if (line.startsWith('>p1 ') || line.startsWith('>p2 ')) engine.submitChoice(line.slice(1, 3) as 'p1' | 'p2', line.slice(4))
  }
  return comparableLog(engine.battle)
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('')
}

export type Phase = 'record' | 'warmup' | 'timing'
export interface Progress { phase: Phase; done: number; total: number }

export interface CompareOptions {
  /** 배틀 수 */
  n: number
  /** 첫 배틀의 시드 (배틀 k 는 seedBase + k) */
  seedBase: number
  /** 워밍업 뒤 측정 라운드 수 (기본 3) */
  rounds?: number
  showdown?: ShowdownRunner
  onProgress?: (p: Progress) => void
  now?: () => number
}

export interface BattleResult {
  seed: number
  turns: number
  showdownHash: string
  engineHash: string
  identical: boolean
  lines: number
}

export interface CompareResult {
  n: number
  seedBase: number
  rounds: number
  turns: number
  /** 배틀 n 개 전체를 한 번 도는 데 든 시간 중 가장 빠른 값 (ms) */
  showdownMs: number
  engineMs: number
  battles: BattleResult[]
  logs: { showdown: string[]; engine: string[] }
}

export async function compareBattles(opts: CompareOptions): Promise<CompareResult> {
  const { n, seedBase, rounds = 3, showdown = showdownDirect, onProgress, now = () => performance.now() } = opts
  const total = n * (1 + 2 + rounds * 2)
  let done = 0
  const tick = (phase: Phase) => onProgress?.({ phase, done: ++done, total })

  const recorded: Recorded[] = []
  for (let k = 0; k < n; k++) { recorded.push(recordBattle(seedBase + k)); tick('record') }

  // 워밍업: 결과 로그는 여기서 받는다 (JIT 가 데워지기 전이라 시간은 버린다)
  const logs = { showdown: [] as string[], engine: [] as string[] }
  for (const r of recorded) { logs.showdown.push(showdown(r.inputLog)); tick('warmup') }
  for (const r of recorded) { logs.engine.push(engineRun(r)); tick('warmup') }

  let showdownMs = Infinity, engineMs = Infinity
  for (let round = 0; round < rounds; round++) {
    // 순서 편향을 줄이려고 라운드마다 순서를 바꾼다
    const order = round % 2 ? ['engine', 'showdown'] as const : ['showdown', 'engine'] as const
    for (const which of order) {
      const t0 = now()
      for (const r of recorded) {
        if (which === 'showdown') showdown(r.inputLog)
        else engineRun(r)
        tick('timing')
      }
      const ms = now() - t0
      if (which === 'showdown') showdownMs = Math.min(showdownMs, ms)
      else engineMs = Math.min(engineMs, ms)
    }
  }

  const battles: BattleResult[] = []
  for (let k = 0; k < n; k++) {
    const [showdownHash, engineHash] = await Promise.all([sha256Hex(logs.showdown[k]!), sha256Hex(logs.engine[k]!)])
    battles.push({
      seed: recorded[k]!.seed, turns: recorded[k]!.turns, showdownHash, engineHash,
      identical: logs.showdown[k] === logs.engine[k] && showdownHash === engineHash,
      lines: logs.engine[k]!.split('\n').length,
    })
  }
  const turns = recorded.reduce((s, r) => s + r.turns, 0)
  return { n, seedBase, rounds, turns, showdownMs, engineMs, battles, logs }
}
