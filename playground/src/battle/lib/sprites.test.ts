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

test('3D: 폼 그림을 모든 출처에서 먼저 찾고 기본 모습은 그 뒤 (새 메가진화)', async () => {
  const { psSpriteId } = await import('./sprites')
  expect(psSpriteId('lucario-mega-z')).toBe('lucario-megaz')
  expect(psSpriteId('charizard-mega-x')).toBe('charizard-megax')
  expect(psSpriteId('barbaracle-mega')).toBe('barbaracle-mega')
  expect(psSpriteId('lucario')).toBeNull()
  expect(psSpriteId('porygon-z')).toBeNull()
  expect(psSpriteId('ho-oh')).toBeNull()
  const c = battleSprite3dCandidates('lucario-mega-z', false)
  // 메가 모습: Showdown 3D → 챔피언스·레전즈 Z-A 모델 애니메이션 → HOME, 기본 모습(448)은 그 다음
  expect(c.slice(0, 5)).toEqual([
    expect.stringContaining('/other/showdown/10310.gif'),
    'https://play.pokemonshowdown.com/sprites/ani/lucario-megaz.gif',
    expect.stringContaining('/generation-ix/champions/10310.webp'),
    expect.stringContaining('/generation-ix/legends-za/10310.webp'),
    expect.stringContaining('/other/home/10310.png'),
  ])
  expect(c.findIndex(u => /\/448\.(gif|png)$/.test(u))).toBe(5)
  // 뒷모습은 진짜 뒷모습 파일, 이로치는 shiny/ 먼저
  expect(battleSprite3dCandidates('lucario-mega-z', true)[2]).toContain('/generation-ix/champions/back/10310.webp')
  expect(battleSprite3dCandidates('lucario-mega-z', true, true)[2]).toContain('/generation-ix/champions/back/shiny/10310.webp')
  // 메가가 아니면 모델 애니메이션(무거움)은 넣지 않는다
  expect(battleSprite3dCandidates('lucario', false).some(u => u.includes('generation-ix'))).toBe(false)
})
