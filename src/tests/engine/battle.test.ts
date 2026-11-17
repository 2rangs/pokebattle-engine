import { describe, it, expect } from 'vitest'
import { Dex, toID } from '@pkmn/sim'
import {
    BattleEngine, BattleError, simulateBattle, HeuristicAI, RandomAI, generateRandomTeam, generateChaosTeam,
    parseShowdownTeam, exportShowdownTeam, calculateDamage, formatEvent, getSpecies, getMove, koName,
    listPokeApiSpecies, speciesToShowdown, speciesSlug, PRNG,
} from '../../index'
import type { Action, BattleConfig, BattleEvent, PlayerID } from '../../types/battle'
import type { PokemonSet } from '../../types/pokemon'

const set = (species: string, moves: string[], extra: Partial<PokemonSet> = {}): PokemonSet => ({
    species, level: 50, gender: null, ability: '', nature: 'hardy',
    moves: moves as PokemonSet['moves'], evs: {}, ivs: {}, ...extra,
})

function battle(p1: PokemonSet[], p2: PokemonSet[], seed = 1, format: BattleConfig['format'] = 'singles'): BattleEngine {
    const e = new BattleEngine({ format, seed, p1: { name: 'P1', team: p1 }, p2: { name: 'P2', team: p2 } })
    e.start()
    return e
}
const move = (e: BattleEngine, player: PlayerID, idx: 0 | 1 | 2 | 3 = 0, tera = false): Action =>
    ({ type: 'move', player, pokemon_id: e.getActive(player).id, move_index: idx, terastallize: tera || undefined })
const sw = (e: BattleEngine, player: PlayerID, to: string): Action =>
    ({ type: 'switch', player, pokemon_id: e.getActive(player).id, switch_to_id: to })
const events = <T extends BattleEvent['type']>(e: BattleEngine, type: T) =>
    e.getState().log.filter((ev): ev is Extract<BattleEvent, { type: T }> => ev.type === type)

// ─── PokeAPI ↔ Showdown 데이터 ─────────────────────────────────
describe('PokeAPI ↔ Showdown 매핑', () => {
    it('PokeAPI 의 모든 포켓몬(폼 포함)이 Showdown 종으로 연결된다', () => {
        const all = listPokeApiSpecies()
        expect(all.length).toBeGreaterThan(1300)
        const unmapped = all.filter(s => !Dex.species.get(speciesToShowdown(s.slug)).exists)
        expect(unmapped.map(s => s.slug)).toEqual([])
    })
    it('Showdown → PokeAPI 역매핑은 기본 폼 슬러그', () => {
        expect(speciesSlug('urshifu')).toBe('urshifu-single-strike')
        expect(speciesSlug('Urshifu-Rapid-Strike')).toBe('urshifu-rapid-strike')
        expect(speciesSlug('greattusk')).toBe('great-tusk')
    })
    it('한국어 이름 (PokeAPI)', () => {
        expect(koName.species('garchomp')).toBe('한카리아스')
        expect(koName.move('earthquake')).toBe('지진')
        expect(koName.ability('intimidate')).toBe('위협')
        expect(koName.item('leftovers')).toBe('먹다남은음식')
        expect(koName.type('fire')).toBe('불꽃')
    })
    it('getSpecies / getMove 는 Showdown 데이터', () => {
        const chomp = getSpecies('garchomp')!
        expect(chomp.base_stats.attack).toBe(130)
        expect(chomp.abilities.map(a => a.name)).toContain('rough-skin')
        const eq = getMove('earthquake')!
        expect(eq).toMatchObject({ power: 100, type: 'ground', category: 'physical' })
        expect(getMove('kings-shield')!.priority).toBe(4)
    })
})

// ─── 기본 흐름 ───────────────────────────────────────────────
describe('BattleEngine (Showdown 시뮬레이터)', () => {
    it('턴 진행 + 이벤트', () => {
        const e = battle([set('garchomp', ['earthquake'])], [set('blissey', ['soft-boiled'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().turn).toBe(2)
        expect(events(e, 'move_use').map(ev => ev.move.name)).toEqual(expect.arrayContaining(['earthquake', 'soft-boiled']))
        expect(e.unhandledProtocol.size).toBe(0)
    })

    it('battle_start 시점에도 getState() 가 안전하다', () => {
        const e = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team: [set('eevee', ['tackle'])] }, p2: { name: 'B', team: [set('pikachu', ['tackle'])] } })
        const phases: string[] = []
        e.on('*', () => { phases.push(e.getState().phase); e.getRequest('p1'); e.getRawRequest('p2') })
        e.start()
        expect(phases.length).toBeGreaterThan(2)
        expect(e.getState().sides.p1.team).toHaveLength(1)
    })

    it('잘못된 행동은 BattleError', () => {
        const e = battle([set('pikachu', ['thunderbolt'])], [set('eevee', ['tackle'])])
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p2_0', move_index: 0 })).toThrow(BattleError)
        expect(() => e.submitAction(sw(e, 'p1', 'p1_5'))).toThrow(BattleError)
        expect(() => e.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 3 })).toThrow(BattleError)
    })

    it('잘못된 팀은 BattleError', () => {
        expect(() => battle([set('notamon', ['tackle'])], [set('eevee', ['tackle'])])).toThrow(BattleError)
        expect(() => battle([set('eevee', ['notamove'])], [set('eevee', ['tackle'])])).toThrow(BattleError)
        expect(() => new BattleEngine({ format: 'doubles', p1: { name: 'a', team: [set('eevee', ['tackle'])] }, p2: { name: 'b', team: [set('eevee', ['tackle'])] } })).toThrow(BattleError)
    })

    it('기절 → 교체 요청 → 다음 턴', () => {
        const e = battle([set('garchomp', ['earthquake'], { level: 100 })], [set('pikachu', ['splash'], { level: 5 }), set('eevee', ['tackle'])])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getState().phase).toBe('switching')
        expect(e.getRequest('p2')).toMatchObject({ type: 'switch', reason: 'faint' })
        expect(e.getRequest('p1')).toBeNull()
        e.submitAction(sw(e, 'p2', 'p2_1'))
        expect(e.getState().phase).toBe('waiting_action')
        expect(e.getActive('p2').species).toBe('eevee')
    })

    it('유턴: 턴 중간 교체 요청', () => {
        const e = battle(
            [set('scizor', ['u-turn'], { evs: { speed: 252 }, nature: 'jolly' }), set('blissey', ['soft-boiled'])],
            [set('slowbro', ['tackle'])],
        )
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getRequest('p1')).toMatchObject({ type: 'switch', reason: 'self_switch' })
        expect(events(e, 'move_use').filter(ev => ev.pokemon_id === 'p2_0').length).toBe(0)
        e.submitAction(sw(e, 'p1', 'p1_1'))
        expect(events(e, 'move_use').find(ev => ev.pokemon_id === 'p2_0')?.target_id).toBe('p1_1')
    })

    it('부활의기원: 기절한 포켓몬 중에서 선택', () => {
        const e = battle(
            [set('pawmot', ['revival-blessing', 'splash'], { level: 100, evs: { speed: 252 } }), set('magikarp', ['splash'], { level: 1 })],
            [set('garchomp', ['earthquake'], { level: 100 })],
        )
        // 잉어킹을 먼저 쓰러뜨리기 위해 교체
        e.submitActions(sw(e, 'p1', 'p1_1'), move(e, 'p2'))
        e.submitAction(sw(e, 'p1', 'p1_0'))
        e.submitActions(move(e, 'p1', 0), move(e, 'p2'))
        const req = e.getRequest('p1')
        expect(req).toMatchObject({ type: 'switch', reason: 'revival_blessing' })
        expect(req!.switches.map(p => p.id)).toEqual(['p1_1'])
    })

    it('숨은 구속 (그림자밟기): 교체 선택지 없음', () => {
        const e = battle([set('eevee', ['tackle']), set('pikachu', ['tackle'])], [set('wobbuffet', ['splash'], { ability: 'shadow-tag' })])
        const req = e.getRequest('p1')
        expect(req?.type).toBe('move')
        expect(req!.switches).toEqual([])
    })

    it('같은 시드 → 같은 결과', () => {
        const run = (seed: number) => {
            const cfg: BattleConfig = { format: 'singles', seed, p1: { name: 'A', team: generateRandomTeam({ seed }) }, p2: { name: 'B', team: generateRandomTeam({ seed: seed + 1 }) } }
            const r = simulateBattle(cfg, { p1: new HeuristicAI({ seed }), p2: new HeuristicAI({ seed: seed + 1 }) })
            return r.engine.protocolLog.filter(l => !l.startsWith('|t:|')).join('\n')
        }
        expect(run(42)).toBe(run(42))
        expect(run(42)).not.toBe(run(43))
    })

    it('doubles: Showdown 선택 문자열', () => {
        const e = battle(
            [set('incineroar', ['fake-out', 'flare-blitz']), set('amoonguss', ['spore', 'pollen-puff'])],
            [set('rillaboom', ['fake-out', 'wood-hammer']), set('flutter-mane', ['moonblast', 'shadow-ball'])],
            3, 'doubles',
        )
        e.submitChoice('p1', 'move 1 1, move 1 2')
        e.submitChoice('p2', 'move 2 1, move 1 2')
        expect(e.getState().turn).toBe(2)
        expect(events(e, 'move_use').length).toBeGreaterThanOrEqual(3)
        expect(e.unhandledProtocol.size).toBe(0)
    })
})

// ─── 특성 ────────────────────────────────────────────────────
describe('특성이 결과에 반영된다', () => {
    it('부유: 땅 기술 무효', () => {
        const e = battle([set('garchomp', ['earthquake'])], [set('rotom-wash', ['splash'], { ability: 'levitate' })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(events(e, 'immune').some(ev => ev.pokemon_id === 'p2_0')).toBe(true)
        expect(e.getActive('p2').hp).toBe(e.getActive('p2').max_hp)
    })
    it('위협: 등장 시 상대 공격 -1', () => {
        const e = battle([set('gyarados', ['splash'], { ability: 'intimidate' })], [set('garchomp', ['earthquake'])])
        expect(e.getActive('p2').stages.attack).toBe(-1)
        expect(events(e, 'ability_trigger').some(ev => ev.ability === 'intimidate')).toBe(true)
    })
    it('가뭄: 쾌청 → 엽록소 스피드 2배', () => {
        const e = battle([set('torkoal', ['splash'], { ability: 'drought' })], [set('venusaur', ['splash'], { ability: 'chlorophyll' })])
        expect(e.getState().field.weather).toBe('sun')
        const venu = e.getActive('p2')
        expect(e.getSpeed(venu)).toBe(venu.stats.speed * 2)
    })
    it('멀티스케일: 풀 HP 에서 데미지 반감 (계산기)', () => {
        const atk = { species: 'weavile', level: 50, evs: { attack: 252 }, nature: 'jolly' }
        const full = calculateDamage(atk, { species: 'dragonite', ability: 'multiscale' }, 'ice-shard')
        const none = calculateDamage(atk, { species: 'dragonite', ability: 'inner-focus' }, 'ice-shard')
        expect(full.max).toBeLessThan(none.max * 0.6)
    })
    it('황금몸: 상대의 변화기 무효', () => {
        const e = battle([set('breloom', ['spore'], { evs: { speed: 252 } })], [set('gholdengo', ['splash'], { ability: 'good-as-gold' })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getActive('p2').status).toBeNull()
        expect(events(e, 'immune').length).toBeGreaterThan(0)
    })
    it('매직미러: 변화기 반사', () => {
        const e = battle([set('breloom', ['spore'])], [set('hatterene', ['splash'], { ability: 'magic-bounce' })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        expect(e.getActive('p1').status === 'sleep' || e.getActive('p1').types.includes('grass')).toBe(true)
        expect(e.getActive('p2').status).toBeNull()
    })
    it('재생력: 교체 시 1/3 회복 (조용한 회복도 이벤트로)', () => {
        const e = battle(
            [set('toxapex', ['splash'], { ability: 'regenerator' }), set('blissey', ['splash'])],
            [set('garchomp', ['dragon-claw'])],
        )
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        const hurt = e.getPokemon('p1_0')!.hp
        e.submitActions(sw(e, 'p1', 'p1_1'), move(e, 'p2'))
        expect(e.getPokemon('p1_0')!.hp).toBeGreaterThan(hurt)
        expect(events(e, 'heal').some(ev => ev.pokemon_id === 'p1_0' && ev.source === 'regenerator')).toBe(true)
    })
    it('부스트에너지 + 고대활성', () => {
        const e = battle([set('great-tusk', ['headlong-rush'], { ability: 'protosynthesis', item: 'booster-energy' })], [set('blissey', ['splash'])])
        expect(e.getActive('p1').item).toBeNull()
        expect(e.getActive('p1').volatile_statuses).toHaveProperty('paradox_boost')
    })
})

// ─── 계산기 (Showdown 계산기와 동일) ────────────────────────────
describe('calculateDamage (@smogon/calc)', () => {
    it('Lv50 양기 252 한카리아스 지진 → 4 HP 타부자고: 180~212, 확정 1타', () => {
        const r = calculateDamage(
            { species: 'garchomp', level: 50, nature: 'jolly', evs: { attack: 252, speed: 252 } },
            { species: 'gholdengo', level: 50, evs: { hp: 4 } },
            'earthquake',
        )
        expect([r.min, r.max]).toEqual([180, 212])
        expect(r.koText).toBe('확정 1타')
        expect(r.effectiveness).toBe(2)
        expect(r.isSTAB).toBe(true)
        expect(r.range).toHaveLength(16)
    })
    it('날씨/벽/급소/테라스탈 반영', () => {
        const atk = { species: 'charizard', level: 50, nature: 'modest', evs: { special_attack: 252 } }
        const def = { species: 'blissey', level: 50, evs: { hp: 252 } }
        const base = calculateDamage(atk, def, 'flamethrower')
        expect(calculateDamage(atk, def, 'flamethrower', { weather: 'sun' }).max).toBeGreaterThan(base.max)
        expect(calculateDamage(atk, def, 'flamethrower', { lightScreen: true }).max).toBeLessThan(base.max)
        expect(calculateDamage(atk, def, 'flamethrower', { isCrit: true }).max).toBeGreaterThan(base.max)
        expect(calculateDamage({ ...atk, teraType: 'fire', terastallized: true }, def, 'flamethrower').max).toBeGreaterThan(base.max)
    })
    it('엔진 미리보기 = 계산기', () => {
        const e = battle([set('garchomp', ['earthquake'], { nature: 'jolly', evs: { attack: 252 } })], [set('gholdengo', ['splash'], { evs: { hp: 4 } })])
        const r = e.previewDamage('p1', 0)!
        expect([r.min, r.max]).toEqual([180, 212])
    })
})

// ─── 팀 / 포맷 ────────────────────────────────────────────────
describe('팀 입출력', () => {
    const text = `Great Tusk @ Booster Energy
Ability: Protosynthesis
Tera Type: Steel
EVs: 252 HP / 4 Atk / 252 Spe
Jolly Nature
- Headlong Rush
- Ice Spinner
- Rapid Spin
- Knock Off

Urshifu-Rapid-Strike @ Choice Band
Ability: Unseen Fist
Level: 100
Adamant Nature
IVs: 0 Spe
- Surging Strikes
- Close Combat
- U-turn
- Aqua Jet`

    it('Showdown 텍스트 → PokeAPI 슬러그 세트', () => {
        const team = parseShowdownTeam(text)
        expect(team).toHaveLength(2)
        expect(team[0]).toMatchObject({ species: 'great-tusk', item: 'booster-energy', ability: 'protosynthesis', teraType: 'steel', nature: 'jolly', level: 50 })
        expect(team[0]!.moves).toEqual(['headlong-rush', 'ice-spinner', 'rapid-spin', 'knock-off'])
        expect(team[1]).toMatchObject({ species: 'urshifu-rapid-strike', level: 100, ivs: { speed: 0 } })
    })
    it('내보내기 → 다시 가져오기 (왕복)', () => {
        const team = parseShowdownTeam(text)
        const again = parseShowdownTeam(exportShowdownTeam(team))
        expect(again.map(p => p.moves)).toEqual(team.map(p => p.moves))
        expect(again.map(p => p.species)).toEqual(team.map(p => p.species))
    })
    it('랜덤배틀 세트는 그대로 배틀 가능', () => {
        for (let s = 0; s < 20; s++) {
            const e = battle(generateRandomTeam({ seed: s }), generateRandomTeam({ seed: s + 100 }), s)
            expect(e.getRequest('p1')).not.toBeNull()
        }
    })
})

// ─── AI / 포맷터 ─────────────────────────────────────────────
describe('AI / 한국어 로그', () => {
    it('HeuristicAI 는 RandomAI 를 이긴다 (다수결)', () => {
        let wins = 0
        const N = 30
        for (let i = 0; i < N; i++) {
            const r = simulateBattle({
                format: 'singles', seed: i,
                p1: { name: 'H', team: generateRandomTeam({ seed: 1000 + i, size: 3 }) },
                p2: { name: 'R', team: generateRandomTeam({ seed: 2000 + i, size: 3 }) },
            }, { p1: new HeuristicAI({ seed: i }), p2: new RandomAI(i) })
            if (r.winner === 'p1') wins++
        }
        expect(wins / N).toBeGreaterThan(0.6)
    })
    it('formatEvent: 한국어 이름 + 올바른 조사', () => {
        const e = battle([set('garchomp', ['earthquake'], { level: 100 })], [set('pikachu', ['splash'], { level: 5 })])
        e.submitActions(move(e, 'p1'), move(e, 'p2'))
        const text = e.getState().log.map(ev => formatEvent(ev, { getPokemon: id => e.getPokemon(id) })).filter(Boolean).join('\n')
        expect(text).toContain('한카리아스의 지진!')
        expect(text).toContain('상대 피카츄는 쓰러졌다!')
    })
    it('혼돈 팀도 끝까지 진행된다 (표본)', () => {
        for (let i = 0; i < 25; i++) {
            const rng = new PRNG(i)
            const r = simulateBattle({ format: 'singles', seed: i, maxTurns: 300, p1: { name: 'A', team: generateChaosTeam({ rng }) }, p2: { name: 'B', team: generateChaosTeam({ rng }) } },
                { p1: new RandomAI(i), p2: new RandomAI(i + 1) })
            expect(r.engine.battle.ended).toBe(true)
            expect(r.engine.unhandledProtocol.size).toBe(0)
        }
    })
})

void toID
