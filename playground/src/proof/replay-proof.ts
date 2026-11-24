// ─── "같은 시드 + 같은 행동 → 같은 배틀" 을 눈앞에서 ─────────────
// 배틀 데모와 같은 코드로 CPU 대 CPU 한 판을 돌리고 → 리플레이 링크로 만들고 → 링크만 가지고 새 엔진에서 다시 돌린다.
// 두 프로토콜 로그의 SHA-256 이 같으면 링크 하나로 같은 배틀이 재현된 것. AI 는 다시 돌리지 않는다 (링크의 행동만).
import { comparableLog } from '../../../dist/index.js'
import type { Action, PlayerID } from '../battle/lib/engine'
import { buildReplayData, controllerAI, createEngine, replaySetup, type BattleSetup, type Controllers } from '../battle/lib/frames'
import { decodeReplay, encodeReplay } from '../battle/lib/replay'
import { randomTeam } from '../battle/lib/team'
import { sha256Hex } from './compare'

/**
 * 비교할 로그: |debug| 줄은 뺀다. CPU(AI)가 행동을 고르면서 미리 계산해 보는 동안 원래 배틀에만
 * |debug| 줄이 덧붙는데(예: "natural status immunity"), 링크로 다시 돌릴 때는 AI 를 돌리지 않으니 없다.
 * Showdown 도 디버그 모드가 아니면 이 줄을 내보내지 않는다. 그 밖의 모든 줄은 바이트 단위로 비교한다.
 */
export function withoutDebug(log: string): { text: string; debug: number } {
  const lines = log.split('\n')
  const kept = lines.filter(l => !l.startsWith('|debug|'))
  return { text: kept.join('\n'), debug: lines.length - kept.length }
}

export interface ReplayProof {
  seed: number
  actions: number
  turns: number
  winner: string | null
  /** 리플레이 링크의 d= 값 */
  link: string
  original: { hash: string; lines: number; debug: number }
  replayed: { hash: string; lines: number; applied: number }
  identical: boolean
}

export async function proveReplay(seed: number, teamSize = 3): Promise<ReplayProof> {
  const setup: BattleSetup = { rule: 'normal', seed, p1Team: randomTeam(seed * 3 + 1, teamSize), p2Team: randomTeam(seed * 3 + 2, teamSize) }
  const ctrl: Controllers = { p1: 'normal', p2: 'hard' }

  // 1. 원래 배틀 (AI 가 고른 행동을 기록)
  const live = createEngine(setup, ctrl)
  live.start()
  const ais = { p1: controllerAI('normal', 'normal', seed, 'p1'), p2: controllerAI('normal', 'hard', seed, 'p2') }
  const actions: Action[] = []
  for (let n = 0; live.getState().phase !== 'ended' && n < 1000; n++) {
    for (const p of ['p1', 'p2'] as PlayerID[]) {
      if (!live.getRequest(p)) continue
      const a = ais[p].chooseAction(live, p) ?? live.getAvailableActions(p)[0]!
      live.submitAction(a)
      actions.push(a)
    }
  }
  const originalLog = withoutDebug(comparableLog(live.battle))

  // 2. 링크로 (시드 + 두 팀의 Showdown 텍스트 + 행동 → deflate → base64url)
  const link = await encodeReplay(buildReplayData(setup, ctrl, actions))

  // 3. 링크만으로 다시: 새 엔진, 기록한 행동을 순서대로
  const data = await decodeReplay(link)
  const again = createEngine(replaySetup(data), { p1: data.p1.ctrl, p2: data.p2.ctrl })
  again.start()
  let applied = 0
  for (const a of data.actions) { again.submitAction(a); applied++ }
  const replayedLog = withoutDebug(comparableLog(again.battle))

  const [h1, h2] = await Promise.all([sha256Hex(originalLog.text), sha256Hex(replayedLog.text)])
  return {
    seed, actions: actions.length, turns: live.getState().turn, winner: live.getState().winner ?? null, link,
    original: { hash: h1, lines: originalLog.text.split('\n').length, debug: originalLog.debug },
    replayed: { hash: h2, lines: replayedLog.text.split('\n').length, applied },
    identical: originalLog.text === replayedLog.text && h1 === h2,
  }
}
