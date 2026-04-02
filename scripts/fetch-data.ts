import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = 'https://pokeapi.co/api/v2'
const OUT = path.resolve(__dirname, '../src/data')
const CONCURRENCY = 20

// --- 유틸 ---
async function fetchJSON(url: string): Promise<any> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    return res.json()
}

async function fetchList(endpoint: string): Promise<string[]> {
    const first = await fetchJSON(`${BASE}/${endpoint}?limit=1`)
    const all = await fetchJSON(`${BASE}/${endpoint}?limit=${first.count}`)
    return all.results.map((r: any) => r.url)
}

async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
    const results: T[] = new Array(tasks.length)
    let index = 0

    const workers = Array.from({ length: concurrency }, async () => {
        while (true) {
            const i = index++
            if (i >= tasks.length) break
            if (i % 100 === 0) console.log(`  ${i} / ${tasks.length}`)
            results[i] = await tasks[i]!()
        }
    })

    await Promise.all(workers)
    return results
}

// --- 파서 ---
function parsePokemon(pokemon: any, species: any) {
    return {
        id: pokemon.id,
        name: pokemon.name,
        species_name: species.name, // 베이스 종족명 (예: pikachu-gmax → pikachu)

        // 타입
        types: pokemon.types
            .sort((a: any, b: any) => a.slot - b.slot)
            .map((t: any) => t.type.name) as string[],

        // 베이스 스탯
        base_stats: {
            hp: 0,
            attack: 0,
            defense: 0,
            special_attack: 0,
            special_defense: 0,
            speed: 0,
            ...Object.fromEntries(
                pokemon.stats.map((s: any) => [
                    s.stat.name
                        .replace('special-attack', 'special_attack')
                        .replace('special-defense', 'special_defense'),
                    s.base_stat,
                ])
            ),
        },

        // 특성
        abilities: pokemon.abilities.map((a: any) => ({
            name: a.ability.name,
            hidden: a.is_hidden,
            slot: a.slot,
        })),

        // 종족 정보 (pokemon-species에서)
        gender_rate: species.gender_rate,         // -1: 성별없음, 0~8: 암컷 비율
        capture_rate: species.capture_rate,
        base_happiness: species.base_happiness,
        is_legendary: species.is_legendary,
        is_mythical: species.is_mythical,
        is_baby: species.is_baby,
        growth_rate: species.growth_rate?.name,
        egg_groups: species.egg_groups.map((e: any) => e.name),
        hatch_counter: species.hatch_counter,

        // 포켓몬 기본 정보
        base_experience: pokemon.base_experience,
        weight: pokemon.weight,   // 100g 단위
        height: pokemon.height,   // 10cm 단위

        // 폼 관련
        is_default: pokemon.is_default,
        forms: pokemon.forms.map((f: any) => f.name),

        // EV yield
        ev_yield: Object.fromEntries(
            pokemon.stats
                .filter((s: any) => s.effort > 0)
                .map((s: any) => [
                    s.stat.name
                        .replace('special-attack', 'special_attack')
                        .replace('special-defense', 'special_defense'),
                    s.effort,
                ])
        ),
    }
}

function parseMove(raw: any) {
    return {
        id: raw.id,
        name: raw.name,
        type: raw.type.name,
        category: raw.damage_class?.name ?? 'status',
        power: raw.power,
        accuracy: raw.accuracy,
        pp: raw.pp,
        priority: raw.priority,
        target: raw.target?.name,
        effect_chance: raw.effect_chance,
        effect: raw.effect_entries.find((e: any) => e.language.name === 'en')?.short_effect ?? '',
        meta: raw.meta
            ? {
                ailment: raw.meta.ailment?.name,
                ailment_chance: raw.meta.ailment_chance,
                drain: raw.meta.drain,
                healing: raw.meta.healing,
                crit_rate: raw.meta.crit_rate,
                flinch_chance: raw.meta.flinch_chance,
                stat_chance: raw.meta.stat_chance,
                min_hits: raw.meta.min_hits,
                max_hits: raw.meta.max_hits,
                category: raw.meta.category?.name,
            }
            : null,
        stat_changes: raw.stat_changes.map((sc: any) => ({
            stat: sc.stat.name,
            change: sc.change,
        })),
    }
}

function parseAbility(raw: any) {
    return {
        id: raw.id,
        name: raw.name,
        is_main_series: raw.is_main_series,
        effect: raw.effect_entries.find((e: any) => e.language.name === 'en')?.short_effect ?? '',
        effect_long: raw.effect_entries.find((e: any) => e.language.name === 'en')?.effect ?? '',
    }
}

function parseType(raw: any) {
    return {
        id: raw.id,
        name: raw.name,
        damage_relations: {
            double_damage_to:   raw.damage_relations.double_damage_to.map((t: any) => t.name),
            half_damage_to:     raw.damage_relations.half_damage_to.map((t: any) => t.name),
            no_damage_to:       raw.damage_relations.no_damage_to.map((t: any) => t.name),
            double_damage_from: raw.damage_relations.double_damage_from.map((t: any) => t.name),
            half_damage_from:   raw.damage_relations.half_damage_from.map((t: any) => t.name),
            no_damage_from:     raw.damage_relations.no_damage_from.map((t: any) => t.name),
        },
    }
}

function parseItem(raw: any) {
    return {
        id: raw.id,
        name: raw.name,
        category: raw.category?.name,
        fling_power: raw.fling_power,
        fling_effect: raw.fling_effect?.name ?? null,
        effect: raw.effect_entries.find((e: any) => e.language.name === 'en')?.short_effect ?? '',
    }
}

// --- pokemon + species 조인 ---
async function fetchPokemon() {
    console.log('\n[Pokemon] 목록 조회 중...')
    const urls = await fetchList('pokemon')
    console.log(`[Pokemon] 총 ${urls.length}개 fetch 시작`)

    const tasks = urls.map(url => async () => {
        const pokemon = await fetchJSON(url)
        const species = await fetchJSON(pokemon.species.url)
        return parsePokemon(pokemon, species)
    })

    const results = await pool(tasks, CONCURRENCY)
    const out = path.join(OUT, 'pokemon.json')
    await fs.writeFile(out, JSON.stringify(results, null, 2))
    console.log(`[Pokemon] 완료 → ${out}`)
}

async function fetchAll(
    label: string,
    endpoint: string,
    parser: (raw: any) => any,
    outFile: string
) {
    console.log(`\n[${label}] 목록 조회 중...`)
    const urls = await fetchList(endpoint)
    console.log(`[${label}] 총 ${urls.length}개 fetch 시작`)

    const tasks = urls.map(url => () => fetchJSON(url).then(parser))
    const results = await pool(tasks, CONCURRENCY)

    const out = path.join(OUT, outFile)
    await fs.writeFile(out, JSON.stringify(results, null, 2))
    console.log(`[${label}] 완료 → ${out}`)
}

// --- 메인 ---
async function main() {
    await fs.mkdir(OUT, { recursive: true })

    await fetchPokemon()  // pokemon + species 조인
    await fetchAll('Moves',     'move',    parseMove,    'moves.json')
    await fetchAll('Abilities', 'ability', parseAbility, 'abilities.json')
    await fetchAll('Types',     'type',    parseType,    'types.json')
    await fetchAll('Items',     'item',    parseItem,    'items.json')

    console.log('\n✅ 전체 완료!')
}

main().catch(console.error)