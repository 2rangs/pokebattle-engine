import { beforeAll, describe, expect, test } from 'vitest'
import { activeTeam, moveUp, placeAt, randomTeam, searchSpecies, slotsFor, speciesOptions } from './team'
import { ready } from './setup.test-util'

beforeAll(ready)

describe('자리 수 = 마릿수', () => {
  const team = ['a', 'b', 'c', 'd']
  test.each([1, 3, 6])('%i마리 → 정확히 %i자리', n => {
    expect(slotsFor(team, n)).toHaveLength(n)
  })
  test('줄이면 앞에서부터 남고, 다시 늘리면 돌아온다', () => {
    expect(slotsFor(team, 1)).toEqual(['a'])
    expect(slotsFor(team, 3)).toEqual(['a', 'b', 'c'])
    expect(slotsFor(team, 6)).toEqual(['a', 'b', 'c', 'd', null, null])
    expect(activeTeam(team, 3)).toEqual(['a', 'b', 'c'])
  })
  test('placeAt: 빈 칸을 채우고 끝의 빈 칸은 자른다', () => {
    expect(placeAt([], 2, 'x')).toEqual([null, null, 'x'])
    expect(placeAt(['a', null, 'x'], 2, null)).toEqual(['a'])
    expect(activeTeam([null, 'b'], 3)).toEqual(['b'])
  })
  test('moveUp: 앞 자리와 맞바꾼다', () => {
    expect(moveUp(['a', 'b', 'c'], 2)).toEqual(['a', 'c', 'b'])
    expect(moveUp(['a', 'b'], 0)).toEqual(['a', 'b'])
  })
})

test('랜덤 팀은 마릿수만큼, 자동 닉네임 없이', () => {
  for (const n of [1, 3, 6]) {
    const t = randomTeam(7, n)
    expect(t).toHaveLength(n)
    expect(t.every(s => s.nickname === undefined && s.level === 50)).toBe(true)
  }
  expect(randomTeam(7, 3)).toEqual(randomTeam(7, 3))
})

test('종 검색: 한국어·영어·도감 번호', () => {
  const ko = speciesOptions('ko')
  expect(searchSpecies(ko, '한카')[0]?.slug).toBe('garchomp')
  expect(searchSpecies(ko, 'garch')[0]?.slug).toBe('garchomp')
  expect(searchSpecies(ko, '445')[0]?.slug).toBe('garchomp')
  // 폼은 엔진 이름 팩의 폼 이름 (PokeAPI)
  expect(ko.find(o => o.slug === 'rotom-wash')?.label).toBe('워시로토무')
  expect(ko.find(o => o.slug === 'ninetales-alola')?.label).toBe('나인테일 (알로라의 모습)')
  expect(speciesOptions('en').find(o => o.slug === 'rotom-wash')?.label).toBe('Rotom-Wash')
  const rotom = searchSpecies(ko, '로토무').map(o => o.label)
  expect(rotom).toContain('워시로토무')
  expect(rotom[0]).toBe('로토무')
  expect(rotom.every(l => !/[A-Za-z]/.test(l))).toBe(true)
  expect(ko.some(o => o.slug.includes('-mega'))).toBe(false)
})
