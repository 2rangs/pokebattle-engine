// ─── 랜덤배틀 (Pokémon Showdown / Smogon Random Battle) ──────────
// 팀·레벨·역할은 Showdown 공식 랜덤배틀 생성기(@pkmn/randoms)와 데이터를 그대로 쓴다.
//  - 레벨: 포켓몬마다 정해진 "밸런스 레벨" (강할수록 낮다). 9세대 기준 64~100, 종족값과 강한 음의 상관(r ≈ -0.78)
//    이지만 공식이 아니라 종별로 조정된 값이다 (특성·기술폭이 강하면 더 낮게, 슬로스타트·게으름 등은 더 높게)
//  - 배틀 규칙: 실제 랜덤배틀 포맷(gen9randombattle 등)으로 돌린다 → Sleep Clause·Species Clause 등 Showdown 과 같다
// 먼저 await preloadData() (랜덤배틀 데이터는 필요할 때 불러온다)
import { Dex, toID } from '@pkmn/sim'
import { BattleEngine, BattleError } from '../engine/BattleEngine'
import type { EngineOptions } from '../engine/BattleEngine'
import { getRandoms, genLoaded } from '../data/lazy'
import { generateRandomTeam } from '../sim'
import { speciesSlug, moveSlug, abilitySlug } from '../data/dex'
import { speciesToShowdown } from '../showdown/ids'
import { PRNG } from '../utils/rng'
import type { Generation } from '../types/battle'
import type { PokemonSet } from '../types/pokemon'

export type RandomBattleFormat = 'singles' | 'doubles' | 'monotype'

/** 지원하는 랜덤배틀: 1~9세대 싱글, 9세대 더블·모노타입 */
export const RANDOM_BATTLE_FORMATS: readonly { gen: Generation; format: RandomBattleFormat; id: string }[] = [
    ...([1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map(gen => ({ gen, format: 'singles' as const, id: `gen${gen}randombattle` })),
    { gen: 9, format: 'doubles', id: 'gen9randomdoublesbattle' },
    { gen: 9, format: 'monotype', id: 'gen9monotyperandombattle' },
]

/** (세대, 형식) → Showdown 랜덤배틀 포맷 ID */
export function randomBattleFormatId(gen: Generation = 9, format: RandomBattleFormat = 'singles'): string {
    const f = RANDOM_BATTLE_FORMATS.find(x => x.gen === gen && x.format === format)
    if (!f) throw new BattleError(`랜덤배틀이 없습니다: ${gen}세대 ${format} (지원: ${RANDOM_BATTLE_FORMATS.map(x => `${x.gen}세대 ${x.format}`).join(', ')})`)
    return f.id
}

function generator(formatId: string): RandomGenerator {
    const randoms = getRandoms()
    if (!randoms) throw new BattleError('랜덤배틀: 먼저 await preloadData() 를 호출하세요')
    return randoms.getTeamGenerator(formatId, [1, 2, 3, 4] as never) as unknown as RandomGenerator
}

interface RandomGenerator {
    /** 1세대는 다른 데이터 형식 (레벨 + 기술 묶음) */
    randomData?: Record<string, { level?: number; moves?: string[]; essentialMoves?: string[]; exclusiveMoves?: string[]; comboMoves?: string[] }>
    randomSets?: Record<string, RawEntry>
    randomDoublesSets?: Record<string, RawEntry>
    getLevel?: (species: unknown, isDoubles?: boolean) => number
}
interface RawEntry {
    level?: number
    sets?: { role: string; movepool: string[]; abilities?: string[]; teraTypes?: string[] }[]
}

// ─── 세트 데이터 조회 ─────────────────────────────────────────
export interface RandomBattleRole {
    /** Showdown 역할 이름 (예: 'Setup Sweeper', 'Bulky Support', 'Doubles Support') */
    role: string
    /** 이 역할에서 고를 수 있는 기술 (PokeAPI 슬러그, Showdown 이 이 중 4개를 고른다) */
    moves: string[]
    abilities: string[]
    /** 9세대: 테라스탈 타입 후보 */
    tera_types?: string[]
}

export interface RandomBattleSpecies {
    species: string
    /** 이 포맷에서의 밸런스 레벨 */
    level: number
    roles: RandomBattleRole[]
}

const setCache = new Map<string, Record<string, RandomBattleSpecies>>()

/**
 * 랜덤배틀 세트 데이터 전체 (PokeAPI 슬러그 → 레벨·역할·기술 후보). Smogon 랜덤배틀 세트 페이지와 같은 정보.
 * 예: getRandomBattleSets()['garchomp'] → { level: 74, roles: [{ role: 'Fast Support', moves: [...], … }, …] }
 */
export function getRandomBattleSets(gen: Generation = 9, format: RandomBattleFormat = 'singles'): Record<string, RandomBattleSpecies> {
    const id = randomBattleFormatId(gen, format)
    const cached = setCache.get(id)
    if (cached) return cached
    if (gen !== 9 && !genLoaded(gen)) throw new BattleError(`${gen}세대 데이터가 없습니다: 먼저 await preloadData({ gens: [${gen}] })`)
    const g = generator(id)
    const raw: Record<string, RawEntry> = gen === 1 && g.randomData
        ? Object.fromEntries(Object.entries(g.randomData).map(([id, d]) => [id, {
            level: d.level,
            sets: [{ role: 'Standard', movepool: [...new Set([...(d.essentialMoves ?? []), ...(d.moves ?? []), ...(d.exclusiveMoves ?? []), ...(d.comboMoves ?? [])])] }],
        }]))
        : (format === 'doubles' ? g.randomDoublesSets : g.randomSets) ?? {}
    const dex = Dex.forGen(gen)
    const out: Record<string, RandomBattleSpecies> = {}
    for (const [psId, entry] of Object.entries(raw)) {
        const species = dex.species.get(psId)
        if (!species.exists) continue
        let level = entry.level
        if (!level && g.getLevel) { try { level = g.getLevel(species, format === 'doubles') } catch { /* 레벨 규칙 없음 */ } }
        out[speciesSlug(psId)] = {
            species: speciesSlug(psId),
            level: level ?? 100,
            roles: (entry.sets ?? []).map(s => ({
                role: s.role,
                moves: s.movepool.map(m => moveSlug(m)),
                abilities: (s.abilities ?? []).map(a => abilitySlug(a)),
                ...(s.teraTypes ? { tera_types: s.teraTypes.map(t => toID(t)) } : {}),
            })),
        }
    }
    setCache.set(id, out)
    return out
}

/**
 * 한 포켓몬의 랜덤배틀 정보 (풀에 없으면 undefined). 이름은 슬러그·Showdown 이름 모두.
 * 겉모습만 다른 폼(꽃사슴 계절 등)은 기본 종, 8세대 거다이맥스는 Gmax 항목으로 찾는다.
 * 참고: 메가스톤·원시 구슬을 든 세트는 메가/원시 모습의 레벨을 쓴다 (예: 7세대 샤크니아 + 메가스톤 → sharpedo-mega 의 레벨).
 */
export function getRandomBattleSet(species: string, gen: Generation = 9, format: RandomBattleFormat = 'singles'): RandomBattleSpecies | undefined {
    const sets = getRandomBattleSets(gen, format)
    const ps = Dex.forGen(gen).species.get(speciesToShowdown(species))
    const candidates = [species, speciesSlug(toID(species))]
    if (ps.exists) {
        candidates.push(speciesSlug(ps.id + 'gmax'))
        if (ps.baseSpecies !== ps.name) candidates.push(speciesSlug(toID(ps.baseSpecies)))
        const base = Dex.forGen(gen).species.get(ps.baseSpecies)
        if (base.exists) candidates.push(speciesSlug(base.id + 'gmax'))
    }
    for (const c of candidates) if (sets[c]) return sets[c]
    return undefined
}

// ─── 랜덤배틀 시작 ────────────────────────────────────────────
export interface RandomBattleOptions {
    gen?: Generation
    format?: RandomBattleFormat
    /** 같은 시드 → 같은 두 팀 + 같은 배틀 진행(같은 선택일 때) */
    seed?: number
    /**
     * 레벨: 'balanced'(기본, Showdown 밸런스 레벨) 또는 숫자(모든 포켓몬 그 레벨, 예: 50 / 100).
     * 고정 레벨은 공식 랜덤배틀과 다르다 — 약한 포켓몬 보정이 없어진다.
     */
    level?: 'balanced' | number
    /** 팀 크기 (기본 6, 더블은 Showdown 기본) */
    teamSize?: number
    p1?: string
    p2?: string
    /** 엔진 옵션 (turnSnapshots 등) */
    engine?: EngineOptions
}

/** 랜덤 팀 둘을 만들고 실제 랜덤배틀 포맷으로 배틀을 준비한다 (start() 전 상태) */
export function createRandomBattle(opts: RandomBattleOptions = {}): BattleEngine {
    const gen = opts.gen ?? 9
    const format = opts.format ?? 'singles'
    const formatid = randomBattleFormatId(gen, format)
    const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff)
    const level = opts.level === undefined || opts.level === 'balanced' ? undefined : opts.level
    if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 100)) throw new BattleError('level 은 1~100 정수 또는 \'balanced\' 입니다')
    const rng = new PRNG(seed)
    const team = (): PokemonSet[] => generateRandomTeam({ seed: rng.int(0x7fffffff), format: formatid, level, size: opts.teamSize })
    return new BattleEngine({
        format: format === 'doubles' ? 'doubles' : 'singles',
        gen,
        seed,
        formatid,
        p1: { name: opts.p1 ?? 'P1', team: team() },
        p2: { name: opts.p2 ?? 'P2', team: team() },
    }, opts.engine)
}

/** 레벨 분포 요약 (분석용): 종족값 구간별 평균 레벨 */
export function randomBattleLevelStats(gen: Generation = 9, format: RandomBattleFormat = 'singles'): { bst: string; count: number; avgLevel: number; min: number; max: number }[] {
    const dex = Dex.forGen(gen)
    const rows = Object.values(getRandomBattleSets(gen, format)).map(s => {
        const b = dex.species.get(s.species).baseStats
        return { level: s.level, bst: b.hp + b.atk + b.def + b.spa + b.spd + b.spe }
    })
    const buckets: [number, number][] = [[0, 400], [400, 450], [450, 500], [500, 550], [550, 600], [600, 700], [700, 9999]]
    return buckets.flatMap(([lo, hi]) => {
        const r = rows.filter(x => x.bst >= lo && x.bst < hi)
        if (!r.length) return []
        return [{ bst: hi > 999 ? `${lo}+` : `${lo}-${hi - 1}`, count: r.length, avgLevel: Math.round(r.reduce((a, x) => a + x.level, 0) / r.length * 10) / 10, min: Math.min(...r.map(x => x.level)), max: Math.max(...r.map(x => x.level)) }]
    })
}


