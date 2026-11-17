import type { BattlePokemon } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { Weather, Terrain } from '../types/effect'
import { isDamageImmune } from '../effects/ability'
import { isGrounded } from '../effects/terrain'
import { getStat, type BattleStatKey } from './stat'
import {
    BITE_MOVES, PULSE_MOVES, PUNCH_MOVES, SLICING_MOVES, FIXED_DAMAGE_MOVES,
    isContact, getMovePatch,
} from '../data/moveTable'

export type TypeChart = Record<string, Record<string, number>>

export interface DamageCalcInput {
    attacker:         BattlePokemon
    defender:         BattlePokemon
    move:             MoveData
    weather:          Weather
    terrain:          Terrain
    typeChart:        TypeChart
    isCrit?:          boolean
    /** 난수 85~100 (미지정 시 평균값 92.5 근사) */
    randomRoll?:      number
    reflect?:         boolean
    lightScreen?:     boolean
    auroraVeil?:      boolean
    /** 공격 측이 테라스탈 상태로 계산 (attacker.terastallized 와 동일 효과) */
    isTerastallized?: boolean
    isStellar?:       boolean
    gravity?:         boolean
    /** 공격 측 진영에서 쓰러진 포켓몬 수 (대장의 깃발/성묘) */
    faintedAllies?:   number
}

export interface DamageCalcResult {
    damage:        number
    effectiveness: number
    isCrit:        boolean
    isSTAB:        boolean
    /** 실제 계산에 사용된 타입/분류/위력 */
    moveType?:     string
    category?:     'physical' | 'special'
    basePower?:    number
    /** 데미지가 0 인 이유 (면역 등) */
    immuneReason?: string
    modifiers: {
        stab:    number
        type:    number
        weather: number
        terrain: number
        crit:    number
        screen:  number
        burn:    number
        random:  number
        ability: number
        item:    number
    }
}

export interface DamageSummary {
    min:      number
    max:      number
    average:  number
    range:    number[]
    minRatio: number
    maxRatio: number
    koChance: 'guaranteed' | 'rng' | 'impossible'
    koText:   string
    minKo:    number
    maxKo:    number
    ohko:     boolean
    ohko_max: boolean
}

// ─── 4096 기반 보정 (게임 내부 반올림 규칙) ─────────────────────
const toMod = (m: number) => Math.round(m * 4096)
/** value × modifier(4096 단위), 0.5 는 내림 (pokeRound) */
function applyMod(value: number, mod4096: number): number {
    return Math.floor((value * mod4096 + 2047) / 4096)
}
function chainMods(mods: number[]): number {
    let acc = 4096
    for (const m of mods) {
        if (m === 1) continue
        acc = (acc * toMod(m) + 2048) >> 12
    }
    return acc
}

// ─── 타입 상성 ────────────────────────────────────────────────
export function calcTypeEffectiveness(
    moveType:        string,
    defenderTypes:   string[],
    typeChart:       TypeChart,
): number {
    let mult = 1
    for (const defType of defenderTypes) {
        mult *= typeChart[moveType]?.[defType] ?? 1
    }
    return mult
}

function zeroResult(effectiveness: number, extra: Partial<DamageCalcResult['modifiers']> = {}, reason?: string): DamageCalcResult {
    return {
        damage: 0, effectiveness, isCrit: false, isSTAB: false, immuneReason: reason,
        modifiers: { stab: 1, type: effectiveness, weather: 1, terrain: 1, crit: 1, screen: 1, burn: 1, random: 1, ability: 1, item: 1, ...extra },
    }
}

const ATE_ABILITIES: Record<string, string> = {
    'aerilate': 'flying', 'galvanize': 'electric', 'pixilate': 'fairy', 'refrigerate': 'ice', 'normalize': 'normal',
}

// ─── 실제 기술 타입 (웨더볼/테라버스트/스킨 특성 등) ───────────
export function getMoveType(attacker: BattlePokemon, move: MoveData, weather: Weather, terrain: Terrain): string {
    if (move.name === 'weather-ball') {
        if (weather === 'sun' || weather === 'harsh_sun')   return 'fire'
        if (weather === 'rain' || weather === 'heavy_rain') return 'water'
        if (weather === 'sandstorm')                        return 'rock'
        if (weather === 'snow')                             return 'ice'
    }
    if (move.name === 'terrain-pulse' && terrain && isGrounded(attacker)) {
        return terrain
    }
    if ((move.name === 'tera-blast' || move.name === 'tera-starstorm') && attacker.terastallized && attacker.tera_type) {
        return attacker.tera_type === 'stellar' ? move.type : attacker.tera_type
    }
    if (move.name === 'ivy-cudgel' && attacker.species.startsWith('ogerpon-')) {
        const form = attacker.species.replace('ogerpon-', '')
        if (form.startsWith('wellspring')) return 'water'
        if (form.startsWith('hearthflame')) return 'fire'
        if (form.startsWith('cornerstone')) return 'rock'
    }
    if (move.name === 'raging-bull' && attacker.species.startsWith('tauros-paldea')) {
        if (attacker.species.includes('blaze')) return 'fire'
        if (attacker.species.includes('aqua'))  return 'water'
        return 'fighting'
    }
    const ate = ATE_ABILITIES[attacker.ability]
    if (ate && (move.type === 'normal' || attacker.ability === 'normalize')) return ate
    if (attacker.ability === 'liquid-voice' && move.name in { 'hyper-voice': 1, 'boomburst': 1 }) return 'water'
    return move.type
}

// ─── 실제 분류 (테라버스트/포톤게이저 등) ─────────────────────
export function getMoveCategory(attacker: BattlePokemon, move: MoveData): 'physical' | 'special' | 'status' {
    if (move.category === 'status') return 'status'
    if ((move.name === 'tera-blast' && attacker.terastallized) || move.name === 'photon-geyser' || move.name === 'shell-side-arm') {
        return getStat(attacker, 'attack') > getStat(attacker, 'special_attack') ? 'physical' : 'special'
    }
    return move.category
}

// ─── 가변 위력 ────────────────────────────────────────────────
function weightBasedPower(weightHg: number): number {
    const kg = weightHg / 10
    if (kg >= 200) return 120
    if (kg >= 100) return 100
    if (kg >= 50)  return 80
    if (kg >= 25)  return 60
    if (kg >= 10)  return 40
    return 20
}

export function getBasePower(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move:     MoveData,
    weather:  Weather,
    opts: { faintedAllies?: number } = {},
): number {
    const bp = move.power ?? 0
    switch (move.name) {
        case 'knock-off':
            return defender.item ? Math.floor(bp * 1.5) : bp
        case 'facade':
            return attacker.status && attacker.status !== 'sleep' && attacker.status !== 'freeze' ? bp * 2 : bp
        case 'hex':
        case 'infernal-parade':
            return defender.status ? bp * 2 : bp
        case 'venoshock':
        case 'barb-barrage':
            return defender.status === 'poison' || defender.status === 'toxic' ? bp * 2 : bp
        case 'brine':
            return defender.hp * 2 <= defender.max_hp ? bp * 2 : bp
        case 'acrobatics':
            return attacker.item ? bp : bp * 2
        case 'weather-ball':
            return weather ? bp * 2 : bp
        case 'eruption':
        case 'water-spout':
        case 'dragon-energy':
            return Math.max(1, Math.floor(150 * attacker.hp / attacker.max_hp))
        case 'flail':
        case 'reversal': {
            const p = Math.floor(48 * attacker.hp / attacker.max_hp)
            return p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20
        }
        case 'low-kick':
        case 'grass-knot':
            return weightBasedPower(defender.weight ?? 500)
        case 'heavy-slam':
        case 'heat-crash': {
            const ratio = (attacker.weight ?? 500) / Math.max(1, defender.weight ?? 500)
            return ratio >= 5 ? 120 : ratio >= 4 ? 100 : ratio >= 3 ? 80 : ratio >= 2 ? 60 : 40
        }
        case 'gyro-ball': {
            const p = Math.floor(25 * getStat(defender, 'speed') / Math.max(1, getStat(attacker, 'speed'))) + 1
            return Math.min(150, p)
        }
        case 'electro-ball': {
            const r = getStat(attacker, 'speed') / Math.max(1, getStat(defender, 'speed'))
            return r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40
        }
        case 'stored-power':
        case 'power-trip': {
            const boosts = Object.values(attacker.stages).reduce((a, s) => a + Math.max(0, s), 0)
            return 20 + 20 * boosts
        }
        case 'last-respects':
            return Math.min(5050, 50 + 50 * (opts.faintedAllies ?? 0))
        case 'bolt-beak':
        case 'fishious-rend':
            return defender.moved_this_turn ? bp : bp * 2
        case 'hard-press':
            return Math.max(1, Math.floor(100 * defender.hp / defender.max_hp))
        case 'wring-out':
        case 'crush-grip':
            return Math.max(1, Math.floor(120 * defender.hp / defender.max_hp))
        case 'solar-beam':
        case 'solar-blade':
            return weather && weather !== 'sun' && weather !== 'harsh_sun' && weather !== 'strong_winds' ? Math.floor(bp / 2) : bp
        default:
            return bp
    }
}

// ─── STAB ─────────────────────────────────────────────────────
function calcSTAB(
    moveType:    string,
    attacker:    BattlePokemon,
    tera:        boolean,
    isStellar:   boolean,
): number {
    const originalTypes = (attacker.original_types ?? attacker.types) as string[]
    const adaptability  = attacker.ability === 'adaptability'
    const hasOriginal   = originalTypes.includes(moveType)
    const teraType      = attacker.tera_type ?? attacker.set.teraType

    if (tera && teraType === 'stellar' || isStellar) {
        // 스텔라: 원래 타입 2배, 그 외 1.2배 (각 타입 1회 – 간이 구현)
        return hasOriginal ? 2 : 1.2
    }
    if (tera && teraType) {
        const hasTera = teraType === moveType
        if (hasTera && hasOriginal) return adaptability ? 2.25 : 2
        if (hasTera)                return adaptability ? 2 : 1.5
        if (hasOriginal)            return 1.5
        return 1
    }
    if (!hasOriginal && !(attacker.types as string[]).includes(moveType)) return 1
    return adaptability ? 2 : 1.5
}

// ─── 날씨 보정 ────────────────────────────────────────────────
function calcWeatherMod(moveType: string, weather: Weather, attacker: BattlePokemon, defender: BattlePokemon): number {
    const suppress = (p: BattlePokemon) => p.ability === 'cloud-nine' || p.ability === 'air-lock'
    if (suppress(attacker) || suppress(defender)) return 1
    if (weather === 'sun' || weather === 'harsh_sun') {
        if (moveType === 'fire')  return 1.5
        if (moveType === 'water') return weather === 'harsh_sun' ? 0 : 0.5
    }
    if (weather === 'rain' || weather === 'heavy_rain') {
        if (moveType === 'water') return 1.5
        if (moveType === 'fire')  return weather === 'heavy_rain' ? 0 : 0.5
    }
    return 1
}

// ─── 필드 보정 (위력 보정으로 적용) ───────────────────────────
function calcTerrainMod(
    moveType: string,
    terrain:  Terrain,
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveName: string,
): number {
    if (!terrain) return 1
    const atkG = isGrounded(attacker)
    const defG = isGrounded(defender)
    if (terrain === 'electric' && moveType === 'electric' && atkG) return 1.3
    if (terrain === 'grassy'   && moveType === 'grass'    && atkG) return 1.3
    if (terrain === 'psychic'  && moveType === 'psychic'  && atkG) return 1.3
    if (terrain === 'misty'    && moveType === 'dragon'   && defG) return 0.5
    if (terrain === 'grassy'   && ['earthquake', 'bulldoze', 'magnitude'].includes(moveName) && defG) return 0.5
    return 1
}

// ─── 위력 보정 (특성/도구) ────────────────────────────────────
const TYPE_BOOST_ITEMS: Record<string, string> = {
    'charcoal': 'fire', 'mystic-water': 'water', 'miracle-seed': 'grass', 'magnet': 'electric',
    'never-melt-ice': 'ice', 'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground',
    'sharp-beak': 'flying', 'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock',
    'spell-tag': 'ghost', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel',
    'silk-scarf': 'normal', 'fairy-feather': 'fairy',
    // 플레이트
    'flame-plate': 'fire', 'splash-plate': 'water', 'meadow-plate': 'grass', 'zap-plate': 'electric',
    'icicle-plate': 'ice', 'fist-plate': 'fighting', 'toxic-plate': 'poison', 'earth-plate': 'ground',
    'sky-plate': 'flying', 'mind-plate': 'psychic', 'insect-plate': 'bug', 'stone-plate': 'rock',
    'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel',
    'pixie-plate': 'fairy',
    // 향로
    'sea-incense': 'water', 'wave-incense': 'water', 'rose-incense': 'grass', 'odd-incense': 'psychic', 'rock-incense': 'rock',
}

function hasSecondaryEffect(move: MoveData): boolean {
    const m = move.meta
    const patch = getMovePatch(move.name)
    return (m?.ailment_chance ?? 0) > 0
        || (m?.flinch_chance ?? 0) > 0
        || ((m?.stat_chance ?? 0) > 0 && (m?.category === 'damage-lower' || m?.category === 'damage-raise'))
        || (patch?.ailmentChance ?? 0) > 0
        || (patch?.flinch ?? 0) > 0
}

function attackerBasePowerMods(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move:     MoveData,
    moveType: string,
    bp:       number,
    weather:  Weather,
    faintedAllies: number,
): { ability: number[]; item: number[] } {
    const ability: number[] = []
    const item: number[] = []
    const a = attacker.ability
    const contact = isContact(move)

    if (a === 'technician' && bp <= 60) ability.push(1.5)
    if (a === 'iron-fist' && PUNCH_MOVES.has(move.name)) ability.push(1.2)
    if (a === 'strong-jaw' && BITE_MOVES.has(move.name)) ability.push(1.5)
    if (a === 'mega-launcher' && PULSE_MOVES.has(move.name)) ability.push(1.5)
    if (a === 'sharpness' && SLICING_MOVES.has(move.name)) ability.push(1.5)
    if (a === 'tough-claws' && contact) ability.push(1.3)
    if (a === 'sheer-force' && hasSecondaryEffect(move)) ability.push(1.3)
    if (a === 'reckless' && ((move.meta?.drain ?? 0) < 0 || (getMovePatch(move.name)?.drain ?? 0) < 0)) ability.push(1.2)
    if (a in ATE_ABILITIES && move.type === 'normal' && a !== 'normalize') ability.push(1.2)
    if (a === 'normalize') ability.push(1.2)
    if (a === 'sand-force' && weather === 'sandstorm' && ['rock', 'steel', 'ground'].includes(moveType)) ability.push(1.3)
    if (a === 'analytic' && defender.moved_this_turn) ability.push(1.3)
    if (a === 'punk-rock' && move.name in SOUND_SET) ability.push(1.3)
    if (a === 'supreme-overlord' && faintedAllies > 0) ability.push(1 + 0.1 * Math.min(5, faintedAllies))
    if (a === 'flare-boost' && attacker.status === 'burn' && move.category === 'special') ability.push(1.5)
    if (a === 'toxic-boost' && (attacker.status === 'poison' || attacker.status === 'toxic') && move.category === 'physical') ability.push(1.5)
    // 방어 측: 건조피부 불꽃 1.25
    if (defender.ability === 'dry-skin' && moveType === 'fire') ability.push(1.25)

    const it = attacker.item
    if (it && TYPE_BOOST_ITEMS[it] === moveType) item.push(1.2)
    if (it === 'muscle-band' && move.category === 'physical') item.push(1.1)
    if (it === 'wise-glasses' && move.category === 'special') item.push(1.1)
    if (it === 'punching-glove' && PUNCH_MOVES.has(move.name)) item.push(1.1)
    return { ability, item }
}

const SOUND_SET: Record<string, true> = { 'boomburst': true, 'hyper-voice': true, 'bug-buzz': true, 'overdrive': true, 'disarming-voice': true, 'snarl': true, 'torch-song': true, 'alluring-voice': true, 'psychic-noise': true, 'sparkling-aria': true, 'clanging-scales': true, 'echoed-voice': true, 'round': true, 'uproar': true, 'relic-song': true }

// ─── 공격/방어 스탯 보정 (특성) ───────────────────────────────
function attackStatAbilityMods(attacker: BattlePokemon, defender: BattlePokemon, moveType: string): number[] {
    const mods: number[] = []
    const a = attacker.ability
    const pinch = attacker.hp <= Math.floor(attacker.max_hp / 3)
    if (pinch && ((a === 'blaze' && moveType === 'fire') || (a === 'torrent' && moveType === 'water')
        || (a === 'overgrow' && moveType === 'grass') || (a === 'swarm' && moveType === 'bug'))) mods.push(1.5)
    if (a === 'flash-fire' && 'flash_fire' in attacker.volatile_statuses && moveType === 'fire') mods.push(1.5)
    if ((a === 'steelworker' || a === 'steely-spirit') && moveType === 'steel') mods.push(1.5)
    if (a === 'dragons-maw'  && moveType === 'dragon')   mods.push(1.5)
    if (a === 'transistor'   && moveType === 'electric') mods.push(1.3)
    if (a === 'rocky-payload'&& moveType === 'rock')     mods.push(1.5)
    if (a === 'water-bubble' && moveType === 'water')    mods.push(2)
    if (a === 'gorilla-tactics') { /* getStat 에서 처리 */ }
    // 방어 측 특성이 공격 스탯을 낮추는 경우
    const d = defender.ability
    if (d === 'thick-fat' && (moveType === 'fire' || moveType === 'ice')) mods.push(0.5)
    if (d === 'heatproof' && moveType === 'fire') mods.push(0.5)
    if (d === 'water-bubble' && moveType === 'fire') mods.push(0.5)
    if (d === 'purifying-salt' && moveType === 'ghost') mods.push(0.5)
    return mods
}

// ─── 스크린 ───────────────────────────────────────────────────
function calcScreenMod(
    category:    string,
    isCrit:      boolean,
    reflect:     boolean,
    lightScreen: boolean,
    auroraVeil:  boolean,
    attacker:    BattlePokemon,
): number {
    if (isCrit || attacker.ability === 'infiltrator') return 1
    if (auroraVeil) return 0.5
    if (category === 'physical' && reflect)     return 0.5
    if (category === 'special'  && lightScreen) return 0.5
    return 1
}

// ─── 화상 보정 ────────────────────────────────────────────────
function calcBurnMod(attacker: BattlePokemon, category: string, moveName: string): number {
    if (category !== 'physical') return 1
    if (attacker.status !== 'burn')   return 1
    if (attacker.ability === 'guts')  return 1
    if (moveName === 'facade')        return 1
    return 0.5
}

// ─── 고정 데미지 기술 ────────────────────────────────────────
function calcFixedDamage(attacker: BattlePokemon, defender: BattlePokemon, move: MoveData, effectiveness: number): number | null {
    const kind = FIXED_DAMAGE_MOVES[move.name]
    if (!kind) return null
    if (effectiveness === 0) return 0
    switch (kind) {
        case 'level':    return attacker.level
        case 'half_hp':  return Math.max(1, Math.floor(defender.hp / 2))
        case 'fixed_20': return 20
        case 'fixed_40': return 40
        case 'endeavor': return Math.max(0, defender.hp - attacker.hp)
        case 'ohko':     return defender.level > attacker.level ? 0 : defender.hp
    }
}

// ─── 메인 데미지 계산 ─────────────────────────────────────────
export function calcDamage(input: DamageCalcInput): DamageCalcResult {
    const {
        attacker: rawAttacker, defender, move, weather, terrain, typeChart,
        isCrit = false,
        randomRoll,
        reflect = false, lightScreen = false, auroraVeil = false,
        isTerastallized = false, isStellar = false, gravity = false,
        faintedAllies = 0,
    } = input

    const attacker: BattlePokemon = isTerastallized && !rawAttacker.terastallized
        ? { ...rawAttacker, terastallized: true, tera_type: rawAttacker.tera_type ?? rawAttacker.set.teraType ?? null }
        : rawAttacker
    const tera = !!attacker.terastallized

    if (move.category === 'status') return zeroResult(1)

    const moveType = getMoveType(attacker, move, weather, terrain)
    const category = getMoveCategory(attacker, move) as 'physical' | 'special'

    // ── 특성 면역 (부유/저수/타오르는불꽃 등) ────────────────
    if (isDamageImmune(defender, moveType, category, move, attacker)) {
        return { ...zeroResult(1, { ability: 0 }, `ability:${defender.ability}`), moveType, category }
    }

    // ── 타입 상성 ────────────────────────────────────────────
    const defenderTypes = (defender.types as string[]).filter(Boolean)
    let effectiveness = calcTypeEffectiveness(moveType, defenderTypes, typeChart)
    if ((attacker.ability === 'scrappy' || attacker.ability === 'minds-eye') && (moveType === 'normal' || moveType === 'fighting') && defenderTypes.includes('ghost')) {
        effectiveness = calcTypeEffectiveness(moveType, defenderTypes.filter(t => t !== 'ghost'), typeChart)
    }
    if (move.name === 'freeze-dry' && defenderTypes.includes('water')) {
        effectiveness = effectiveness / (typeChart['ice']?.['water'] ?? 0.5) * 2
    }
    if (moveType === 'ground' && !gravity) {
        const airborne = !isGrounded(defender)
        if (airborne && !defenderTypes.includes('flying')) effectiveness = 0  // 풍선/전자부유 등
        if (defender.item === 'iron-ball' && defenderTypes.includes('flying')) effectiveness = 1
    }
    if (gravity && moveType === 'ground' && defenderTypes.includes('flying')) {
        effectiveness = calcTypeEffectiveness(moveType, defenderTypes.filter(t => t !== 'flying'), typeChart)
    }
    if (defender.terastallized && defender.tera_type === 'stellar') {
        effectiveness = calcTypeEffectiveness(moveType, (defender.original_types ?? defender.types).filter(Boolean) as string[], typeChart)
    }

    if (effectiveness === 0) {
        return { ...zeroResult(0, { type: 0 }, 'type'), moveType, category }
    }
    if (defender.ability === 'wonder-guard' && effectiveness <= 1) {
        return { ...zeroResult(effectiveness, { ability: 0 }, 'ability:wonder-guard'), moveType, category }
    }

    // ── 고정 데미지 ──────────────────────────────────────────
    const fixed = calcFixedDamage(attacker, defender, move, effectiveness)
    if (fixed !== null) {
        return {
            damage: fixed, effectiveness: 1, isCrit: false, isSTAB: false, moveType, category, basePower: 0,
            modifiers: { stab: 1, type: 1, weather: 1, terrain: 1, crit: 1, screen: 1, burn: 1, random: 1, ability: 1, item: 1 },
        }
    }

    // ── 날씨 (0이면 실패) ────────────────────────────────────
    const weatherMod = calcWeatherMod(moveType, weather, attacker, defender)
    if (weatherMod === 0) {
        return { ...zeroResult(effectiveness, { weather: 0 }, 'weather'), moveType, category }
    }

    // ── 위력 ─────────────────────────────────────────────────
    let basePower = getBasePower(attacker, defender, move, weather, { faintedAllies })
    // 테라스탈: 테라 타입 기술의 위력 최소 60
    if (tera && attacker.tera_type === moveType && basePower < 60 && move.priority <= 0
        && !(move.meta?.max_hits) && !FIXED_DAMAGE_MOVES[move.name]) {
        basePower = 60
    }
    const terrainMod = calcTerrainMod(moveType, terrain, attacker, defender, move.name)
    const bpMods = attackerBasePowerMods(attacker, defender, move, moveType, basePower, weather, faintedAllies)
    basePower = Math.max(1, applyMod(basePower, chainMods([...bpMods.ability, ...bpMods.item, terrainMod])))

    // ── 공격/방어 스탯 ───────────────────────────────────────
    const atkKey: BattleStatKey = move.name === 'body-press' ? 'defense' : category === 'physical' ? 'attack' : 'special_attack'
    const defKey: BattleStatKey = ['psyshock', 'psystrike', 'secret-sword'].includes(move.name) ? 'defense'
        : category === 'physical' ? 'defense' : 'special_defense'
    const atkSource = move.name === 'foul-play' ? defender : attacker

    const ignoreAtkStages = defender.ability === 'unaware'
    const ignoreDefStages = attacker.ability === 'unaware' || ['sacred-sword', 'darkest-lariat', 'chip-away'].includes(move.name)

    let atkStage = ignoreAtkStages ? 0 : atkSource.stages[atkKey]
    if (isCrit && atkStage < 0) atkStage = 0
    let defStage = ignoreDefStages ? 0 : defender.stages[defKey]
    if (isCrit && defStage > 0) defStage = 0

    let atk = getStat({ ...atkSource, stages: { ...atkSource.stages, [atkKey]: atkStage } }, atkKey, { weather, terrain })
    let def = getStat({ ...defender, stages: { ...defender.stages, [defKey]: defStage } }, defKey, { weather, terrain })

    const atkAbilityMods = attackStatAbilityMods(attacker, defender, moveType)
    atk = Math.max(1, applyMod(atk, chainMods(atkAbilityMods)))

    // 모래바람: 바위 특방 1.5 / 설경: 얼음 방어 1.5
    if (weather === 'sandstorm' && defKey === 'special_defense' && (defender.types as string[]).includes('rock')) def = Math.floor(def * 1.5)
    if (weather === 'snow' && defKey === 'defense' && (defender.types as string[]).includes('ice')) def = Math.floor(def * 1.5)
    def = Math.max(1, def)

    // ── 기본 데미지 ──────────────────────────────────────────
    let damage = Math.floor(Math.floor(Math.floor(2 * attacker.level / 5 + 2) * basePower * atk / def) / 50) + 2

    // 날씨
    if (weatherMod !== 1) damage = applyMod(damage, toMod(weatherMod))

    // 급소
    const critMult = isCrit ? 1.5 : 1
    if (isCrit) damage = Math.floor(damage * 1.5)

    // 난수
    const roll = randomRoll ?? 92.5
    const randomMult = roll / 100
    damage = Math.floor(damage * Math.floor(roll) / 100)

    // 자속
    const stabMult = calcSTAB(moveType, attacker, tera, isStellar)
    if (stabMult !== 1) damage = applyMod(damage, toMod(stabMult))

    // 상성
    damage = Math.floor(damage * effectiveness)

    // 화상
    const burnMod = calcBurnMod(attacker, category, move.name)
    if (burnMod !== 1) damage = applyMod(damage, toMod(burnMod))

    // 최종 보정
    const screenMod = calcScreenMod(category, isCrit, reflect, lightScreen, auroraVeil, attacker)
    const finalAbility: number[] = []
    const finalItem: number[] = []
    const d = defender.ability
    if ((d === 'multiscale' || d === 'shadow-shield') && defender.hp === defender.max_hp) finalAbility.push(0.5)
    if (['solid-rock', 'filter', 'prism-armor'].includes(d) && effectiveness > 1) finalAbility.push(0.75)
    if (d === 'fluffy') {
        if (isContact(move)) finalAbility.push(0.5)
        if (moveType === 'fire') finalAbility.push(2)
    }
    if (d === 'ice-scales' && category === 'special') finalAbility.push(0.5)
    if (d === 'punk-rock' && move.name in SOUND_SET) finalAbility.push(0.5)
    if (attacker.ability === 'tinted-lens' && effectiveness < 1) finalAbility.push(2)
    if (attacker.ability === 'sniper' && isCrit) finalAbility.push(1.5)
    if (attacker.ability === 'neuroforce' && effectiveness > 1) finalAbility.push(1.25)
    if (attacker.item === 'expert-belt' && effectiveness > 1) finalItem.push(1.2)
    if (attacker.item === 'life-orb') finalItem.push(1.3)
    if (move.name === 'collision-course' || move.name === 'electro-drift') {
        if (effectiveness > 1) finalAbility.push(5461 / 4096)
    }

    const finalMod = chainMods([screenMod, ...finalAbility, ...finalItem])
    damage = applyMod(damage, finalMod)

    const abilityProduct = [...bpMods.ability, ...atkAbilityMods, ...finalAbility].reduce((a, b) => a * b, 1)
    const itemProduct    = [...bpMods.item, ...finalItem].reduce((a, b) => a * b, 1)

    return {
        damage:        Math.max(1, damage),
        effectiveness,
        isCrit,
        isSTAB:        stabMult > 1,
        moveType,
        category,
        basePower,
        modifiers: {
            stab:    stabMult,
            type:    effectiveness,
            weather: weatherMod,
            terrain: terrainMod,
            crit:    critMult,
            screen:  screenMod,
            burn:    burnMod,
            random:  randomMult,
            ability: Math.round(abilityProduct * 1000) / 1000,
            item:    Math.round(itemProduct * 1000) / 1000,
        },
    }
}

// ─── 데미지 범위 (난수 85~100, 16단계) ────────────────────────
export function calcDamageRange(input: Omit<DamageCalcInput, 'randomRoll'>): number[] {
    return Array.from({ length: 16 }, (_, i) =>
        calcDamage({ ...input, randomRoll: 85 + i }).damage
    )
}

// ─── 데미지 요약 ─────────────────────────────────────────────
export function calcDamageSummary(input: Omit<DamageCalcInput, 'randomRoll'>): DamageSummary {
    const range   = calcDamageRange(input)
    const min     = range[0]!
    const max     = range[15]!
    const average = Math.round(range.reduce((a, b) => a + b, 0) / 16)
    const hp      = input.defender.hp > 0 ? input.defender.hp : input.defender.max_hp

    const minRatio = min / hp
    const maxRatio = max / hp

    const koChance: DamageSummary['koChance'] =
        minRatio >= 1 ? 'guaranteed' :
            maxRatio >= 1 ? 'rng'        : 'impossible'

    const koTurns = (dmg: number) => dmg <= 0 ? Infinity : Math.ceil(hp / dmg)
    const minKo = koTurns(max)
    const maxKo = koTurns(min)

    const koText = (() => {
        if (max <= 0)                  return '데미지 없음'
        if (koChance === 'guaranteed') return '확정 1타'
        if (koChance === 'rng') {
            const n = range.filter(d => d >= hp).length
            return `난수 1타 (${(n / 16 * 100).toFixed(1)}%)`
        }
        if (minKo === maxKo)           return `확정 ${minKo}타`
        return `난수 ${minKo}타 (확정 ${maxKo}타)`
    })()

    return {
        min, max, average, range,
        minRatio, maxRatio,
        koChance, koText,
        minKo, maxKo,
        ohko:     minRatio >= 1,
        ohko_max: maxRatio >= 1,
    }
}
