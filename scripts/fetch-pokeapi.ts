// ─── PokeAPI → src/data/pokeapi.json ──────────────────────────
// 도감용 PokeAPI 데이터(슬러그/한국어 이름)를 받아 Showdown ID 와 연결한다.
// 사용: npx tsx scripts/fetch-pokeapi.ts   (캐시: .cache/pokeapi)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Dex } from '@pkmn/sim'
import { speciesToShowdown, moveToShowdown, abilityToShowdown, itemToShowdown } from '../src/showdown/ids'

const ROOT = join(import.meta.dirname, '..')
const CACHE = join(ROOT, '.cache/pokeapi')
const API = 'https://pokeapi.co/api/v2'
mkdirSync(CACHE, { recursive: true })

async function get<T>(path: string): Promise<T> {
    const file = join(CACHE, path.replace(/[/?=&]/g, '_') + '.json')
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const res = await fetch(`${API}/${path}`, { headers: { 'User-Agent': 'pokebattle-engine-data-script' } })
            if (res.status === 404) return null as T
            if (!res.ok) throw new Error(`${res.status}`)
            const json = await res.json()
            writeFileSync(file, JSON.stringify(json))
            return json as T
        } catch (err) {
            if (attempt === 4) throw new Error(`${path}: ${(err as Error).message}`)
            await new Promise(r => setTimeout(r, 500 * 2 ** attempt))
        }
    }
    throw new Error('unreachable')
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length)
    let i = 0
    let done = 0
    await Promise.all(Array.from({ length: n }, async () => {
        while (i < items.length) {
            const idx = i++
            out[idx] = await fn(items[idx]!)
            if (++done % 200 === 0) console.log(`  ${done}/${items.length}`)
        }
    }))
    return out
}

type Named = { name: string; url: string }
type Names = { names: { name: string; language: { name: string } }[] }
const ko = (r: Names | null) => r?.names.find(n => n.language.name === 'ko')?.name ?? null

async function list(kind: string): Promise<string[]> {
    const r = await get<{ results: Named[] }>(`${kind}?limit=5000`)
    return r.results.map(x => x.name)
}

async function main(): Promise<void> {
    console.log('pokemon list…')
    const pokemon = await list('pokemon')
    console.log('pokemon details (species link, types)…')
    const details = await pool(pokemon, 12, async name => {
        const d = await get<{ id: number; name: string; species: Named; types: { type: Named }[]; is_default: boolean }>(`pokemon/${name}`)
        return d
    })
    const speciesNames = [...new Set(details.map(d => d.species.name))]
    console.log(`species ko (${speciesNames.length})…`)
    const speciesKo = new Map<string, { ko: string | null; num: number }>()
    await pool(speciesNames, 12, async s => {
        const r = await get<Names & { id: number }>(`pokemon-species/${s}`)
        speciesKo.set(s, { ko: ko(r), num: r?.id ?? 0 })
    })

    const species = details.map(d => {
        const sp = speciesKo.get(d.species.name)!
        const ps = speciesToShowdown(d.name)
        return {
            slug: d.name, id: d.id, num: sp.num, species: d.species.name, ko: sp.ko, default: d.is_default,
            types: d.types.map(t => t.type.name), ps: Dex.species.get(ps).exists ? ps : null,
        }
    })

    console.log('moves…')
    const moveNames = await list('move')
    const moves: Record<string, { ko: string | null; ps: string | null }> = {}
    await pool(moveNames, 12, async m => {
        const r = await get<Names>(`move/${m}`)
        const ps = moveToShowdown(m)
        moves[m] = { ko: ko(r), ps: Dex.moves.get(ps).exists ? ps : null }
    })

    console.log('abilities…')
    const abilityNames = await list('ability')
    const abilities: Record<string, { ko: string | null; ps: string | null }> = {}
    await pool(abilityNames, 12, async a => {
        const ps = abilityToShowdown(a)
        if (!Dex.abilities.get(ps).exists) return
        const r = await get<Names>(`ability/${a}`)
        abilities[a] = { ko: ko(r), ps }
    })

    console.log('items (Showdown 에 있는 것만)…')
    const itemNames = await list('item')
    const items: Record<string, { ko: string | null; ps: string }> = {}
    await pool(itemNames, 12, async it => {
        const ps = itemToShowdown(it)
        const dexItem = Dex.items.get(ps)
        if (!dexItem.exists || (dexItem.isNonstandard && dexItem.isNonstandard !== 'Past')) return
        const r = await get<Names>(`item/${it}`)
        items[it] = { ko: ko(r), ps }
    })

    console.log('types / natures…')
    const types: Record<string, string | null> = {}
    for (const t of await list('type')) types[t] = ko(await get<Names>(`type/${t}`))
    const natures: Record<string, string | null> = {}
    for (const n of await list('nature')) natures[n] = ko(await get<Names>(`nature/${n}`))

    const out = { source: 'https://pokeapi.co', fetchedAt: new Date().toISOString().slice(0, 10), species, moves, abilities, items, types, natures }
    writeFileSync(join(ROOT, 'src/data/pokeapi.json'), JSON.stringify(out))
    const missing = species.filter(s => !s.ps).map(s => s.slug)
    console.log(`done: species ${species.length} (unmapped ${missing.length}), moves ${moveNames.length}, abilities ${Object.keys(abilities).length}, items ${Object.keys(items).length}`)
    console.log('unmapped species:', missing.join(' '))
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
