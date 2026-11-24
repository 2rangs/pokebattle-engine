// "이 세대 규칙" 요약이 엔진(Showdown) 데이터와 맞는지
import { beforeAll, describe, expect, test } from 'vitest'
import { getItem, getMove, getSpecies, getTypeChart, listItems, preloadData } from './engine'
import { ALL_GENS, genFacts, genInfo } from './genRules'

beforeAll(() => preloadData({ gens: [1, 2, 3, 4, 5, 6, 7, 8] }), 120_000)

describe('세대 규칙 = Showdown 데이터', () => {
  test.each(ALL_GENS)('%i세대: 타입 수·강철 내성', gen => {
    const chart = getTypeChart({ gen })
    expect(Object.keys(chart).filter(t => t !== 'stellar')).toHaveLength(genInfo(gen).typeCount)
    // 강철이 고스트·악을 반감하는 것은 5세대까지
    if (gen >= 2) expect(chart.ghost!.steel === 0.5).toBe(gen <= 5)
  })

  test.each(ALL_GENS)('%i세대: 물리/특수 (깨물어부수기·치기)', gen => {
    const crunch = getMove('crunch', { gen })
    if (gen >= 2) expect(crunch!.category).toBe(genInfo(gen).splitPerMove ? 'physical' : 'special')
    // 1세대: 물기는 노말 타입 물리
    if (gen === 1) expect(getMove('bite', { gen })).toMatchObject({ type: 'normal', category: 'physical' })
  })

  test.each(ALL_GENS)('%i세대: 특수 하나 · 특성 · 숨겨진 특성', gen => {
    const gengar = getSpecies('gengar', { gen })!
    expect(gengar.base_stats.special_attack === gengar.base_stats.special_defense).toBe(genInfo(gen).singleSpecial)
    const info = genInfo(gen).abilities
    expect(gengar.abilities.length > 0).toBe(info !== 'none')
    if (gen >= 3) expect(getSpecies('ninetales', { gen })!.abilities.some(a => a.hidden)).toBe(info === 'hidden')
  })

  test.each(ALL_GENS)('%i세대: 지닌 도구 · 기믹 도구', gen => {
    expect(listItems({ gen }).some(i => i.name === 'leftovers')).toBe(genInfo(gen).items)
    const g = genInfo(gen).gimmicks
    expect(listItems({ gen }).some(i => i.name === 'charizardite-x')).toBe(g.includes('mega'))
    expect(listItems({ gen }).some(i => i.name === 'firium-z')).toBe(g.includes('zmove'))
  })

  test.each(ALL_GENS)('%i세대: 날씨·필드 기술', gen => {
    const has = (m: string) => !!getMove(m, { gen })
    expect(has('rain-dance')).toBe(gen >= 2)
    expect(has('electric-terrain')).toBe(genInfo(gen).terrain)
    expect(has('snowscape')).toBe(gen === 9)
    expect(genFacts(gen).some(f => f.id === 'terrain')).toBe(genInfo(gen).terrain)
  })

  test('표: 값이 바로 보이지 않는 줄에만 설명', () => {
    const g3 = genFacts(3)
    expect(g3.find(f => f.id === 'split')!.hint).toBeTruthy()
    expect(genFacts(4).find(f => f.id === 'split')!.hint).toBeUndefined()
    expect(genFacts(1).find(f => f.id === 'stats')!.hint!.ko).toContain('특수 하나')
    expect(getItem('leftovers')).toBeTruthy()
  })
})
