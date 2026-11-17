// ─── 자동 배틀 시뮬레이션 / 랜덤 세트 생성 ────────────────────
import type { BattleConfig, BattleEvent, PlayerID } from '../types/battle'
import type { PokemonSet, Nature, EVs } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { BattleAI } from '../ai'
import { BattleEngine } from '../engine/BattleEngine'
import { getMove, getSpecies, listMoves, listSpecies, type SpeciesData } from '../data/loader'
import { PRNG } from '../utils/rng'
import { toId } from '../utils/id'
import { RECHARGE_MOVES, CHARGE_MOVES, FIXED_DAMAGE_MOVES } from '../data/moveTable'

export interface SimulateOptions {
    p1: BattleAI
    p2: BattleAI
    onEvent?: (event: BattleEvent, engine: BattleEngine) => void
    /** 무한 루프 방지용 최대 결정 횟수 (기본 5000) */
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
    const engine = new BattleEngine(config)
    if (opts.onEvent) engine.on('*', ev => opts.onEvent!(ev, engine))
    engine.start()
    const ais: Record<PlayerID, BattleAI> = { p1: opts.p1, p2: opts.p2 }
    const max = opts.maxDecisions ?? 5000
    let decisions = 0

    while (engine.getState().phase !== 'ended' && decisions < max) {
        let progressed = false
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            if (engine.getState().phase === 'ended') break
            const req = engine.getRequest(player)
            if (!req) continue
            const action = ais[player].chooseAction(engine, player) ?? engine.getAvailableActions(player)[0]
            if (!action) continue
            engine.submitAction(action)
            decisions++
            progressed = true
        }
        if (!progressed) break
    }
    if (engine.getState().phase !== 'ended') engine.forfeit('p1')

    const state = engine.getState()
    return { winner: state.winner, turns: state.turn, engine, log: state.log }
}

// ─── 랜덤 세트 ───────────────────────────────────────────────
export interface RandomSetOptions {
    rng?: PRNG
    level?: number
    /** 배울 수 있는 기술 목록 (있으면 이 안에서만 고른다) */
    learnset?: string[]
}

const BANNED_MOVES = new Set([
    'struggle', 'sketch', 'transform', 'mimic', 'metronome', 'copycat', 'mirror-move', 'assist', 'me-first',
    'nature-power', 'bide', 'counter', 'mirror-coat', 'metal-burst', 'focus-punch', 'dream-eater', 'snore',
    'sleep-talk', 'last-resort', 'belch', 'spit-up', 'swallow', 'stockpile', 'natural-gift', 'fling',
    'present', 'beat-up', 'synchronoise', 'false-swipe', 'hold-back', 'self-destruct', 'explosion',
    'misty-explosion', 'memento', 'healing-wish', 'lunar-dance', 'final-gambit', 'destiny-bond', 'perish-song',
    'grudge', 'spite', 'trump-card', 'magnitude', 'hidden-power', 'frustration', 'return', 'secret-power',
    'skull-bash', 'razor-wind', 'sky-attack', 'bounce', 'fly', 'dig', 'dive', 'phantom-force', 'shadow-force',
    'sky-drop', 'focus-energy', 'rage', 'feint', 'snatch', 'magic-coat', 'follow-me', 'rage-powder',
    'helping-hand', 'ally-switch', 'after-you', 'quash', 'instruct', 'spotlight', 'wide-guard', 'quick-guard',
    'crafty-shield', 'mat-block', 'aromatic-mist', 'decorate', 'coaching', 'hold-hands', 'celebrate',
    'happy-hour', 'splash', 'teleport', 'baton-pass', 'conversion', 'conversion-2', 'camouflage',
])

const GOOD_STATUS = [
    'swords-dance', 'nasty-plot', 'dragon-dance', 'calm-mind', 'bulk-up', 'quiver-dance', 'shell-smash',
    'stealth-rock', 'spikes', 'toxic-spikes', 'toxic', 'will-o-wisp', 'thunder-wave', 'recover', 'roost',
    'slack-off', 'soft-boiled', 'protect', 'leech-seed', 'substitute', 'taunt', 'trick-room', 'tailwind',
    'reflect', 'light-screen', 'iron-defense', 'agility', 'spore', 'sleep-powder', 'yawn', 'synthesis',
    'moonlight', 'morning-sun', 'shore-up', 'defog', 'haze', 'parting-shot', 'coil', 'shift-gear',
    'victory-dance', 'tidy-up', 'curse', 'wish', 'strength-sap', 'glare', 'hypnosis', 'sticky-web',
]

const NATURE_BY_ROLE: Record<string, Nature[]> = {
    physical_fast: ['jolly', 'adamant'],
    physical_slow: ['adamant', 'brave'],
    special_fast:  ['timid', 'modest'],
    special_slow:  ['modest', 'quiet'],
    defensive:     ['bold', 'calm', 'impish', 'careful'],
}

/** 종 하나로 그럴듯한 랜덤 세트 생성 (STAB 공격기 + 견제기 + 변화기) */
export function generateRandomSet(speciesName: string, opts: RandomSetOptions = {}): PokemonSet {
    const rng = opts.rng ?? new PRNG()
    const species = getSpecies(speciesName)
    if (!species) throw new Error(`알 수 없는 포켓몬: ${speciesName}`)
    const bs = species.base_stats
    const physical = bs.attack >= bs.special_attack
    const fast = bs.speed >= 85
    const defensive = bs.hp + bs.defense + bs.special_defense > (bs.attack + bs.special_attack + bs.speed) * 1.35

    const pool: MoveData[] = (opts.learnset
        ? opts.learnset.map(m => getMove(m)).filter((m): m is MoveData => !!m)
        : [...listMoves()]
    ).filter(m => !BANNED_MOVES.has(m.name) && !RECHARGE_MOVES.has(m.name) && !(m.name in CHARGE_MOVES) && !m.name.startsWith('max-') && !m.name.startsWith('g-max') && !m.name.includes('--'))

    const category = physical ? 'physical' : 'special'
    const goodAttack = (m: MoveData) => m.category === category && (m.power ?? 0) >= 60 && (m.power ?? 0) <= 130 && (m.accuracy ?? 100) >= 80 && !FIXED_DAMAGE_MOVES[m.name]
    const chosen: MoveData[] = []
    const take = (m: MoveData | undefined) => { if (m && !chosen.includes(m)) chosen.push(m) }

    // STAB
    for (const t of species.types) {
        const stab = pool.filter(m => m.type === t && goodAttack(m))
        stab.sort((a, b) => (b.power ?? 0) * (b.accuracy ?? 100) - (a.power ?? 0) * (a.accuracy ?? 100))
        take(stab.slice(0, 3).length ? rng.pick(stab.slice(0, 3)) : undefined)
    }
    // 견제기
    const coverage = pool.filter(m => goodAttack(m) && !species.types.includes(m.type) && m.type !== 'normal')
    if (coverage.length) {
        coverage.sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
        take(rng.pick(coverage.slice(0, 8)))
    }
    // 변화기
    const status = pool.filter(m => GOOD_STATUS.includes(m.name))
    const wantStatus = defensive ? 2 : 1
    for (let i = 0; i < wantStatus && status.length; i++) take(rng.pick(status))
    // 채우기
    const filler = pool.filter(m => goodAttack(m))
    while (chosen.length < 4 && filler.length) {
        const before = chosen.length
        take(rng.pick(filler))
        if (chosen.length === before && filler.every(f => chosen.includes(f))) break
    }
    if (chosen.length === 0) {
        const anyAttack = pool.filter(m => m.category !== 'status' && (m.power ?? 0) > 0)
        take(anyAttack.length ? rng.pick(anyAttack) : getMove('tackle'))
    }

    const role = defensive ? 'defensive' : `${physical ? 'physical' : 'special'}_${fast ? 'fast' : 'slow'}`
    const nature = rng.pick(NATURE_BY_ROLE[role]!)
    const atkKey = physical ? 'attack' : 'special_attack'
    const evs: EVs = defensive
        ? { hp: 252, [bs.defense >= bs.special_defense ? 'defense' : 'special_defense']: 252, [atkKey]: 4 }
        : { [atkKey]: 252, speed: 252, hp: 4 }

    const abilities = species.abilities.map(a => a.name)
    const items = defensive
        ? ['leftovers', 'rocky-helmet', 'heavy-duty-boots', 'sitrus-berry']
        : physical ? ['life-orb', 'choice-band', 'expert-belt', 'focus-sash', 'leftovers']
            : ['life-orb', 'choice-specs', 'expert-belt', 'focus-sash', 'leftovers']
    let item = rng.pick(items)
    if (item.startsWith('choice-') && chosen.some(m => m.category === 'status')) item = 'life-orb'

    return {
        species:  species.name,
        level:    opts.level ?? 50,
        gender:   null,
        ability:  abilities.length ? rng.pick(abilities) : '',
        nature,
        item,
        moves:    chosen.slice(0, 4).map(m => m.name) as PokemonSet['moves'],
        evs,
        ivs:      { hp: 31, attack: physical ? 31 : 0, defense: 31, special_attack: 31, special_defense: 31, speed: 31 },
        teraType: rng.pick(species.types),
    }
}

export interface RandomTeamOptions extends RandomSetOptions {
    size?: number
    /** 종족값 합계 범위 (기본 420~600) */
    minBST?: number
    maxBST?: number
    includeLegendary?: boolean
    /** 종 → 배울 수 있는 기술 */
    learnsets?: Record<string, string[]>
}

export function bst(s: SpeciesData): number {
    const b = s.base_stats
    return b.hp + b.attack + b.defense + b.special_attack + b.special_defense + b.speed
}

/** 랜덤 팀 생성 */
export function generateRandomTeam(opts: RandomTeamOptions = {}): PokemonSet[] {
    const rng = opts.rng ?? new PRNG()
    const size = opts.size ?? 6
    const min = opts.minBST ?? 420
    const max = opts.maxBST ?? 600
    const candidates = listSpecies().filter(s =>
        s.is_default !== false && !s.name.includes('-totem') && !s.name.endsWith('-gmax')
        && bst(s) >= min && bst(s) <= max
        && (opts.includeLegendary || (!s.is_legendary && !s.is_mythical)))
    const picked: SpeciesData[] = []
    const used = new Set<string>()
    while (picked.length < size && candidates.length > 0) {
        const s = rng.pick(candidates)
        const key = s.species_name ?? s.name
        if (used.has(key)) {
            if (used.size >= candidates.length) break
            continue
        }
        used.add(key)
        picked.push(s)
    }
    return picked.map(s => generateRandomSet(s.name, { rng, level: opts.level, learnset: opts.learnsets?.[s.name] }))
}

export { toId }
