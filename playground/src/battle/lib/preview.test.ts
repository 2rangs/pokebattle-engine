import { beforeAll, expect, test } from 'vitest'
import { createEngine } from './frames'
import { metronomePreview } from './preview'
import { ready } from './setup.test-util'

beforeAll(ready)

test('미리보기 팀 = 같은 시드로 시작한 배틀의 팀', () => {
  const m = { teamSize: 3, level: 100, p1Team: 'random' as const, p2Team: 'random' as const }
  const pre = metronomePreview(1234, m)
  const e = createEngine({ rule: 'metronome', seed: 1234, metronome: m }, { p1: 'normal', p2: 'hard' })
  e.start()
  for (const p of ['p1', 'p2'] as const) {
    expect(pre[p].map(x => x.species)).toEqual(e.getState().sides[p].team.map(x => x.species))
    expect(pre[p].map(x => x.ability)).toEqual(e.getState().sides[p].team.map(x => x.ability))
  }
  expect(pre.p2).toHaveLength(3)
  // 한쪽을 직접 골라도 다른 쪽 랜덤 팀은 그대로
  const picked = metronomePreview(1234, { ...m, p1Team: ['pikachu', 'snorlax', 'eevee'] })
  expect(picked.p2.map(x => x.species)).toEqual(pre.p2.map(x => x.species))
  expect(picked.p1.map(x => x.species)).toEqual(['pikachu', 'snorlax', 'eevee'])
  // 다 차지 않은 고른 팀(null)도 미리보기는 된다
  expect(metronomePreview(1234, { ...m, p1Team: null }).p2.map(x => x.species)).toEqual(pre.p2.map(x => x.species))
})
