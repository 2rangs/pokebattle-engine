// ─── 손가락흔들기 모드 (Metronome Battle) ──────────────────────
// 모든 포켓몬의 기술이 손가락흔들기(metronome) 하나뿐인 배틀.
//  - 포켓몬: 직접 고르거나(종 목록) 'random' (시드로 재현 가능)
//  - 능력치: HP·공격·방어·특공·특방·스피드 실수치를 자유롭게 (1~9999), 레벨 1~100
//    → PokemonSet.customStats + 'Custom Stats Mod' 규칙 (../engine/customstats.ts)
//  - 규칙: Showdown 커스텀 게임 + (9세대) Terastal Clause 기본.
//    참고: Showdown 서버의 [Gen 9] Metronome Battle 포맷은 @pkmn/sim 에 들어 있지 않아 같은 규칙을 직접 꾸린다.
// 옵션 객체는 JSON 으로 저장할 수 있다 → 룸 설정으로 보관하고 같은 seed 로 같은 배틀을 다시 만들 수 있다.
import { Dex } from '@pkmn/sim'
import type { Species as PSSpecies } from '@pkmn/sim'
import type { ShowdownSpecies } from '../types/showdown'
import { BattleEngine, BattleError } from '../engine/BattleEngine'
import type { EngineOptions } from '../engine/BattleEngine'
import { toCustomStats, SetError } from '../showdown/sets'
import { speciesToShowdown } from '../showdown/ids'
import { speciesSlug, abilitySlug } from '../data/dex'
import { PRNG } from '../utils/rng'
import type { Generation, PlayerID } from '../types/battle'
import type { Nature, PokemonSet, Stats } from '../types/pokemon'

/** 고정 기술 (PokeAPI 슬러그) */
export const METRONOME_MOVE = 'metronome'

export type MetronomeFormat = 'singles' | 'doubles'

/** 자유 능력치 (지정한 것만 덮어쓴다, 1~9999) */
export type MetronomeStats = Partial<Stats>

/** 직접 고른 포켓몬 하나. 문자열이면 종 이름만 */
export interface MetronomePokemonInput {
    /** PokeAPI 슬러그 / Showdown 이름 / 한국어 이름은 안 됨 (예: 'pikachu', 'Garchomp') */
    species: string
    nickname?: string
    /** 1~100 */
    level?: number
    /** 없으면 그 종의 첫 번째 특성 */
    ability?: string
    item?: string
    gender?: 'M' | 'F' | null
    nature?: Nature
    /** 이 포켓몬만의 능력치 (팀·전체 설정보다 우선) */
    stats?: MetronomeStats
}

export interface MetronomeSideOptions {
    name?: string
    /** 'random'(기본) 또는 고른 포켓몬 목록 (1~6마리) */
    team?: 'random' | (string | MetronomePokemonInput)[]
    /** 이 팀 모든 포켓몬의 능력치 (전체 설정보다 우선) */
    stats?: MetronomeStats
    /** 이 팀 모든 포켓몬의 레벨 */
    level?: number
}

export interface MetronomeBattleOptions {
    /** 같은 시드 → 같은 랜덤 팀 + 같은 배틀 진행 (같은 선택일 때) */
    seed?: number
    /** 'random' 팀의 크기 (1~6, 기본 3) */
    teamSize?: number
    /** 모든 포켓몬 레벨 (1~100, 기본 100) */
    level?: number
    /** 모든 포켓몬 능력치 (예: { hp: 999 }) */
    stats?: MetronomeStats
    /** 'singles'(기본) | 'doubles' */
    format?: MetronomeFormat
    /** 세대 (기본 9). 9 가 아니면 먼저 await preloadData({ gens: [gen] }) */
    gen?: Generation
    /** 9세대 테라스탈 허용 (기본 false) */
    terastal?: boolean
    /** 'random' 팀에 같은 종 중복 허용 (기본 false) */
    allowDuplicates?: boolean
    /** 이 턴을 넘기면 무승부 (기본 1000) */
    maxTurns?: number
    p1?: MetronomeSideOptions
    p2?: MetronomeSideOptions
    /** 엔진 옵션 (turnSnapshots 등) */
    engine?: EngineOptions
}

// ─── 랜덤 종 풀 ───────────────────────────────────────────────
const poolCache = new Map<number, PSSpecies[]>()

/**
 * 'random' 팀에 쓰는 종: 그 세대까지 나온 일반 포켓몬 (과거작 포함).
 * 배틀 중에만 되는 폼(메가·거다이맥스 등)과 특정 도구·특성·기술이 있어야 하는 폼(아르세우스 타입 등)은 뺀다.
 */
export function metronomeSpeciesPool(gen: Generation = 9): readonly ShowdownSpecies[] {
    return speciesPool(gen) as unknown as readonly ShowdownSpecies[]
}

function speciesPool(gen: Generation): readonly PSSpecies[] {
    const cached = poolCache.get(gen)
    if (cached) return cached
    const pool = Dex.forGen(gen).species.all().filter(s => {
        if (!s.exists || s.num <= 0 || s.gen > gen || s.battleOnly) return false
        if (s.isNonstandard && s.isNonstandard !== 'Past') return false
        if (s.requiredItem || s.requiredItems?.length || s.requiredAbility || s.requiredMove) return false
        if (s.forme && /Totem|Gmax|Mega|Primal/.test(s.forme)) return false
        return true
    })
    poolCache.set(gen, pool)
    return pool
}

// ─── 검사 ─────────────────────────────────────────────────────
function checkLevel(v: unknown, label: string): number | undefined {
    if (v === undefined || v === null) return undefined
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100) throw new BattleError(`${label}: 레벨은 1~100 정수여야 합니다 (받은 값: ${String(v)})`)
    return v
}

function checkStats(v: MetronomeStats | undefined, label: string): MetronomeStats | undefined {
    try {
        toCustomStats(v, label)
    } catch (err) {
        if (err instanceof SetError) throw new BattleError(err.message)
        throw err
    }
    return v ?? undefined
}

function mergeStats(...layers: (MetronomeStats | undefined)[]): MetronomeStats | undefined {
    const out: MetronomeStats = {}
    for (const l of layers) for (const [k, v] of Object.entries(l ?? {})) if (v !== undefined && v !== null) out[k as keyof Stats] = v
    return Object.keys(out).length ? out : undefined
}

// ─── 팀 ───────────────────────────────────────────────────────
interface TeamContext {
    gen: Generation
    level: number
    stats?: MetronomeStats
    teamSize: number
    allowDuplicates: boolean
    rng: PRNG
}

function metronomeSet(species: PSSpecies, base: { level: number; stats?: MetronomeStats; ability?: string }, input: Partial<MetronomePokemonInput> = {}): PokemonSet {
    const stats = mergeStats(base.stats, input.stats)
    return {
        species: speciesSlug(species.id),
        ...(input.nickname ? { nickname: input.nickname } : {}),
        level: input.level ?? base.level,
        gender: input.gender ?? null,
        ability: input.ability ?? base.ability ?? abilitySlug(species.abilities['0'] ?? ''),
        nature: input.nature ?? 'hardy',
        ...(input.item ? { item: input.item } : {}),
        moves: [METRONOME_MOVE],
        ...(stats ? { customStats: stats } : {}),
    }
}

/**
 * 한 팀의 손가락흔들기 세트를 만든다 (기술은 metronome 하나).
 * team: 'random' → 시드 rng 로 종·특성 선택 / 목록 → 그 종 그대로.
 */
export function buildMetronomeTeam(side: MetronomeSideOptions, ctx: TeamContext, label = 'team'): PokemonSet[] {
    const sideLevel = checkLevel(side.level, `${label}.level`) ?? ctx.level
    const sideStats = mergeStats(ctx.stats, checkStats(side.stats, `${label}.stats`))
    const dex = Dex.forGen(ctx.gen)
    const team = side.team ?? 'random'
    if (team === 'random') {
        const pool = speciesPool(ctx.gen)
        const picked: PSSpecies[] = []
        while (picked.length < ctx.teamSize) {
            const s = ctx.rng.pick(pool)
            if (!ctx.allowDuplicates && picked.some(p => p.baseSpecies === s.baseSpecies)) continue
            picked.push(s)
        }
        return picked.map(s => {
            const abilities = Object.values(s.abilities).filter(Boolean) as string[]
            return metronomeSet(s, { level: sideLevel, stats: sideStats, ability: abilities.length ? abilitySlug(ctx.rng.pick(abilities)) : '' })
        })
    }
    if (!Array.isArray(team)) throw new BattleError(`${label}.team: 'random' 또는 포켓몬 목록이어야 합니다`)
    if (team.length < 1 || team.length > 6) throw new BattleError(`${label}.team: 1~6마리여야 합니다 (받은 수: ${team.length})`)
    return team.map((entry, i) => {
        const input: MetronomePokemonInput = typeof entry === 'string' ? { species: entry } : entry
        const where = `${label}.team[${i}]`
        if (!input || typeof input.species !== 'string' || !input.species.trim()) throw new BattleError(`${where}: species 가 필요합니다`)
        const species = dex.species.get(speciesToShowdown(input.species))
        if (!species.exists || species.num <= 0) throw new BattleError(`${where}: 알 수 없는 포켓몬: ${input.species}`)
        if (species.gen > ctx.gen) throw new BattleError(`${where}: ${species.name} 은(는) ${ctx.gen}세대에 없습니다`)
        checkLevel(input.level, `${where}.level`)
        checkStats(input.stats, `${where}.stats`)
        return metronomeSet(species, { level: sideLevel, stats: sideStats }, input)
    })
}

/**
 * 손가락흔들기 배틀을 준비한다 (start() 전 상태).
 * 예: createMetronomeBattle({ seed: 1, stats: { hp: 999 }, p1: { team: ['pikachu', 'snorlax'] }, p2: { team: 'random' } })
 */
export function createMetronomeBattle(opts: MetronomeBattleOptions = {}): BattleEngine {
    const gen = opts.gen ?? 9
    const format = opts.format ?? 'singles'
    if (format !== 'singles' && format !== 'doubles') throw new BattleError(`format 은 'singles' 또는 'doubles' 입니다 (받은 값: ${String(format)})`)
    const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff)
    if (!Number.isInteger(seed) || seed < 0) throw new BattleError('seed 는 0 이상의 정수여야 합니다')
    const teamSize = opts.teamSize ?? (format === 'doubles' ? 4 : 3)
    if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 6) throw new BattleError(`teamSize 는 1~6 정수여야 합니다 (받은 값: ${String(teamSize)})`)
    if (format === 'doubles' && teamSize < 2) throw new BattleError('doubles 는 teamSize 가 2 이상이어야 합니다')
    const level = checkLevel(opts.level, 'level') ?? 100
    const stats = checkStats(opts.stats, 'stats')
    const rng = new PRNG(seed)
    const ctx = (): TeamContext => ({ gen, level, stats, teamSize, allowDuplicates: !!opts.allowDuplicates, rng: new PRNG(rng.int(0x7fffffff)) })
    const teams = {} as Record<PlayerID, PokemonSet[]>
    for (const player of ['p1', 'p2'] as const) teams[player] = buildMetronomeTeam(opts[player] ?? {}, ctx(), player)
    return new BattleEngine({
        format,
        gen,
        seed,
        maxTurns: opts.maxTurns,
        p1: { name: opts.p1?.name ?? 'P1', team: teams.p1 },
        p2: { name: opts.p2?.name ?? 'P2', team: teams.p2 },
        options: gen === 9 && !opts.terastal ? { terastal: false } : {},
    }, opts.engine)
}
