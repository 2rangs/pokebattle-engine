import { beforeAll, expect, test } from 'vitest'
import { battleSprite3dCandidates, battleSpriteCandidates, moveFx, spriteIdsOf } from './sprites'
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

test('2D 후보: 5세대 도트 애니메이션 → 정지 도트 → 일러스트', () => {
  const c = battleSpriteCandidates('rotom-wash', true)
  expect(c[0]).toMatch(/generation-v\/black-white\/animated\/back\/10009\.gif$/)
  expect(c[1]).toMatch(/generation-v\/black-white\/animated\/back\/479\.gif$/)
  expect(c[2]).toMatch(/pokemon\/back\/10009\.png$/)
  expect(c.at(-1)).toMatch(/official-artwork\/10009\.png$/)
})

test('3D 후보: 3D 모델 애니메이션 → HOME 렌더 → 2D', () => {
  const c = battleSprite3dCandidates('rotom-wash', true)
  expect(c[0]).toMatch(/other\/showdown\/back\/10009\.gif$/)
  expect(c[2]).toMatch(/other\/home\/10009\.png$/)
  expect(c).toContain(battleSpriteCandidates('rotom-wash', true)[0])
})

test('기술 연출: 접촉은 충격, 원거리는 타입 탄, 변화는 없음', () => {
  expect(moveFx({ type: 'fire', category: 'special' })).toEqual({ projectile: 'fireball', impact: 'fireball' })
  expect(moveFx({ type: 'fire', category: 'physical', flags: ['contact'] })).toEqual({ projectile: null, impact: 'impact' })
  expect(moveFx({ type: 'normal', category: 'status' })).toBeNull()
})

test('배틀 중 폼체인지 모습은 기본 모습 그림으로 떨어지지 않는다 (2D 아틀라스 키)', async () => {
  const { Dex } = await import('@pkmn/sim')
  const { speciesSlug } = await import('./engine')
  const { pokeRogueKey } = await import('./pokerogue')
  const forms = Dex.species.all().filter(s => s.exists && s.num > 0 && s.forme && !/Gmax|Totem/.test(s.forme)
    && (s.battleOnly || s.isMega || s.isPrimal || /Mega|Primal|Ultra|Zen|Blade|Busted|School|Hero|Hangry|Gulping|Gorging|Noice|Pirouette|Sunshine|Meteor|Complete|Terastal|Stellar|Crowned|Eternamax/.test(s.forme)))
  expect(forms.length).toBeGreaterThan(100)
  const bad = forms
    .map(s => [speciesSlug(s.id), speciesSlug(Dex.species.get(s.baseSpecies).id)] as const)
    .filter(([f, b]) => !pokeRogueKey(f) || pokeRogueKey(f) === pokeRogueKey(b))
  expect(bad).toEqual([])
})
