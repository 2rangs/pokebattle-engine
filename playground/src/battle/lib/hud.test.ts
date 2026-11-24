import { beforeAll, expect, test } from 'vitest'
import type { BattleEvent } from './engine'
import { calledMoveIndexes, effectivenessLabel, fieldItems, groupLogByTurn, hpTone, koLabel, lastCalledMoves, messageFrameIndex, pctOf, stageMultiplier , hasEntered } from './hud'
import { statusShort } from './names'
import { ready } from './setup.test-util'

beforeAll(ready)

test('HP: 반올림 규칙과 게임 색', () => {
  expect(pctOf({ hp: 399, max_hp: 400 })).toBe(99)
  expect(pctOf({ hp: 1, max_hp: 400 })).toBe(1)
  expect(pctOf({ hp: 0, max_hp: 400 })).toBe(0)
  expect(hpTone(0.51)).toBe('green')
  expect(hpTone(0.5)).toBe('yellow')
  expect(hpTone(0.2)).toBe('red')
})

test('라벨', () => {
  expect(koLabel({ koChance: 1, koHits: 2 }, 'ko')).toBe('확정 2타')
  expect(koLabel({ koChance: 0.375, koHits: 1 }, 'en')).toBe('38% to OHKO')
  expect(koLabel({ koChance: 0, koHits: 0 }, 'ko')).toBeNull()
  expect(effectivenessLabel(4, 'ko')).toBe('효과 굉장 ×4')
  expect(effectivenessLabel(1, 'ko')).toBeNull()
  expect(stageMultiplier('attack', 1)).toBe('×1.5')
  expect(stageMultiplier('accuracy', -1)).toBe('×0.75')
  expect(statusShort('paralysis', 'ko')).toBe('마비')
  expect(statusShort('toxic', 'en')).toBe('TOX')
})

const mv = (name: string, type = 'normal') => ({ name, type }) as never
const fr = (index: number, event: BattleEvent, silent = false) => ({ index, event, silent, turn: 1 })

test('손가락흔들기로 불려 나온 기술을 찾는다', () => {
  const frames = [
    fr(0, { type: 'turn_start', turn: 1 }),
    fr(1, { type: 'move_use', pokemon_id: 'p2_0', move: mv('metronome'), target_id: 'p2_0' }),
    fr(2, { type: 'move_use', pokemon_id: 'p2_0', move: mv('power-whip', 'grass'), target_id: 'p1_0' }),
    fr(3, { type: 'move_use', pokemon_id: 'p1_0', move: mv('metronome'), target_id: 'p1_0' }),
    fr(4, { type: 'turn_end', turn: 1 } as BattleEvent, true),
    fr(5, { type: 'move_use', pokemon_id: 'p1_0', move: mv('tackle'), target_id: 'p2_0' }),
  ]
  expect([...calledMoveIndexes(frames)]).toEqual([2, 5])
  expect(lastCalledMoves(frames, 3).get('p2_0')).toEqual({ move: 'power-whip', type: 'grass', turnIndex: 2 })
  expect(messageFrameIndex(frames, 5)).toBe(3)
  expect(groupLogByTurn(frames)[0]!.items).toHaveLength(5)
})

test('필드 줄 순서: 날씨 → 필드 → 상대 → 우리', () => {
  const side = (id: 'p1' | 'p2', c: string) => ({ id, conditions: [{ id: c, layers: 1, turns: 3 }] }) as never
  const items = fieldItems({ weather: 'rain', weatherTurns: 4, terrain: null, terrainTurns: null, field: [], p1: side('p1', 'reflect'), p2: side('p2', 'spikes') })
  expect(items.map(i => i.id)).toEqual(['rain', 'spikes', 'reflect'])
})

test('hasEntered: "내보냈다" 프레임부터 보인다', () => {
  const ev = (type: string, in_id?: string) => ({ event: { type, in_id } })
  const frames = [ev('battle_start'), ev('switch', 'p1_0'), ev('switch', 'p2_0'), ev('turn_start'), ev('faint'), ev('switch', 'p2_1')]
  expect(hasEntered(frames, 0, 'p1_0')).toBe(false)
  expect(hasEntered(frames, 1, 'p1_0')).toBe(true)
  expect(hasEntered(frames, 1, 'p2_0')).toBe(false)
  expect(hasEntered(frames, 2, 'p2_0')).toBe(true)
  expect(hasEntered(frames, 4, 'p2_1')).toBe(false)
  expect(hasEntered(frames, 5, 'p2_1')).toBe(true)
  expect(hasEntered([ev('turn_start')], 0, 'p1_0')).toBe(true)
})
