import { describe, it, expect } from 'vitest'
import { BattleEngine, BattleError, simulateBattle, HeuristicAI, RandomAI, generateRandomTeam, optionsToRules } from '../../index'
import type { BattleConfig, BattleRuleOptions } from '../../types/battle'
import type { PokemonSet } from '../../types/pokemon'

const set = (species: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet => ({
    species, level: 50, gender: null, ability: '', nature: 'hardy',
    moves: moves as PokemonSet['moves'], evs: {}, ivs: {}, ...extra,
})

const SIX: PokemonSet[] = [
    set('garchomp', ['earthquake', 'protect'], { item: 'leftovers' }),
    set('gholdengo', ['make-it-rain', 'protect'], { item: 'life-orb' }),
    set('kingambit', ['kowtow-cleave', 'protect'], { item: 'black-glasses' }),
    set('arcanine', ['flare-blitz', 'protect'], { item: 'sitrus-berry' }),
    set('rillaboom', ['wood-hammer', 'fake-out'], { item: 'choice-band' }),
    set('amoonguss', ['spore', 'rage-powder'], { item: 'rocky-helmet' }),
]

function engine(format: BattleConfig['format'], options?: BattleRuleOptions, p1 = SIX, p2 = SIX, seed = 1) {
    return new BattleEngine({ format, seed, options, p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } })
}

describe('triples', () => {
    it('양쪽에 3마리씩 나오고 Showdown 선택 문자열로 진행된다', () => {
        const e = engine('triples')
        e.start()
        expect(e.getActivePokemon('p1').map(p => p.species)).toEqual(['garchomp', 'gholdengo', 'kingambit'])
        expect(e.getActivePokemon('p2')).toHaveLength(3)
        e.submitChoice('p1', 'move 1, move 1, move 1 1')
        e.submitChoice('p2', 'move 2, move 2, move 2')
        expect(e.getState().turn).toBe(2)
        expect(e.getState().log.some(ev => ev.type === 'move_use')).toBe(true)
    })

    it('래더 규칙(종 클로즈·밴리스트·팀 프리뷰)은 기본으로 꺼져 있다', () => {
        const dupes = [SIX[0]!, SIX[0]!, SIX[0]!]
        const e = engine('triples', undefined, dupes, dupes)
        e.start()
        expect(e.phase).toBe('waiting_action')
    })

    it('3마리 미만이면 거부', () => {
        expect(() => engine('triples', undefined, SIX.slice(0, 2))).toThrow(BattleError)
    })
})

describe('팀 프리뷰', () => {
    it('pickedTeamSize: 고른 순서대로 선발, 고른 수만 출전', () => {
        const e = engine('singles', { pickedTeamSize: 3 })
        e.start()
        expect(e.phase).toBe('team_preview')
        expect(e.getRequest('p1')).toBeNull()
        const pv = e.getTeamPreview('p1')!
        expect(pv.pick).toBe(3)
        expect(pv.team).toHaveLength(6)
        e.submitAction({ type: 'team', player: 'p1', order: ['p1_3', 'p1_0', 'p1_5'] })
        e.submitAction({ type: 'team', player: 'p2', order: ['p2_1', 'p2_2', 'p2_4'] })
        expect(e.phase).toBe('waiting_action')
        expect(e.getActive('p1').species).toBe('arcanine')
        expect(e.getActive('p2').species).toBe('gholdengo')
        // state.team 은 원래 파티 순서로, 고른 포켓몬만 남는다
        expect(e.getSide('p1').team.map(p => p.id)).toEqual(['p1_0', 'p1_3', 'p1_5'])
    })

    it('잘못된 선택은 BattleError', () => {
        const e = engine('doubles', { pickedTeamSize: 4 })
        expect(() => e.submitAction({ type: 'team', player: 'p1', order: ['p1_0', 'p1_1'] })).toThrow(/4마리/)
        expect(() => e.submitAction({ type: 'team', player: 'p1', order: ['p1_0', 'p1_0', 'p1_1', 'p1_2'] })).toThrow(BattleError)
        expect(() => e.submitAction({ type: 'team', player: 'p1', order: ['p2_0', 'p1_0', 'p1_1', 'p1_2'] })).toThrow(BattleError)
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })).toThrow(/팀 프리뷰/)
    })

    it('AI 와 simulateBattle 이 팀 프리뷰를 통과한다', () => {
        const r = simulateBattle(
            { format: 'singles', seed: 3, options: { teamPreview: true, pickedTeamSize: 3, level: 50 }, p1: { name: 'A', team: generateRandomTeam({ seed: 1 }) }, p2: { name: 'B', team: generateRandomTeam({ seed: 2 }) } },
            { p1: new HeuristicAI({ seed: 1 }), p2: new RandomAI(2) },
        )
        expect(r.winner === 'p1' || r.winner === 'p2').toBe(true)
        expect(r.engine.getSide('p1').team).toHaveLength(3)
    })
})

describe('규칙 옵션', () => {
    it('level: 모든 포켓몬 레벨 고정', () => {
        const e = engine('singles', { level: 5 }, [set('garchomp', ['tackle'], { level: 100 })], [set('pikachu', ['tackle'])])
        e.start()
        expect(e.getActive('p1').level).toBe(5)
        expect(e.getActive('p2').level).toBe(5)
    })

    it('terastal: false 면 테라스탈 불가', () => {
        const e = engine('singles', { terastal: false }, [set('garchomp', ['tackle'], { teraType: 'steel' })], [set('pikachu', ['tackle'])])
        const req = e.getRequest('p1')!
        expect(req.type === 'move' && req.can_terastallize).toBe(false)
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, terastallize: true })).toThrow(BattleError)
    })

    it('팀 단위 클로즈는 시작할 때 검사한다', () => {
        const dupes = [set('garchomp', ['tackle']), set('garchomp', ['tackle'])]
        expect(() => engine('singles', { speciesClause: true }, dupes, SIX).start()).toThrow(/Species Clause/)
        const items = [set('garchomp', ['tackle'], { item: 'leftovers' }), set('pikachu', ['tackle'], { item: 'leftovers' })]
        expect(() => engine('singles', { itemClause: true }, items, SIX).start()).toThrow(/Item Clause/)
        expect(() => engine('singles', { ohkoClause: true }, [set('lapras', ['sheer-cold'])], SIX).start()).toThrow(/OHKO Clause/)
        expect(() => engine('singles', { evasionClause: true }, [set('garchomp', ['double-team'])], SIX).start()).toThrow(BattleError)
        expect(() => engine('singles', { maxLevel: 50 }, [set('garchomp', ['tackle'], { level: 51 })], SIX).start()).toThrow(BattleError)
        expect(() => engine('singles', { speciesClause: true, itemClause: true, ohkoClause: true }).start()).not.toThrow()
    })

    it('sleepClause: 두 번째 수면은 막힌다', () => {
        const p1 = [set('amoonguss', ['spore'], { ability: 'regenerator' })]
        const p2 = [set('pikachu', ['tackle']), set('raichu', ['tackle'])]
        const e = engine('singles', { sleepClause: true }, p1, p2, 5)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
        e.submitAction({ type: 'switch', player: 'p2', pokemon_id: 'p2_0', switch_to_id: 'p2_1' })
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
        e.submitAction({ type: 'switch', player: 'p2', pokemon_id: 'p2_1', switch_to_id: 'p2_0' })
        const slept = e.getSide('p2').team.filter(p => p.status === 'sleep')
        expect(slept).toHaveLength(1)
    })

    it('잘못된 값은 BattleError', () => {
        expect(() => optionsToRules({ pickedTeamSize: 0 })).toThrow(BattleError)
        expect(() => optionsToRules({ level: 1.5 })).toThrow(BattleError)
        expect(optionsToRules({ terastal: false, speciesClause: true })).toEqual({ battle: ['Terastal Clause'], validate: ['Species Clause'] })
    })
})
