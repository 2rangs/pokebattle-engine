import type { BattlePokemon } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { Weather, Terrain } from '../types/effect'
import { getStat } from './stat'

export type TypeChart = Record<string, Record<string, number>>

export interface DamageCalcInput {
    attacker:         BattlePokemon
    defender:         BattlePokemon
    move:             MoveData
    weather:          Weather
    terrain:          Terrain
    typeChart:        TypeChart
    isCrit?:          boolean
    randomRoll?:      number
    reflect?:         boolean
    lightScreen?:     boolean
    auroraVeil?:      boolean
    isTerastallized?: boolean
    isStellar?:       boolean
}

export interface DamageCalcResult {
    damage:        number
    effectiveness: number
    isCrit:        boolean
    isSTAB:        boolean
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

// ─── STAB ─────────────────────────────────────────────────────
function calcSTAB(
    moveType:         string,
    attackerTypes:    string[],
    ability:          string,
    isTerastallized:  boolean,
    teraType?:        string,
    isStellar?:       boolean,
): number {
    if (isStellar) return 1

    const hasNormalSTAB = attackerTypes.includes(moveType)

    if (isTerastallized && teraType) {
        const hasTeraSTAB = teraType === moveType
        if (hasTeraSTAB && hasNormalSTAB) return 2.25
        if (hasTeraSTAB)  return ability === 'adaptability' ? 2   : 1.5
        if (hasNormalSTAB) return 1
        return 1
    }

    if (!hasNormalSTAB) return 1
    return ability === 'adaptability' ? 2 : 1.5
}

// ─── 날씨 보정 ────────────────────────────────────────────────
function calcWeatherMod(moveType: string, weather: Weather, ability: string): number {
    if (ability === 'cloud-nine' || ability === 'air-lock') return 1
    if (weather === 'sun' || weather === 'harsh_sun') {
        if (moveType === 'fire')  return weather === 'harsh_sun' ? 1.5 : 1.5
        if (moveType === 'water') return weather === 'harsh_sun' ? 0   : 0.5
    }
    if (weather === 'rain' || weather === 'heavy_rain') {
        if (moveType === 'water') return weather === 'heavy_rain' ? 1.5 : 1.5
        if (moveType === 'fire')  return weather === 'heavy_rain' ? 0   : 0.5
    }
    return 1
}

// ─── 필드 보정 ────────────────────────────────────────────────
function calcTerrainMod(
    moveType:          string,
    terrain:           Terrain,
    attackerGrounded:  boolean,
    defenderGrounded:  boolean,
): number {
    if (terrain === 'electric' && moveType === 'electric' && attackerGrounded) return 1.3
    if (terrain === 'grassy'   && moveType === 'grass'    && attackerGrounded) return 1.3
    if (terrain === 'psychic'  && moveType === 'psychic'  && attackerGrounded) return 1.3
    if (terrain === 'misty'    && moveType === 'dragon'   && defenderGrounded) return 0.5
    return 1
}

// ─── 스크린 보정 ──────────────────────────────────────────────
function calcScreenMod(
    category:    string,
    isCrit:      boolean,
    reflect:     boolean,
    lightScreen: boolean,
    auroraVeil:  boolean,
): number {
    if (isCrit) return 1
    if (auroraVeil) return 0.5
    if (category === 'physical' && reflect)     return 0.5
    if (category === 'special'  && lightScreen) return 0.5
    return 1
}

// ─── 공격 측 특성 보정 ────────────────────────────────────────
function calcAttackerAbilityMod(
    attacker:      BattlePokemon,
    move:          MoveData,
    weather:       Weather,
    effectiveness: number,
): number {
    const { ability } = attacker
    const { type, power } = move

    if (ability === 'technician' && (power ?? 0) <= 60) return 1.5

    if (ability === 'sand-force' && weather === 'sandstorm') {
        if (['rock', 'steel', 'ground'].includes(type)) return 1.3
    }

    const hpThird = attacker.hp <= Math.floor(attacker.max_hp / 3)
    if (ability === 'blaze'    && type === 'fire'  && hpThird) return 1.5
    if (ability === 'torrent'  && type === 'water' && hpThird) return 1.5
    if (ability === 'overgrow' && type === 'grass' && hpThird) return 1.5
    if (ability === 'swarm'    && type === 'bug'   && hpThird) return 1.5

    if (ability === 'sheer-force' && (move.meta?.ailment_chance ?? 0) > 0) return 1.3
    if (ability === 'reckless'    && (move.meta?.drain ?? 0) < 0)           return 1.2

    const normConvert: Record<string, string> = {
        'aerilate': 'flying', 'galvanize': 'electric',
        'pixilate': 'fairy',  'refrigerate': 'ice',
    }
    if (ability in normConvert && type === 'normal') return 1.2

    if ((ability === 'steelworker' || ability === 'steely-spirit') && type === 'steel')    return 1.5
    if (ability === 'dragons-maw'  && type === 'dragon')   return 1.5
    if (ability === 'transistor'   && type === 'electric') return 1.5
    if (ability === 'rocky-payload'&& type === 'rock')     return 1.5

    return 1
}

// ─── 방어 측 특성 보정 ────────────────────────────────────────
function calcDefenderAbilityMod(
    defender:      BattlePokemon,
    move:          MoveData,
    effectiveness: number,
): number {
    const { ability } = defender
    const { type } = move

    if (ability === 'wonder-guard' && effectiveness <= 1) return 0
    if ((ability === 'multiscale' || ability === 'shadow-shield') && defender.hp === defender.max_hp) return 0.5
    if (ability === 'fluffy'      && type === 'fire')  return 2
    if (['solid-rock', 'filter', 'prism-armor'].includes(ability) && effectiveness > 1) return 0.75
    if (ability === 'heatproof'   && type === 'fire')  return 0.5
    if (ability === 'dry-skin'    && type === 'fire')  return 1.25

    return 1
}

// ─── 아이템 보정 ──────────────────────────────────────────────
function calcItemMod(attacker: BattlePokemon, move: MoveData, effectiveness: number): number {
    const { item } = attacker
    if (!item) return 1

    const typeItems: Record<string, string> = {
        'charcoal':       'fire',     'mystic-water':   'water',
        'miracle-seed':   'grass',    'magnet':         'electric',
        'never-melt-ice': 'ice',      'black-belt':     'fighting',
        'poison-barb':    'poison',   'soft-sand':      'ground',
        'sharp-beak':     'flying',   'twisted-spoon':  'psychic',
        'silver-powder':  'bug',      'hard-stone':     'rock',
        'spell-tag':      'ghost',    'dragon-fang':    'dragon',
        'black-glasses':  'dark',     'metal-coat':     'steel',
        'silk-scarf':     'normal',   'fairy-feather':  'fairy',
    }
    if (item in typeItems && typeItems[item] === move.type) return 1.2
    if (item === 'life-orb')    return 1.3
    if (item === 'expert-belt' && effectiveness > 1) return 1.2

    return 1
}

// ─── 화상 보정 ────────────────────────────────────────────────
function calcBurnMod(attacker: BattlePokemon, move: MoveData): number {
    if (move.category !== 'physical') return 1
    if (attacker.status !== 'burn')   return 1
    if (attacker.ability === 'guts')  return 1
    return 0.5
}

// ─── 메인 데미지 계산 ─────────────────────────────────────────
export function calcDamage(input: DamageCalcInput): DamageCalcResult {
    const {
        attacker, defender, move, weather, terrain, typeChart,
        isCrit = false,
        randomRoll,
        reflect = false, lightScreen = false, auroraVeil = false,
        isTerastallized = false, isStellar = false,
    } = input

    if (move.category === 'status') {
        return {
            damage: 0, effectiveness: 1, isCrit: false, isSTAB: false,
            modifiers: { stab: 1, type: 1, weather: 1, terrain: 1, crit: 1, screen: 1, burn: 1, random: 1, ability: 1, item: 1 },
        }
    }

    const atkStat = move.category === 'physical' ? 'attack' : 'special_attack'
    const defStat = move.category === 'physical' ? 'defense' : 'special_defense'

    // 급소: 내 하락 공격 무시, 상대 상승 방어 무시
    const atkStages = isCrit
        ? { ...attacker.stages, [atkStat]: Math.max(0, attacker.stages[atkStat]) }
        : attacker.stages
    const defStages = isCrit
        ? { ...defender.stages, [defStat]: Math.min(0, defender.stages[defStat]) }
        : defender.stages

    const atk = getStat({ ...attacker, stages: atkStages }, atkStat, { weather })
    const def = getStat({ ...defender, stages: defStages }, defStat, { weather })

    const defenderTypes = isTerastallized && defender.set.teraType
        ? [defender.set.teraType]
        : (defender.types as string[])

    const effectiveness = calcTypeEffectiveness(move.type, defenderTypes, typeChart)
    if (effectiveness === 0) {
        return {
            damage: 0, effectiveness: 0, isCrit: false, isSTAB: false,
            modifiers: { stab: 1, type: 0, weather: 1, terrain: 1, crit: 1, screen: 1, burn: 1, random: 1, ability: 1, item: 1 },
        }
    }

    const stabMult   = calcSTAB(move.type, attacker.types as string[], attacker.ability, isTerastallized, attacker.set.teraType, isStellar)
    const isSTAB     = stabMult > 1
    const weatherMod = calcWeatherMod(move.type, weather, attacker.ability)

    if (weatherMod === 0) {
        return {
            damage: 0, effectiveness, isCrit, isSTAB,
            modifiers: { stab: stabMult, type: effectiveness, weather: 0, terrain: 1, crit: 1, screen: 1, burn: 1, random: 1, ability: 1, item: 1 },
        }
    }

    const attackerGrounded = !attacker.types.includes('flying') && attacker.ability !== 'levitate' && attacker.item !== 'air-balloon'
    const defenderGrounded = !defender.types.includes('flying') && defender.ability !== 'levitate' && defender.item !== 'air-balloon'

    const terrainMod = calcTerrainMod(move.type, terrain, attackerGrounded, defenderGrounded)
    const screenMod  = calcScreenMod(move.category, isCrit, reflect, lightScreen, auroraVeil)
    const critMult   = isCrit ? (attacker.ability === 'sniper' ? 2.25 : 1.5) : 1
    const burnMod    = calcBurnMod(attacker, move)
    const atkAbilMod = calcAttackerAbilityMod(attacker, move, weather, effectiveness)
    const defAbilMod = calcDefenderAbilityMod(defender, move, effectiveness)
    const itemMod    = calcItemMod(attacker, move, effectiveness)
    const randomMult = (randomRoll ?? 92.3) / 100

    // Gen 9 데미지 공식
    // floor(floor(floor(2×Lv/5+2) × Power × Atk/Def) / 50 + 2)
    const base = Math.floor(
        Math.floor(
            Math.floor(2 * attacker.level / 5 + 2) * (move.power ?? 0) * atk / def
        ) / 50 + 2
    )

    let damage = base
    damage = Math.floor(damage * screenMod)
    damage = Math.floor(damage * weatherMod)
    damage = Math.floor(damage * terrainMod)
    damage = Math.floor(damage * critMult)
    damage = Math.floor(damage * randomMult)
    damage = Math.floor(damage * stabMult)
    damage = Math.floor(damage * effectiveness)
    damage = Math.floor(damage * burnMod)
    damage = Math.floor(damage * atkAbilMod)
    damage = Math.floor(damage * defAbilMod)
    damage = Math.floor(damage * itemMod)

    return {
        damage:        Math.max(1, damage),
        effectiveness,
        isCrit,
        isSTAB,
        modifiers: {
            stab:    stabMult,
            type:    effectiveness,
            weather: weatherMod,
            terrain: terrainMod,
            crit:    critMult,
            screen:  screenMod,
            burn:    burnMod,
            random:  randomMult,
            ability: atkAbilMod * defAbilMod,
            item:    itemMod,
        },
    }
}

// ─── 데미지 범위 (85~100) ────────────────────────────────────
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
    const maxHp   = input.defender.max_hp

    const minRatio = min / maxHp
    const maxRatio = max / maxHp

    const koChance: DamageSummary['koChance'] =
        minRatio >= 1 ? 'guaranteed' :
            maxRatio >= 1 ? 'rng'        : 'impossible'

    const koTurns = (dmg: number) => Math.ceil(maxHp / dmg)
    const minKo = koTurns(max)
    const maxKo = koTurns(min)

    const koText = (() => {
        if (koChance === 'guaranteed') return `확정 ${minKo}타`
        if (koChance === 'rng')        return `난수 ${minKo}타`
        if (minKo === maxKo)           return `확정 ${minKo}타 이상`
        return `${minKo}~${maxKo}타`
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