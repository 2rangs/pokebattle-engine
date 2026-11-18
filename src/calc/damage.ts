// ─── 데미지 계산기 (@smogon/calc = Showdown 데미지 계산기 엔진) ────
// 입력은 PokeAPI 슬러그 / Showdown 이름 모두 허용한다.
import { calculate, Field, Generations, Move, Pokemon, Side } from '@smogon/calc'
import type { State } from '@smogon/calc'
import { Dex } from '@pkmn/sim'
import type { EVs, IVs, StatStages, Stats } from '../types/pokemon'
import type { Weather, Terrain } from '../types/effect'
import { speciesToShowdown, moveToShowdown, abilityToShowdown, itemToShowdown, natureToShowdown, typeToShowdown } from '../showdown/ids'
import { STAT_TO_PS } from '../data/dex'

/** 세대별 계산기 데이터 (기본 9세대) */
const genOf = (n = 9) => Generations.get(n as never)

export interface CalcPokemonInput {
    species:   string
    level?:    number
    nature?:   string
    ability?:  string
    item?:     string | null
    evs?:      EVs
    ivs?:      IVs
    /** 랭크 (-6 ~ +6) */
    boosts?:   Partial<StatStages>
    status?:   'burn' | 'paralysis' | 'poison' | 'toxic' | 'sleep' | 'freeze' | null
    /** 현재 HP (실수치). hpPercent 보다 우선 */
    curHP?:    number
    /** 현재 HP 비율 0~100 */
    hpPercent?: number
    /** 테라스탈 타입 (terastallized 가 true 일 때만 적용) */
    teraType?: string | null
    terastallized?: boolean
    /** 아군 기절 수 (대장의깃발/성묘) */
    alliesFainted?: number
    /** 고대활성/쿼크차지로 오른 스탯 */
    boostedStat?: 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'auto'
    /** 실수치 직접 지정 (자유 능력치). 지정한 스탯은 계산식 대신 이 값 (랭크·도구 보정은 그대로 적용) */
    stats?:    Partial<Stats>
}

export interface CalcFieldInput {
    weather?:     Weather
    terrain?:     Terrain
    gravity?:     boolean
    magicRoom?:   boolean
    wonderRoom?:  boolean
    /** 방어 측 벽 */
    reflect?:     boolean
    lightScreen?: boolean
    auroraVeil?:  boolean
    /** 방어 측 해저드 (KO 확률에 반영) */
    stealthRock?: boolean
    spikes?:      number
    /** 세대 (1~9, 기본 9) */
    gen?:         number
    /** 공격 측 */
    helpingHand?: boolean
    isCrit?:      boolean
    doubles?:     boolean
    hits?:        number
}

export interface DamageResult {
    /** 난수 16단계 데미지 */
    range:         number[]
    min:           number
    max:           number
    /** 방어 측 최대 HP 대비 % */
    minPercent:    number
    maxPercent:    number
    defenderHP:    number
    defenderMaxHP: number
    /** KO 확률 (0~1) 과 타수 */
    koChance:      number
    koHits:        number
    /** 한국어 KO 문구 (예: '확정 2타', '난수 1타 (43.8%)') */
    koText:        string
    /** Showdown 계산기 형식 설명 (영어) */
    desc:          string
    moveType:      string
    category:      'physical' | 'special' | 'status'
    basePower:     number
    effectiveness: number
    isSTAB:        boolean
}

const STATUS_TO_CALC: Record<string, State.Pokemon['status']> = {
    burn: 'brn', paralysis: 'par', poison: 'psn', toxic: 'tox', sleep: 'slp', freeze: 'frz',
}
const WEATHER_TO_CALC: Record<string, State.Field['weather']> = {
    sun: 'Sun', rain: 'Rain', sandstorm: 'Sand', snow: 'Snow',
    harsh_sun: 'Harsh Sunshine', heavy_rain: 'Heavy Rain', strong_winds: 'Strong Winds',
}
const TERRAIN_TO_CALC: Record<string, State.Field['terrain']> = {
    electric: 'Electric', grassy: 'Grassy', misty: 'Misty', psychic: 'Psychic',
}

function statTable(src: EVs | IVs | Partial<StatStages> | undefined): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(src ?? {})) {
        if (v === undefined || v === null) continue
        const key = STAT_TO_PS[k] ?? k
        if (key === 'accuracy' || key === 'evasion') continue
        out[key] = v as number
    }
    return out
}

/**
 * 실수치 고정. @smogon/calc 는 계산 중에 Pokemon 을 clone() 하며 능력치를 다시 계산하므로 clone 도 감싼다.
 * curHP 는 clone 생성자가 (계산된) 최대 HP 로 자르므로 원래 값을 되돌린다.
 */
function fixStats(p: Pokemon, fixed: Record<string, number>, curHP: number): Pokemon {
    for (const [k, v] of Object.entries(fixed)) {
        const key = k as keyof Pokemon['rawStats']
        p.rawStats[key] = v
        p.stats[key] = v
    }
    p.originalCurHP = Math.max(0, Math.min(p.rawStats.hp, curHP))
    p.clone = function (this: Pokemon) {
        return fixStats(Pokemon.prototype.clone.call(this), fixed, this.originalCurHP)
    }
    return p
}

export function toCalcPokemon(input: CalcPokemonInput, genNum = 9): Pokemon {
    const gen = genOf(genNum)
    const species = Dex.species.get(speciesToShowdown(input.species))
    if (!species.exists) throw new Error(`알 수 없는 포켓몬: ${input.species}`)
    const ability = input.ability ? Dex.abilities.get(abilityToShowdown(input.ability)) : undefined
    const item = input.item ? Dex.items.get(itemToShowdown(input.item)) : undefined
    const boosts = statTable(input.boosts)
    delete boosts.hp
    delete boosts.accuracy
    delete boosts.evasion
    const opts: State.Pokemon = {
        name:   species.name as never,
        level:  input.level ?? 50,
        nature: natureToShowdown(input.nature ?? 'hardy') as never,
        evs:    statTable(input.evs),
        ivs:    statTable(input.ivs),
        boosts,
        status: input.status ? STATUS_TO_CALC[input.status] : '',
        alliesFainted: input.alliesFainted,
        boostedStat: input.boostedStat,
    }
    if (ability?.exists) opts.ability = ability.name as never
    if (item?.exists) opts.item = item.name as never
    if (input.terastallized && input.teraType) opts.teraType = typeToShowdown(input.teraType) as never
    const p = new Pokemon(gen, species.name, opts)
    if (input.stats) {
        const fixed: Record<string, number> = {}
        for (const [k, v] of Object.entries(statTable(input.stats))) if (Number.isFinite(v) && v >= 1) fixed[k] = Math.floor(v)
        if (Object.keys(fixed).length) fixStats(p, fixed, fixed.hp ?? p.maxHP())
    }
    if (input.curHP !== undefined) p.originalCurHP = Math.max(0, Math.min(p.maxHP(), Math.floor(input.curHP)))
    else if (input.hpPercent !== undefined) p.originalCurHP = Math.max(1, Math.min(p.maxHP(), Math.floor(p.maxHP() * input.hpPercent / 100)))
    return p
}

export function toCalcField(field: CalcFieldInput = {}): Field {
    return new Field({
        gameType: field.doubles ? 'Doubles' : 'Singles',
        weather: field.weather ? WEATHER_TO_CALC[field.weather] : undefined,
        terrain: field.terrain ? TERRAIN_TO_CALC[field.terrain] : undefined,
        isGravity: !!field.gravity,
        isMagicRoom: !!field.magicRoom,
        isWonderRoom: !!field.wonderRoom,
        attackerSide: new Side({ isHelpingHand: !!field.helpingHand }),
        defenderSide: new Side({
            isReflect: !!field.reflect, isLightScreen: !!field.lightScreen, isAuroraVeil: !!field.auroraVeil,
            isSR: !!field.stealthRock, spikes: field.spikes ?? 0,
        }),
    })
}

function koTextKo(chance: number, n: number): string {
    if (!n) return ''
    if (chance >= 1) return `확정 ${n}타`
    if (chance > 0) return `난수 ${n}타 (${(chance * 100).toFixed(1)}%)`
    return ''
}

/** Showdown 데미지 계산기와 같은 결과 */
export function calculateDamage(
    attacker: CalcPokemonInput | Pokemon,
    defender: CalcPokemonInput | Pokemon,
    move: string,
    field: CalcFieldInput = {},
): DamageResult {
    const gen = genOf(field.gen)
    const atk = attacker instanceof Pokemon ? attacker : toCalcPokemon(attacker, field.gen)
    const def = defender instanceof Pokemon ? defender : toCalcPokemon(defender, field.gen)
    const moveData = Dex.moves.get(moveToShowdown(move))
    if (!moveData.exists) throw new Error(`알 수 없는 기술: ${move}`)
    const m = new Move(gen, moveData.name as never, { isCrit: !!field.isCrit, hits: field.hits })
    const result = calculate(gen, atk, def, m, toCalcField(field))

    const raw = result.damage as number | number[] | number[][]
    let range: number[]
    if (typeof raw === 'number') range = Array<number>(16).fill(raw)
    else if (Array.isArray(raw[0])) {
        const hits = raw as number[][]
        range = hits[0]!.map((_, i) => hits.reduce((sum, h) => sum + (h[i] ?? 0), 0))
    } else range = [...(raw as number[])]
    if (range.length === 1) range = Array<number>(16).fill(range[0]!)

    const min = Math.min(...range)
    const max = Math.max(...range)
    const maxHP = def.maxHP()
    let ko = { chance: 0, n: 0 }
    try {
        if (max > 0) ko = result.kochance() as { chance: number; n: number }
    } catch { /* KO 계산이 불가능한 기술 */ }
    let desc = ''
    try {
        desc = result.desc()
    } catch {
        desc = `${atk.name} ${m.name} vs. ${def.name}`
    }
    const defTypes = (def.teraType && def.teraType !== 'Stellar' ? [def.teraType] : def.types) as string[]
    let eff = 1
    const typeData = gen.types.get(m.type.toLowerCase() as never)
    for (const t of defTypes) eff *= (typeData?.effectiveness as Record<string, number> | undefined)?.[t] ?? 1

    return {
        range, min, max,
        minPercent: Math.round(min / maxHP * 1000) / 10,
        maxPercent: Math.round(max / maxHP * 1000) / 10,
        defenderHP: def.curHP(),
        defenderMaxHP: maxHP,
        koChance: ko.chance ?? 0,
        koHits: ko.n ?? 0,
        koText: max <= 0 ? '데미지 없음' : koTextKo(ko.chance ?? 0, ko.n ?? 0),
        desc,
        moveType: m.type.toLowerCase(),
        category: m.category.toLowerCase() as DamageResult['category'],
        basePower: m.bp,
        effectiveness: max > 0 ? eff : 0,
        isSTAB: (atk.types as string[]).includes(m.type) || atk.teraType === m.type,
    }
}
