// 세대별 규칙 옵션: 기믹 끄기 (메가진화·Z기술·다이맥스), 1·2세대 세트 정리 (특성·성격·도구·특수·DV)
import { describe, it, expect, beforeAll } from 'vitest'
import {
    BattleEngine, MEGA_CLAUSE, ZMOVE_CLAUSE, optionsToRules, parseShowdownTeam, preloadData, replayInputLog, comparableLog,
    type BattleRuleOptions, type PokemonSet,
} from '../../index'

beforeAll(async () => { await preloadData({ gens: [1, 2, 3, 4, 5, 7, 8] }) })

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
        const again = replayInputLog(e.ps.inputLog)
        expect(comparableLog(again)).toBe(comparableLog(e.ps))
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
        const p = e.ps.p1.pokemon[0]!
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
        const p = e.ps.p1.pokemon[0]!
        expect(p.item).toBe('leftovers')
        expect(p.ability).toBe('noability')
        expect(p.set.ivs.spd).toBe(p.set.ivs.spa)
        expect(p.set.evs.spd).toBe(252)
    })

    it('HP DV 는 다른 DV 로 정해진다 (1·2세대)', () => {
        const e = make(2, set({ ivs: { attack: 2, defense: 30, special_attack: 30, speed: 30, hp: 30 } }))
        // 공격 DV 1(홀) → 8, 방어 15 → 4, 스피드 15 → 2, 특수 15 → 1 = 15 → IV 30
        expect(e.ps.p1.pokemon[0]!.set.ivs.hp).toBe(30)
        const even = make(2, set({ ivs: { attack: 4, defense: 4, special_attack: 4, speed: 4, hp: 30 } }))
        expect(even.ps.p1.pokemon[0]!.set.ivs.hp).toBe(0)
    })

    it('3세대는 그대로 (특성·성격)', () => {
        const e = make(3, set())
        const p = e.ps.p1.pokemon[0]!
        expect(p.ability).toBe('intimidate')
        expect(p.storedStats.atk).toBe(383) // 고집 ×1.1
    })
})

describe('세대별 데이터 (getSpecies / getMove / getTypeChart 의 gen)', () => {
    it('종: 1세대 특수 하나, 페어리 이전 타입, 1·2세대 특성 없음, 숨겨진 특성은 5세대부터', async () => {
        const { getSpecies } = await import('../../index')
        expect(getSpecies('gengar', { gen: 1 })!.base_stats.special_defense).toBe(130)
        expect(getSpecies('gengar')!.base_stats.special_defense).toBe(75)
        expect(getSpecies('clefable', { gen: 5 })!.types).toEqual(['normal'])
        expect(getSpecies('clefable')!.types).toEqual(['fairy'])
        expect(getSpecies('gengar', { gen: 2 })!.abilities).toEqual([])
        expect(getSpecies('ninetales', { gen: 4 })!.abilities.some(a => a.hidden)).toBe(false)
        expect(getSpecies('ninetales', { gen: 5 })!.abilities.some(a => a.hidden)).toBe(true)
        expect(getSpecies('garchomp', { gen: 3 })).toBeUndefined()
    })

    it('기술: 3세대까지 분류는 타입으로', async () => {
        const { getMove } = await import('../../index')
        expect(getMove('crunch', { gen: 3 })!.category).toBe('special')
        expect(getMove('crunch', { gen: 4 })!.category).toBe('physical')
        expect(getMove('bite', { gen: 1 })!.type).toBe('normal')
    })

    it('타입 상성표: 1세대 15, 2~5세대 17, 6세대부터 18 타입', async () => {
        const { getTypeChart } = await import('../../index')
        expect(Object.keys(getTypeChart({ gen: 1 }))).toHaveLength(15)
        expect(Object.keys(getTypeChart({ gen: 3 }))).toHaveLength(17)
        expect(getTypeChart({ gen: 3 }).ghost!.steel).toBe(0.5)
        expect(getTypeChart({ gen: 7 }).ghost!.steel).toBeUndefined()
    })
})

describe('기믹 겹치기 (stackGimmicks)', () => {
    const FOE9 = 'Blissey\nLevel: 100\nAbility: Natural Cure\nEVs: 252 HP / 252 Def\n- Soft-Boiled'
    const make = (team: string, options: BattleRuleOptions = { stackGimmicks: true }) => {
        const e = new BattleEngine({ format: 'singles', gen: 9, seed: 3, options, p1: { name: 'A', team: parseShowdownTeam(team) }, p2: { name: 'B', team: parseShowdownTeam(FOE9) } })
        const events: { type: string }[] = []
        e.on('*', ev => events.push(ev))
        e.start()
        const turn = (flags: Record<string, boolean> = {}, move: 0 | 1 | 2 | 3 = 0) => {
            e.submitAction({ type: 'move', player: 'p1', pokemon_id: e.getRequest('p1')!.active.id, move_index: move, ...flags })
            e.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 0 })
        }
        return { e, events, turn }
    }
    const ZARD = 'Charizard @ Charizardite Y\nAbility: Blaze\nTera Type: Fire\nGigantamax: Yes\n- Flamethrower\n- Air Slash'

    it('규칙 없이: 9세대 메가스톤 지니면 테라스탈·다이맥스 불가 (Showdown 그대로)', () => {
        const { e } = make(ZARD, {})
        const r = moveReq(e)
        expect(r.can_mega_evolve).toBe(true)
        expect(r.can_terastallize).toBeFalsy()
        expect(r.can_dynamax).toBeFalsy()
    })

    it('한 포켓몬이 한 턴에 메가진화 + 다이맥스 + 테라스탈 (순서: 메가 → 다이맥스 → 테라)', () => {
        const b = make(ZARD)
        const r = moveReq(b.e)
        expect([r.can_mega_evolve, r.can_dynamax, r.can_terastallize]).toEqual([true, true, true])
        const hp = b.e.getPokemon('p1_0')!.max_hp
        b.turn({ mega: true, terastallize: true, dynamax: true })
        const order = b.events.map(ev => ev.type).filter(t => ['mega_evolve', 'volatile_apply', 'terastallize', 'move_use'].includes(t))
        expect(order.slice(0, 3)).toEqual(['mega_evolve', 'volatile_apply', 'terastallize'])
        const p = b.e.getPokemon('p1_0')!
        expect(p.species).toBe('charizard-mega-y')
        expect(p.terastallized).toBeTruthy()
        expect(p.max_hp).toBe(hp * 2)
        // 메가 모습은 거다이맥스하지 않는다 (다이맥스 기술: 다이번)
        expect(b.events.find(ev => ev.type === 'volatile_apply') as unknown).toMatchObject({ volatile: 'dynamax' })
        expect((b.events.find(ev => ev.type === 'volatile_apply') as { gmax?: boolean }).gmax).toBeFalsy()
        expect(b.events.some(ev => ev.type === 'move_use' && (ev as unknown as { move: { name: string } }).move.name === 'max-flare')).toBe(true)
    })

    it('턴을 나눠서도 (테라 → 메가 → 다이맥스), 각 기믹은 한 번', () => {
        const b = make(ZARD)
        b.turn({ terastallize: true })
        expect(moveReq(b.e).can_terastallize).toBeFalsy()
        expect(moveReq(b.e).can_mega_evolve).toBe(true)
        b.turn({ mega: true })
        expect(moveReq(b.e).can_mega_evolve).toBeFalsy()
        expect(moveReq(b.e).can_dynamax).toBe(true)
        b.turn({ dynamax: true })
        const p = b.e.getPokemon('p1_0')!
        expect(p.species).toBe('charizard-mega-y')
        expect(p.terastallized).toBeTruthy()
        expect(b.events.some(ev => ev.type === 'volatile_apply')).toBe(true)
    })

    it('Z기술 + 테라스탈은 함께, Z기술 + 다이맥스는 안 된다', () => {
        const team = 'Pikachu @ Electrium Z\nAbility: Static\nTera Type: Electric\n- Thunderbolt'
        const ok = make(team)
        expect(moveReq(ok.e).can_zmove).toBe(true)
        expect(moveReq(ok.e).can_terastallize).toBe(true)
        ok.turn({ zmove: true, terastallize: true })
        expect(ok.events.some(ev => ev.type === 'terastallize')).toBe(true)
        expect(ok.events.some(ev => ev.type === 'move_use' && (ev as unknown as { move: { name: string } }).move.name.startsWith('gigavolt-havoc'))).toBe(true)
        const no = make(team)
        expect(() => no.turn({ zmove: true, dynamax: true })).toThrow(/Z-Move and Dynamax/)
    })

    it('울트라버스트 + 테라스탈 + 다이맥스', () => {
        const b = make('Necrozma-Dusk-Mane @ Ultranecrozium Z\nAbility: Prism Armor\nTera Type: Steel\n- Sunsteel Strike')
        b.turn({ ultra_burst: true, terastallize: true, dynamax: true })
        const p = b.e.getPokemon('p1_0')!
        expect(p.species).toBe('necrozma-ultra')
        expect(p.terastallized).toBeTruthy()
        expect(b.events.some(ev => ev.type === 'volatile_apply')).toBe(true)
    })

    it('메가레쿠쟈 (화룡점정) 도 9세대에서', () => {
        const b = make('Rayquaza\nAbility: Air Lock\nTera Type: Flying\n- Dragon Ascent')
        expect(moveReq(b.e).can_mega_evolve).toBe(true)
    })

    it('입력 로그 재생이 같은 배틀을 만든다', () => {
        const b = make(ZARD)
        b.turn({ mega: true, terastallize: true, dynamax: true })
        b.turn()
        expect(comparableLog(replayInputLog(b.e.ps.inputLog))).toBe(comparableLog(b.e.ps))
    })
})

describe('기믹 AI · 겹치기 퍼즈', () => {
    it('useGimmicks AI 가 7·8세대에서 메가·Z·다이맥스를 쓰고, 겹치기 배틀이 끝까지 돌며 입력 로그로 재현된다', async () => {
        const { simulateBattle, createAI, generateRandomTeam } = await import('../../index')
        const used = { mega: 0, zmove: 0, dynamax: 0, terastallize: 0, stacked: 0 }
        const count = (e: BattleEngine) => {
            for (const line of e.ps.inputLog) {
                const m = /^>p[12] move \S+(.*)$/.exec(line)
                if (!m) continue
                const flags = m[1]!.trim().split(/\s+/).filter(Boolean)
                for (const f of flags) if (f in used) used[f as keyof typeof used]++
                if (flags.length > 1) used.stacked++
            }
        }
        for (const gen of [7, 8] as const) {
            for (let i = 0; i < 15; i++) {
                const t = (s: number) => generateRandomTeam({ seed: s, format: `gen${gen}randombattle` })
                const r = simulateBattle({ format: 'singles', gen, seed: i, p1: { name: 'a', team: t(i * 2 + 1) }, p2: { name: 'b', team: t(i * 2 + 2) } },
                    { p1: createAI('heuristic', i, { useGimmicks: true }), p2: createAI('strong', i + 1, { useGimmicks: true }) })
                count(r.engine)
            }
        }
        expect(used.mega).toBeGreaterThan(0)
        expect(used.dynamax).toBeGreaterThan(0)
        // 겹치기: 9세대 랜덤 팀 + 메가스톤 지닌 리자몽·Z크리스탈 피카츄를 섞어서
        const extra = parseShowdownTeam('Charizard @ Charizardite X\nAbility: Blaze\nTera Type: Dragon\n- Flare Blitz\n- Dragon Claw\n- Earthquake\n- Dragon Dance\n\nPikachu @ Pikanium Z\nAbility: Static\nTera Type: Electric\n- Volt Tackle\n- Thunderbolt', 80)
        for (let i = 0; i < 60; i++) {
            const t = (s: number) => [...extra, ...generateRandomTeam({ seed: s, size: 4 })]
            const ai = (k: number) => (i % 3 === 0 ? createAI('random', k) : createAI('heuristic', k, { useGimmicks: true }))
            const r = simulateBattle({ format: 'singles', gen: 9, seed: i, options: { stackGimmicks: true }, p1: { name: 'a', team: t(i * 2 + 1) }, p2: { name: 'b', team: t(i * 2 + 2) } },
                { p1: ai(i), p2: ai(i + 7) })
            expect(r.winner).not.toBeNull()
            count(r.engine)
            const nodebug = (s: string) => s.split("\n").filter(l => !l.startsWith("|debug|")).join("\n")
            if (i % 10 === 0) expect(nodebug(comparableLog(replayInputLog(r.engine.ps.inputLog)))).toBe(nodebug(comparableLog(r.engine.ps)))
        }
        expect(used.stacked).toBeGreaterThan(0)
        expect(used.terastallize).toBeGreaterThan(0)
    }, 60_000)
})
