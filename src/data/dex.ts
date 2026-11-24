// ─── 데이터 조회 (Showdown Dex + PokeAPI 슬러그/한국어 이름) ──────
// 배틀 메커니즘 데이터: Pokémon Showdown (@pkmn/sim Dex)
// 도감 슬러그·한국어 이름: PokeAPI (src/data/pokeapi.json, scripts/fetch-pokeapi.ts 로 생성)
import { Dex, toID } from '@pkmn/sim'
import type { Stats } from '../types/pokemon'
import type { Generation } from '../types/battle'
import type { MoveData, MoveTarget, MoveCategory } from '../types/move'
import { speciesToShowdown, moveToShowdown, itemToShowdown, toSlug } from '../showdown/ids'
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
    /** 폼 슬러그 → 한국어 폼 이름 (워시로토무, 나인테일 (알로라의 모습)). 기본 모습은 없음 */
    forms: Record<string, string>
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
    /** 폼이면 폼 이름 (rotom-wash → 워시로토무), 아니면 종 이름 */
    species: (slug: string): string | null => {
        const form = API.forms[slug]
        if (form) return form
        const s = SPECIES_BY_SLUG.get(slug) ?? SPECIES_BY_SLUG.get(speciesSlug(speciesToShowdown(slug)))
        return (s && API.forms[s.slug]) ?? s?.ko ?? null
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
    /** 한국어 이름 (폼은 폼 이름: 워시로토무, 나인테일 (알로라의 모습)) */
    nameKo?:      string | null
}

const speciesCache = new Map<string, SpeciesData | undefined>()

/**
 * PokeAPI 슬러그 / Showdown 이름 / ID 모두 허용.
 * gen 을 주면 그 세대 데이터 (1세대 특수, 페어리 이전 타입, 그 세대 특성 — 1·2세대는 특성 없음). 1~8세대는 preloadData({ gens }) 뒤에.
 */
export function getSpecies(name: string, opts: { gen?: Generation } = {}): SpeciesData | undefined {
    const gen = opts.gen ?? 9
    const key = gen === 9 ? name : `${gen}:${name}`
    if (speciesCache.has(key)) return speciesCache.get(key)
    const dex = dexFor(gen, 'getSpecies')
    const sp = dex.species.get(speciesToShowdown(name))
    let out: SpeciesData | undefined
    if (sp.exists && (gen === 9 || !sp.isNonstandard || sp.isNonstandard === 'Past' || sp.isNonstandard === 'Unobtainable')) {
        const api = SPECIES_BY_SLUG.get(name)
        const slug = api?.slug ?? speciesSlug(sp.id)
        const abilities = gen <= 2 ? [] : Object.entries(sp.abilities)
            .filter(([, a]) => !!a && a !== 'No Ability')
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
            nameKo:       koName.species(slug),
        }
    }
    speciesCache.set(key, out)
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

/** gen 을 주면 그 세대의 타입·분류·위력 (3세대까지는 분류가 타입으로 정해진다). 1~8세대는 preloadData({ gens }) 뒤에 */
export function getMove(name: string, opts: { gen?: Generation } = {}): MoveData | undefined {
    const gen = opts.gen ?? 9
    const key = gen === 9 ? name : `${gen}:${name}`
    if (moveCache.has(key)) return moveCache.get(key)
    const m = dexFor(gen, 'getMove').moves.get(moveToShowdown(name))
    let out: MoveData | undefined
    // 그 세대 이후에 나온 기술은 없다
    if (m.exists && !(gen !== 9 && m.isNonstandard === 'Future')) {
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
    moveCache.set(key, out)
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
    return Object.keys(API.moves).map(m => getMove(m)).filter((m): m is MoveData => !!m)
}

/** 타입 상성표 (공격 타입 → 방어 타입 → 배율). gen 을 주면 그 세대에 있는 타입과 그 세대 상성 */
export function getTypeChart(opts: { gen?: Generation } = {}): Record<string, Record<string, number>> {
    const dex = dexFor(opts.gen ?? 9, 'getTypeChart')
    const types = dex.types.all().filter(t => !t.isNonstandard)
    const chart: Record<string, Record<string, number>> = {}
    for (const atk of types) {
        const a = atk.id
        chart[a] = {}
        for (const def of types) {
            if (!dex.getImmunity(atk.name, def.name)) chart[a]![def.id] = 0
            else {
                const eff = dex.getEffectiveness(atk.name, def.name)
                if (eff !== 0) chart[a]![def.id] = 2 ** eff
            }
        }
    }
    return chart
}

// ─── 기술표 · 도구 목록 (팀 편집기용) ──────────────────────────
function dexFor(gen: Generation, what: string) {
    if (gen === 9) return Dex
    if (!genLoaded(gen)) throw new Error(`${what}: ${gen}세대 데이터가 필요합니다 — 먼저 await preloadData({ gens: [${gen}] }) 를 호출하세요`)
    return Dex.forGen(gen)
}

const learnsetCache = new Map<string, string[]>()

/**
 * 이 종이 그 세대에 배울 수 있는 기술 (PokeAPI 기술 슬러그, 가나다가 아닌 슬러그 알파벳순).
 *
 * Showdown 팀 검증기와 같은 규칙(`Dex.species.getMovePool`)으로 모은다:
 *  - 종 자신의 기술표 + 진화 전(prevo) 사슬 (알·레벨·기술머신·이벤트 등 출처 무관)
 *  - 기술표가 따로 없는 폼(메가·거다이맥스·리전 폼이 아닌 배틀 폼 등)은 기본 폼의 기술표, 바꿀 수 있는 폼(로토무·네크로즈마)은 기본 폼 기술표도 더한다
 *  - 9세대: 9세대 출처가 있는 기술만 (HOME 이 기술을 지운다). 1~8세대: 그 세대 이하 출처 (세대 이동 포함)
 *  - 그 세대에 없는 기술(isNonstandard)은 뺀다. 루브도의 스케치는 스케치할 수 있는 모든 기술
 * 같은 세트 안의 기술끼리 함께 배울 수 있는지(이벤트 전용 조합 등)는 보지 않는다.
 *
 * 기술표는 무거워서 따로 불러온다: 먼저 `await preloadData()` (1~8세대는 `preloadData({ gens: [n] })`). 안 불렀으면 오류를 던진다.
 * 모르는 종이면 오류를 던진다.
 */
export function getLearnset(species: string, opts: { gen?: Generation } = {}): string[] {
    const gen = opts.gen ?? 9
    if (!learnsetsLoaded()) throw new Error('getLearnset: 기술표가 필요합니다 — 먼저 await preloadData() 를 호출하세요')
    const dex = dexFor(gen, 'getLearnset')
    const sp = dex.species.get(speciesToShowdown(species))
    if (!sp.exists) throw new Error(`getLearnset: 알 수 없는 포켓몬: ${species}`)
    const key = `${gen}:${sp.id}`
    const hit = learnsetCache.get(key)
    if (hit) return [...hit]
    const out: string[] = []
    for (const id of dex.species.getMovePool(sp.id)) {
        const m = dex.moves.get(id)
        if (!m.exists || m.isNonstandard || m.isZ || m.isMax) continue
        out.push(moveSlug(m.id))
    }
    out.sort()
    learnsetCache.set(key, out)
    return [...out]
}

export interface ItemData {
    /** PokeAPI 슬러그 (아이콘: sprites/items/{name}.png) */
    name:      string
    showdown:  string
    /** Showdown 도구 번호 */
    num:       number
    /** 효과 한 줄 설명 (영어, Showdown) */
    effect:    string
    nameKo:    string | null
    /** 나무열매 */
    berry:     boolean
    /** 메가스톤 → 메가진화하는 폼 슬러그 */
    megaStone?: string
    /** Z크리스탈 */
    zCrystal?: boolean
    /** 타입 Z크리스탈: 이 타입의 기술을 Z기술로 (전용 Z크리스탈은 없음) */
    zMoveType?: string
    /** 이 도구를 써야 하는 종 (메가스톤·전용 Z크리스탈·원시회귀 구슬 등, PokeAPI 슬러그) */
    itemUser?: string[]
    /** 던지기(fling) 위력 */
    flingPower?: number
}

const itemCache = new Map<string, ItemData | undefined>()

function toItemData(it: ReturnType<typeof Dex.items.get>): ItemData {
    const slug = itemSlug(it.id)
    const mega = it.megaStone && Object.values(it.megaStone)[0]
    return {
        name: slug, showdown: it.name, num: it.num, effect: it.shortDesc || it.desc, nameKo: koName.item(slug),
        berry: !!it.isBerry,
        ...(mega ? { megaStone: speciesSlug(mega) } : {}),
        ...(it.zMove ? { zCrystal: true } : {}),
        ...(it.zMove && it.zMoveType ? { zMoveType: it.zMoveType.toLowerCase() } : {}),
        ...(it.itemUser?.length ? { itemUser: it.itemUser.map(u => speciesSlug(toID(u))) } : {}),
        ...(it.fling?.basePower ? { flingPower: it.fling.basePower } : {}),
    }
}

/** 도구 하나 (PokeAPI 슬러그 / Showdown 이름 / ID). 없으면 undefined */
export function getItem(name: string): ItemData | undefined {
    if (itemCache.has(name)) return itemCache.get(name)
    const it = Dex.items.get(itemToShowdown(name))
    const out = it.exists ? toItemData(it) : undefined
    itemCache.set(name, out)
    return out
}

const itemListCache = new Map<number, ItemData[]>()

/**
 * 배틀에서 지니게 할 수 있는 도구 (그 세대에 있는 것: isNonstandard 제외, 몬스터볼 제외). 이름(영어)순.
 * 9세대는 바로 쓸 수 있고, 1~8세대는 `preloadData({ gens: [n] })` 가 필요하다 (메가스톤·Z크리스탈 등).
 */
export function listItems(opts: { gen?: Generation } = {}): ItemData[] {
    const gen = opts.gen ?? 9
    const hit = itemListCache.get(gen)
    if (hit) return [...hit]
    const dex = dexFor(gen, 'listItems')
    const out = dex.items.all()
        .filter(it => it.exists && !it.isNonstandard && !it.isPokeball && it.num > 0)
        .map(toItemData)
        .sort((a, b) => a.showdown.localeCompare(b.showdown))
    itemListCache.set(gen, out)
    return [...out]
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
