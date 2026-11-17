import type { Stats, EVs, IVs, Nature, StatStages, BattlePokemon } from '../types/pokemon'
import type { Weather } from '../types/effect'

// ─── 상수 ─────────────────────────────────────────────────────
export const STAT_KEYS = ['hp', 'attack', 'defense', 'special_attack', 'special_defense', 'speed'] as const
export type StatKey = typeof STAT_KEYS[number]
export type BattleStatKey = Exclude<StatKey, 'hp'>

// ─── 성격 보정 테이블 ─────────────────────────────────────────
interface NatureEffect {
    boosted: BattleStatKey | null
    hindered: BattleStatKey | null
}

export const NATURE_TABLE: Record<Nature, NatureEffect> = {
    hardy:   { boosted: null,              hindered: null },
    docile:  { boosted: null,              hindered: null },
    serious: { boosted: null,              hindered: null },
    bashful: { boosted: null,              hindered: null },
    quirky:  { boosted: null,              hindered: null },
    lonely:  { boosted: 'attack',          hindered: 'defense' },
    brave:   { boosted: 'attack',          hindered: 'speed' },
    adamant: { boosted: 'attack',          hindered: 'special_attack' },
    naughty: { boosted: 'attack',          hindered: 'special_defense' },
    bold:    { boosted: 'defense',         hindered: 'attack' },
    relaxed: { boosted: 'defense',         hindered: 'speed' },
    impish:  { boosted: 'defense',         hindered: 'special_attack' },
    lax:     { boosted: 'defense',         hindered: 'special_defense' },
    timid:   { boosted: 'speed',           hindered: 'attack' },
    hasty:   { boosted: 'speed',           hindered: 'defense' },
    jolly:   { boosted: 'speed',           hindered: 'special_attack' },
    naive:   { boosted: 'speed',           hindered: 'special_defense' },
    modest:  { boosted: 'special_attack',  hindered: 'attack' },
    mild:    { boosted: 'special_attack',  hindered: 'defense' },
    quiet:   { boosted: 'special_attack',  hindered: 'speed' },
    rash:    { boosted: 'special_attack',  hindered: 'special_defense' },
    calm:    { boosted: 'special_defense', hindered: 'attack' },
    gentle:  { boosted: 'special_defense', hindered: 'defense' },
    sassy:   { boosted: 'special_defense', hindered: 'speed' },
    careful: { boosted: 'special_defense', hindered: 'special_attack' },
}

// ─── 스탯 랭크 배율 테이블 ────────────────────────────────────
const STAGE_NUM: Record<number, number> = { [-6]: 2, [-5]: 2, [-4]: 2, [-3]: 2, [-2]: 2, [-1]: 2, 0: 2, 1: 3, 2: 4, 3: 5, 4: 6, 5: 7, 6: 8 }
const STAGE_DEN: Record<number, number> = { [-6]: 8, [-5]: 7, [-4]: 6, [-3]: 5, [-2]: 4, [-1]: 3, 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }

// 명중/회피 랭크 배율 (×100)
const ACC_STAGE: Record<number, number> = {
    [-6]: 33, [-5]: 36, [-4]: 43, [-3]: 50, [-2]: 60, [-1]: 75,
    0: 100,
    1: 133, 2: 166, 3: 200, 4: 250, 5: 300, 6: 350,
}

// ─── HP 실수치 ────────────────────────────────────────────────
export function calcHP(base: number, level: number, iv = 31, ev = 0): number {
    if (base === 1) return 1
    return Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + level + 10
}

// ─── 일반 스탯 실수치 ─────────────────────────────────────────
export function calcBaseStat(base: number, level: number, iv = 31, ev = 0, natureMult: 1 | 1.1 | 0.9 = 1): number {
    return Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5) * natureMult)
}

// ─── 성격 배율 ────────────────────────────────────────────────
export function getNatureMultiplier(nature: Nature, stat: BattleStatKey): 1 | 1.1 | 0.9 {
    const { boosted, hindered } = NATURE_TABLE[nature]
    if (boosted === stat)  return 1.1
    if (hindered === stat) return 0.9
    return 1
}

// ─── 전체 실수치 계산 ─────────────────────────────────────────
export function calcAllStats(baseStats: Stats, level: number, nature: Nature, evs: EVs = {}, ivs: IVs = {}): Stats {
    return {
        hp:              calcHP(baseStats.hp, level, ivs.hp ?? 31, evs.hp ?? 0),
        attack:          calcBaseStat(baseStats.attack,          level, ivs.attack          ?? 31, evs.attack          ?? 0, getNatureMultiplier(nature, 'attack')),
        defense:         calcBaseStat(baseStats.defense,         level, ivs.defense         ?? 31, evs.defense         ?? 0, getNatureMultiplier(nature, 'defense')),
        special_attack:  calcBaseStat(baseStats.special_attack,  level, ivs.special_attack  ?? 31, evs.special_attack  ?? 0, getNatureMultiplier(nature, 'special_attack')),
        special_defense: calcBaseStat(baseStats.special_defense, level, ivs.special_defense ?? 31, evs.special_defense ?? 0, getNatureMultiplier(nature, 'special_defense')),
        speed:           calcBaseStat(baseStats.speed,           level, ivs.speed           ?? 31, evs.speed           ?? 0, getNatureMultiplier(nature, 'speed')),
    }
}

// ─── 랭크 적용 ────────────────────────────────────────────────
export function applyStage(stat: number, stage: number): number {
    const s = Math.max(-6, Math.min(6, stage))
    return Math.floor(stat * (STAGE_NUM[s] ?? 2) / (STAGE_DEN[s] ?? 2))
}

// ─── 전체 스탯 랭크 적용 ─────────────────────────────────────
export function applyStages(stats: Stats, stages: StatStages): Stats {
    return {
        hp:              stats.hp,
        attack:          applyStage(stats.attack,          stages.attack),
        defense:         applyStage(stats.defense,         stages.defense),
        special_attack:  applyStage(stats.special_attack,  stages.special_attack),
        special_defense: applyStage(stats.special_defense, stages.special_defense),
        speed:           applyStage(stats.speed,           stages.speed),
    }
}

// ─── 랭크 변화 (clamp + actual) ──────────────────────────────
export interface StageChangeResult {
    stages: StatStages
    actual: number
}

export function applyStageChange(stages: StatStages, stat: keyof StatStages, change: number): StageChangeResult {
    const before = stages[stat]
    const after = Math.max(-6, Math.min(6, before + change))
    return { stages: { ...stages, [stat]: after }, actual: after - before }
}

// ─── 명중/회피 배율 ───────────────────────────────────────────
export function getAccEvaMultiplier(accStage: number, evaStage: number): number {
    const net = Math.max(-6, Math.min(6, accStage - evaStage))
    return (ACC_STAGE[net] ?? 100) / 100
}

// ─── Protosynthesis / Quark Drive 부스트 스탯 결정 ───────────
const PARADOX_ORDER: BattleStatKey[] = ['attack', 'defense', 'special_attack', 'special_defense', 'speed']

export function getParadoxBoostedStat(stats: Stats): BattleStatKey {
    let best: BattleStatKey = 'attack'
    let bestVal = 0
    for (const key of PARADOX_ORDER) {
        if (stats[key] > bestVal) { bestVal = stats[key]; best = key }
    }
    return best
}

// ─── 전투 중 실제 스탯 (Showdown getStat 대응) ───────────────
export interface GetStatOptions {
    ignoreAbility?: boolean
    ignoreItem?:    boolean
    weather?:       Weather
    terrain?:       string | null
}

export function getStat(pokemon: BattlePokemon, stat: BattleStatKey, opts: GetStatOptions = {}): number {
    let value = applyStage(pokemon.stats[stat], pokemon.stages[stat])
    const { ability, item, species, status, volatile_statuses, transformed } = pokemon
    const { weather, terrain, ignoreAbility = false, ignoreItem = false } = opts

    if (!ignoreAbility) {
        // ── 화상: 물리 데미지 0.5× 는 damage.ts (calcBurnMod) 에서 처리 ──
        //    (예전에는 여기서도 공격을 반감해 화상 보정이 이중 적용되었음)

        // ── 마비: 스피드 0.5× ────────────────────────────────
        if (stat === 'speed' && status === 'paralysis') {
            if (ability !== 'quick-feet') {
                value = Math.floor(value * 0.5)
            }
        }

        // ── Guts: 상태이상 시 공격 1.5× ────────────────────
        if (stat === 'attack' && ability === 'guts' && status !== null) {
            value = Math.floor(value * 1.5)
        }

        // ── Marvel Scale: 상태이상 시 방어 1.5× ────────────
        if (stat === 'defense' && ability === 'marvel-scale' && status !== null) {
            value = Math.floor(value * 1.5)
        }

        // ── Quick Feet: 상태이상 시 스피드 1.5× ────────────
        if (stat === 'speed' && ability === 'quick-feet' && status !== null) {
            value = Math.floor(value * 1.5)
        }
        // ── Pure Power / Huge Power: 물리공격 2× ────────────────
        if (stat === 'attack' && (ability === 'pure-power' || ability === 'huge-power')) {
            value = value * 2
        }
        // ── Chlorophyll: 쾌청 스피드 2× ─────────────────────
        if (stat === 'speed' && ability === 'chlorophyll' && (weather === 'sun' || weather === 'harsh_sun')) {
            value = value * 2
        }

        // ── Swift Swim: 비 스피드 2× ─────────────────────────
        if (stat === 'speed' && ability === 'swift-swim' && (weather === 'rain' || weather === 'heavy_rain')) {
            value = value * 2
        }

        // ── Sand Rush: 모래바람 스피드 2× ────────────────────
        if (stat === 'speed' && ability === 'sand-rush' && weather === 'sandstorm') {
            value = value * 2
        }

        // ── Slush Rush: 눈 스피드 2× ─────────────────────────
        if (stat === 'speed' && ability === 'slush-rush' && weather === 'snow') {
            value = value * 2
        }

        // ── Surge Surfer: 일렉트릭필드 스피드 2× ─────────────
        if (stat === 'speed' && ability === 'surge-surfer' && terrain === 'electric') {
            value = value * 2
        }

        // ── Hustle: 물리공격 1.5× ───────────────────────────
        if (stat === 'attack' && ability === 'hustle') {
            value = Math.floor(value * 1.5)
        }

        // ── Slow Start: 5턴간 공격/스피드 0.5× ──────────────
        if ((stat === 'attack' || stat === 'speed') && ability === 'slow-start' && 'slow_start' in volatile_statuses) {
            value = Math.floor(value * 0.5)
        }

        // ── Unburden: 아이템 소비 후 스피드 2× ──────────────
        if (stat === 'speed' && ability === 'unburden' && item === null && 'unburden' in volatile_statuses) {
            value = value * 2
        }

        // ── Protosynthesis / Quark Drive ─────────────────────
        if ((ability === 'protosynthesis' || ability === 'quark-drive') && 'paradox_boost' in volatile_statuses) {
            const boostedStat = getParadoxBoostedStat(pokemon.stats)
            if (boostedStat === stat) {
                value = Math.floor(value * (stat === 'attack' || stat === 'special_attack' ? 1.3 : 1.5))
            }
        }

        // ── Flower Gift: 쾌청 시 공격/특방 1.5× ─────────────
        if ((stat === 'attack' || stat === 'special_defense') && ability === 'flower-gift'
            && (weather === 'sun' || weather === 'harsh_sun')) {
            value = Math.floor(value * 1.5)
        }

        // ── Fur Coat: 방어 2× ────────────────────────────────
        if (stat === 'defense' && ability === 'fur-coat') {
            value = value * 2
        }

        // ── Ice Scales: 특방 2× ──────────────────────────────
        if (stat === 'special_defense' && ability === 'ice-scales') {
            value = value * 2
        }

        // ── Gorilla Tactics: 물리공격 1.5× ──────────────────
        if (stat === 'attack' && ability === 'gorilla-tactics') {
            value = Math.floor(value * 1.5)
        }

        // ── Defeatist: HP 절반 이하 시 공격/특공 0.5× ────────
        if ((stat === 'attack' || stat === 'special_attack') && ability === 'defeatist') {
            if (pokemon.hp <= Math.floor(pokemon.max_hp / 2)) {
                value = Math.floor(value * 0.5)
            }
        }

        // ── Sand Force: 데미지calc에서 처리
        // ── Punk Rock: 데미지calc에서 처리
    }

    if (!ignoreItem && item !== null) {
        // ── Choice Band: 물리공격 1.5× ──────────────────────
        if (stat === 'attack' && item === 'choice-band') {
            value = Math.floor(value * 1.5)
        }

        // ── Choice Specs: 특수공격 1.5× ─────────────────────
        if (stat === 'special_attack' && item === 'choice-specs') {
            value = Math.floor(value * 1.5)
        }

        // ── Choice Scarf: 스피드 1.5× ───────────────────────
        if (stat === 'speed' && item === 'choice-scarf') {
            value = Math.floor(value * 1.5)
        }

        // ── Assault Vest: 특방 1.5× ─────────────────────────
        if (stat === 'special_defense' && item === 'assault-vest') {
            value = Math.floor(value * 1.5)
        }

        // ── Light Ball: 피카츄 공격/특공 2× ──────────────────
        if ((stat === 'attack' || stat === 'special_attack') && item === 'light-ball' && species === 'pikachu') {
            value = value * 2
        }

        // ── Thick Club: 가라/딱구리 공격 2× ──────────────────
        if (stat === 'attack' && item === 'thick-club'
            && ['cubone', 'marowak', 'marowak-alola'].includes(species)) {
            value = value * 2
        }

        // ── Deep Sea Scale: 클램펄 특방 2× ───────────────────
        if (stat === 'special_defense' && item === 'deep-sea-scale' && species === 'clamperl') {
            value = value * 2
        }

        // ── Deep Sea Tooth: 클램펄 특공 2× ───────────────────
        if (stat === 'special_attack' && item === 'deep-sea-tooth' && species === 'clamperl') {
            value = value * 2
        }

        // ── Metal Powder: 메타몽 방어 2× (변신 전) ───────────
        if (stat === 'defense' && item === 'metal-powder' && species === 'ditto' && !transformed) {
            value = value * 2
        }

        // ── Quick Powder: 메타몽 스피드 2× (변신 전) ─────────
        if (stat === 'speed' && item === 'quick-powder' && species === 'ditto' && !transformed) {
            value = value * 2
        }
    }

    return Math.max(1, value)
}

// ─── 스피드 우선도 정렬 ───────────────────────────────────────
export function compareSpeed(
    a: { speed: number; priority: number },
    b: { speed: number; priority: number },
    trickRoom = false,
): number {
    if (a.priority !== b.priority) return b.priority - a.priority
    return trickRoom ? a.speed - b.speed : b.speed - a.speed
}

// ─── StatStages 초기값 ────────────────────────────────────────
export function createInitialStages(): StatStages {
    return { attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0, accuracy: 0, evasion: 0 }
}