// ─── 엔티티 이름 (포켓몬·기술·특성·도구·타입·성격) — 언어별 ────────
// ko  : src/data/pokeapi.json (항상 로드)
// en  : Showdown 데이터 이름 (데이터 추가 없음)
// 그 외: 이름 팩 src/data/names/<코드>.json — loadNames(code) 로 필요할 때만 불러온다
//        (scripts/fetch-pokeapi.ts 가 PokeAPI 에서 생성: ja, zh-hans, zh-hant, fr, de, es, it)
import { Dex } from '@pkmn/sim'
import { koName, getPokeApiSpecies, moveSlug, abilitySlug, itemSlug } from '../data/dex'
import { speciesToShowdown, moveToShowdown, abilityToShowdown, itemToShowdown } from '../showdown/ids'

export type EntityKind = 'species' | 'move' | 'ability' | 'item' | 'type' | 'nature'

/** 한 언어의 이름 조회. 데이터가 없으면 null */
export type NameLookup = Record<EntityKind, (slug: string) => string | null>

/** 이름 팩 (PokeAPI 슬러그 → 이름). species 는 종 슬러그(폼 아님) 기준 */
export interface NamePack {
    species: Record<string, string>
    moves: Record<string, string>
    abilities: Record<string, string>
    items: Record<string, string>
    types: Record<string, string>
    natures: Record<string, string>
}

const ko: NameLookup = {
    species: s => koName.species(s),
    move: s => koName.move(s),
    ability: s => koName.ability(s),
    item: s => koName.item(s),
    type: s => koName.type(s),
    nature: s => koName.nature(s),
}

const exists = <T extends { exists: boolean; name: string }>(x: T) => (x.exists ? x.name : null)
const en: NameLookup = {
    species: s => exists(Dex.species.get(speciesToShowdown(s))),
    move: s => exists(Dex.moves.get(moveToShowdown(s))),
    ability: s => exists(Dex.abilities.get(abilityToShowdown(s))),
    item: s => exists(Dex.items.get(itemToShowdown(s))),
    type: s => (s === 'stellar' ? 'Stellar' : exists(Dex.types.get(s))),
    nature: s => exists(Dex.natures.get(s)),
}

function fromPack(pack: NamePack): NameLookup {
    return {
        species: s => pack.species[s] ?? pack.species[getPokeApiSpecies(s)?.species ?? ''] ?? null,
        move: s => pack.moves[s] ?? pack.moves[moveSlug(moveToShowdown(s))] ?? null,
        ability: s => pack.abilities[s] ?? pack.abilities[abilitySlug(abilityToShowdown(s))] ?? null,
        item: s => pack.items[s] ?? pack.items[itemSlug(itemToShowdown(s))] ?? null,
        type: s => pack.types[s] ?? null,
        nature: s => pack.natures[s.toLowerCase()] ?? null,
    }
}

const lookups = new Map<string, NameLookup>([['ko', ko], ['en', en]])

// 정적 경로여야 번들러가 언어별 청크로 나눈다
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
    ja: () => import('../data/names/ja.json'),
    'zh-hans': () => import('../data/names/zh-hans.json'),
    'zh-hant': () => import('../data/names/zh-hant.json'),
    fr: () => import('../data/names/fr.json'),
    de: () => import('../data/names/de.json'),
    es: () => import('../data/names/es.json'),
    it: () => import('../data/names/it.json'),
}

/** 내장 이름 팩 코드 */
export const NAME_PACKS = ['ko', 'en', ...Object.keys(LOADERS)] as const

/** 이름 팩을 직접 등록 (내장에 없는 언어, 또는 내장 팩 덮어쓰기) */
export function registerNames(code: string, names: NamePack | NameLookup): void {
    lookups.set(code, 'moves' in names ? fromPack(names as NamePack) : (names as NameLookup))
}

/** 내장 이름 팩을 불러온다 (ko·en 은 즉시 사용 가능) */
export async function loadNames(code: string): Promise<void> {
    if (lookups.has(code)) return
    const loader = LOADERS[code]
    if (!loader) throw new Error(`이름 팩이 없습니다: ${code} (내장: ${NAME_PACKS.join(', ')})`)
    const mod = await loader()
    registerNames(code, mod.default as NamePack)
}

/** 불러온 이름 조회 (없으면 undefined) */
export function getNames(code: string): NameLookup | undefined {
    return lookups.get(code)
}

/** 조건(장판·필드·휘발성 등) → 같은 이름의 기술/특성. 이름을 따로 번역하지 않고 데이터에서 가져온다 */
export const CONDITION_ENTITY: Record<string, { move?: string; ability?: string }> = {
    // 장판
    reflect: { move: 'reflect' }, light_screen: { move: 'light-screen' }, aurora_veil: { move: 'aurora-veil' },
    spikes: { move: 'spikes' }, toxic_spikes: { move: 'toxic-spikes' }, stealth_rock: { move: 'stealth-rock' },
    sticky_web: { move: 'sticky-web' }, tailwind: { move: 'tailwind' }, lucky_chant: { move: 'lucky-chant' },
    safeguard: { move: 'safeguard' }, mist: { move: 'mist' }, wish: { move: 'wish' },
    // 필드
    trick_room: { move: 'trick-room' }, gravity: { move: 'gravity' }, magic_room: { move: 'magic-room' },
    wonder_room: { move: 'wonder-room' }, mud_sport: { move: 'mud-sport' }, water_sport: { move: 'water-sport' },
    // 필드(지형)
    electric: { move: 'electric-terrain' }, grassy: { move: 'grassy-terrain' }, misty: { move: 'misty-terrain' },
    psychic: { move: 'psychic-terrain' },
    electric_terrain: { move: 'electric-terrain' }, grassy_terrain: { move: 'grassy-terrain' },
    misty_terrain: { move: 'misty-terrain' }, psychic_terrain: { move: 'psychic-terrain' },
    // 휘발성
    seeded: { move: 'leech-seed' }, bound: { move: 'bind' }, infatuation: { move: 'attract' }, curse: { move: 'curse' },
    nightmare: { move: 'nightmare' }, aqua_ring: { move: 'aqua-ring' }, ingrain: { move: 'ingrain' },
    magnet_rise: { move: 'magnet-rise' }, taunt: { move: 'taunt' }, encore: { move: 'encore' }, torment: { move: 'torment' },
    disable: { move: 'disable' }, heal_block: { move: 'heal-block' }, embargo: { move: 'embargo' }, yawn: { move: 'yawn' },
    protect: { move: 'protect' }, kings_shield: { move: 'kings-shield' }, spiky_shield: { move: 'spiky-shield' },
    baneful_bunker: { move: 'baneful-bunker' }, silk_trap: { move: 'silk-trap' }, burning_bulwark: { move: 'burning-bulwark' },
    obstruct: { move: 'obstruct' }, endure: { move: 'endure' }, focus_energy: { move: 'focus-energy' },
    substitute: { move: 'substitute' }, salt_cure: { move: 'salt-cure' }, destiny_bond: { move: 'destiny-bond' },
    stockpile: { move: 'stockpile' }, charge: { move: 'charge' }, minimize: { move: 'minimize' },
    defense_curl: { move: 'defense-curl' }, telekinesis: { move: 'telekinesis' }, roost: { move: 'roost' },
    perish_song: { move: 'perish-song' }, future_sight: { move: 'future-sight' }, doom_desire: { move: 'doom-desire' },
    slow_start: { ability: 'slow-start' }, unburden: { ability: 'unburden' }, flash_fire: { ability: 'flash-fire' },
}
