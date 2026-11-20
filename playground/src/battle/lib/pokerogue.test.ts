import { beforeAll, expect, test } from 'vitest'
import { listPokeApiSpecies } from './engine'
import { hasPokeRogueKey, pokeRogueAtlas, pokeRogueKey } from './pokerogue'
import { ready } from './setup.test-util'

beforeAll(ready)

test('종 → PokéRogue 키 (에셋 저장소 파일 목록에 있는 것)', () => {
  expect(pokeRogueKey('pikachu')).toBe('25')
  expect(pokeRogueKey('garchomp')).toBe('445')
  expect(pokeRogueKey('gholdengo')).toBe('1000')
  expect(pokeRogueKey('rotom-wash')).toBe('479-wash')
  expect(pokeRogueKey('charizard-mega-x')).toBe('6-mega-x')
  expect(pokeRogueKey('charizard-gmax')).toBe('6-gigantamax')
  expect(pokeRogueKey('ninetales-alola')).toBe('2038')
  expect(pokeRogueKey('darmanitan-galar-zen')).toBe('4555-zen')
  expect(pokeRogueKey('zoroark-hisui')).toBe('6571')
  expect(pokeRogueKey('tauros-paldea-aqua-breed')).toBe('8128-aqua')
  expect(pokeRogueKey('tauros-paldea-combat-breed')).toBe('8128')
  expect(pokeRogueKey('urshifu-rapid-strike')).toBe('892-rapid-strike')
  expect(pokeRogueKey('urshifu-single-strike')).toBe('892')
  expect(pokeRogueKey('ogerpon')).toBe('1017-teal-mask')
  expect(pokeRogueKey('ogerpon-wellspring-mask')).toBe('1017-wellspring-mask')
  expect(pokeRogueKey('arceus')).toBe('493-normal')
  expect(pokeRogueKey('unown')).toBe('201-a')
  expect(pokeRogueKey('vivillon-fancy')).toBe('666-fancy')
  expect(pokeRogueKey('necrozma-dusk')).toBe('800-dusk-mane')
  // 그림이 없는 폼은 기본형
  expect(pokeRogueKey('pikachu-hoenn-cap')).toBe('25')
  expect(pokeRogueKey('pumpkaboo-super')).toBe('710')
})

test('모든 종이 같은 번호의 아틀라스로 풀린다', () => {
  const misses: string[] = []
  for (const s of listPokeApiSpecies()) {
    const k = pokeRogueKey(s.slug)
    if (!k || !hasPokeRogueKey(k) || parseInt(k, 10) % 2000 !== s.num % 2000) misses.push(`${s.slug}→${k}`)
  }
  expect(misses).toEqual([])
})

test('URL: 뒷모습·암컷', () => {
  expect(pokeRogueAtlas('rotom-wash', true)?.json).toMatch(/pokerogue-assets\/beta\/images\/pokemon\/back\/479-wash\.json$/)
  expect(pokeRogueAtlas('garchomp', false, 'F')?.png).toMatch(/\/pokemon\/female\/445\.png$/)
  expect(pokeRogueAtlas('garchomp', true, 'F')?.png).toMatch(/\/pokemon\/back\/female\/445\.png$/)
  // 본 그림이 정지 한 장인 종은 exp/ 애니메이션
  expect(pokeRogueAtlas('dragapult', false, 'F')?.png).toMatch(/\/pokemon\/exp\/887\.png$/)
  expect(pokeRogueAtlas('dragapult', true)?.png).toMatch(/\/pokemon\/exp\/back\/887\.png$/)
  expect(pokeRogueAtlas('pikachu', false)?.png).toMatch(/\/pokemon\/25\.png$/)
})
