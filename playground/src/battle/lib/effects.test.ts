import { expect, test } from 'vitest'
import { effectKeys, sceneEffects } from './effects'
import type { Frame, SideView } from './frame'

const side = (id: 'p1' | 'p2', conds: [string, number?][]): SideView =>
  ({ id, conditions: conds.map(([c, layers = 1]) => ({ id: c, layers, turns: null })) }) as unknown as SideView

const frame = (over: Partial<Frame>): Pick<Frame, 'weather' | 'terrain' | 'field' | 'p1' | 'p2'> => ({
  weather: null, terrain: null, field: [], p1: side('p1', []), p2: side('p2', []), ...over,
})

test('날씨·필드·필드 전체', () => {
  const fx = sceneEffects(frame({ weather: 'heavy_rain', terrain: 'psychic', field: [{ id: 'trick_room', turns: 3 }, { id: 'mud_sport', turns: 2 }] }))
  expect(fx.weather).toBe('heavy_rain')
  expect(fx.terrain).toBe('psychic')
  expect(fx.field).toEqual(['trick_room'])
  expect(sceneEffects(frame({ weather: 'hail' })).weather).toBe('snow')
  expect(sceneEffects(frame({ weather: 'electric-terrain' as never })).weather).toBeNull()
  expect(sceneEffects(frame({ terrain: 'electric_terrain' })).terrain).toBe('electric')
})

test('진영: 우리 = 아래, 겹 수는 최대치까지', () => {
  const f = frame({
    p1: side('p1', [['reflect'], ['spikes', 5], ['tailwind'], ['wish']]),
    p2: side('p2', [['stealth_rock'], ['toxic_spikes', 2], ['sticky_web'], ['aurora_veil'], ['mist']]),
  })
  const fx = sceneEffects(f)
  expect(fx.sides.ours).toEqual({ hazards: [{ id: 'spikes', layers: 3 }], barriers: ['reflect'], tailwind: true, protect: false })
  expect(fx.sides.foe.hazards.map(h => h.id)).toEqual(['stealth_rock', 'toxic_spikes', 'sticky_web'])
  expect(fx.sides.foe.barriers).toEqual(['aurora_veil', 'mist'])
  // p2 시점이면 위아래가 바뀐다
  expect(sceneEffects(f, 'p2').sides.ours.hazards[0]!.id).toBe('stealth_rock')
  expect(effectKeys(fx)).toContain('ours:spikes:3')
})

test('방어: 나와 있는 포켓몬의 protect 휘발 상태', () => {
  const p1 = { ...side('p1', []), active: { volatiles: ['protect'] } } as unknown as SideView
  const fx = sceneEffects(frame({ p1 }))
  expect(fx.sides.ours.protect).toBe(true)
  expect(fx.sides.foe.protect).toBe(false)
  expect(effectKeys(fx)).toContain('ours:protect')
})
