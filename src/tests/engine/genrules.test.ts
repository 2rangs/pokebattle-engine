// 세대별 규칙 옵션: 기믹 끄기 (메가진화·Z기술·다이맥스), 1·2세대 세트 정리 (특성·성격·도구·특수·DV)
import { describe, it, expect, beforeAll } from 'vitest'
import {
    BattleEngine, MEGA_CLAUSE, ZMOVE_CLAUSE, optionsToRules, parseShowdownTeam, preloadData, replayInputLog, comparableLog,
    type BattleRuleOptions, type PokemonSet,
} from '../../index'

beforeAll(async () => { await preloadData({ gens: [1, 2, 3, 7, 8] }) })

const FOE = 'Blissey\nLevel: 100\nAbility: Natural Cure\n- Soft-Boiled'

function engine(gen: number, team: string, options?: BattleRuleOptions, foe = FOE) {
    const e = new BattleEngine({
        format: 'singles', gen: gen as never, seed: 1, ...(options ? { options } : {}),
        p1: { name: 'A', team: parseShowdownTeam(team) }, p2: { name: 'B', team: parseShowdownTeam(foe) },
    })
    e.start()
    return e
}

const moveReq = (e: BattleEngine) => {
    const r = e.getRequest('p1')
    if (!r || r.type !== 'move') throw new Error('no move request')
    return r
}

describe('기믹 끄기', () => {
    it('규칙 이름: 다이맥스는 Showdown, 메가·Z는 엔진 규칙', () => {
        expect(optionsToRules({ dynamax: false, megaEvolution: false, zMoves: false }).battle).toEqual(['Dynamax Clause', MEGA_CLAUSE, ZMOVE_CLAUSE])
        expect(optionsToRules({ dynamax: true, megaEvolution: true, zMoves: true }).battle).toEqual([])
    })

    it('메가진화 끄기: 7세대 메가스톤이 있어도 can_mega_evolve 없음, Z기술은 그대로', () => {
        const team = 'Charizard @ Charizardite Y\nAbility: Blaze\n- Flamethrower'
        expect(moveReq(engine(7, team)).can_mega_evolve).toBe(true)
        const off = engine(7, team, { megaEvolution: false })
        expect(moveReq(off).can_mega_evolve).toBeFalsy()
        expect(() => off.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, mega: true })).toThrow()
        const z = engine(7, 'Pikachu @ Electrium Z\nAbility: Static\n- Thunderbolt', { megaEvolution: false })
        expect(moveReq(z).can_zmove).toBe(true)
    })

    it('Z기술 끄기: Z크리스탈이 있어도 can_zmove 없음, 메가진화는 그대로', () => {
        const off = engine(7, 'Pikachu @ Electrium Z\nAbility: Static\n- Thunderbolt', { zMoves: false })
        expect(moveReq(off).can_zmove).toBeFalsy()
        expect(moveReq(off).moves[0]!.zmove).toBeFalsy()
        const mega = engine(7, 'Charizard @ Charizardite Y\nAbility: Blaze\n- Flamethrower', { zMoves: false })
        expect(moveReq(mega).can_mega_evolve).toBe(true)
    })

    it('울트라버스트도 메가진화 규칙으로 꺼진다', () => {
        const team = 'Necrozma-Dusk-Mane @ Ultranecrozium Z\nAbility: Prism Armor\n- Sunsteel Strike'
        expect(moveReq(engine(7, team)).can_ultra_burst).toBe(true)
        expect(moveReq(engine(7, team, { megaEvolution: false })).can_ultra_burst).toBeFalsy()
    })

    it('다이맥스 끄기 (8세대)', () => {
        const team = 'Charizard\nAbility: Blaze\n- Flamethrower'
        expect(moveReq(engine(8, team)).can_dynamax).toBe(true)
        expect(moveReq(engine(8, team, { dynamax: false })).can_dynamax).toBeFalsy()
    })

    it('입력 로그 재생도 같은 규칙으로', () => {
        const e = engine(7, 'Charizard @ Charizardite Y\nAbility: Blaze\n- Flamethrower', { megaEvolution: false, zMoves: false })
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        const again = replayInputLog(e.battle.inputLog)
        expect(comparableLog(again)).toBe(comparableLog(e.battle))
    })
})

describe('1·2세대 세트 정리', () => {
    const set = (over: Partial<PokemonSet> = {}): PokemonSet => ({
        species: 'gyarados', level: 100, gender: null, ability: 'intimidate', nature: 'adamant', item: 'leftovers',
        moves: ['tackle'], evs: { hp: 252, attack: 252, defense: 252, special_attack: 252, special_defense: 0, speed: 252 }, ...over,
    })
    const make = (gen: number, s: PokemonSet) => {
        const e = new BattleEngine({ format: 'singles', gen: gen as never, seed: 1, p1: { name: 'A', team: [s] }, p2: { name: 'B', team: [set({ nature: 'hardy' })] } })
        e.start()
        return e
    }

    it('1세대: 특성·성격·도구 없음, 특수는 하나', () => {
        const e = make(1, set())
        const p = e.battle.p1.pokemon[0]!
        expect(p.ability).toBe('noability')
        expect(p.item).toBe('')
        // 성격 보정 없음 (고집이어도 공격 ×1.1 아님), 특수: 특방 = 특공 (능력치 경험치도 하나)
        expect(p.storedStats.atk).toBe(348)
        expect(p.storedStats.spd).toBe(p.storedStats.spa)
        expect(e.getPokemon('p1_0')!.ability).toBe('')
        expect(e.getState().log.some(ev => ev.type === 'ability_trigger')).toBe(false)
    })

    it('2세대: 도구는 있고 특성·성격은 없다, 특방 DV·경험치는 특공과 같다', () => {
        const e = make(2, set({ ivs: { special_attack: 20, special_defense: 2 } }))
        const p = e.battle.p1.pokemon[0]!
        expect(p.item).toBe('leftovers')
        expect(p.ability).toBe('noability')
        expect(p.set.ivs.spd).toBe(p.set.ivs.spa)
        expect(p.set.evs.spd).toBe(252)
    })

    it('HP DV 는 다른 DV 로 정해진다 (1·2세대)', () => {
        const e = make(2, set({ ivs: { attack: 2, defense: 30, special_attack: 30, speed: 30, hp: 30 } }))
        // 공격 DV 1(홀) → 8, 방어 15 → 4, 스피드 15 → 2, 특수 15 → 1 = 15 → IV 30
        expect(e.battle.p1.pokemon[0]!.set.ivs.hp).toBe(30)
        const even = make(2, set({ ivs: { attack: 4, defense: 4, special_attack: 4, speed: 4, hp: 30 } }))
        expect(even.battle.p1.pokemon[0]!.set.ivs.hp).toBe(0)
    })

    it('3세대는 그대로 (특성·성격)', () => {
        const e = make(3, set())
        const p = e.battle.p1.pokemon[0]!
        expect(p.ability).toBe('intimidate')
        expect(p.storedStats.atk).toBe(383) // 고집 ×1.1
    })
})
