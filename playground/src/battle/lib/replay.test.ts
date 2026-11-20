import { expect, test } from 'vitest'
import type { Action } from './engine'
import { decodeAction, decodeReplay, encodeAction, encodeReplay, ReplayError, type ReplayData } from './replay'

test('행동 튜플: 원래 Action 객체로 정확히 돌아온다', () => {
  const cases: Action[] = [
    { type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 2 },
    { type: 'move', player: 'p2', pokemon_id: 'p2_5', move_index: 0, terastallize: true },
    { type: 'move', player: 'p1', pokemon_id: 'p1_1', move_index: -1 },
    { type: 'switch', player: 'p2', pokemon_id: 'p2_0', switch_to_id: 'p2_4' },
    { type: 'raw', player: 'p1', choice: 'move 1 terastallize, switch 3' },
    { type: 'team', player: 'p1', order: ['p1_2', 'p1_0', 'p1_1'] },
    { type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, terastallize: false },
  ]
  for (const a of cases) expect(decodeAction(JSON.parse(JSON.stringify(encodeAction(a))))).toEqual(a)
  expect(encodeAction(cases[0]!)).toEqual([0, 1, 0, 2, 0])
  expect(encodeAction(cases[3]!)).toEqual([1, 2, 0, 4])
  expect(encodeAction(cases[6]!)[0]).toBe(9)
})

const base: ReplayData = {
  v: 1, rule: 'normal', seed: 7, format: 'singles',
  p1: { team: 'Pikachu\n- Thunderbolt', ctrl: 'human' },
  p2: { team: 'Eevee\n- Tackle', ctrl: 'easy' },
  actions: [{ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 }],
}

test('일반·손가락흔들기·기권 왕복', async () => {
  expect(await decodeReplay(await encodeReplay(base))).toEqual(base)
  const m: ReplayData = {
    ...base, rule: 'metronome', p1: { team: '', ctrl: 'human' }, p2: { team: '', ctrl: 'normal' },
    metronome: { teamSize: 3, level: 100, stats: { hp: 999 }, p1Team: ['pikachu'], p2Team: 'random' },
    forfeit: 'p1',
  }
  expect(await decodeReplay(await encodeReplay(m))).toEqual(m)
})

test('손상된 문자열 → corrupt, 다른 버전 → version', async () => {
  const s = await encodeReplay(base)
  for (const b of ['', 'not a replay!', s.slice(0, Math.floor(s.length / 2)), 'AAAA']) {
    await expect(decodeReplay(b)).rejects.toSatisfy(e => e instanceof ReplayError && e.code === 'corrupt')
  }
  const bad = await encodeReplay({ ...base, rule: 'metronome', metronome: { teamSize: 9 } } as unknown as ReplayData)
  await expect(decodeReplay(bad)).rejects.toSatisfy(e => e instanceof ReplayError && e.code === 'corrupt')
  const v2 = await encodeReplay({ ...base, v: 2 } as unknown as ReplayData)
  await expect(decodeReplay(v2)).rejects.toSatisfy(e => e instanceof ReplayError && e.code === 'version')
})
