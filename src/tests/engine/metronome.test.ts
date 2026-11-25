import { describe, it, expect } from 'vitest'
import {
    createMetronomeBattle, buildMetronomeTeam, metronomeSpeciesPool, BattleEngine, BattleError, RandomAI, PRNG,
    replayInputLog, comparableLog,
} from '../../index'
import type { BattleEvent, PokemonSet } from '../../index'

function play(engine: BattleEngine, seed = 1) {
    const ai = new RandomAI(seed)
    engine.start()
    for (let g = 0; !engine.ps.ended && g < 5000; g++) {
        for (const p of ['p1', 'p2'] as const) {
            if (engine.ps.ended) break
            if (engine.ps.gameType === 'doubles') {
                const req = engine.getRawRequest(p) as { wait?: boolean } | null
                if (req && !req.wait && !engine.ps[p].isChoiceDone()) engine.submitChoice(p, 'default')
            } else if (engine.getRequest(p)) engine.submitAction(ai.chooseAction(engine, p)!)
        }
    }
    return engine
}

const ids = (e: BattleEngine) => (['p1', 'p2'] as const).flatMap(p => e.ps[p].pokemon.map((_, i) => `${p}_${i}`))

describe('손가락흔들기 모드', () => {
    it('모든 포켓몬의 기술은 손가락흔들기 하나', () => {
        const e = createMetronomeBattle({ seed: 1, teamSize: 6 })
        e.start()
        for (const id of ids(e)) {
            const p = e.getPokemon(id)!
            expect(p.set.moves).toEqual(['metronome'])
            expect(p.moves.map(m => m?.move.name)).toEqual(['metronome'])
        }
        // 선택할 수 있는 기술도 손가락흔들기 (PP 가 다하면 발버둥)
        const ai = new RandomAI(2)
        for (let turn = 0; turn < 30 && !e.ps.ended; turn++) {
            for (const p of ['p1', 'p2'] as const) {
                const req = e.getRequest(p)
                if (!req) continue
                if (req.type === 'move') for (const m of req.moves) expect(['metronome', 'struggle']).toContain(m.move.name)
                e.submitAction(ai.chooseAction(e, p)!)
            }
        }
    })

    it('손가락흔들기가 실제로 다른 기술을 부른다', () => {
        const used = new Set<string>()
        const e = createMetronomeBattle({ seed: 5, stats: { hp: 2000 } })
        e.on('move_use', ev => used.add((ev as Extract<BattleEvent, { type: 'move_use' }>).move.name))
        play(e)
        expect(used.has('metronome')).toBe(true)
        expect(used.size).toBeGreaterThan(5)
    })

    it('자유 능력치가 시뮬레이터와 엔진 상태에 그대로 반영', () => {
        const e = createMetronomeBattle({
            seed: 2, level: 50,
            stats: { hp: 999 },
            p1: { team: ['pikachu', { species: 'snorlax', stats: { attack: 5, speed: 1 } }] },
            p2: { team: ['garchomp'], stats: { defense: 3000 } },
        })
        e.start()
        const pika = e.getPokemon('p1_0')!
        expect(pika.max_hp).toBe(999)
        expect(pika.hp).toBe(999)
        expect(pika.stats.hp).toBe(999)
        expect(pika.level).toBe(50)
        expect(pika.stats.attack).toBe(75)               // 지정 안 한 스탯은 평소 계산 (Lv50, 노력치 0, 개체값 31)
        const lax = e.getPokemon('p1_1')!
        expect(lax.stats).toMatchObject({ hp: 999, attack: 5, speed: 1 })
        const ps = e.psPokemon('p1_1')!
        expect(ps.maxhp).toBe(999)
        expect(ps.baseMaxhp).toBe(999)
        expect(ps.storedStats).toMatchObject({ atk: 5, spe: 1 })
        expect(ps.baseStoredStats).toMatchObject({ hp: 999, atk: 5, spe: 1 })
        const chomp = e.getPokemon('p2_0')!
        expect(chomp.stats).toMatchObject({ hp: 999, defense: 3000 })   // 팀 설정 + 전체 설정
        expect(e.getSpeed('p1_1')).toBe(1)
    })

    it('우선순위: 포켓몬 > 팀 > 전체', () => {
        const team = buildMetronomeTeam(
            { team: [{ species: 'mew', stats: { hp: 10 } }, 'eevee'], stats: { hp: 20, speed: 7 }, level: 30 },
            { gen: 9, level: 100, stats: { hp: 30, attack: 40 }, teamSize: 3, allowDuplicates: false, rng: new PRNG(1) },
        )
        expect(team[0]!.customStats).toEqual({ hp: 10, attack: 40, speed: 7 })
        expect(team[1]!.customStats).toEqual({ hp: 20, attack: 40, speed: 7 })
        expect(team.map(s => s.level)).toEqual([30, 30])
    })

    it('폼체인지·변신 뒤에도 커스텀 능력치 유지', () => {
        const e = createMetronomeBattle({
            seed: 3,
            p1: { team: [{ species: 'aegislash', stats: { attack: 777, defense: 888, hp: 500 } }] },
            p2: { team: [{ species: 'ditto', stats: { hp: 300 } }] },
        })
        e.start()
        const aegi = e.psPokemon('p1_0')!
        aegi.formeChange('Aegislash-Blade', null, false)
        expect(aegi.species.name).toBe('Aegislash-Blade')
        expect(aegi.storedStats).toMatchObject({ atk: 777, def: 888 })
        expect(aegi.maxhp).toBe(500)
        const ditto = e.psPokemon('p2_0')!
        ditto.transformInto(aegi)
        expect(ditto.storedStats).toMatchObject({ atk: 777, def: 888 })   // 변신은 상대 능력치 복사
        expect(ditto.maxhp).toBe(300)                                     // HP 는 그대로
        expect(e.getPokemon('p2_0')!.stats.attack).toBe(777)
    })

    it('데미지 미리보기 = 실제 데미지 (자유 능력치)', () => {
        const set = (species: string, customStats: PokemonSet['customStats']): PokemonSet => ({
            species, level: 50, gender: null, ability: '', nature: 'hardy', moves: ['tackle'], customStats,
        })
        const e = new BattleEngine({
            format: 'singles', seed: 4,
            p1: { name: 'a', team: [set('pikachu', { attack: 999, speed: 999 })] },
            p2: { name: 'b', team: [set('snorlax', { hp: 5000, defense: 10 })] },
        })
        e.start()
        const pv = e.previewDamage('p1', 0)!
        expect(pv.defenderMaxHP).toBe(5000)
        expect(pv.defenderHP).toBe(5000)
        let dealt: { amount: number; crit?: boolean } | undefined
        e.on('damage', ev => { const d = ev as Extract<BattleEvent, { type: 'damage' }>; if (d.pokemon_id === 'p2_0' && !dealt) dealt = d })
        e.submitActions(
            { type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 },
            { type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 },
        )
        expect(dealt).toBeDefined()
        if (!dealt!.crit) {
            expect(dealt!.amount).toBeGreaterThanOrEqual(pv.min)
            expect(dealt!.amount).toBeLessThanOrEqual(pv.max)
        }
        // 능력치를 안 바꾼 같은 배틀보다 훨씬 세다
        const plain = new BattleEngine({
            format: 'singles', seed: 4,
            p1: { name: 'a', team: [set('pikachu', undefined)] },
            p2: { name: 'b', team: [set('snorlax', undefined)] },
        })
        expect(pv.max).toBeGreaterThan(plain.previewDamage('p1', 0)!.max * 5)
    })

    it('랜덤 팀: 시드 재현, 크기, 중복 없음', () => {
        const species = (e: BattleEngine) => ids(e).map(id => e.getPokemon(id)!.species)
        const a = createMetronomeBattle({ seed: 42, teamSize: 6 }); a.start()
        const b = createMetronomeBattle({ seed: 42, teamSize: 6 }); b.start()
        const c = createMetronomeBattle({ seed: 43, teamSize: 6 }); c.start()
        expect(species(a)).toEqual(species(b))
        expect(species(a)).not.toEqual(species(c))
        expect(a.ps.p1.pokemon).toHaveLength(6)
        for (const side of [a.ps.p1, a.ps.p2]) {
            expect(new Set(side.pokemon.map(p => p.baseSpecies.baseSpecies)).size).toBe(6)
        }
        // 같은 시드 + 같은 선택 → 같은 배틀
        expect(comparableLog(play(a, 7).ps)).toBe(comparableLog(play(b, 7).ps))
        const pool = metronomeSpeciesPool()
        expect(pool.length).toBeGreaterThan(900)
        expect(pool.some(s => s.battleOnly || s.requiredItem)).toBe(false)
    })

    it('고른 팀 + 랜덤 팀 섞기', () => {
        const e = createMetronomeBattle({ seed: 9, p1: { team: ['Pikachu', 'charizard', { species: 'mewtwo', nickname: 'Boss', level: 70 }] }, p2: { team: 'random' }, teamSize: 2 })
        e.start()
        expect(ids(e).filter(id => id.startsWith('p1')).map(id => e.getPokemon(id)!.species)).toEqual(['pikachu', 'charizard', 'mewtwo'])
        expect(e.getPokemon('p1_2')!.nickname).toBe('Boss')
        expect(e.getPokemon('p1_2')!.level).toBe(70)
        expect(e.ps.p2.pokemon).toHaveLength(2)
    })

    it('입력 검사', () => {
        const bad: [Parameters<typeof createMetronomeBattle>[0], RegExp][] = [
            [{ stats: { hp: 0 } }, /stats\.hp: 1~9999/],
            [{ stats: { hp: 10000 } }, /1~9999/],
            [{ stats: { speed: 1.5 } }, /stats\.speed/],
            [{ stats: { luck: 5 } as never }, /알 수 없는 능력치 'luck'/],
            [{ p1: { stats: { attack: -1 } } }, /p1\.stats\.attack/],
            [{ p2: { team: [{ species: 'pikachu', stats: { defense: 0 } }] } }, /p2\.team\[0\]\.stats\.defense/],
            [{ level: 0 }, /level: 레벨은 1~100/],
            [{ p1: { team: [{ species: 'pikachu', level: 101 }] } }, /p1\.team\[0\]\.level/],
            [{ teamSize: 7 }, /teamSize 는 1~6/],
            [{ p1: { team: [] } }, /1~6마리/],
            [{ p1: { team: ['notamon'] } }, /알 수 없는 포켓몬: notamon/],
            [{ format: 'triples' as never }, /format/],
            [{ format: 'doubles', teamSize: 1 }, /doubles/],
        ]
        for (const [opts, msg] of bad) {
            expect(() => createMetronomeBattle(opts), JSON.stringify(opts)).toThrow(BattleError)
            expect(() => createMetronomeBattle(opts), JSON.stringify(opts)).toThrow(msg)
        }
        // 일반 배틀의 set.customStats 도 같은 검사
        expect(() => new BattleEngine({
            format: 'singles',
            p1: { name: 'a', team: [{ species: 'pikachu', level: 50, gender: null, ability: '', nature: 'hardy', moves: ['tackle'], customStats: { hp: 0 } }] },
            p2: { name: 'b', team: [{ species: 'pikachu', level: 50, gender: null, ability: '', nature: 'hardy', moves: ['tackle'] }] },
        })).toThrow(/customStats\.hp/)
    })

    it('배틀이 끝까지 진행된다 (싱글·더블, HP 999)', () => {
        for (let seed = 1; seed <= 4; seed++) {
            const e = play(createMetronomeBattle({ seed, stats: { hp: 999 } }), seed)
            expect(e.ps.ended, `seed ${seed}`).toBe(true)
        }
        const d = play(createMetronomeBattle({ seed: 11, format: 'doubles' }))
        expect(d.ps.ended).toBe(true)
        expect(d.ps.gameType).toBe('doubles')
    })

    it('inputLog 재생으로 같은 배틀 (커스텀 능력치 포함)', () => {
        const e = play(createMetronomeBattle({ seed: 21, stats: { hp: 1500, speed: 5 }, p1: { team: ['pikachu'] } }))
        expect(e.ps.ended).toBe(true)
        expect(comparableLog(replayInputLog(e.ps.inputLog))).toBe(comparableLog(e.ps))
    })

    it('테라스탈은 기본 금지, terastal: true 로 허용', () => {
        const tera = (e: BattleEngine) => { const r = e.getRequest('p1')!; return r.type === 'move' && r.can_terastallize }
        expect(tera(createMetronomeBattle({ seed: 1 }))).toBe(false)
        expect(tera(createMetronomeBattle({ seed: 1, terastal: true }))).toBe(true)
    })
})
