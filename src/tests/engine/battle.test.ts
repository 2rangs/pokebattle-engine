import { describe, it, expect, beforeAll } from 'vitest'
import {
    BattleEngine, BattleError, preloadData, simulateBattle, HeuristicAI, RandomAI,
    generateRandomTeam, PRNG, parseShowdownTeam, exportShowdownTeam, calcDamage, getTypeChart,
    createBattlePokemon, formatEvent,
} from '../../index'
import type { Action, BattleConfig, BattleEvent, PlayerID } from '../../types/battle'
import type { PokemonSet } from '../../types/pokemon'

beforeAll(async () => {
    await preloadData()
})

const set = (species: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet => ({
    species, level: 50, gender: null, ability: '', nature: 'hardy',
    moves: moves as PokemonSet['moves'], evs: {}, ivs: {}, ...extra,
})

function battle(p1: PokemonSet[], p2: PokemonSet[], seed = 1): BattleEngine {
    const cfg: BattleConfig = { format: 'singles', seed, p1: { name: 'P1', team: p1 }, p2: { name: 'P2', team: p2 } }
    const e = new BattleEngine(cfg)
    e.start()
    return e
}

const move = (e: BattleEngine, player: PlayerID, idx: 0 | 1 | 2 | 3 = 0, tera = false): Action => ({
    type: 'move', player, pokemon_id: e.getActive(player).id, move_index: idx, terastallize: tera || undefined,
})
const sw = (e: BattleEngine, player: PlayerID, to: string): Action => ({
    type: 'switch', player, pokemon_id: e.getActive(player).id, switch_to_id: to,
})
const events = <T extends BattleEvent['type']>(e: BattleEngine, type: T) =>
    e.getState().log.filter((ev): ev is Extract<BattleEvent, { type: T }> => ev.type === type)

describe('BattleEngine 기본 흐름', () => {
    it('선두 등장 + 턴 진행', () => {
        const e = battle([set('garchomp', ['earthquake'])], [set('blissey', ['soft-boiled'])])
        expect(e.getState().phase).toBe('waiting_action')
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().turn).toBe(2)
        expect(events(e, 'move_use').length).toBe(2)
    })

    it('같은 시드 → 같은 결과 (재현성)', () => {
        const run = (seed: number) => {
            const rng = new PRNG(seed)
            const cfg: BattleConfig = {
                format: 'singles', seed,
                p1: { name: 'A', team: generateRandomTeam({ rng }) },
                p2: { name: 'B', team: generateRandomTeam({ rng }) },
            }
            const r = simulateBattle(cfg, { p1: new HeuristicAI({ seed }), p2: new HeuristicAI({ seed: seed + 1 }) })
            return JSON.stringify(r.log.filter(ev => ev.type !== 'turn_end'))
        }
        expect(run(42)).toBe(run(42))
        expect(run(42)).not.toBe(run(43))
    })

    it('잘못된 행동은 BattleError', () => {
        const e = battle([set('pikachu', ['thunderbolt'])], [set('eevee', ['tackle'])])
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p2_0', move_index: 0 })).toThrow(BattleError)
        expect(() => e.submitAction(sw(e, 'p1', 'p1_5'))).toThrow(BattleError)
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 3 })).toThrow(BattleError)
    })

    it('doubles 포맷은 명시적으로 거부', () => {
        expect(() => new BattleEngine({ format: 'doubles', p1: { name: 'a', team: [set('pikachu', ['tackle'])] }, p2: { name: 'b', team: [set('pikachu', ['tackle'])] } }))
            .toThrow(BattleError)
    })

    it('기절 → 교체 페이즈 → 다음 턴', () => {
        const e = battle(
            [set('garchomp', ['earthquake'], { level: 100, nature: 'adamant', evs: { attack: 252 } })],
            [set('pikachu', ['splash']), set('eevee', ['tackle'])],
        )
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().phase).toBe('switching')
        expect(e.getRequest('p2')?.type).toBe('switch')
        expect(e.getRequest('p1')).toBeNull()
        e.submitAction(sw(e, 'p2', 'p2_1'))
        expect(e.getState().phase).toBe('waiting_action')
        expect(e.getActive('p2').species).toBe('eevee')
    })

    it('모두 쓰러지면 배틀 종료', () => {
        const e = battle([set('garchomp', ['earthquake'], { level: 100 })], [set('pikachu', ['splash'], { level: 5 })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().phase).toBe('ended')
        expect(e.getState().winner).toBe('p1')
    })
})

describe('턴 중 교체 (유턴)', () => {
    it('유턴 → 교체 요청 → 남은 행동 재개', () => {
        const e = battle(
            [set('scizor', ['u-turn'], { evs: { speed: 252 }, nature: 'jolly' }), set('blissey', ['soft-boiled'])],
            [set('slowbro', ['tackle'])],
        )
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().phase).toBe('switching')
        expect(e.getState().pending_switches?.p1).toBe('self_switch')
        // 상대의 행동은 아직 실행되지 않음
        expect(events(e, 'move_use').filter(ev => ev.pokemon_id === 'p2_0').length).toBe(0)
        e.submitAction(sw(e, 'p1', 'p1_1'))
        // 교체 후 상대 기술이 새로 나온 포켓몬에게
        const foeMove = events(e, 'move_use').find(ev => ev.pokemon_id === 'p2_0')
        expect(foeMove?.target_id).toBe('p1_1')
        expect(e.getState().phase).toBe('waiting_action')
    })
})

describe('상태이상', () => {
    it('화상: 물리 데미지 약 절반 (이중 적용 없음)', () => {
        const atk = createBattlePokemon(set('garchomp', ['earthquake']), 'p1_0')
        const def = createBattlePokemon(set('blissey', ['soft-boiled']), 'p2_0')
        const eq = atk.moves[0]!.move
        const base = { defender: def, move: eq, weather: null, terrain: null, typeChart: getTypeChart(), randomRoll: 100 }
        const normal = calcDamage({ ...base, attacker: atk }).damage
        const burned = calcDamage({ ...base, attacker: { ...atk, status: 'burn' } }).damage
        expect(burned / normal).toBeGreaterThan(0.45)
        expect(burned / normal).toBeLessThan(0.55)
    })

    it('수면: 1~3턴 동안 행동 불가', () => {
        const e = battle([set('breloom', ['spore'], { evs: { speed: 252 } })], [set('snorlax', ['tackle'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getActive('p2').status).toBe('sleep')
        const sleepTurns = e.getActive('p2').status_turns
        // 카운터 2~4 로 시작, 첫 행동 시도에서 1 감소 → 남은 1~3
        expect(sleepTurns).toBeGreaterThanOrEqual(1)
        expect(sleepTurns).toBeLessThanOrEqual(3)
        expect(events(e, 'cant_move').some(ev => ev.reason === 'sleep')).toBe(true)
    })

    it('얼음 상태는 행동하지 못한다', () => {
        const e = battle([set('pikachu', ['splash'])], [set('eevee', ['tackle'])])
        e.getActive('p2').status = 'freeze'
        let froze = 0
        for (let i = 0; i < 5 && e.getState().phase === 'waiting_action'; i++) {
            e.submitActions(move(e, 'p1'), move(e, 'p2'))
        }
        froze = events(e, 'cant_move').filter(ev => ev.reason === 'freeze').length
        expect(froze).toBeGreaterThan(0)
    })

    it('맹독은 턴마다 데미지 증가', () => {
        const e = battle([set('toxapex', ['toxic'])], [set('blissey', ['splash'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        const toxic = events(e, 'damage').filter(ev => ev.source === 'toxic').map(ev => ev.amount)
        expect(toxic.length).toBe(2)
        expect(toxic[1]!).toBeGreaterThan(toxic[0]!)
    })
})

describe('필드 / 사이드', () => {
    it('스텔스록: 리자몽 교체 시 1/2', () => {
        const e = battle([set('garchomp', ['stealth-rock'])], [set('blissey', ['splash']), set('charizard', ['splash'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        e.submitActions(move(e, 'p1'), sw(e, 'p2', 'p2_1'))
        const zard = e.getPokemon('p2_1')!
        const rock = events(e, 'damage').find(ev => ev.source === 'stealth-rock')
        expect(rock?.amount).toBe(Math.floor(zard.max_hp / 2))
    })

    it('리플렉터: 물리 데미지 감소 + 5턴 후 해제', () => {
        const e = battle([set('blissey', ['reflect'])], [set('snorlax', ['splash'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getSide('p1').conditions.reflect).toBeDefined()
        for (let i = 0; i < 5; i++) e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'side_end').some(ev => ev.condition === 'reflect')).toBe(true)
    })

    it('트릭룸: 느린 쪽이 먼저', () => {
        const e = battle(
            [set('snorlax', ['trick-room', 'tackle'])],
            [set('jolteon', ['splash'], { evs: { speed: 252 } })],
        )
        e.submitActions(move(e, 'p1', 0), move(e, 'p2'))
        e.submitActions(move(e, 'p1', 1), move(e, 'p2'))
        const t2 = e.getState().log.slice(e.getState().log.findIndex(ev => ev.type === 'turn_start' && ev.turn === 2))
        const firstMove = t2.find(ev => ev.type === 'move_use') as Extract<BattleEvent, { type: 'move_use' }>
        expect(firstMove.pokemon_id).toBe('p1_0')
    })

    it('먹다남은음식: 턴 종료 1/16 회복', () => {
        const e = battle([set('snorlax', ['splash'], { item: 'leftovers' })], [set('pikachu', ['thunderbolt'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'heal').some(ev => ev.source === 'leftovers')).toBe(true)
    })

    it('위협: 등장 시 상대 공격 -1', () => {
        const e = battle([set('gyarados', ['splash'], { ability: 'intimidate' })], [set('garchomp', ['earthquake'])])
        expect(e.getActive('p2').stages.attack).toBe(-1)
    })

    it('가뭄: 등장 시 쾌청', () => {
        const e = battle([set('torkoal', ['splash'], { ability: 'drought' })], [set('garchomp', ['earthquake'])])
        expect(e.getState().field.weather).toBe('sun')
    })
})

describe('기술 메커니즘', () => {
    it('파괴광선: 다음 턴 반동', () => {
        const e = battle([set('snorlax', ['hyper-beam'], { ability: 'no-guard' })], [set('blissey', ['soft-boiled'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getActive('p1').must_recharge).toBe(true)
        expect(e.getRequest('p1')?.type === 'move' && e.getRequest('p1')).toMatchObject({ forced: true })
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'cant_move').some(ev => ev.reason === 'recharge')).toBe(true)
    })

    it('구애스카프: 다른 기술 잠김', () => {
        const e = battle([set('garchomp', ['earthquake', 'dragon-claw'], { item: 'choice-scarf' })], [set('blissey', ['soft-boiled'])])
        e.submitActions(move(e, 'p1', 0), move(e, 'p2'))
        const req = e.getRequest('p1')
        expect(req?.type).toBe('move')
        if (req?.type === 'move') {
            expect(req.moves.find(m => m.index === 1)?.disabled).toBe(true)
            expect(req.moves.find(m => m.index === 0)?.disabled).toBe(false)
        }
    })

    it('방어: 공격을 막는다', () => {
        const e = battle([set('garchomp', ['earthquake'])], [set('blissey', ['protect'], { evs: { speed: 252 } })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'move_fail').some(ev => ev.reason === 'protect')).toBe(true)
        expect(e.getActive('p2').hp).toBe(e.getActive('p2').max_hp)
    })

    it('솔라빔: 1턴 모으고 2턴째 공격 (강제)', () => {
        const e = battle([set('venusaur', ['solar-beam', 'tackle'])], [set('blissey', ['splash'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'damage').length).toBe(0)
        const req = e.getRequest('p1')
        expect(req?.type === 'move' && req.forced).toBe(true)
        e.submitActions(move(e, 'p1', 0), move(e, 'p2'))
        expect(events(e, 'damage').some(ev => ev.pokemon_id === 'p2_0')).toBe(true)
    })

    it('테라스탈: 타입 변경 + 1회 제한', () => {
        const e = battle([set('dragonite', ['extreme-speed'], { teraType: 'normal' })], [set('blissey', ['splash'])])
        expect(e.getRequest('p1')).toMatchObject({ can_terastallize: true })
        e.submitActions(move(e, 'p1', 0, true), move(e, 'p2'))
        expect(e.getActive('p1').types).toEqual(['normal'])
        expect(events(e, 'terastallize').length).toBe(1)
        expect(e.getRequest('p1')).toMatchObject({ can_terastallize: false })
    })

    it('PP 가 모두 떨어지면 발버둥', () => {
        const e = battle([set('pikachu', ['thunderbolt'])], [set('blissey', ['soft-boiled'])])
        e.getActive('p1').moves[0]!.pp = 0
        const req = e.getRequest('p1')
        expect(req?.type === 'move' && req.moves[0]!.index).toBe(-1)
    })
})

describe('AI / 시뮬레이션', () => {
    it('HeuristicAI 는 RandomAI 를 이긴다 (다수결)', () => {
        let wins = 0
        const N = 30
        for (let i = 0; i < N; i++) {
            const rng = new PRNG(500 + i)
            const r = simulateBattle({
                format: 'singles', seed: i,
                p1: { name: 'H', team: generateRandomTeam({ rng, size: 3 }) },
                p2: { name: 'R', team: generateRandomTeam({ rng, size: 3 }) },
            }, { p1: new HeuristicAI({ seed: i }), p2: new RandomAI(i) })
            if (r.winner === 'p1') wins++
        }
        expect(wins / N).toBeGreaterThan(0.6)
    })

    it('formatEvent 는 한국어 로그를 만든다', () => {
        const e = battle([set('garchomp', ['earthquake'])], [set('blissey', ['soft-boiled'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        const lines = e.getState().log.map(ev => formatEvent(ev, { getPokemon: id => e.getPokemon(id) })).filter(Boolean)
        expect(lines.join('\n')).toContain('데미지')
    })
})

describe('Showdown 포맷', () => {
    const text = `Great Tusk @ Booster Energy
Ability: Protosynthesis
Tera Type: Steel
EVs: 252 HP / 4 Atk / 252 Spe
Jolly Nature
- Headlong Rush
- Ice Spinner
- Rapid Spin
- Knock Off

Kingambit @ Leftovers
Ability: Supreme Overlord
Level: 100
Adamant Nature
IVs: 0 Spe
- Swords Dance
- Kowtow Cleave
- Iron Head
- Sucker Punch`

    it('파싱 (여러 단어 기술/특성 포함)', () => {
        const team = parseShowdownTeam(text)
        expect(team).toHaveLength(2)
        expect(team[0]).toMatchObject({ species: 'great-tusk', item: 'booster-energy', ability: 'protosynthesis', teraType: 'steel', nature: 'jolly' })
        expect(team[0]!.moves).toEqual(['headlong-rush', 'ice-spinner', 'rapid-spin', 'knock-off'])
        expect(team[0]!.evs).toEqual({ hp: 252, attack: 4, speed: 252 })
        expect(team[1]).toMatchObject({ level: 100, ivs: { speed: 0 } })
    })

    it('내보내기 → 다시 파싱 (왕복)', () => {
        const team = parseShowdownTeam(text)
        const again = parseShowdownTeam(exportShowdownTeam(team))
        expect(again.map(p => p.moves)).toEqual(team.map(p => p.moves))
        expect(again.map(p => p.species)).toEqual(team.map(p => p.species))
    })
})
