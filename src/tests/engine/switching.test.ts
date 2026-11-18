// ─── 교체: 교체 기술·강제 교체·교체 아이템/특성·구속·장판 ─────────────
// 판정은 Showdown 시뮬레이터 그대로. 여기서는 엔진이 그것을 요청·이벤트·로그·AI 로 제대로 전달하는지 본다.
import { describe, it, expect } from 'vitest'
import { BattleEngine, HeuristicAI, createFormatter } from '../../index'
import type { Action, BattleEvent, PlayerID, Generation } from '../../types/battle'
import type { PokemonSet } from '../../types/pokemon'

const S = (species: string, moves: string[], x: Partial<PokemonSet> = {}): PokemonSet => ({
    species, level: 50, gender: null, ability: '', nature: 'hardy', moves: moves as PokemonSet['moves'], evs: {}, ivs: {}, ...x,
})
const fast = { evs: { speed: 252 }, nature: 'jolly' } as Partial<PokemonSet>
const bench = () => [S('blissey', ['soft-boiled']), S('ferrothorn', ['protect'])]

function setup(p1: PokemonSet[], p2: PokemonSet[], opts: { seed?: number; gen?: Generation } = {}) {
    const e = new BattleEngine({ format: 'singles', seed: opts.seed ?? 1, gen: opts.gen, p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } })
    const events: BattleEvent[] = []
    const ko: string[] = []
    const en: string[] = []
    const fko = createFormatter({ locale: 'ko', getPokemon: id => e.getPokemon(id) })
    const fen = createFormatter({ locale: 'en', getPokemon: id => e.getPokemon(id) })
    e.on('*', ev => {
        events.push(ev)
        const k = fko.format(ev); if (k) ko.push(k)
        const n = fen.format(ev); if (n) en.push(n)
    })
    e.start()
    return { e, events, ko, en }
}
const mv = (e: BattleEngine, player: PlayerID, i = 0): Action => ({ type: 'move', player, pokemon_id: e.getActive(player).id, move_index: i as 0 })
const sw = (e: BattleEngine, player: PlayerID, to: string): Action => ({ type: 'switch', player, pokemon_id: e.getActive(player).id, switch_to_id: to })
function turn(e: BattleEngine, a: Action, b: Action) { e.submitActions(a, b) }
const switchEvents = (events: BattleEvent[]) => events.filter((ev): ev is Extract<BattleEvent, { type: 'switch' }> => ev.type === 'switch')
const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1]

describe('교체 기술: 요청·이벤트에 원인이 붙는다', () => {
    const cases: [string, PokemonSet, PokemonSet][] = [
        ['u-turn', S('scizor', ['u-turn'], fast), S('slowbro', ['tackle'])],
        ['volt-switch', S('rotom-wash', ['volt-switch'], fast), S('slowbro', ['tackle'])],
        ['flip-turn', S('palafin', ['flip-turn'], fast), S('slowbro', ['tackle'])],
        ['parting-shot', S('incineroar', ['parting-shot'], fast), S('slowbro', ['tackle'])],
        ['teleport', S('slowbro', ['teleport']), S('jolteon', ['tackle'], fast)],
        ['baton-pass', S('ninjask', ['baton-pass'], fast), S('slowbro', ['tackle'])],
        ['shed-tail', S('cyclizar', ['shed-tail'], fast), S('slowbro', ['tackle'])],
        ['chilly-reception', S('slowking-galar', ['chilly-reception']), S('jolteon', ['tackle'], fast)],
    ]
    for (const [move, user, foe] of cases) {
        it(move, () => {
            const { e, events, ko, en } = setup([user, ...bench()], [foe, ...bench()])
            turn(e, mv(e, 'p1'), mv(e, 'p2'))
            const req = e.getRequest('p1')
            expect(req).toMatchObject({ type: 'switch', reason: 'self_switch', source: { kind: 'move', id: move } })
            e.submitAction(sw(e, 'p1', 'p1_1'))
            expect(last(switchEvents(events))).toMatchObject({ player: 'p1', in_id: 'p1_1', source: { kind: 'move', id: move } })
            // "○○은(는) 트레이너에게로 돌아갔다!" + "가랏!" (일반 교체의 "돌아와" 는 쓰지 않는다)
            // 한 이벤트가 두 문장: "○○은(는) 트레이너에게로 돌아갔다! 가랏! △△"
            expect(ko.some(t => /트레이너에게로 돌아갔다! 가랏! /.test(t))).toBe(true)
            expect(en.some(t => /went back to its trainer! Go! /.test(t))).toBe(true)
            expect(ko.some(t => t.startsWith('돌아와'))).toBe(false)
        })
    }

    it('배턴터치는 랭크를, 꼬리자르기는 대타를 넘긴다', () => {
        const bp = setup([S('ninjask', ['swords-dance', 'baton-pass'], fast), ...bench()], [S('slowbro', ['calm-mind'])])
        turn(bp.e, mv(bp.e, 'p1', 0), mv(bp.e, 'p2'))
        turn(bp.e, mv(bp.e, 'p1', 1), mv(bp.e, 'p2'))
        bp.e.submitAction(sw(bp.e, 'p1', 'p1_1'))
        expect(bp.e.getActive('p1').stages.attack).toBe(2)

        const st = setup([S('cyclizar', ['shed-tail'], fast), ...bench()], [S('slowbro', ['calm-mind'])])
        turn(st.e, mv(st.e, 'p1'), mv(st.e, 'p2'))
        st.e.submitAction(sw(st.e, 'p1', 'p1_1'))
        expect(st.e.getActive('p1').volatile_statuses).toHaveProperty('substitute')
        expect(st.e.getActive('p1').substitute_hp).toBeGreaterThan(0)
    })

    it('벤치가 없거나 기술이 막히면 교체 요청이 없다', () => {
        const alone = setup([S('scizor', ['u-turn'], fast)], [S('slowbro', ['tackle'])])
        turn(alone.e, mv(alone.e, 'p1'), mv(alone.e, 'p2'))
        expect(alone.e.getRequest('p1')?.type).toBe('move')
        const immune = setup([S('rotom-wash', ['volt-switch'], fast), ...bench()], [S('garchomp', ['tackle'])])
        turn(immune.e, mv(immune.e, 'p1'), mv(immune.e, 'p2'))
        expect(immune.e.getRequest('p1')?.type).toBe('move')
    })

    it('구속돼 있어도 유턴·배턴터치로는 빠질 수 있다', () => {
        const { e } = setup([S('scizor', ['u-turn'], fast), ...bench()], [S('wobbuffet', ['splash'], { ability: 'shadow-tag' })])
        expect(e.getRequest('p1')).toMatchObject({ can_switch: false })
        turn(e, mv(e, 'p1'), mv(e, 'p2'))
        expect(e.getRequest('p1')).toMatchObject({ type: 'switch', source: { id: 'u-turn' } })
    })

    it('기절 후 교체는 원인 없음, 문장은 "가랏!" (돌아와 아님)', () => {
        const { e, events, ko } = setup([S('magikarp', ['splash'], { level: 1 }), ...bench()], [S('garchomp', ['earthquake'], fast)])
        turn(e, mv(e, 'p1'), mv(e, 'p2'))
        expect(e.getRequest('p1')).toMatchObject({ type: 'switch', reason: 'faint' })
        expect(e.getRequest('p1')).not.toHaveProperty('source')
        e.submitAction(sw(e, 'p1', 'p1_1'))
        expect(last(switchEvents(events))!.source).toBeUndefined()
        expect(ko).toContain('가랏! 해피너스')
        expect(ko.some(t => t.includes('돌아와'))).toBe(false)
    })

    it('일반 교체 문장: 누가 들어가고 누가 나오는지', () => {
        const { e, ko, en } = setup([S('slowbro', ['tackle']), ...bench()], [S('snorlax', ['splash']), ...bench()])
        turn(e, sw(e, 'p1', 'p1_1'), sw(e, 'p2', 'p2_2'))
        expect(ko).toContain('돌아와, 야도란! 가랏! 해피너스!')
        expect(ko).toContain('상대는 잠만보을 거둬들이고 너트령을 내보냈다!'.replace('잠만보을', '잠만보를'))
        expect(en).toContain('Slowbro, come back! Go! Blissey!')
        expect(en).toContain('The opposing trainer withdrew Snorlax and sent out Ferrothorn!')
    })
})

describe('강제 교체: 날려버리기·드래곤테일·레드카드', () => {
    for (const move of ['whirlwind', 'roar', 'dragon-tail', 'circle-throw']) {
        it(move, () => {
            const { e, events, ko } = setup([S('dragonite', [move]), ...bench()], [S('slowbro', ['calm-mind']), ...bench()])
            turn(e, mv(e, 'p1'), mv(e, 'p2'))
            const ev = last(switchEvents(events))!
            expect(ev).toMatchObject({ player: 'p2', forced: true, source: { kind: 'move', id: move } })
            expect(ko).toContain('상대 해피너스가 끌려 나왔다!')
        })
    }

    for (const [name, foe, text] of [
        ['흡반', S('octillery', ['calm-mind'], { ability: 'suction-cups' }), '상대 대포무노는 흡반으로 달라붙어 꿈쩍도 하지 않는다!'],
        ['파수견', S('mabosstiff', ['calm-mind'], { ability: 'guard-dog' }), '상대 마피티프는 꿈쩍도 하지 않는다!'],
        ['뿌리박기', S('ferrothorn', ['ingrain'], fast), '상대 너트령은 뿌리를 박고 있어 꿈쩍도 하지 않는다!'],
    ] as const) {
        it(`${name}은(는) 끌려 나오지 않는다`, () => {
            const { e, events, ko } = setup([S('arcanine', ['roar']), ...bench()], [foe, ...bench()])
            turn(e, mv(e, 'p1'), mv(e, 'p2'))
            expect(switchEvents(events).filter(s => s.forced)).toEqual([])
            expect(ko).toContain(text)
        })
    }

    it('레드카드: 공격한 쪽이 끌려 나온다 (우격다짐이면 발동 안 함)', () => {
        const { e, events, ko, en } = setup([S('slowbro', ['tackle'], { item: 'red-card' }), ...bench()], [S('garchomp', ['earthquake'], fast), ...bench()])
        turn(e, mv(e, 'p1'), mv(e, 'p2'))
        expect(events.find(ev => ev.type === 'item_consume')).toMatchObject({ item: 'red-card', pokemon_id: 'p1_0', target_id: 'p2_0' })
        expect(last(switchEvents(events))).toMatchObject({ player: 'p2', forced: true, source: { kind: 'item', id: 'red-card' } })
        expect(ko).toContain('야도란은 상대 한카리아스에게 레드카드를 내밀었다!')
        expect(en).toContain('Slowbro held up its Red Card against the opposing Garchomp!')

        const sf = setup([S('slowbro', ['tackle'], { item: 'red-card' }), ...bench()], [S('nidoking', ['earth-power'], { ...fast, ability: 'sheer-force' }), ...bench()])
        turn(sf.e, mv(sf.e, 'p1'), mv(sf.e, 'p2'))
        expect(switchEvents(sf.events).filter(s => s.forced)).toEqual([])
    })
})

describe('교체 아이템·특성', () => {
    it('탈출버튼', () => {
        const { e, ko, en, events } = setup([S('slowbro', ['tackle'], { item: 'eject-button' }), ...bench()], [S('garchomp', ['earthquake'], fast), ...bench()])
        turn(e, mv(e, 'p1'), mv(e, 'p2'))
        expect(e.getRequest('p1')).toMatchObject({ type: 'switch', reason: 'self_switch', source: { kind: 'item', id: 'eject-button' } })
        e.submitAction(sw(e, 'p1', 'p1_1'))
        expect(last(switchEvents(events))!.source).toEqual({ kind: 'item', id: 'eject-button' })
        expect(ko).toContain('야도란은 탈출버튼으로 교체된다!')
        expect(ko).toContain('가랏! 해피너스')
        expect(en).toContain('Slowbro is switched out with the Eject Button!')
    })

    it('탈출팩 (자기 기술로 랭크가 떨어져도)', () => {
        const { e, ko } = setup([S('heatran', ['overheat'], { item: 'eject-pack', ...fast }), ...bench()], [S('slowbro', ['tackle'])])
        turn(e, mv(e, 'p1'), mv(e, 'p2'))
        expect(e.getRequest('p1')).toMatchObject({ type: 'switch', source: { kind: 'item', id: 'eject-pack' } })
        e.submitAction(sw(e, 'p1', 'p1_1'))
        expect(ko).toContain('히드런은 탈출팩으로 교체된다!')
    })

    it('위기회피 (HP 가 절반 아래로)', () => {
        let found = false
        for (let level = 40; level <= 70 && !found; level += 5) {
            const { e, ko } = setup([S('golisopod', ['tackle'], { ability: 'emergency-exit' }), ...bench()], [S('garchomp', ['dragon-claw'], { ...fast, level })])
            turn(e, mv(e, 'p1'), mv(e, 'p2'))
            const req = e.getRequest('p1')
            if (req?.type !== 'switch' || req.reason !== 'self_switch') continue
            found = true
            expect(req.source).toEqual({ kind: 'ability', id: 'emergency-exit' })
            e.submitAction(sw(e, 'p1', 'p1_1'))
            expect(ko).toContain('[위기회피] 갑주무사 가랏! 해피너스')
        }
        expect(found).toBe(true)
    })
})

describe('구속: 교체할 수 없는 경우와 예외', () => {
    const cases: [string, PokemonSet, PokemonSet, number, boolean, Generation?][] = [
        ['그림자밟기', S('slowbro', ['tackle']), S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), 0, false],
        ['그림자밟기 vs 고스트 (6세대+)', S('gengar', ['tackle']), S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), 0, true],
        ['그림자밟기 vs 고스트 (5세대: 통함)', S('gengar', ['tackle']), S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), 0, false, 5],
        ['그림자밟기 vs 그림자밟기', S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), 0, true],
        ['개미지옥', S('slowbro', ['tackle']), S('dugtrio', ['splash'], { ability: 'arena-trap' }), 0, false],
        ['개미지옥 vs 비행', S('pidgeot', ['tackle']), S('dugtrio', ['splash'], { ability: 'arena-trap' }), 0, true],
        ['개미지옥 vs 부유', S('gengar', ['tackle'], { ability: 'levitate' }), S('dugtrio', ['splash'], { ability: 'arena-trap' }), 0, true],
        ['개미지옥 vs 풍선', S('slowbro', ['tackle'], { item: 'air-balloon' }), S('dugtrio', ['splash'], { ability: 'arena-trap' }), 0, true],
        ['자력 vs 강철', S('skarmory', ['tackle']), S('magnezone', ['splash'], { ability: 'magnet-pull' }), 0, false],
        ['자력 vs 비강철', S('slowbro', ['tackle']), S('magnezone', ['splash'], { ability: 'magnet-pull' }), 0, true],
        ['탈출용껍질', S('slowbro', ['tackle'], { item: 'shed-shell' }), S('wobbuffet', ['splash'], { ability: 'shadow-tag' }), 0, true],
        ['검은눈빛', S('slowbro', ['tackle']), S('umbreon', ['mean-look'], fast), 1, false],
        ['검은눈빛 vs 고스트', S('gengar', ['tackle']), S('umbreon', ['mean-look'], fast), 1, true],
        ['김밥말이', S('slowbro', ['tackle']), S('arbok', ['wrap'], fast), 1, false],
        ['김밥말이 vs 고스트', S('gengar', ['tackle']), S('arbok', ['wrap'], fast), 1, true],
        ['물고버티기', S('slowbro', ['tackle']), S('dracovish', ['jaw-lock'], fast), 1, false],
        ['배수의진 (자기)', S('falinks', ['no-retreat'], fast), S('slowbro', ['tackle']), 1, false],
        ['뿌리박기 (자기)', S('ferrothorn', ['ingrain'], fast), S('slowbro', ['tackle']), 1, false],
        ['문어굳히기', S('slowbro', ['tackle']), S('grapploct', ['octolock'], fast), 1, false],
        ['페어리록', S('slowbro', ['tackle']), S('klefki', ['fairy-lock'], fast), 1, false],
        ['그림자꿰매기', S('slowbro', ['tackle']), S('decidueye', ['spirit-shackle'], fast), 1, false],
    ]
    for (const [name, me, foe, turns, canSwitch, gen] of cases) {
        it(`${name} → ${canSwitch ? '교체 가능' : '교체 불가'}`, () => {
            const { e } = setup([me, ...bench()], [foe], { gen })
            for (let t = 0; t < turns; t++) turn(e, mv(e, 'p1'), mv(e, 'p2'))
            const req = e.getRequest('p1')
            expect(req).toMatchObject({ type: 'move', can_switch: canSwitch })
            expect(e.getAvailableActions('p1').some(a => a.type === 'switch')).toBe(canSwitch)
            if (!canSwitch) expect(() => e.submitAction(sw(e, 'p1', 'p1_1'))).toThrow()
        })
    }

    it('구속 문장', () => {
        const ml = setup([S('slowbro', ['tackle']), ...bench()], [S('umbreon', ['mean-look'], fast)])
        turn(ml.e, mv(ml.e, 'p1'), mv(ml.e, 'p2'))
        expect(ml.ko).toContain('야도란은 이제 도망칠 수 없다!')
        expect(ml.en).toContain('Slowbro can no longer escape!')
        const wrap = setup([S('slowbro', ['tackle']), ...bench()], [S('arbok', ['wrap'], fast)])
        turn(wrap.e, mv(wrap.e, 'p1'), mv(wrap.e, 'p2'))
        expect(wrap.ko).toContain('야도란은 김밥말이에 붙잡혔다!')
        const ol = setup([S('slowbro', ['tackle']), ...bench()], [S('grapploct', ['octolock'], fast)])
        turn(ol.e, mv(ol.e, 'p1'), mv(ol.e, 'p2'))
        expect(ol.ko).toContain('야도란은 문어굳히기에 걸려 도망칠 수 없다!')
        const fl = setup([S('slowbro', ['tackle']), ...bench()], [S('klefki', ['fairy-lock'], fast)])
        turn(fl.e, mv(fl.e, 'p1'), mv(fl.e, 'p2'))
        expect(fl.en).toContain('No one will be able to run away during the next turn!')
    })
})

describe('장판: 들어올 때', () => {
    /** p1 이 장판을 깔고(여러 번), p2 가 두 번째 포켓몬으로 교체 */
    function enter(hazards: string[], incoming: PokemonSet) {
        // 대기 기술은 명상 (중력이면 튀어오르기를 못 쓴다)
        const setter = S('mew', [...new Set([...hazards, 'calm-mind'])], { ...fast, level: 100 })
        const r = setup([setter], [S('wobbuffet', ['splash'], { ability: 'telepathy' }), incoming])
        for (const h of hazards) turn(r.e, mv(r.e, 'p1', setter.moves.indexOf(h as never)), mv(r.e, 'p2'))
        turn(r.e, mv(r.e, 'p1', setter.moves.indexOf('calm-mind' as never)), sw(r.e, 'p2', 'p2_1'))
        return { ...r, mon: r.e.getPokemon('p2_1')! }
    }
    const lost = (m: { hp: number; max_hp: number }) => m.max_hp - m.hp

    it('스텔스록은 바위 상성대로 (4배 50% ~ 0.25배 3%)', () => {
        for (const [sp, frac] of [['charizard', 1 / 2], ['pidgeot', 1 / 4], ['blissey', 1 / 8], ['garchomp', 1 / 16], ['excadrill', 1 / 32], ['scizor', 1 / 8]] as const) {
            const { mon } = enter(['stealth-rock'], S(sp, ['splash']))
            expect(lost(mon), sp).toBe(Math.floor(mon.max_hp * frac))
        }
    })
    it('통굽부츠·매직가드는 스텔스록을 무시', () => {
        expect(lost(enter(['stealth-rock'], S('charizard', ['splash'], { item: 'heavy-duty-boots' })).mon)).toBe(0)
        expect(lost(enter(['stealth-rock'], S('clefable', ['splash'], { ability: 'magic-guard' })).mon)).toBe(0)
    })
    it('압정뿌리기: 층수, 부유·풍선 무시, 중력이면 맞음', () => {
        const three = enter(['spikes', 'spikes', 'spikes'], S('blissey', ['splash'])).mon
        expect(lost(three)).toBe(Math.floor(three.max_hp / 4))
        expect(lost(enter(['spikes'], S('gengar', ['splash'], { ability: 'levitate' })).mon)).toBe(0)
        const balloon = enter(['spikes'], S('blissey', ['splash'], { item: 'air-balloon' }))
        expect(lost(balloon.mon)).toBe(0)
        expect(balloon.ko).toContain('상대 해피너스는 풍선으로 떠 있다!')
        expect(lost(enter(['spikes', 'gravity'], S('pidgeot', ['splash'])).mon)).toBeGreaterThan(0)
    })
    it('독압정: 1층 독, 2층 맹독, 독타입이 밟으면 사라짐, 강철·비행·부츠·미스트필드는 무시', () => {
        expect(enter(['toxic-spikes'], S('blissey', ['splash'])).mon.status).toBe('poison')
        expect(enter(['toxic-spikes', 'toxic-spikes'], S('blissey', ['splash'])).mon.status).toBe('toxic')
        const muk = enter(['toxic-spikes'], S('muk', ['splash']))
        expect(muk.e.battle.p2.sideConditions['toxicspikes']).toBeUndefined()
        expect(muk.events.find(ev => ev.type === 'side_end')).toMatchObject({ player: 'p2', condition: 'toxic_spikes', pokemon_id: 'p2_1' })
        expect(muk.ko).toContain('상대 질뻐기가 독압정을 흡수했다!')
        expect(muk.en).toContain('The opposing Muk absorbed the Toxic Spikes!')
        const crobat = enter(['toxic-spikes'], S('crobat', ['splash'])) // 독+비행: 땅에 닿지 않아 흡수도 못 한다
        expect(crobat.e.battle.p2.sideConditions['toxicspikes']).toBeDefined()
        for (const mon of [S('skarmory', ['splash']), S('blissey', ['splash'], { item: 'heavy-duty-boots' })]) {
            expect(enter(['toxic-spikes'], mon).mon.status).toBeNull()
        }
        expect(enter(['toxic-spikes', 'misty-terrain'], S('blissey', ['splash'])).mon.status).toBeNull()
    })
    it('끈적끈적네트: 스피드 -1, 심술꾸러기는 +1, 오기 발동, 비행은 무시', () => {
        const web = enter(['sticky-web'], S('blissey', ['splash']))
        expect(web.mon.stages.speed).toBe(-1)
        expect(web.ko).toContain('상대 해피너스는 끈적끈적네트에 걸렸다!')
        expect(enter(['sticky-web'], S('serperior', ['splash'], { ability: 'contrary' })).mon.stages.speed).toBe(1)
        expect(enter(['sticky-web'], S('bisharp', ['splash'], { ability: 'defiant' })).mon.stages.attack).toBe(2)
        expect(enter(['sticky-web'], S('pidgeot', ['splash'])).mon.stages.speed).toBe(0)
    })
    it('자연회복: 나갈 때 상태이상 회복 (문장은 한 번)', () => {
        const setter = S('mew', ['toxic', 'splash'], { level: 100 })
        const { e, ko } = setup([setter], [S('starmie', ['splash'], { ability: 'natural-cure' }), S('blissey', ['splash'])])
        turn(e, mv(e, 'p1', 0), mv(e, 'p2'))
        turn(e, mv(e, 'p1', 1), sw(e, 'p2', 'p2_1'))
        expect(e.getPokemon('p2_0')!.status).toBeNull()
        expect(ko.filter(t => t === '상대 아쿠스타의 맹독 상태가 풀렸다!')).toHaveLength(1)
    })
})

describe('옹골참·일격기', () => {
    it('옹골참은 일격기를 막고, 만피에서 1 HP 로 버틴다 (틀깨기는 무시)', () => {
        const ohko = setup([S('garchomp', ['fissure'])], [S('golem', ['splash'], { ability: 'sturdy' })])
        turn(ohko.e, mv(ohko.e, 'p1'), mv(ohko.e, 'p2'))
        expect(ohko.e.getPokemon('p2_0')!.hp).toBe(ohko.e.getPokemon('p2_0')!.max_hp)
        const endure = setup([S('garchomp', ['earthquake'], { level: 100, evs: { attack: 252 } })], [S('golem', ['splash'], { ability: 'sturdy', level: 20 })])
        turn(endure.e, mv(endure.e, 'p1'), mv(endure.e, 'p2'))
        expect(endure.e.getPokemon('p2_0')!.hp).toBe(1)
        const mb = setup([S('excadrill', ['earthquake'], { ability: 'mold-breaker', level: 100 })], [S('golem', ['splash'], { ability: 'sturdy', level: 20 })])
        turn(mb.e, mv(mb.e, 'p1'), mv(mb.e, 'p2'))
        expect(mb.e.getPokemon('p2_0')!.fainted).toBe(true)
    })
    it('절대영도는 얼음타입에게, 일격기는 레벨이 높은 상대에게 통하지 않는다', () => {
        const ice = setup([S('lapras', ['sheer-cold'])], [S('glalie', ['splash'])])
        turn(ice.e, mv(ice.e, 'p1'), mv(ice.e, 'p2'))
        expect(ice.e.getPokemon('p2_0')!.hp).toBe(ice.e.getPokemon('p2_0')!.max_hp)
        const lv = setup([S('garchomp', ['fissure'])], [S('golem', ['splash'], { level: 60 })])
        turn(lv.e, mv(lv.e, 'p1'), mv(lv.e, 'p2'))
        expect(lv.e.getPokemon('p2_0')!.hp).toBe(lv.e.getPokemon('p2_0')!.max_hp)
    })
})

describe('AI: 교체 판단', () => {
    /** 여러 시드로 같은 상황에서 고른 행동을 모은다 */
    function picks(p1: PokemonSet[], p2: PokemonSet[], prep?: (e: BattleEngine) => void, n = 12) {
        const out: Action[] = []
        for (let seed = 1; seed <= n; seed++) {
            const { e } = setup(p1, p2, { seed })
            prep?.(e)
            out.push(new HeuristicAI({ seed }).chooseAction(e, 'p1')!)
        }
        return out
    }
    const moveIdx = (a: Action) => (a.type === 'move' ? a.move_index : -1)

    it('벤치가 없으면 순간이동·배턴터치·꼬리자르기를 고르지 않는다', () => {
        const acts = picks([S('slowbro', ['teleport', 'scald'])], [S('snorlax', ['splash'])])
        expect(acts.every(a => moveIdx(a) === 1)).toBe(true)
    })
    it('HP 가 절반 이하면 꼬리자르기를 쓰지 않는다', () => {
        const acts = picks([S('cyclizar', ['shed-tail', 'splash'], fast), ...bench()], [S('snorlax', ['splash'])], e => {
            const p = e.battle.p1.active[0]!; p.sethp(Math.floor(p.maxhp / 2))
        })
        expect(acts.some(a => moveIdx(a) === 0)).toBe(false)
    })
    it('흡반 상대에게는 울부짖기를 쓰지 않고, 랭크를 올린 상대에게는 쓴다', () => {
        const team = [S('arcanine', ['roar', 'splash']), ...bench()]
        const cups = picks(team, [S('octillery', ['splash'], { ability: 'suction-cups' }), ...bench()], e => { e.battle.p2.active[0]!.boosts.spa = 2 })
        expect(cups.some(a => moveIdx(a) === 0)).toBe(false)
        const boosted = picks(team, [S('snorlax', ['splash']), ...bench()], e => { e.battle.p2.active[0]!.boosts.atk = 2 })
        expect(boosted.filter(a => moveIdx(a) === 0).length).toBeGreaterThan(8)
    })
    it('배턴터치: 랭크를 쌓았으면 넘기고, 넘겨받을 포켓몬은 그 랭크를 쓰는 쪽', () => {
        const team = [S('ninjask', ['baton-pass', 'splash'], fast), S('alakazam', ['psychic']), S('machamp', ['close-combat'])]
        const acts = picks(team, [S('snorlax', ['splash'])], e => { Object.assign(e.battle.p1.active[0]!.boosts, { atk: 4, spe: 2 }) })
        expect(acts.filter(a => moveIdx(a) === 0).length).toBeGreaterThan(8)
        const chosen = new Set<string>()
        for (let seed = 1; seed <= 12; seed++) {
            const { e } = setup(team, [S('snorlax', ['splash'])], { seed })
            Object.assign(e.battle.p1.active[0]!.boosts, { atk: 4, spe: 2 })
            turn(e, mv(e, 'p1', 0), mv(e, 'p2'))
            const a = new HeuristicAI({ seed }).chooseAction(e, 'p1')!
            if (a.type === 'switch') chosen.add(a.switch_to_id)
        }
        expect([...chosen]).toEqual(['p1_2']) // 물리 공격 랭크 → 괴력몬
    })
    it('교체할 포켓몬을 고를 때 스텔스록 피해를 따진다', () => {
        // 리자몽(바위 4배)과 윈디(1배): 상성은 거의 같지만 스텔스록이 깔리면 윈디
        const chosen: string[] = []
        for (let seed = 1; seed <= 12; seed++) {
            const { e } = setup([S('magikarp', ['splash'], { level: 1 }), S('charizard', ['flamethrower']), S('arcanine', ['flamethrower'])], [S('mew', ['stealth-rock', 'tackle'], { ...fast, level: 100 })], { seed })
            turn(e, mv(e, 'p1'), mv(e, 'p2', 0))
            turn(e, mv(e, 'p1'), mv(e, 'p2', 1)) // 잉어킹 기절
            const a = new HeuristicAI({ seed }).chooseAction(e, 'p1')
            if (a?.type === 'switch') chosen.push(a.switch_to_id)
        }
        expect(chosen.length).toBeGreaterThan(0)
        expect(chosen.filter(id => id === 'p1_2').length).toBeGreaterThan(chosen.length / 2)
    })
})
