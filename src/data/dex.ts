// ─── 데이터 조회 (Showdown Dex + PokeAPI 슬러그/한국어 이름) ──────
// 배틀 메커니즘 데이터: Pokémon Showdown (@pkmn/sim Dex)
// 도감 슬러그·한국어 이름: PokeAPI (src/data/pokeapi.json, scripts/fetch-pokeapi.ts 로 생성)
import { Dex, toID } from '@pkmn/sim'
import type { Stats } from '../types/pokemon'
import type { MoveData, MoveTarget, MoveCategory } from '../types/move'
import { speciesToShowdown, moveToShowdown, toSlug } from '../showdown/ids'
import pokeapi from './pokeapi.json'
import { loadRandoms, loadLearnsets, getRandoms, learnsetsLoaded, loadGen, genLoaded } from './lazy'

// ─── PokeAPI 데이터 ───────────────────────────────────────────
interface PokeApiSpecies {
    slug: string; id: number; num: number; species: string; ko: string | null
    default: boolean; types: string[]; ps: string | null
}
type KoMap = Record<string, { ko: string | null; ps: string | null }>

const API = pokeapi as unknown as {
    species: PokeApiSpecies[]
    moves: KoMap; abilities: KoMap; items: KoMap
    types: Record<string, string | null>; natures: Record<string, string | null>
}

const SPECIES_BY_SLUG = new Map<string, PokeApiSpecies>()
const SLUG_BY_PS_SPECIES = new Map<string, string>()
for (const s of API.species) {
    SPECIES_BY_SLUG.set(s.slug, s)
    if (!s.ps) continue
    // 기본 폼을 우선해서 역매핑 (urshifu → urshifu-single-strike)
    const prev = SLUG_BY_PS_SPECIES.get(s.ps)
    if (!prev || (s.default && !SPECIES_BY_SLUG.get(prev)!.default) || (s.default === SPECIES_BY_SLUG.get(prev)!.default && s.id < SPECIES_BY_SLUG.get(prev)!.id && toID(s.slug) === s.ps)) {
        SLUG_BY_PS_SPECIES.set(s.ps, s.slug)
    }
}
// 이름이 정확히 일치하는 슬러그가 있으면 그것을 우선
for (const s of API.species) if (s.ps && toID(s.slug) === s.ps) SLUG_BY_PS_SPECIES.set(s.ps, s.slug)

const reverse = (m: KoMap) => {
    const out = new Map<string, string>()
    for (const [slug, v] of Object.entries(m)) if (v.ps && !out.has(v.ps)) out.set(v.ps, slug)
    return out
}
const SLUG_BY_PS_MOVE = reverse(API.moves)
const SLUG_BY_PS_ABILITY = reverse(API.abilities)
// Showdown 로그는 두 혼연일체를 'As One' 하나로 쓴다 (이름은 같다)
if (!SLUG_BY_PS_ABILITY.has('asone')) SLUG_BY_PS_ABILITY.set('asone', 'as-one-glastrier')
const SLUG_BY_PS_ITEM = reverse(API.items)

// ─── Showdown ID → PokeAPI 슬러그 ──────────────────────────────
export function speciesSlug(psIdOrName: string): string {
    const id = toID(psIdOrName)
    return SLUG_BY_PS_SPECIES.get(id) ?? toSlug(Dex.species.get(id).exists ? Dex.species.get(id).name : psIdOrName)
}
export function moveSlug(psIdOrName: string): string {
    const id = toID(psIdOrName)
    return SLUG_BY_PS_MOVE.get(id) ?? toSlug(Dex.moves.get(id).exists ? Dex.moves.get(id).name : psIdOrName)
}
export function abilitySlug(psIdOrName: string): string {
    const id = toID(psIdOrName)
    return SLUG_BY_PS_ABILITY.get(id) ?? toSlug(Dex.abilities.get(id).exists ? Dex.abilities.get(id).name : psIdOrName)
}
export function itemSlug(psIdOrName: string): string {
    const id = toID(psIdOrName)
    if (!id) return ''
    return SLUG_BY_PS_ITEM.get(id) ?? toSlug(Dex.items.get(id).exists ? Dex.items.get(id).name : psIdOrName)
}

// ─── 한국어 이름 ─────────────────────────────────────────────
export const koName = {
    species: (slug: string): string | null => {
        const s = SPECIES_BY_SLUG.get(slug) ?? SPECIES_BY_SLUG.get(speciesSlug(speciesToShowdown(slug)))
        return s?.ko ?? null
    },
    move:    (slug: string): string | null => API.moves[slug]?.ko ?? API.moves[moveSlug(moveToShowdown(slug))]?.ko ?? null,
    ability: (slug: string): string | null => API.abilities[slug]?.ko ?? API.abilities[abilitySlug(slug)]?.ko ?? null,
    item:    (slug: string): string | null => API.items[slug]?.ko ?? API.items[itemSlug(slug)]?.ko ?? null,
    type:    (slug: string): string | null => slug === 'stellar' ? '스텔라' : API.types[slug] ?? null,
    nature:  (slug: string): string | null => API.natures[slug.toLowerCase()] ?? null,
}

/** PokeAPI 도감 정보 (슬러그, 전국도감 번호, 한국어 이름) */
export function getPokeApiSpecies(slug: string): PokeApiSpecies | undefined {
    return SPECIES_BY_SLUG.get(slug)
}
export function listPokeApiSpecies(): readonly PokeApiSpecies[] {
    return API.species
}

// ─── 엔진 형식의 데이터 ───────────────────────────────────────
export interface SpeciesData {
    id:           number     // 전국도감 번호
    name:         string     // PokeAPI 슬러그
    showdown:     string     // Showdown 이름 (예: 'Urshifu-Rapid-Strike')
    species_name?: string
    types:        string[]
    base_stats:   Stats
    abilities:    { name: string; hidden: boolean; slot: number }[]
    gender_rate:  number
    is_legendary: boolean
    is_mythical:  boolean
    is_default?:  boolean
    weight:       number     // hg (PokeAPI 단위)
    height:       number     // dm
    tier?:        string
    nameKo?:      string | null
}

const speciesCache = new Map<string, SpeciesData | undefined>()

/** PokeAPI 슬러그 / Showdown 이름 / ID 모두 허용 */
export function getSpecies(name: string): SpeciesData | undefined {
    if (speciesCache.has(name)) return speciesCache.get(name)
    const sp = Dex.species.get(speciesToShowdown(name))
    let out: SpeciesData | undefined
    if (sp.exists) {
        const api = SPECIES_BY_SLUG.get(name)
        const slug = api?.slug ?? speciesSlug(sp.id)
        const abilities = Object.entries(sp.abilities)
            .filter(([, a]) => !!a)
            .map(([k, a], i) => ({ name: abilitySlug(a as string), hidden: k === 'H', slot: k === 'H' ? 3 : i + 1 }))
        out = {
            id:           sp.num,
            name:         slug,
            showdown:     sp.name,
            species_name: api?.species ?? toSlug(sp.baseSpecies),
            types:        sp.types.map(t => t.toLowerCase()),
            base_stats:   {
                hp: sp.baseStats.hp, attack: sp.baseStats.atk, defense: sp.baseStats.def,
                special_attack: sp.baseStats.spa, special_defense: sp.baseStats.spd, speed: sp.baseStats.spe,
            },
            abilities,
            gender_rate:  sp.gender === 'N' ? -1 : sp.gender === 'F' ? 8 : sp.gender === 'M' ? 0 : Math.round((sp.genderRatio?.F ?? 0.5) * 8),
            is_legendary: sp.tags.includes('Restricted Legendary') || sp.tags.includes('Sub-Legendary'),
            is_mythical:  sp.tags.includes('Mythical'),
            is_default:   api?.default ?? !sp.forme,
            weight:       Math.round(sp.weightkg * 10),
            height:       Math.round(sp.heightm * 10),
            tier:         sp.tier,
            nameKo:       api?.ko ?? koName.species(slug),
        }
    }
    speciesCache.set(name, out)
    return out
}

const TARGET_MAP: Record<string, MoveTarget> = {
    normal: 'selected-pokemon', any: 'selected-pokemon', adjacentFoe: 'selected-pokemon',
    allAdjacentFoes: 'all-opponents', allAdjacent: 'all-other-pokemon', all: 'entire-field',
    self: 'user', allySide: 'users-field', foeSide: 'opponents-field', allyTeam: 'user-and-allies',
    adjacentAlly: 'ally', adjacentAllyOrSelf: 'user-or-ally', allies: 'all-allies',
    randomNormal: 'random-opponent', scripted: 'specific-move',
}

const moveCache = new Map<string, MoveData | undefined>()

export function getMove(name: string): MoveData | undefined {
    if (moveCache.has(name)) return moveCache.get(name)
    const m = Dex.moves.get(moveToShowdown(name))
    let out: MoveData | undefined
    if (m.exists) {
        const boosts = m.category === 'Status' ? m.boosts ?? m.self?.boosts : m.self?.boosts ?? m.secondary?.self?.boosts ?? m.secondary?.boosts
        out = {
            id:            m.num,
            name:          moveSlug(m.id),
            showdown:      m.name,
            type:          m.type.toLowerCase(),
            category:      m.category.toLowerCase() as MoveCategory,
            power:         m.basePower || null,
            accuracy:      m.accuracy === true ? null : m.accuracy,
            pp:            m.pp,
            priority:      m.priority,
            target:        (TARGET_MAP[m.target] ?? 'selected-pokemon') as MoveTarget,
            effect_chance: m.secondary?.chance ?? null,
            effect:        m.shortDesc || m.desc,
            meta:          null,
            stat_changes:  Object.entries(boosts ?? {}).map(([stat, change]) => ({ stat: STAT_FROM_PS[stat] ?? stat, change: change as number })),
            flags:         Object.keys(m.flags),
            nameKo:        API.moves[moveSlug(m.id)]?.ko ?? null,
        }
    }
    moveCache.set(name, out)
    return out
}

export const STAT_FROM_PS: Record<string, string> = {
    hp: 'hp', atk: 'attack', def: 'defense', spa: 'special_attack', spd: 'special_defense', spe: 'speed',
    accuracy: 'accuracy', evasion: 'evasion',
}
export const STAT_TO_PS: Record<string, string> = Object.fromEntries(Object.entries(STAT_FROM_PS).map(([k, v]) => [v, k]))

/** 배틀 가능한 (9세대 기준 존재하는) 포켓몬 목록 */
export function listSpecies(): SpeciesData[] {
    return API.species.map(s => getSpecies(s.slug)).filter((s): s is SpeciesData => !!s)
}

export function listMoves(): MoveData[] {
    return Object.keys(API.moves).map(getMove).filter((m): m is MoveData => !!m)
}

/** 타입 상성표 (공격 타입 → 방어 타입 → 배율) */
export function getTypeChart(): Record<string, Record<string, number>> {
    const chart: Record<string, Record<string, number>> = {}
    for (const atk of Dex.types.all()) {
        const a = atk.id
        chart[a] = {}
        for (const def of Dex.types.all()) {
            if (!Dex.getImmunity(atk.name, def.name)) chart[a]![def.id] = 0
            else {
                const eff = Dex.getEffectiveness(atk.name, def.name)
                if (eff !== 0) chart[a]![def.id] = 2 ** eff
            }
        }
    }
    return chart
}

/** 하위 호환: 이제 데이터는 동기적으로 사용 가능 */
/**
 * 무거운 데이터(랜덤배틀 세트, Showdown 기술표)를 불러온다. 배틀·계산기·이름은 이것 없이도 동작하고,
 * generateRandomTeam / generateRandomSet(기술표 사용) / generateChaosTeam 전에 한 번 필요하다.
 */
export async function preloadData(opts: { gens?: number[] } = {}): Promise<void> {
    await Promise.all([loadRandoms(), loadLearnsets()])
    // 세대 데이터는 상위 세대를 상속하므로 하나씩 차례로 (예: 7세대 = 8세대 위에 차이만)
    for (const g of opts.gens ?? []) if (g !== 9) await loadGen(g)
}
/** 무거운 데이터가 모두 준비됐는지 (gens: 이 세대 데이터까지) */
export function isDataLoaded(gens: number[] = []): boolean {
    return !!getRandoms() && learnsetsLoaded() && gens.every(g => g === 9 || genLoaded(g))
}
export { genLoaded }
