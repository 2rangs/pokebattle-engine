import type { Stats } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { TypeChart } from '../calc/damage'
import { toId } from '../utils/id'

// ─── 타입 정의 ────────────────────────────────────────────────
export interface SpeciesData {
    id:           number
    name:         string
    species_name?: string
    types:        string[]
    base_stats:   Stats
    abilities:    { name: string; hidden: boolean; slot: number }[]
    gender_rate:  number
    is_legendary: boolean
    is_mythical:  boolean
    is_default?:  boolean
    weight:       number   // hg
    height:       number   // dm
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
let pokemonCache:   Map<string, SpeciesData> | null = null
let speciesList:    SpeciesData[] = []
let moveCache:      Map<string, MoveData>    | null = null
let moveList:       MoveData[] = []
let typeChartCache: TypeChart                | null = null

// ─── 원본 → 엔진 데이터 변환 ─────────────────────────────────
const normStat = (s: string) => s
    .replace('special-attack',  'special_attack')
    .replace('special-defense', 'special_defense')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMove(m: any): MoveData {
    return {
        id:            m.id,
        name:          m.name,
        type:          m.type,
        category:      m.category,
        power:         m.power,
        accuracy:      m.accuracy,
        pp:            m.pp ?? 5,
        priority:      m.priority ?? 0,
        target:        m.target,
        effect_chance: m.effect_chance ?? null,
        effect:        m.effect ?? '',
        meta:          m.meta ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stat_changes:  (m.stat_changes ?? []).map((sc: any) => ({
            stat:   normStat(sc.stat),
            change: sc.change,
        })),
    }
}

function indexSpecies(data: SpeciesData[]): void {
    speciesList = data
    pokemonCache = new Map()
    for (const p of data) {
        pokemonCache.set(p.name, p)
        pokemonCache.set(String(p.id), p)
    }
    // species_name 으로도 조회 가능하게 (기본 폼 우선)
    for (const p of data) {
        const key = p.species_name
        if (!key || pokemonCache.has(key)) continue
        if (p.is_default !== false) pokemonCache.set(key, p)
    }
    for (const p of data) {
        const key = p.species_name
        if (key && !pokemonCache.has(key)) pokemonCache.set(key, p)
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function indexMoves(data: any[]): void {
    moveCache = new Map()
    moveList = []
    for (const raw of data) {
        const move = normalizeMove(raw)
        moveList.push(move)
        moveCache.set(move.name, move)
        moveCache.set(String(move.id), move)
    }
}

export function buildTypeChart(data: TypeData[]): TypeChart {
    const chart: TypeChart = {}
    for (const type of data) {
        chart[type.name] = {}
        for (const t of type.damage_relations.double_damage_to)  chart[type.name]![t] = 2
        for (const t of type.damage_relations.half_damage_to)    chart[type.name]![t] = 0.5
        for (const t of type.damage_relations.no_damage_to)      chart[type.name]![t] = 0
    }
    return chart
}

// ─── 비동기 로드 (번들된 JSON) ───────────────────────────────
export async function loadPokemonData(): Promise<Map<string, SpeciesData>> {
    if (pokemonCache) return pokemonCache
    const data = (await import('./compact/pokemon.json')).default as unknown as SpeciesData[]
    indexSpecies(data)
    return pokemonCache!
}

export async function loadMoveData(): Promise<Map<string, MoveData>> {
    if (moveCache) return moveCache
    const data = (await import('./compact/moves.json')).default as unknown[]
    indexMoves(data)
    return moveCache!
}

export async function loadTypeChart(): Promise<TypeChart> {
    if (typeChartCache) return typeChartCache
    const data = (await import('./compact/types.json')).default as unknown as TypeData[]
    typeChartCache = buildTypeChart(data)
    return typeChartCache
}

/** 포켓몬/기술/타입 데이터를 모두 미리 로드 (BattleEngine 생성 전에 1회 호출) */
export async function preloadData(): Promise<void> {
    await Promise.all([
        loadPokemonData(),
        loadMoveData(),
        loadTypeChart(),
    ])
}

/**
 * 외부 데이터 주입 (번들 JSON 대신 사용하거나, 커스텀 포켓몬/기술 추가)
 * 이미 로드된 데이터는 교체된다.
 */
export function registerData(data: {
    pokemon?: SpeciesData[]
    moves?:   unknown[]
    types?:   TypeData[]
    typeChart?: TypeChart
}): void {
    if (data.pokemon) indexSpecies(data.pokemon)
    if (data.moves)   indexMoves(data.moves)
    if (data.types)   typeChartCache = buildTypeChart(data.types)
    if (data.typeChart) typeChartCache = data.typeChart
}

export function isDataLoaded(): boolean {
    return !!pokemonCache && !!moveCache && !!typeChartCache
}

// ─── 동기 조회 (미리 로드된 경우만) ──────────────────────────
export function getSpecies(name: string): SpeciesData | undefined {
    if (!pokemonCache) return undefined
    return pokemonCache.get(name) ?? pokemonCache.get(toId(name))
}

export function getMove(name: string): MoveData | undefined {
    if (!moveCache) return undefined
    return moveCache.get(name) ?? moveCache.get(toId(name))
}

export function getTypeChart(): TypeChart {
    return typeChartCache ?? {}
}

export function listSpecies(): readonly SpeciesData[] {
    return speciesList
}

export function listMoves(): readonly MoveData[] {
    return moveList
}
