// 세대(규칙)별 팀 빌더·기믹 프레임·리플레이
import { beforeAll, describe, expect, test } from 'vitest'
import { parseShowdownTeam, preloadData, type Action, type PlayerID } from './engine'
import { itemOptionsFor, moveOptions, validateSet } from './editor'
import { gimmickItemsFor, gmaxForm, speciesInGen, spriteSpeciesOf } from './gimmick'
import { randomTeam, speciesOptions, suggestedSet } from './team'
import { buildReplayData, simulateReplay, type BattleSetup } from './frames'
import { decodeReplay, encodeReplay } from './replay'
import { pokeRogueKey } from './pokerogue'
import { spriteIdsOf } from './sprites'

beforeAll(() => preloadData({ gens: [8, 7, 6] }), 60_000)

describe('세대별 도감·도구', () => {
  test('그 세대에 없는 종은 고를 수 없다', () => {
    expect(speciesInGen('dragapult', 7)).toBe(false)
    expect(speciesInGen('dragapult', 8)).toBe(true)
    expect(speciesInGen('meltan', 7)).toBe(true)
    expect(speciesInGen('sprigatito', 8)).toBe(false)
    expect(speciesInGen('sprigatito', 9)).toBe(true)
    const g6 = speciesOptions('ko', 6).map(o => o.slug)
    expect(g6).toContain('charizard')
    expect(g6).not.toContain('rowlet')
    expect(speciesOptions('ko', 7).map(o => o.slug)).toContain('rowlet')
  })

  test('세트 검증: 종·도구가 그 세대에 있는지', () => {
    const base = { species: 'sprigatito', level: 50, gender: null, ability: 'overgrow', nature: 'hardy', moves: ['scratch'] } as never
    expect(validateSet(base, 'ko', 7).map(i => i.key)).toContain('issueSpeciesGen')
    const boots = { species: 'charizard', level: 50, gender: null, ability: 'blaze', nature: 'hardy', item: 'heavy-duty-boots', moves: ['flamethrower'] } as never
    expect(validateSet(boots, 'en', 7).map(i => i.key)).toContain('issueItemGen')
    expect(validateSet(boots, 'en', 8).map(i => i.key)).not.toContain('issueItemGen')
  })

  test('기술 목록은 그 세대 기술표', () => {
    const g6 = moveOptions('charizard', 'en', 6).map(m => m.slug)
    const g9 = moveOptions('charizard', 'en', 9).map(m => m.slug)
    expect(g6).not.toContain('scorching-sands')
    expect(g9).toContain('scorching-sands')
  })

  test('메가스톤·Z크리스탈은 그 포켓몬 것이 목록 맨 위', () => {
    expect(gimmickItemsFor('charizard', [], 7).slice(0, 2).sort()).toEqual(['charizardite-x', 'charizardite-y'])
    expect(gimmickItemsFor('pikachu', ['electric'], 7)).toEqual(expect.arrayContaining(['pikanium-z', 'pikashunium-z', 'electrium-z']))
    expect(gimmickItemsFor('kyogre', [], 6)).toEqual(['blue-orb'])
    expect(gimmickItemsFor('charizard', [], 8)).toEqual([])
    const set = { species: 'charizard', level: 50, gender: null, ability: 'blaze', nature: 'hardy', moves: ['flamethrower'] } as never
    const opts = itemOptionsFor(set, 'ko', 7)
    expect(opts[0]!.gimmick).toBe(true)
    expect(opts.slice(0, 2).map(o => o.slug).sort()).toEqual(['charizardite-x', 'charizardite-y'])
  })
})

describe('세대별 랜덤 팀·추천 세트', () => {
  test('7세대 랜덤 팀에는 메가스톤·Z크리스탈, 테라 타입은 없다', () => {
    const sets = [1, 2, 3, 4, 5, 6, 7, 8].flatMap(seed => randomTeam(seed, 6, 50, 7))
    expect(sets.some(s => s.item && /ite(-[xy])?$|ium-z$/.test(s.item))).toBe(true)
    expect(sets.every(s => s.teraType === undefined)).toBe(true)
    expect(sets.every(s => speciesInGen(s.species, 7))).toBe(true)
  })

  test('8세대 랜덤 팀에는 거다이맥스 세트가 있다', () => {
    const sets = Array.from({ length: 30 }, (_, i) => randomTeam(i + 1, 6, 50, 8)).flat()
    const g = sets.find(s => s.gigantamax)
    expect(g).toBeTruthy()
    expect(gmaxForm(g!.species)).toBeTruthy()
  })

  test('추천 세트: 6·7세대는 메가스톤, 8세대는 거다이맥스, 9세대는 테라 타입', () => {
    expect(suggestedSet('charizard', 1, 50, 7).item).toMatch(/^charizardite-[xy]$/)
    expect(suggestedSet('kyogre', 1, 50, 6).item).toBe('blue-orb')
    expect(suggestedSet('charizard', 1, 50, 8)).toMatchObject({ gigantamax: true })
    expect(suggestedSet('charizard', 1, 50, 8).teraType).toBeUndefined()
    expect(suggestedSet('charizard', 1, 50, 9).teraType).toBeTruthy()
  })
})

describe('기믹 모습 (스프라이트 키)', () => {
  test('메가·원시·거다이맥스 폼의 2D 키와 3D id', () => {
    expect(pokeRogueKey('charizard-mega-x')).toBe('6-mega-x')
    expect(pokeRogueKey('kyogre-primal')).toBe('382-primal')
    expect(pokeRogueKey(spriteSpeciesOf({ species: 'charizard', gmax: true }))).toBe('6-gigantamax')
    expect(spriteIdsOf('charizard-mega-x')?.form).toBe(10034)
    expect(spriteIdsOf('charizard-gmax')?.form).toBeGreaterThan(10000)
  })
})

// ─── 프레임 ─────────────────────────────────────────────────
const FOE = 'Blissey\nLevel: 100\nAbility: Natural Cure\nEVs: 252 HP / 252 Def\n- Soft-Boiled'
function play(gen: 6 | 7 | 8, team: string, flags: Partial<Record<'mega' | 'zmove' | 'dynamax' | 'ultra_burst', boolean>>, turns = 1) {
  const setup: BattleSetup = { rule: 'normal', seed: 3, gen, p1Team: parseShowdownTeam(team), p2Team: parseShowdownTeam(FOE) }
  const actions: Action[] = []
  for (let t = 0; t < turns; t++) {
    actions.push({ type: 'move', player: 'p1' as PlayerID, pokemon_id: 'p1_0', move_index: 0, ...(t === 0 ? flags : {}) })
    actions.push({ type: 'move', player: 'p2' as PlayerID, pokemon_id: 'p2_0', move_index: 0 })
  }
  const data = buildReplayData(setup, { p1: 'human', p2: 'normal' }, actions)
  return { data, sim: simulateReplay(data) }
}

describe('기믹 프레임', () => {
  test('메가진화: 반응 문장까지는 원래 모습, 변신 문장에서 메가 폼·타입', () => {
    const { sim } = play(7, 'Charizard @ Charizardite X\nAbility: Blaze\n- Dragon Claw', { mega: true })
    expect(sim.error).toBeUndefined()
    const fc = sim.frames.find(f => f.event.type === 'forme_change')!
    const [a, b] = sim.frames.filter(f => f.event.type === 'mega_evolve')
    expect(fc.p1.active.species).toBe('charizard')
    expect(a!.part).toBe(0)
    expect(a!.p1.active.species).toBe('charizard')
    expect(a!.p1.active.types).toEqual(['fire', 'flying'])
    expect(b!.part).toBe(1)
    expect(b!.p1.active.species).toBe('charizard-mega-x')
    expect(b!.p1.active.types).toEqual(['fire', 'dragon'])
  })

  test('원시회귀는 나오자마자: 등장 프레임은 원래 모습, 원시회귀 문장에서 바뀐다', () => {
    const { sim } = play(7, 'Kyogre @ Blue Orb\nAbility: Drizzle\n- Surf', {})
    const sw = sim.frames.find(f => f.event.type === 'switch' && f.event.in_id === 'p1_0')!
    const primal = sim.frames.find(f => f.event.type === 'mega_evolve')!
    expect(sw.p1.active.species).toBe('kyogre')
    expect(primal.part).toBeUndefined()
    expect(primal.p1.active.species).toBe('kyogre-primal')
  })

  test('다이맥스: 문장부터 커지고, 거다이맥스 세트는 거다이맥스 모습, 3턴 뒤 원래 크기로', () => {
    const { sim } = play(8, 'Charizard\nAbility: Blaze\nGigantamax: Yes\n- Flamethrower', { dynamax: true }, 3)
    const i = sim.frames.findIndex(f => f.event.type === 'volatile_apply' && f.event.volatile === 'dynamax')
    expect(sim.frames[i - 1]!.p1.active.dynamax).toBe(false)
    const on = sim.frames[i]!.p1.active
    expect(on).toMatchObject({ dynamax: true, gmax: true, dynamaxTurns: 3 })
    expect(spriteSpeciesOf(on)).toBe('charizard-gmax')
    expect(on.volatiles).not.toContain('dynamax')
    const turns = sim.frames.filter(f => f.p1.active.dynamax).map(f => f.p1.active.dynamaxTurns)
    expect(new Set(turns)).toEqual(new Set([3, 2, 1]))
    const off = sim.frames.find(f => f.event.type === 'volatile_remove' && f.event.volatile === 'dynamax')!
    expect(off.p1.active.dynamax).toBe(false)
    // 최대 HP 변화는 소리 없이
    expect(sim.frames.filter(f => (f.event.type === 'heal' || f.event.type === 'damage') && f.event.source === 'dynamax').every(f => f.silent)).toBe(true)
  })

  test('Z기술: Z파워 프레임 다음에 Z기술', () => {
    const { sim } = play(7, 'Pikachu @ Pikanium Z\nAbility: Static\n- Volt Tackle', { zmove: true })
    const i = sim.frames.findIndex(f => f.event.type === 'activate' && f.event.effect === 'z-power')
    expect(i).toBeGreaterThan(0)
    const next = sim.frames[i + 1]!.event
    expect(next.type === 'move_use' && next.move.name).toBe('catastropika')
  })
})

describe('리플레이: 세대', () => {
  test('세대를 싣고 왕복하며 같은 프레임을 재현한다', async () => {
    const { data, sim } = play(7, 'Charizard @ Charizardite Y\nAbility: Blaze\n- Flamethrower', { mega: true }, 2)
    expect(data.gen).toBe(7)
    const back = await decodeReplay(await encodeReplay(data))
    expect(back.gen).toBe(7)
    const again = simulateReplay(back)
    expect(again.error).toBeUndefined()
    expect(again.frames.map(f => [f.event.type, f.part, f.p1.active.species])).toEqual(sim.frames.map(f => [f.event.type, f.part, f.p1.active.species]))
  })

  test('세대 없는 옛 링크는 9세대', async () => {
    const { data } = play(7, 'Pikachu\nAbility: Static\n- Thunderbolt', {})
    const { gen: _g, ...old } = data
    void _g
    const back = await decodeReplay(await encodeReplay(old))
    expect(back.gen).toBeUndefined()
  })
})
