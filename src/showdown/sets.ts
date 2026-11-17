// ─── PokemonSet (PokeAPI 슬러그) ↔ Showdown PokemonSet ─────────
import { Dex, toID } from '@pkmn/sim'
import type { PokemonSet as PSSet, StatsTable } from '@pkmn/sim'
import type { PokemonSet, EVs, IVs, Nature } from '../types/pokemon'
import { speciesToShowdown, moveToShowdown, abilityToShowdown, itemToShowdown, natureToShowdown, typeToShowdown } from './ids'
import { speciesSlug, moveSlug, abilitySlug, itemSlug, STAT_TO_PS, STAT_FROM_PS } from '../data/dex'

export class SetError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'SetError'
    }
}

function toStatsTable(src: EVs | IVs | undefined, fill: number): StatsTable {
    const out = { hp: fill, atk: fill, def: fill, spa: fill, spd: fill, spe: fill } as StatsTable
    for (const [k, v] of Object.entries(src ?? {})) {
        if (v === undefined || v === null) continue
        const key = (STAT_TO_PS[k] ?? k) as keyof StatsTable
        if (key in out) out[key] = Math.max(0, Math.floor(Number(v)))
    }
    return out
}

function fromStatsTable(t: Partial<StatsTable> | undefined, skip: number): EVs {
    const out: EVs = {}
    for (const [k, v] of Object.entries(t ?? {})) {
        if (v === undefined || v === skip) continue
        ;(out as Record<string, number>)[STAT_FROM_PS[k] ?? k] = v
    }
    return out
}

/** 프로토콜에 쓰이는 이름이라 구분자 문자 제거 */
function cleanName(name: string): string {
    return name.replace(/[|,\]\[]/g, '').trim().slice(0, 18)
}

/**
 * 엔진 세트 → Showdown 세트.
 * 종/기술/특성/도구는 PokeAPI 슬러그·Showdown 이름·ID 를 모두 받는다.
 * strict 면 존재하지 않는 이름에서 SetError.
 */
export function toShowdownSet(set: PokemonSet, strict = true): PSSet {
    const species = Dex.species.get(speciesToShowdown(set.species))
    if (!species.exists) {
        throw new SetError(`알 수 없는 포켓몬: ${set.species}`)
    }
    const moves: string[] = []
    for (const m of set.moves) {
        if (!m) continue
        const move = Dex.moves.get(moveToShowdown(m))
        if (!move.exists) {
            if (strict) throw new SetError(`알 수 없는 기술: ${m}`)
            continue
        }
        if (!moves.includes(move.name)) moves.push(move.name)
    }
    if (moves.length === 0) throw new SetError(`${set.species}: 기술이 없습니다`)

    let ability = ''
    if (set.ability) {
        const a = Dex.abilities.get(abilityToShowdown(set.ability))
        if (!a.exists && strict) throw new SetError(`알 수 없는 특성: ${set.ability}`)
        ability = a.exists ? a.name : ''
    }
    if (!ability) ability = species.abilities['0']

    let item = ''
    if (set.item) {
        const it = Dex.items.get(itemToShowdown(set.item))
        if (!it.exists && strict) throw new SetError(`알 수 없는 도구: ${set.item}`)
        item = it.exists ? it.name : ''
    }

    const teraType = set.teraType ? typeToShowdown(set.teraType) : species.types[0]!
    const nickname = set.nickname ? cleanName(set.nickname) : ''

    return {
        name:     nickname || species.baseSpecies,
        species:  species.name,
        item,
        ability,
        moves,
        nature:   natureToShowdown(set.nature ?? 'hardy'),
        gender:   set.gender ?? '',
        evs:      toStatsTable(set.evs, 0),
        ivs:      toStatsTable(set.ivs, 31),
        level:    Math.max(1, Math.min(100, Math.floor(set.level ?? 50))),
        shiny:    !!set.shiny,
        teraType,
        happiness: 255,
    } as PSSet
}

/** Showdown 세트 → 엔진 세트 (PokeAPI 슬러그) */
export function fromShowdownSet(ps: PSSet): PokemonSet {
    const species = Dex.species.get(ps.species)
    const slug = speciesSlug(species.exists ? species.id : toID(ps.species))
    return {
        species:  slug,
        nickname: ps.name && toID(ps.name) !== species.id && ps.name !== species.baseSpecies ? ps.name : undefined,
        level:    ps.level || 100,
        gender:   ps.gender === 'M' || ps.gender === 'F' ? ps.gender : null,
        ability:  ps.ability ? abilitySlug(ps.ability) : '',
        nature:   (toID(ps.nature) || 'hardy') as Nature,
        item:     ps.item ? itemSlug(ps.item) : undefined,
        moves:    ps.moves.slice(0, 4).map(m => moveSlug(m)) as PokemonSet['moves'],
        evs:      fromStatsTable(ps.evs, 0),
        ivs:      fromStatsTable(ps.ivs, 31),
        teraType: ps.teraType ? toID(ps.teraType) : undefined,
        shiny:    ps.shiny || undefined,
    }
}
