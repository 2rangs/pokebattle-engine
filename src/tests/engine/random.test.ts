import { describe, it, expect } from 'vitest'
import {
    createRandomBattle, getRandomBattleSet, getRandomBattleSets, randomBattleFormatId, randomBattleLevelStats,
    generateRandomTeam, RandomAI, BattleEngine, createFormatter,
} from '../../index'
import type { Generation, PokemonSet } from '../../index'

function play(engine: BattleEngine, seed = 1) {
    const ai = new RandomAI(seed)
    engine.start()
    for (let g = 0; !engine.battle.ended && g < 3000; g++) {
        for (const p of ['p1', 'p2'] as const) {
            if (engine.battle.ended) break
            if (engine.battle.gameType === 'doubles') {
                const req = engine.getRawRequest(p) as { wait?: boolean } | null
                if (req && !req.wait && !engine.battle[p].isChoiceDone()) engine.submitChoice(p, 'default')
            } else if (engine.getRequest(p)) engine.submitAction(ai.chooseAction(engine, p)!)
        }
    }
    return engine
}

describe('랜덤배틀 API', () => {
    it('세트 조회: 레벨·역할·기술 후보 (Showdown 데이터)', () => {
        const chomp = getRandomBattleSet('garchomp')!
        expect(chomp.level).toBeGreaterThan(60)
        expect(chomp.level).toBeLessThan(100)
        expect(chomp.roles.length).toBeGreaterThan(0)
        expect(chomp.roles[0]!.moves).toContain('earthquake')
        expect(getRandomBattleSet('Garchomp')).toEqual(chomp)          // Showdown 이름도
        expect(getRandomBattleSet('sawsbuck-summer')).toBeDefined()     // 겉모습만 다른 폼 → 기본 종
        expect(getRandomBattleSet('mewtwo', 1)!.level).toBeLessThan(getRandomBattleSet('pikachu', 1)!.level) // 1세대 데이터
    })

    it('생성된 팀의 레벨 == 조회한 밸런스 레벨', () => {
        for (const gen of [2, 5, 9] as Generation[]) {
            for (const s of generateRandomTeam({ seed: 3, format: randomBattleFormatId(gen) })) {
                const info = getRandomBattleSet(s.species, gen)
                expect(info, `${gen} ${s.species}`).toBeDefined()
                if (!/ite$|orb$|rusted/.test(s.item ?? '')) expect(s.level).toBe(info!.level) // 메가스톤·원시구슬·녹슨검은 바뀐 모습의 레벨
            }
        }
    })

    it('밸런스 레벨: 종족값이 높을수록 낮다', () => {
        const stats = randomBattleLevelStats(9)
        expect(stats[0]!.avgLevel).toBeGreaterThan(stats[stats.length - 1]!.avgLevel + 10)
        expect(Object.keys(getRandomBattleSets(9, 'doubles')).length).toBeGreaterThan(400)
    })

    it('createRandomBattle: 실제 랜덤배틀 포맷 규칙, 시드 재현, 고정 레벨', () => {
        const a = play(createRandomBattle({ seed: 11 }))
        const b = play(createRandomBattle({ seed: 11 }))
        expect(a.battle.format.id).toBe('gen9randombattle')
        expect(a.battle.log.filter(l => !l.startsWith('|t:|'))).toEqual(b.battle.log.filter(l => !l.startsWith('|t:|')))
        const lv50 = createRandomBattle({ seed: 11, level: 50 })
        lv50.start()
        expect(lv50.getSide('p1').team.every(p => p.level === 50)).toBe(true)
        expect(() => createRandomBattle({ gen: 3, format: 'doubles' })).toThrow(/랜덤배틀이 없습니다/)
    })

    for (const gen of [1, 2, 3, 4, 5, 6, 7, 8] as Generation[]) {
        it(`${gen}세대 랜덤배틀이 끝까지 돌고 모든 로그를 처리한다`, () => {
            const e = play(createRandomBattle({ gen, seed: gen * 7, engine: { turnSnapshots: false } }), gen)
            expect(e.battle.ended).toBe(true)
            expect(e.battle.gen).toBe(gen)
            expect([...e.unhandledProtocol.keys()]).toEqual([])
        })
    }

    it('9세대 더블·모노타입 랜덤배틀', () => {
        expect(play(createRandomBattle({ format: 'doubles', seed: 2 })).battle.format.id).toBe('gen9randomdoublesbattle')
        expect(play(createRandomBattle({ format: 'monotype', seed: 2 })).battle.ended).toBe(true)
    })
})

describe('세대별 기믹', () => {
    it('메가진화: 요청·행동·이벤트·로그', () => {
        const e = new BattleEngine({
            format: 'singles', gen: 7, seed: 1,
            p1: { name: 'A', team: [{ species: 'charizard', item: 'charizardite-x', ability: 'blaze', moves: ['flare-blitz'], level: 100 }] as unknown as PokemonSet[] },
            p2: { name: 'B', team: [{ species: 'blissey', moves: ['soft-boiled'], level: 100 }] as unknown as PokemonSet[] },
        })
        const events: string[] = []
        const f = createFormatter({ locale: 'ko', getPokemon: id => e.getPokemon(id) })
        e.on('*', ev => { const t = f.format(ev); if (t) events.push(t) })
        const req = e.getRequest('p1')!
        expect(req.type === 'move' && req.can_mega_evolve).toBe(true)
        expect(e.getAvailableActions('p1').some(a => a.type === 'move' && a.mega)).toBe(true)
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, mega: true })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        expect(events).toContain('리자몽의 리자몽나이트X와(과) 키스톤이 반응했다! 리자몽은 메가리자몽X로 메가진화했다!')
        expect(events).not.toContain('리자몽의 모습이 바뀌었다!')
        expect(e.getPokemon('p1_0')!.species).toBe('charizard-mega-x')
    })

    it('다이맥스 (8세대)', () => {
        const e = new BattleEngine({
            format: 'singles', gen: 8, seed: 1,
            p1: { name: 'A', team: [{ species: 'garchomp', moves: ['earthquake'], level: 100 }] as unknown as PokemonSet[] },
            p2: { name: 'B', team: [{ species: 'blissey', moves: ['soft-boiled'], level: 100 }] as unknown as PokemonSet[] },
        })
        const req = e.getRequest('p1')!
        expect(req.type === 'move' && req.can_dynamax).toBe(true)
        const texts: string[] = []
        e.on('*', ev => { const t = createFormatter({ locale: 'en', getPokemon: id => e.getPokemon(id) }).format(ev); if (t) texts.push(t) })
        e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0, dynamax: true })
        e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        expect(texts).toContain('Garchomp Dynamaxed!')
    })

    it('세대별 형식 제한', () => {
        const team = [{ species: 'pikachu', moves: ['thunderbolt'] }, { species: 'pikachu', moves: ['thunderbolt'] }, { species: 'pikachu', moves: ['thunderbolt'] }] as unknown as PokemonSet[]
        expect(() => new BattleEngine({ format: 'doubles', gen: 2, p1: { name: 'a', team }, p2: { name: 'b', team } })).toThrow(/3세대/)
        expect(() => new BattleEngine({ format: 'rotation', gen: 6, p1: { name: 'a', team }, p2: { name: 'b', team } })).toThrow(/9세대/)
        expect(new BattleEngine({ format: 'triples', gen: 5, p1: { name: 'a', team }, p2: { name: 'b', team } }).battle.format.id).toBe('gen5triplescustomgame')
    })
})
