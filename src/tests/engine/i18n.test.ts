import { describe, it, expect, beforeAll } from 'vitest'
import {
    BattleEngine, createFormatter, describeEvent, formatEvent, loadNames, registerLocale, en, generateRandomTeam, PRNG,
} from '../../index'
import type { BattleEvent, PokemonSet } from '../../index'

type Team = Partial<PokemonSet>[]
function battle(p1: Team, p2: Team, seed = 1) {
    const engine = new BattleEngine({ format: 'singles', seed, p1: { name: 'A', team: p1 as PokemonSet[] }, p2: { name: 'B', team: p2 as PokemonSet[] } })
    const events: BattleEvent[] = []
    engine.on('*', ev => events.push(ev))
    engine.start()
    const turn = (a: string, b: string) => { engine.submitChoice('p1', a); engine.submitChoice('p2', b) }
    return { engine, events, turn }
}

describe('다국어 로그', () => {
    beforeAll(() => loadNames('ja'))

    const { engine, events, turn } = battle(
        [{ species: 'garchomp', moves: ['earthquake', 'swords-dance'], level: 100 }],
        [{ species: 'heatran', moves: ['flash-cannon', 'protect'], level: 60 }],
    )
    turn('move 2', 'move 1')
    turn('move 1', 'move 1')
    const ctx = { getPokemon: (id: string) => engine.getPokemon(id) }
    const lines = (code: string) => {
        const f = createFormatter({ ...ctx, locale: code })
        return events.map(e => f.format(e)).filter(Boolean) as string[]
    }

    it('같은 이벤트를 ko / en / ja 로', () => {
        expect(lines('ko')).toContain('한카리아스의 칼춤!')
        expect(lines('ko')).toContain('한카리아스의 공격이 크게 올라갔다!')
        expect(lines('en')).toContain('Garchomp used Swords Dance!')
        expect(lines('en')).toContain("Garchomp's Attack rose sharply!")
        expect(lines('ja')).toContain('ガブリアスの つるぎのまい！')
        expect(lines('ja')).toContain('ガブリアスの こうげきが ぐーんと 上がった！')
        // 4배 약점: 효과 문장 + 이벤트에는 실제 배율
        expect(lines('en').some(l => l.includes("It's super effective! The opposing Heatran took"))).toBe(true)
        expect(lines('en')).toContain('The opposing trainer sent out Heatran!')
        expect(events.find(e => e.type === 'damage' && e.pokemon_id === 'p2_0')).toMatchObject({ effectiveness: 4 })
    })

    it('예전 formatEvent 는 한국어 포매터와 같다', () => {
        const f = createFormatter({ ...ctx, locale: 'ko' })
        for (const e of events) expect(formatEvent(e, ctx)).toBe(f.format(e))
    })

    it('시점(perspective)을 바꾸면 우리/상대가 바뀐다', () => {
        const f = createFormatter({ ...ctx, locale: 'ko', perspective: 'p2' })
        expect(events.map(e => f.format(e))).toContain('상대 한카리아스의 칼춤!')
    })

    it('문장 일부만 바꾸기 + 새 언어 등록 (없는 문장은 fallback)', () => {
        const f = createFormatter({ ...ctx, locale: 'en', messages: { 'move.use': '{pokemon} → {move}' } })
        expect(f.format(events.find(e => e.type === 'move_use')!)).toBe('Garchomp → Swords Dance')
        registerLocale({ code: 'en-pirate', fallback: en, terms: {}, messages: { 'move.use': 'Arr, {pokemon} be usin\' {move}!' } })
        const p = createFormatter({ ...ctx, locale: 'en-pirate' })
        expect(p.format(events.find(e => e.type === 'move_use')!)).toBe("Arr, Garchomp be usin' Swords Dance!")
        expect(p.format(events.find(e => e.type === 'faint') ?? { type: 'turn_start', turn: 3 })).toBeTruthy()
    })

    it('describeEvent 는 언어와 무관한 메시지', () => {
        const use = events.find(e => e.type === 'move_use')!
        expect(describeEvent(use, ctx)).toEqual([{ key: 'move.use', params: { pokemon: { pokemon: 'p1_0' }, move: { move: 'swords-dance' } } }])
    })

    it('이름 조회 재사용 + 복수형 + 이름 없는 폼은 기본 종 이름', () => {
        const ja = createFormatter({ ...ctx, locale: 'ja' })
        expect(ja.name.item('heavy-duty-boots')).toBe('あつぞこブーツ')
        expect(ja.name.effect('stealth_rock')).toBe('ステルスロック')
        expect(createFormatter({ ...ctx, locale: 'ko' }).name.species('alcremie-ruby-swirl')).toBe('마휘핑')
        const enF = createFormatter({ ...ctx, locale: 'en' })
        expect(enF.render([{ key: 'hits', params: { count: 1 } }])).toBe('The Pokémon was hit 1 time!')
        expect(enF.render([{ key: 'hits', params: { count: 3 } }])).toBe('The Pokémon was hit 3 times!')
    })
})

describe('로그·이벤트 버그 회귀', () => {
    it('미래예지 데미지의 출처는 미래예지 (마지막에 쓴 기술이 아니라)', () => {
        const { engine, events, turn } = battle(
            [{ species: 'slowking', moves: ['future-sight', 'slack-off'] }],
            [{ species: 'snorlax', moves: ['curse'] }],
        )
        turn('move 1', 'move 1'); turn('move 2', 'move 1'); turn('move 2', 'move 1')
        const dmg = events.find(e => e.type === 'damage' && e.pokemon_id === 'p2_0')
        expect(dmg).toMatchObject({ source: 'future-sight', effectiveness: 1 })
        const ko = createFormatter({ getPokemon: id => engine.getPokemon(id), locale: 'ko' })
        const text = events.map(e => ko.format(e))
        expect(text).toContain('야도킹은 미래를 내다보았다!')
        expect(text).toContain('상대 잠만보는 미래예지 공격을 받았다!')
    })

    it('대타출동 HP 비용은 공격 명중이 아니다', () => {
        const { engine, events, turn } = battle(
            [{ species: 'lapras', moves: ['splash'] }],
            [{ species: 'blissey', moves: ['substitute'] }],
        )
        turn('move 1', 'move 1')
        const cost = events.find(e => e.type === 'damage' && e.pokemon_id === 'p2_0')
        expect(cost).toMatchObject({ source: 'substitute', effectiveness: undefined })
        const text = events.map(e => formatEvent(e, { getPokemon: id => engine.getPokemon(id) }))
        expect(text).toContain('상대 해피너스의 대타가 나타났다!')
        expect(text.some(t => t?.includes('대신 공격을 받았다'))).toBe(false)
    })

    it('급소 플래그는 같은 기술의 -crit 에만 붙는다 / 기절은 상태이상 이벤트가 아니다', () => {
        for (let seed = 0; seed < 40; seed++) {
            const rng = new PRNG(seed)
            const engine = new BattleEngine({
                format: 'singles', seed, maxTurns: 80,
                p1: { name: 'A', team: generateRandomTeam({ seed: rng.int(1e9) }) },
                p2: { name: 'B', team: generateRandomTeam({ seed: rng.int(1e9) }) },
            })
            const at: { ev: BattleEvent; line: number }[] = []
            engine.on('*', ev => at.push({ ev, line: engine.battle.log.length }))
            engine.start()
            let g = 0
            while (!engine.battle.ended && g++ < 2000) {
                for (const p of ['p1', 'p2'] as const) if (!engine.battle.ended && engine.getRequest(p)) engine.submitAction(rng.pick(engine.getAvailableActions(p)))
            }
            const log = engine.battle.log
            for (const { ev, line } of at) {
                if (ev.type === 'status_apply') expect(ev.status).not.toBe('fnt')
                if (ev.type !== 'damage' || !ev.crit) continue
                const p = engine.getShowdownPokemon(ev.pokemon_id)!
                let k = line - 1
                let found = false
                for (; k >= 0 && !log[k]!.startsWith('|move|'); k--) if (log[k]!.startsWith('|-crit|') && log[k]!.includes(p.name)) found = true
                expect(found, `seed ${seed}: crit on ${ev.pokemon_id} without -crit in the same move`).toBe(true)
            }
        }
    })
})

describe('formatKO: 데미지 KO 문구 언어별', async () => {
    const { formatKO } = await import('../../index')
    it('확정·난수, 1타는 OHKO', () => {
        expect(formatKO({ koChance: 1, koHits: 1 }, 'en')).toBe('guaranteed OHKO')
        expect(formatKO({ koChance: 0.438, koHits: 2 }, 'en')).toBe('43.8% chance to 2HKO')
        expect(formatKO({ koChance: 1, koHits: 2 }, 'ko')).toBe('확정 2타')
        expect(formatKO({ koChance: 0.438, koHits: 2 })).toBe('난수 2타 (43.8%)')
        expect(formatKO({ koChance: 1, koHits: 3 }, 'ja')).toBe('確定3発')
        expect(formatKO({ koChance: 0, koHits: 0 }, 'en')).toBe('')
    })
})
