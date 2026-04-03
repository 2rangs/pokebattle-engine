import type { Stats } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { TypeChart } from '../calc/damage'

// ─── 타입 정의 ────────────────────────────────────────────────
export interface SpeciesData {
    id:           number
    name:         string
    types:        string[]
    base_stats:   Stats
    abilities:    { name: string; hidden: boolean; slot: number }[]
    gender_rate:  number
    is_legendary: boolean
    is_mythical:  boolean
    weight:       number
    height:       number
}

export interface TypeData {
    id:   number
    name: string
    damage_relations: {
        double_damage_to:   string[]
        half_damage_to:     string[]
        no_damage_to:       string[]
        double_damage_from: string[]
        half_damage_from:   string[]
        no_damage_from:     string[]
    }
}

// ─── 싱글톤 캐시 ─────────────────────────────────────────────
let pokemonCache:  Map<string, SpeciesData> | null = null
let moveCache:     Map<string, MoveData>    | null = null
let typeChartCache: TypeChart               | null = null

// ─── Pokemon JSON 로드 ────────────────────────────────────────
export async function loadPokemonData(): Promise<Map<string, SpeciesData>> {
    if (pokemonCache) return pokemonCache

    const data: SpeciesData[] = await import('../../src/data/pokemon.json').then(m => m.default)

    pokemonCache = new Map()
    for (const p of data) {
        pokemonCache.set(p.name, p)
        pokemonCache.set(String(p.id), p)
    }

    return pokemonCache
}

// ─── Moves JSON 로드 ──────────────────────────────────────────
export async function loadMoveData(): Promise<Map<string, MoveData>> {
    if (moveCache) return moveCache

    const data: any[] = await import('../../src/data/moves.json').then(m => m.default)

    moveCache = new Map()
    const normStat = (s: string) => s
        .replace('special-attack',  'special_attack')
        .replace('special-defense', 'special_defense')
    for (const m of data) {
        const move: MoveData = {
            id:            m.id,
            name:          m.name,
            type:          m.type,
            category:      m.category,
            power:         m.power,
            accuracy:      m.accuracy,
            pp:            m.pp,
            priority:      m.priority,
            target:        m.target,
            effect_chance: m.effect_chance,
            effect:        m.effect,
            meta:          m.meta,
            stat_changes:  (m.stat_changes ?? []).map((sc: any) => ({
                stat:   normStat(sc.stat),   // ← 여기
                change: sc.change,
            })),
        }
        moveCache.set(m.name, move)
        moveCache.set(String(m.id), move)
    }

    return moveCache
}

// ─── TypeChart JSON 로드 ──────────────────────────────────────
export async function loadTypeChart(): Promise<TypeChart> {
    if (typeChartCache) return typeChartCache

    const data: TypeData[] = await import('../../src/data/types.json').then(m => m.default)

    typeChartCache = {}
    for (const type of data) {
        typeChartCache[type.name] = {}
        for (const t of type.damage_relations.double_damage_to)  typeChartCache[type.name]![t] = 2
        for (const t of type.damage_relations.half_damage_to)    typeChartCache[type.name]![t] = 0.5
        for (const t of type.damage_relations.no_damage_to)      typeChartCache[type.name]![t] = 0
    }

    return typeChartCache
}

// ─── 동기 조회 (미리 로드된 경우만) ──────────────────────────
export function getSpecies(name: string): SpeciesData | undefined {
    return pokemonCache?.get(name.toLowerCase())
}

export function getMove(name: string): MoveData | undefined {
    return moveCache?.get(name.toLowerCase())
}

export function getTypeChart(): TypeChart {
    return typeChartCache ?? {}
}

// ─── 전부 미리 로드 ───────────────────────────────────────────
export async function preloadData(): Promise<void> {
    await Promise.all([
        loadPokemonData(),
        loadMoveData(),
        loadTypeChart(),
    ])
}