// ─── 자동 배틀 / 팀 생성 ──────────────────────────────────────
import { Dex, toID } from '@pkmn/sim'
import type { Species as PSSpecies } from '@pkmn/sim'
import { getRandoms, learnsetsLoaded } from '../data/lazy'
import type { BattleConfig, BattleEvent, PlayerID } from '../types/battle'
import type { PokemonSet, Nature, EVs } from '../types/pokemon'
import type { BattleAI } from '../ai'
import { BattleEngine } from '../engine/BattleEngine'
import { getMove, getSpecies, listSpecies, speciesSlug, moveSlug, abilitySlug, itemSlug, type SpeciesData } from '../data/dex'
import { fromShowdownSet } from '../showdown/sets'
import { speciesToShowdown } from '../showdown/ids'
import { PRNG } from '../utils/rng'
import type { MoveData } from '../types/move'

export interface SimulateOptions {
    p1: BattleAI
    p2: BattleAI
    onEvent?: (event: BattleEvent, engine: BattleEngine) => void
    /** 최대 결정 횟수 (기본 5000) */
    maxDecisions?: number
}

export interface SimulateResult {
    winner: PlayerID | 'draw' | null
    turns:  number
    engine: BattleEngine
    log:    BattleEvent[]
}

/** 두 AI 로 배틀을 끝까지 진행 */
export function simulateBattle(config: BattleConfig, opts: SimulateOptions): SimulateResult {
    const engine = new BattleEngine(config, { turnSnapshots: !!opts.onEvent })
    if (opts.onEvent) engine.on('*', ev => opts.onEvent!(ev, engine))
    engine.start()
    const ais: Record<PlayerID, BattleAI> = { p1: opts.p1, p2: opts.p2 }
    const max = opts.maxDecisions ?? 5000
    let decisions = 0
    while (!engine.ps.ended && decisions < max) {
        let progressed = false
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            if (engine.ps.ended) break
            if (!engine.getRequest(player) && !engine.getTeamPreview(player)) continue
            const action = ais[player].chooseAction(engine, player) ?? engine.getAvailableActions(player)[0]
            if (!action) continue
            engine.submitAction(action)
            decisions++
            progressed = true
        }
        if (!progressed) break
    }
    if (!engine.ps.ended) engine.ps.tie()
    const state = engine.getState()
    return { winner: state.winner, turns: state.turn, engine, log: state.log }
}

// ─── 랜덤 배틀 팀 (Showdown 공식 랜덤 배틀 세트) ───────────────
export interface RandomTeamOptions {
    seed?: number
    /** 'gen9randombattle'(기본) | 'gen9randomdoublesbattle' 등 */
    format?: string
    size?: number
    /** 지정하면 모든 포켓몬 레벨 고정 (기본: 랜덤배틀 밸런스 레벨) */
    level?: number
}

export function generateRandomTeam(opts: RandomTeamOptions = {}): PokemonSet[] {
    const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff)
    const r = new PRNG(seed)
    const TeamGenerators = getRandoms()
    if (!TeamGenerators) throw new Error('generateRandomTeam: 먼저 await preloadData() 를 호출하세요 (랜덤배틀 세트는 필요할 때 불러옵니다)')
    const gen = TeamGenerators.getTeamGenerator(opts.format ?? 'gen9randombattle', [r.int(0x10000), r.int(0x10000), r.int(0x10000), r.int(0x10000)] as never)
    const team = gen.getTeam().slice(0, opts.size ?? 6).map(s => fromShowdownSet(s as never))
    return opts.level ? team.map(s => ({ ...s, level: opts.level! })) : team
}

// ─── 기술표 기반 추천 세트 ───────────────────────────────────
export interface RandomSetOptions {
    rng?: PRNG
    level?: number
    /** 배울 수 있는 기술 (PokeAPI 슬러그). 없으면 Showdown 기술표 사용 */
    learnset?: string[]
}

const BANNED_MOVES = new Set([
    'struggle', 'sketch', 'transform', 'mimic', 'metronome', 'copycat', 'mirrormove', 'assist', 'mefirst',
    'naturepower', 'bide', 'focuspunch', 'dreameater', 'snore', 'sleeptalk', 'lastresort', 'belch', 'spitup',
    'swallow', 'stockpile', 'naturalgift', 'fling', 'present', 'beatup', 'synchronoise', 'falseswipe', 'holdback',
    'selfdestruct', 'explosion', 'mistyexplosion', 'memento', 'healingwish', 'lunardance', 'finalgambit',
    'perishsong', 'grudge', 'spite', 'magnitude', 'frustration', 'return', 'secretpower', 'focusenergy', 'rage',
    'snatch', 'followme', 'ragepowder', 'helpinghand', 'allyswitch', 'afteryou', 'quash', 'instruct', 'spotlight',
    'wideguard', 'quickguard', 'craftyshield', 'matblock', 'aromaticmist', 'decorate', 'coaching', 'holdhands',
    'celebrate', 'happyhour', 'splash', 'conversion', 'conversion2', 'camouflage', 'skydrop',
])
const GOOD_STATUS = new Set([
    'swordsdance', 'nastyplot', 'dragondance', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'stealthrock',
    'spikes', 'toxicspikes', 'toxic', 'willowisp', 'thunderwave', 'recover', 'roost', 'slackoff', 'softboiled',
    'protect', 'leechseed', 'substitute', 'taunt', 'trickroom', 'tailwind', 'reflect', 'lightscreen', 'irondefense',
    'agility', 'spore', 'sleeppowder', 'yawn', 'synthesis', 'moonlight', 'morningsun', 'shoreup', 'defog', 'haze',
    'partingshot', 'coil', 'shiftgear', 'victorydance', 'tidyup', 'curse', 'wish', 'strengthsap', 'glare',
    'stickyweb', 'uturn', 'voltswitch', 'knockoff', 'rapidspin',
])

function psLearnset(species: PSSpecies): string[] {
    if (!learnsetsLoaded()) throw new Error('기술표가 필요합니다: 먼저 await preloadData() 를 호출하세요 (또는 learnset 옵션 지정)')
    const out = new Set<string>()
    let s: PSSpecies | undefined = species
    for (let guard = 0; s && guard < 5; guard++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (Dex.species as any).getLearnsetData(s.id) as { learnset?: Record<string, string[]> }
        for (const [m, srcs] of Object.entries(data?.learnset ?? {})) if (srcs.some(x => x.startsWith('9'))) out.add(m)
        if (!data?.learnset && s.changesFrom) { s = Dex.species.get(s.changesFrom); continue }
        s = s.prevo ? Dex.species.get(s.prevo) : (s.baseSpecies !== s.name ? Dex.species.get(s.baseSpecies) : undefined)
    }
    return [...out]
}

/** 종 하나로 그럴듯한 세트 (STAB 2 + 견제기 + 변화기) */
export function generateRandomSet(speciesName: string, opts: RandomSetOptions = {}): PokemonSet {
    const rng = opts.rng ?? new PRNG()
    const ps = Dex.species.get(speciesToShowdown(speciesName))
    if (!ps.exists) throw new Error(`알 수 없는 포켓몬: ${speciesName}`)
    const bs = ps.baseStats
    const physical = bs.atk >= bs.spa
    const fast = bs.spe >= 85
    const defensive = bs.hp + bs.def + bs.spd > (bs.atk + bs.spa + bs.spe) * 1.35

    const names = opts.learnset?.length ? opts.learnset : psLearnset(ps)
    const pool = names
        .map(n => Dex.moves.get(toID(n)))
        .filter(m => m.exists && !m.isNonstandard && !BANNED_MOVES.has(m.id) && !m.isZ && !m.isMax && !m.flags.charge && !m.self?.volatileStatus?.includes('mustrecharge'))
    const category = physical ? 'Physical' : 'Special'
    const goodAttack = (m: typeof pool[number]) => m.category === category && m.basePower >= 60 && m.basePower <= 130
        && (m.accuracy === true || m.accuracy >= 80) && !m.ohko && !m.damage
    const chosen: string[] = []
    const take = (id: string | undefined) => { if (id && !chosen.includes(id) && chosen.length < 4) chosen.push(id) }
    const score = (m: typeof pool[number]) => m.basePower * (m.accuracy === true ? 100 : m.accuracy) * (m.recoil ? 0.85 : 1)

    for (const t of ps.types) {
        const stab = pool.filter(m => m.type === t && goodAttack(m)).sort((a, b) => score(b) - score(a))
        if (stab.length) take(rng.pick(stab.slice(0, 3)).id)
    }
    const coverage = pool.filter(m => goodAttack(m) && !ps.types.includes(m.type) && m.type !== 'Normal').sort((a, b) => score(b) - score(a))
    if (coverage.length) take(rng.pick(coverage.slice(0, 8)).id)
    const status = pool.filter(m => GOOD_STATUS.has(m.id))
    for (let i = 0; i < (defensive ? 2 : 1) && status.length; i++) take(rng.pick(status).id)
    const filler = pool.filter(goodAttack)
    for (let i = 0; chosen.length < 4 && i < 20 && filler.length; i++) take(rng.pick(filler).id)
    if (chosen.length === 0) {
        const any = pool.filter(m => m.category !== 'Status' && m.basePower > 0)
        take(any.length ? rng.pick(any).id : 'tackle')
    }

    const role = defensive ? 'defensive' : `${physical ? 'physical' : 'special'}_${fast ? 'fast' : 'slow'}`
    const natures: Record<string, Nature[]> = {
        physical_fast: ['jolly', 'adamant'], physical_slow: ['adamant', 'brave'],
        special_fast: ['timid', 'modest'], special_slow: ['modest', 'quiet'], defensive: ['bold', 'calm', 'impish', 'careful'],
    }
    const atkKey = physical ? 'attack' : 'special_attack'
    const evs: EVs = defensive
        ? { hp: 252, [bs.def >= bs.spd ? 'defense' : 'special_defense']: 252, [atkKey]: 4 }
        : { [atkKey]: 252, speed: 252, hp: 4 }
    const hasStatus = chosen.some(id => Dex.moves.get(id).category === 'Status')
    const items = defensive ? ['leftovers', 'rocky-helmet', 'heavy-duty-boots', 'sitrus-berry']
        : physical ? ['life-orb', 'choice-band', 'expert-belt', 'focus-sash', 'leftovers']
            : ['life-orb', 'choice-specs', 'expert-belt', 'focus-sash', 'leftovers']
    let item = rng.pick(items)
    if (item.startsWith('choice-') && hasStatus) item = 'life-orb'
    const abilities = Object.values(ps.abilities).filter(Boolean) as string[]

    return {
        species:  getSpecies(speciesName)?.name ?? speciesSlug(ps.id),
        level:    opts.level ?? 50,
        gender:   null,
        ability:  abilitySlug(rng.pick(abilities)),
        nature:   rng.pick(natures[role]!),
        item,
        moves:    chosen.map(moveSlug) as PokemonSet['moves'],
        evs,
        ivs:      { hp: 31, attack: physical ? 31 : 0, defense: 31, special_attack: 31, special_defense: 31, speed: 31 },
        teraType: rng.pick(ps.types).toLowerCase(),
    }
}

// ─── 퍼징용 혼돈 팀 (무작위 종/특성/도구/기술/노력치) ─────────────
let chaosPool: { species: PSSpecies[]; items: string[]; abilities: string[]; moves: string[]; types: string[] } | null = null

function getChaosPool() {
    if (chaosPool) return chaosPool
    const species = Dex.species.all().filter(s => s.exists && (!s.isNonstandard || s.isNonstandard === 'Past') && !s.battleOnly && s.gen <= 9 && s.num > 0)
    const items = Dex.items.all().filter(i => i.exists && (!i.isNonstandard || i.isNonstandard === 'Past') && !i.zMove && !i.megaStone && !i.isGem).map(i => i.id)
    const abilities = Dex.abilities.all().filter(a => a.exists && a.num > 0 && !a.isNonstandard).map(a => a.id)
    const moves = Dex.moves.all().filter(m => m.exists && (!m.isNonstandard || m.isNonstandard === 'Past') && !m.isZ && !m.isMax).map(m => m.id)
    const types: string[] = [...Dex.types.all().map(t => t.id as string), 'stellar']
    chaosPool = { species, items, abilities, moves, types }
    return chaosPool
}

export interface ChaosTeamOptions {
    rng: PRNG
    size?: number
    /** 0~1: 종 기술표 밖 기술을 섞을 확률 (기본 0.1) */
    illegalMoveRate?: number
}

/** 극단적으로 다양한 팀 (퍼징 테스트용). PokeAPI 슬러그 형식으로 반환 */
export function generateChaosTeam(opts: ChaosTeamOptions): PokemonSet[] {
    const { rng } = opts
    const pool = getChaosPool()
    const size = opts.size ?? rng.int(1, 6)
    const statKeys = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'] as const
    const team: PokemonSet[] = []
    for (let i = 0; i < size; i++) {
        const sp = rng.pick(pool.species)
        const learn = psLearnset(sp)
        const moveCount = rng.int(1, 4)
        const moves: string[] = []
        for (let k = 0; k < moveCount * 3 && moves.length < moveCount; k++) {
            const id = learn.length && !rng.chance((opts.illegalMoveRate ?? 0.1) * 100) ? rng.pick(learn) : rng.pick(pool.moves)
            if (!moves.includes(id)) moves.push(id)
        }
        if (!moves.length) moves.push('tackle')
        const abilities = Object.values(sp.abilities).filter(Boolean) as string[]
        const ability = rng.chance(80) && abilities.length ? toID(rng.pick(abilities)) : rng.pick(pool.abilities)
        const evs: EVs = {}
        let budget = 510
        for (const k of rng.shuffle([...statKeys])) {
            const v = Math.min(252, budget, rng.int(0, 63) * 4)
            budget -= v
            ;(evs as Record<string, number>)[k] = v
        }
        const ivs: EVs = {}
        for (const k of statKeys) (ivs as Record<string, number>)[k] = rng.chance(70) ? 31 : rng.int(0, 31)
        team.push({
            species:  speciesSlug(sp.id),
            nickname: rng.chance(10) ? `N${i}${rng.int(100)}` : undefined,
            level:    rng.chance(50) ? rng.pick([50, 100]) : rng.int(1, 100),
            gender:   null,
            ability:  abilitySlug(ability),
            nature:   rng.pick(Dex.natures.all()).id as Nature,
            item:     rng.chance(85) ? itemSlug(rng.pick(pool.items)) : undefined,
            moves:    moves.map(moveSlug) as PokemonSet['moves'],
            evs,
            ivs,
            teraType: rng.pick(pool.types),
            shiny:    rng.chance(5),
        })
    }
    return team
}

export function bst(s: SpeciesData): number {
    const b = s.base_stats
    return b.hp + b.attack + b.defense + b.special_attack + b.special_defense + b.speed
}

export { getMove, listSpecies }
export type { MoveData }
