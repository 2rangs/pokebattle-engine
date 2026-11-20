import { beforeAll, expect, test } from 'vitest'
import { battleSpriteCandidates, moveFx, spriteIdsOf } from './sprites'
import { ready } from './setup.test-util'

beforeAll(ready)

test('폼 → PokeAPI 폼 id (curl 로 200 확인한 것들)', () => {
  expect(spriteIdsOf('garchomp')).toEqual({ form: 445, num: 445 })
  expect(spriteIdsOf('rotom-wash')).toEqual({ form: 10009, num: 479 })
  expect(spriteIdsOf('charizard-mega-x')).toEqual({ form: 10034, num: 6 })
  expect(spriteIdsOf('minior-yellow')).toEqual({ form: 10138, num: 774 })
  // 엔진 대표 슬러그 / 외형만 다른 폼은 기본형으로
  expect(spriteIdsOf('minior')?.num).toBe(774)
  expect(spriteIdsOf('toxtricity')).toEqual({ form: 849, num: 849 })
  expect(spriteIdsOf('vivillon-fancy')).toEqual({ form: 666, num: 666 })
  expect(spriteIdsOf('ogerpon-wellspring')).toEqual({ form: 10273, num: 1017 })
})

test('스프라이트 후보: 애니메이션 gif 먼저, 정지 도트·일러스트로 내려간다', () => {
  const c = battleSpriteCandidates('rotom-wash', true)
  expect(c[0]).toMatch(/other\/showdown\/back\/10009\.gif$/)
  expect(c[1]).toMatch(/other\/showdown\/back\/479\.gif$/)
  expect(c.at(-1)).toMatch(/official-artwork\/10009\.png$/)
})

test('기술 연출: 접촉은 충격, 원거리는 타입 탄, 변화는 없음', () => {
  expect(moveFx({ type: 'fire', category: 'special' })).toEqual({ projectile: 'fireball', impact: 'fireball' })
  expect(moveFx({ type: 'fire', category: 'physical', flags: ['contact'] })).toEqual({ projectile: null, impact: 'impact' })
  expect(moveFx({ type: 'normal', category: 'status' })).toBeNull()
})
