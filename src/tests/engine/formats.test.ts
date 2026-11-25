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

describe('모든 기술 사용 불가', () => {
    it('봉인으로 유일한 기술이 막히고 벤치가 없으면 발버둥(move_index -1)을 제시하고 받는다', () => {
        const e = engine('singles', undefined, [set('mew', ['imprison', 'tackle'])], [set('rattata', ['tackle'])], 1)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        const acts = e.getAvailableActions('p2')
        expect(acts).toEqual([{ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: -1 }])
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 1 })
        e.submitAction(acts[0]!)
        expect(e.getState().log.some(ev => ev.type === 'move_use' && ev.pokemon_id === 'p2_0' && ev.move.name === 'struggle')).toBe(true)
    })
})

describe('rotation', () => {
    const lead = (moves: string[], species = 'garchomp', extra: Partial<PokemonSet> = {}) => set(species, moves, extra)
    const rot = (p1: PokemonSet[], p2: PokemonSet[], seed = 1, options?: BattleRuleOptions) =>
        new BattleEngine({ format: 'rotation', seed, options, p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } })
    const FILLER = [lead(['splash'], 'snorlax'), lead(['splash'], 'blissey'), lead(['splash'], 'chansey')]

    it('양쪽 3마리가 나오고 앞(가운데)만 행동한다. 뒷줄은 rotate 선택지로 제공', () => {
        const e = rot(SIX, SIX)
        e.start()
        expect(e.getActivePokemon('p1').map(p => p.species)).toEqual(['garchomp', 'gholdengo', 'kingambit'])
        expect(e.frontSlot).toBe(1)
        expect(e.getActive('p1').species).toBe('gholdengo')
        const req = e.getRequest('p1')!
        expect(req.type).toBe('move')
        if (req.type !== 'move') return
        expect(req.active.species).toBe('gholdengo')
        expect(req.rotate?.map(r => [r.direction, r.pokemon.species])).toEqual([['left', 'garchomp'], ['right', 'kingambit']])
        expect(req.rotate?.[0]!.moves.map(m => m.move.name)).toEqual(['earthquake', 'protect'])
        const acts = e.getAvailableActions('p1')
        expect(acts.some(a => a.type === 'move' && a.rotate === 'left' && a.pokemon_id === 'p1_0')).toBe(true)
        expect(acts.filter(a => a.type === 'switch').map(a => a.type === 'switch' && a.switch_to_id)).toEqual(['p1_3', 'p1_4', 'p1_5'])
    })

    it('범위 기술도 상대 앞 1마리만 맞힌다 (뒷줄·아군 무사)', () => {
        const p1 = [FILLER[0]!, lead(['earthquake']), FILLER[1]!]
        const e = rot(p1, FILLER)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_1', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        const hit = e.getState().log.filter(ev => ev.type === 'damage').map(ev => ev.type === 'damage' && ev.pokemon_id)
        expect(hit).toEqual(['p2_1'])
    })

    it('회전: 턴 맨 처음(선공기보다 먼저) 뒷줄이 앞으로 나와 기술을 쓰고, 랭크는 유지된다', () => {
        const p1 = [lead(['swords-dance', 'tackle'], 'garchomp'), lead(['splash'], 'snorlax'), lead(['splash'], 'blissey')]
        const p2 = [FILLER[0]!, lead(['extreme-speed'], 'arcanine'), FILLER[1]!]
        const e = rot(p1, p2, 4)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, rotate: 'left' })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        const log = e.getState().log
        const turn = log.slice(log.findIndex(ev => ev.type === 'turn_start' && ev.turn === 1))
        const rotate = turn.findIndex(ev => ev.type === 'rotate')
        const firstMove = turn.findIndex(ev => ev.type === 'move_use')
        expect(rotate).toBeGreaterThan(-1)
        expect(rotate).toBeLessThan(firstMove)
        expect(turn[rotate]).toMatchObject({ type: 'rotate', player: 'p1', direction: 'left', in_id: 'p1_0', out_id: 'p1_1' })
        // 신속은 새로 앞에 나온 한카리아스를 맞힌다
        expect(turn.find(ev => ev.type === 'damage' && ev.source === 'extreme-speed')).toMatchObject({ pokemon_id: 'p1_0' })
        expect(e.getActive('p1').id).toBe('p1_0')
        expect(e.getActivePokemon('p1').map(p => p.id)).toEqual(['p1_1', 'p1_0', 'p1_2'])
        expect(e.getActive('p1').stages.attack).toBe(2)
        // 다시 돌려 빼도 (교체가 아니므로) 랭크는 그대로
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_2', move_index: 0, rotate: 'right' })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        expect(e.getActive('p1').id).toBe('p1_2')
        expect(e.getPokemon('p1_0')!.stages.attack).toBe(2)
    })

    it('잘못된 선택은 BattleError: 두 마리 행동, shift, 뒷줄 교체, 없는 방향', () => {
        const e = rot(SIX, SIX)
        expect(() => e.submitChoice('p1', 'move 1, move 1, pass')).toThrow(/exactly one/)
        expect(() => e.submitChoice('p1', 'shift, pass, pass')).toThrow(BattleError)
        expect(() => e.submitChoice('p1', 'switch 4, pass, pass')).toThrow(/front/)
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_3', move_index: 0, rotate: 'left' })).toThrow(BattleError)
        // 원시 선택 문자열도 그대로 쓸 수 있다
        e.submitChoice('p1', 'pass, move 1, pass')
        e.submitChoice('p2', 'default')
        expect(e.getState().turn).toBe(2)
    })

    it('앞 포켓몬이 역린에 묶이면 돌릴 수 없다', () => {
        const p1 = [FILLER[0]!, lead(['outrage'], 'dragonite'), FILLER[1]!]
        const e = rot(p1, FILLER, 2)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_1', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        const req = e.getRequest('p1')!
        expect(req.type === 'move' && req.rotate).toEqual([])
        expect(() => e.submitChoice('p1', 'move 1, pass, pass')).toThrow(/locked/)
    })

    it('앞이 쓰러지면 벤치에서 앞을 채우고, 벤치가 없으면 반드시 회전한다', () => {
        const weak = (s: string) => lead(['splash'], s, { level: 1 })
        const p1 = [weak('pichu'), weak('magikarp'), weak('feebas'), weak('wurmple')]
        const p2 = [FILLER[0]!, lead(['close-combat'], 'machamp', { level: 100 }), FILLER[1]!]
        const e = rot(p1, p2, 3)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_1', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        const sw = e.getRequest('p1')!
        expect(sw).toMatchObject({ type: 'switch', reason: 'faint' })
        expect(sw.active.id).toBe('p1_1')
        e.submitAction({ type: 'switch', player: 'p1', pokemon_id: 'p1_1', switch_to_id: 'p1_3' })
        expect(e.getActive('p1').id).toBe('p1_3')
        // 벤치가 바닥난 뒤 앞이 쓰러지면 must_rotate
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_3', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        const req = e.getRequest('p1')!
        expect(req).toMatchObject({ type: 'move', must_rotate: true, moves: [] })
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_3', move_index: 0 })).toThrow(/rotate/)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_2', move_index: 0, rotate: 'right' })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 0 })
        expect(e.getState().log.some(ev => ev.type === 'rotate' && ev.in_id === 'p1_2')).toBe(true)
    })

    it('위협은 상대 앞 포켓몬에게만, 도우미는 실패', () => {
        const p1 = [FILLER[0]!, lead(['helping-hand'], 'gyarados', { ability: 'intimidate' }), FILLER[1]!]
        const e = rot(p1, SIX)
        e.start()
        expect(e.getActivePokemon('p2').map(p => p.stages.attack)).toEqual([0, -1, 0])
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_1', move_index: 0 })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_1', move_index: 1 })
        expect(e.getState().log.some(ev => ev.type === 'volatile_apply' && ev.volatile === 'helping-hand')).toBe(false)
    })

    it('AI 끼리 끝까지 진행되고 처리 못 한 프로토콜이 없다', () => {
        for (let seed = 1; seed <= 12; seed++) {
            const r = simulateBattle(
                { format: 'rotation', seed, options: seed % 3 === 0 ? { pickedTeamSize: 4 } : undefined, p1: { name: 'A', team: generateRandomTeam({ seed }) }, p2: { name: 'B', team: generateRandomTeam({ seed: seed + 100 }) } },
                { p1: seed % 2 ? new HeuristicAI({ seed }) : new RandomAI(seed), p2: new RandomAI(seed + 1) },
            )
            expect(r.engine.ps.ended).toBe(true)
            expect([...r.engine.unhandledProtocol.keys()]).toEqual([])
        }
    })

    it('3마리 미만이면 거부', () => {
        expect(() => rot(SIX.slice(0, 2), SIX)).toThrow(BattleError)
    })
})
