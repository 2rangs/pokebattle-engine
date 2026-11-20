import { beforeAll, expect, test } from 'vitest'
import type { Action, PlayerID } from './engine'
import type { Frame } from './frame'
import { decodeReplay, encodeReplay, type MetronomeSetup, type ReplayController } from './replay'
import { attachFrameCapture, buildReplayData, controllerAI, createEngine, simulateReplay, type BattleSetup, type Controllers } from './frames'
import { calledMoveIndexes } from './hud'
import { randomTeam } from './team'
import { ready } from './setup.test-util'

beforeAll(ready)

type Cpu = Exclude<ReplayController, 'human'>

/** 세션과 같은 방식으로 한 판: 프레임 캡처 + CPU 행동 기록 */
function liveBattle(setup: BattleSetup, ctrl: { p1: Cpu; p2: Cpu }, forfeitAfterTurn?: { turn: number; player: PlayerID }) {
  const e = createEngine(setup, ctrl)
  const frames: Frame[] = []
  attachFrameCapture(e, f => frames.push({ ...f, index: frames.length }))
  e.start()
  const ais = { p1: controllerAI(setup.rule, ctrl.p1, setup.seed, 'p1'), p2: controllerAI(setup.rule, ctrl.p2, setup.seed, 'p2') }
  const actions: Action[] = []
  let forfeit: PlayerID | undefined
  for (let n = 0; e.getState().phase !== 'ended' && n < 800; n++) {
    if (forfeitAfterTurn && e.getState().turn >= forfeitAfterTurn.turn) {
      e.forfeit(forfeitAfterTurn.player)
      forfeit = forfeitAfterTurn.player
      break
    }
    for (const p of ['p1', 'p2'] as PlayerID[]) {
      if (!e.getRequest(p)) continue
      const a = ais[p].chooseAction(e, p) ?? e.getAvailableActions(p)[0]!
      e.submitAction(a)
      actions.push(a)
    }
  }
  return { frames, actions, winner: e.getState().winner, forfeit }
}

async function roundTrip(setup: BattleSetup, ctrl: Controllers & { p1: Cpu; p2: Cpu }, forfeitAt?: { turn: number; player: PlayerID }) {
  const live = liveBattle(setup, ctrl, forfeitAt)
  expect(live.winner).not.toBeNull()
  const data = buildReplayData(setup, ctrl, live.actions, live.forfeit)
  const encoded = await encodeReplay(data)
  const replay = simulateReplay(await decodeReplay(encoded))
  expect(replay.error).toBeUndefined()
  expect(replay.applied).toBe(live.actions.length)
  expect(replay.winner).toBe(live.winner)
  expect(replay.frames).toEqual(live.frames)
  return { live, replay, encoded }
}

test.each([
  [101, 'hard', 'normal', 6],
  [202, 'normal', 'easy', 3],
  [303, 'easy', 'hard', 1],
] as const)('일반 배틀: 기록 → 링크 → 재현이 같은 프레임 (seed %i)', async (seed, c1, c2, size) => {
  const setup: BattleSetup = { rule: 'normal', seed, p1Team: randomTeam(seed * 3 + 1, size), p2Team: randomTeam(seed * 3 + 2, size) }
  const { encoded } = await roundTrip(setup, { p1: c1, p2: c2 })
  expect(encoded.length).toBeLessThan(3000)
})

const metro = (p: Partial<MetronomeSetup> = {}): MetronomeSetup => ({ teamSize: 3, level: 100, p1Team: 'random', p2Team: 'random', ...p })

test.each([
  [11, metro()],
  [22, metro({ teamSize: 1, level: 50, stats: { hp: 999, speed: 1 } })],
  [33, metro({ teamSize: 6, p1Team: ['pikachu', 'snorlax', 'garchomp', 'rotom-wash', 'mew', 'ditto'], p2Team: 'random' })],
])('손가락흔들기: 옵션 + 시드 + 행동으로 같은 배틀 (seed %i)', async (seed, m) => {
  const { live, encoded } = await roundTrip({ rule: 'metronome', seed, metronome: m }, { p1: 'normal', p2: 'normal' })
  // 기술은 손가락흔들기 하나, 불려 나온 기술이 로그에 있다
  const uses = live.frames.filter(f => f.event.type === 'move_use')
  expect(uses.length).toBeGreaterThan(0)
  expect(calledMoveIndexes(live.frames).size).toBeGreaterThan(0)
  expect(live.frames[0]!.p1.team.every(p => p.moves.length === 1 && p.moves[0]!.id === 'metronome')).toBe(true)
  expect(live.frames[0]!.p1.team).toHaveLength(m.p1Team === 'random' ? m.teamSize : m.p1Team.length)
  expect(encoded.length).toBeLessThan(2000)
})

test('손가락흔들기 능력치 덮어쓰기가 엔진에 들어간다', () => {
  const live = liveBattle({ rule: 'metronome', seed: 5, metronome: metro({ teamSize: 1, stats: { hp: 1234 } }) }, { p1: 'normal', p2: 'normal' })
  expect(live.frames[0]!.p1.active.max_hp).toBe(1234)
  expect(live.frames[0]!.p2.active.max_hp).toBe(1234)
})

test('기권도 리플레이에 남는다', async () => {
  const setup: BattleSetup = { rule: 'normal', seed: 77, p1Team: randomTeam(1, 3), p2Team: randomTeam(2, 3) }
  const { replay } = await roundTrip(setup, { p1: 'normal', p2: 'normal' }, { turn: 3, player: 'p1' })
  expect(replay.winner).toBe('p2')
  expect(replay.frames.at(-1)!.event.type).toBe('battle_end')
})

test('행동이 어긋나면 그 지점에서 멈추고 mismatch', () => {
  const setup: BattleSetup = { rule: 'normal', seed: 404, p1Team: randomTeam(4, 3), p2Team: randomTeam(5, 3) }
  const live = liveBattle(setup, { p1: 'normal', p2: 'normal' })
  const data = buildReplayData(setup, { p1: 'normal', p2: 'normal' }, live.actions)
  const broken = { ...data, actions: [data.actions[0]!, ...data.actions] }
  const r = simulateReplay(broken)
  expect(r.error).toBe('mismatch')
  expect(r.frames.length).toBeLessThan(live.frames.length)
  expect(simulateReplay({ ...data, actions: [...data.actions, data.actions.at(-1)!] }).error).toBe('mismatch')
})
