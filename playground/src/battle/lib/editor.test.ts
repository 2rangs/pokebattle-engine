import { beforeAll, describe, expect, test } from 'vitest'
import {
  abilityOptions, evTotal, itemOptions, moveOptions, natureLabel, natureOptions, presetOf, PRESET_EVS, searchOptions,
  setEv, statsOf, teraOptions, validateSet, withMove, hasErrors,
} from './editor'
import type { PokemonSet } from './engine'
import { ready } from './setup.test-util'

beforeAll(ready)

const chomp = (o: Partial<PokemonSet> = {}): PokemonSet => ({
  species: 'garchomp', level: 50, gender: null, ability: 'rough-skin', nature: 'jolly', item: 'choice-scarf',
  moves: ['earthquake', 'dragon-claw', 'stone-edge', 'fire-fang'], evs: { ...PRESET_EVS.physical }, ...o,
} as PokemonSet)

describe('기술 목록 (getLearnset)', () => {
  test('종이 배울 수 있는 기술만, 타입·분류·위력과 함께', () => {
    const opts = moveOptions('garchomp', 'ko')
    const eq = opts.find(o => o.slug === 'earthquake')!
    expect(eq).toMatchObject({ label: '지진', type: 'ground', category: 'physical', power: 100 })
    expect(opts.some(o => o.slug === 'hydro-pump')).toBe(false)
    expect(moveOptions('rotom-wash', 'ko').some(o => o.slug === 'hydro-pump')).toBe(true)
  })
  test('검색: 한국어·영어, 빈 검색어는 전체', () => {
    const opts = moveOptions('garchomp', 'ko')
    expect(searchOptions(opts, '지진')[0]?.slug).toBe('earthquake')
    expect(searchOptions(opts, 'earthq')[0]?.slug).toBe('earthquake')
    expect(searchOptions(opts, 'stone edge')[0]?.slug).toBe('stone-edge')
    expect(searchOptions(opts, '', 1000)).toHaveLength(opts.length)
  })
})

describe('특성·도구·성격·테라', () => {
  test('숨겨진 특성 포함', () => {
    expect(abilityOptions('garchomp', 'ko')).toEqual([
      { slug: 'sand-veil', label: '모래숨기', hidden: false }, { slug: 'rough-skin', label: '까칠한피부', hidden: true },
    ])
  })
  test('도구: 한국어 이름 검색', () => {
    const items = itemOptions('ko')
    expect(searchOptions(items, '먹다')[0]?.slug).toBe('leftovers')
    expect(searchOptions(items, 'scarf')[0]?.slug).toBe('choice-scarf')
  })
  test('성격: 25개, 보정 표시', () => {
    const n = natureOptions('ko')
    expect(n).toHaveLength(25)
    expect(natureLabel(n.find(x => x.slug === 'adamant')!, 'ko')).toBe('고집 (공격↑ 특공↓)')
    expect(natureLabel(natureOptions('en').find(x => x.slug === 'jolly')!, 'en')).toBe('Jolly (Spe↑ SpA↓)')
    expect(natureLabel(n.find(x => x.slug === 'hardy')!, 'ko')).toBe('노력')
  })
  test('테라 타입 19개 (스텔라 포함)', () => {
    expect(teraOptions('ko')).toHaveLength(19)
    expect(teraOptions('ko').at(-1)).toEqual({ slug: 'stellar', label: '스텔라' })
  })
})

describe('노력치', () => {
  test('칸당 252, 합계 510', () => {
    expect(setEv({}, 'attack', 300).attack).toBe(252)
    const e = setEv({ attack: 252, speed: 252 }, 'hp', 100)
    expect(e.hp).toBe(6)
    expect(evTotal(e)).toBe(510)
    expect(setEv({}, 'hp', -5).hp).toBe(0)
  })
  test('프리셋 판별 · 실수치', () => {
    expect(presetOf(PRESET_EVS.special)).toBe('special')
    expect(presetOf({ hp: 1 })).toBe(null)
    expect(presetOf({})).toBe('none')
    // 한카리아스 Lv.50 명랑 252 스피드: 169
    expect(statsOf(chomp())?.speed).toBe(169)
  })
})

describe('검증', () => {
  test('정상 세트는 문제 없음', () => {
    expect(validateSet(chomp(), 'ko')).toEqual([])
  })
  test('기술 없음 · 중복 · 노력치 초과는 오류', () => {
    expect(hasErrors(validateSet(chomp({ moves: [''] as never }), 'ko'))).toBe(true)
    const dup = validateSet(chomp({ moves: ['earthquake', 'earthquake'] }), 'ko')
    expect(dup).toMatchObject([{ field: 'moves', level: 'error', key: 'issueDupMove', index: 1 }])
    expect(validateSet(chomp({ evs: { attack: 252, speed: 252, hp: 252 } }), 'ko').map(i => i.key)).toEqual(['issueEvTotal'])
  })
  test('배울 수 없는 기술 · 다른 종의 특성은 경고 (시작은 된다)', () => {
    const w = validateSet(chomp({ moves: ['earthquake', 'hydro-pump'], ability: 'levitate' }), 'ko')
    expect(w.map(i => [i.key, i.level])).toEqual([['issueCantLearn', 'warn'], ['issueAbility', 'warn']])
    expect(hasErrors(w)).toBe(false)
  })
  test('withMove: 바꾸기·지우기 (앞으로 당김)', () => {
    expect(withMove(chomp(), 1, 'outrage').moves).toEqual(['earthquake', 'outrage', 'stone-edge', 'fire-fang'])
    expect(withMove(chomp(), 1, null).moves).toEqual(['earthquake', 'stone-edge', 'fire-fang'])
    expect(withMove(chomp({ moves: ['earthquake'] }), 1, 'outrage').moves).toEqual(['earthquake', 'outrage'])
  })
})
