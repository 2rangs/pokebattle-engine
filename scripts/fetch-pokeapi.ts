// ─── PokeAPI → src/data/pokeapi.json ──────────────────────────
// 도감용 PokeAPI 데이터(슬러그/한국어 이름)를 받아 Showdown ID 와 연결한다.
// 다른 언어 이름은 src/data/names/<언어>.json 으로 따로 쓴다 (필요할 때만 불러오는 이름 팩).
// 폼 이름(워시로토무, 메가리자몽X, 나인테일 (알로라의 모습) …)은 PokeAPI CSV 덤프에서 가져온다 (buildFormNames).
// 사용: npx tsx scripts/fetch-pokeapi.ts           (캐시: .cache/pokeapi)
//       npx tsx scripts/fetch-pokeapi.ts --forms   (폼 이름만 다시 만들어 기존 pokeapi.json·이름 팩에 넣는다)
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

// ─── 이름 팩 (ko 는 pokeapi.json 에, en 은 Showdown 이름을 쓰므로 제외) ──
// 팩 코드 → PokeAPI 언어 코드 (앞에서부터 있는 것)
const NAME_PACKS: Record<string, string[]> = {
    ja: ['ja', 'ja-hrkt'], 'zh-hans': ['zh-hans'], 'zh-hant': ['zh-hant'],
    fr: ['fr'], de: ['de'], es: ['es'], it: ['it'],
}
type Pack = { species: Record<string, string>; moves: Record<string, string>; abilities: Record<string, string>; items: Record<string, string>; types: Record<string, string>; natures: Record<string, string> }
const packs: Record<string, Pack> = Object.fromEntries(Object.keys(NAME_PACKS).map(l => [l, { species: {}, moves: {}, abilities: {}, items: {}, types: {}, natures: {} }]))
function collect(kind: keyof Pack, slug: string, r: Names | null): void {
    if (!r) return
    for (const [pack, langs] of Object.entries(NAME_PACKS)) {
        const name = langs.map(l => r.names.find(n => n.language.name === l)?.name).find(Boolean)
        if (name) packs[pack]![kind][slug] = name
    }
}

async function list(kind: string): Promise<string[]> {
    const r = await get<{ results: Named[] }>(`${kind}?limit=5000`)
    return r.results.map(x => x.name)
}

// ─── 폼 이름 (PokeAPI CSV: pokemon_forms / pokemon_form_names / pokemon_species_names) ──
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv'
async function csv(name: string): Promise<Record<string, string>[]> {
    const file = join(CACHE, `csv_${name}.csv`)
    let text: string
    if (existsSync(file)) text = readFileSync(file, 'utf8')
    else {
        const res = await fetch(`${CSV}/${name}.csv`, { headers: { 'User-Agent': 'pokebattle-engine-data-script' } })
        if (!res.ok) throw new Error(`${name}.csv: ${res.status}`)
        text = await res.text()
        writeFileSync(file, text)
    }
    // 이 덤프에는 따옴표로 감싼 칸이 없다 (있으면 멈춘다)
    if (text.includes('"')) throw new Error(`${name}.csv: quoted fields are not supported`)
    const [head, ...rows] = text.trim().split(/\r?\n/)
    const cols = head!.split(',')
    return rows.map(r => Object.fromEntries(r.split(',').map((v, i) => [cols[i]!, v])))
}
// PokeAPI languages.csv id
const LANG_ID: Record<string, string> = { 'ja-hrkt': '1', ko: '3', 'zh-hant': '4', fr: '5', de: '6', es: '7', it: '8', en: '9', ja: '11', 'zh-hans': '12' }
// 전각 영숫자 → 반각 (メガリザードンＸ → メガリザードンX)
const halfwidth = (s: string) => s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, ' ')

/**
 * PokeAPI 에 한국어 폼 이름이 없는 폼 (form_identifier → 한국어 공식 폼 이름). '!' 로 시작하면 종 이름 없이 그대로 쓴다.
 * 타입 폼(아르세우스·실버디)은 타입 이름으로 만든다.
 */
const KO_FORM_SUPPLEMENT: Record<string, string> = {
    gmax: '거다이맥스의 모습', hisui: '히스이의 모습', paldea: '팔데아의 모습',
    'paldea-combat-breed': '팔데아의 모습 · 컴뱃종', 'paldea-blaze-breed': '팔데아의 모습 · 블레이즈종', 'paldea-aqua-breed': '팔데아의 모습 · 워터종',
    totem: '주인 포켓몬', 'totem-alola': '주인 포켓몬', 'totem-disguised': '주인 포켓몬', 'totem-busted': '주인 포켓몬',
    cosplay: '!옷갈아입기 피카츄', 'rock-star': '!하드록 피카츄', belle: '!마담 피카츄', 'pop-star': '!아이돌 피카츄',
    phd: '!닥터 피카츄', libre: '!마스크드 피카츄', 'spiky-eared': '!삐쭉귀 피츄',
    origin: '오리진폼', therian: '영물폼', 'white-striped': '흰줄무늬의 모습', 'battle-bond': '유대변화', antique: '진작폼',
    female: '암컷의 모습', 'family-of-four': '네 식구', 'blue-plumage': '블루 페더', 'yellow-plumage': '옐로 페더',
    'white-plumage': '화이트 페더', hero: '마이티폼', droopy: '늘어진 모습', stretchy: '뻗은 모습',
    'three-segment': '세마디폼', roaming: '도보폼', terastal: '테라스탈폼', stellar: '스텔라폼',
}

/**
 * 폼 슬러그 → 언어별 폼 이름. 키는 엔진의 PokeAPI pokemon 슬러그(rotom-wash, charizard-mega-x) 와
 * 폼 식별자(vivillon-polar 처럼 pokemon 이 따로 없는 폼). 기본 모습(종의 기본 pokemon·기본 폼)은 넣지 않는다.
 * 이름: pokemon_name 이 있으면 그것 → form_name 이 종 이름을 포함하면(워시로토무) 그대로 → 아니면 "종 (폼)"
 */
async function buildFormNames(langs: Record<string, string[]>, koTypes: Record<string, string | null>): Promise<Record<string, Record<string, string>>> {
    const [forms, formNames, pokemonRows, speciesNames] = await Promise.all([
        csv('pokemon_forms'), csv('pokemon_form_names'), csv('pokemon'), csv('pokemon_species_names'),
    ])
    const pokemon = new Map(pokemonRows.map(p => [p.id!, p]))
    const spName = new Map(speciesNames.map(r => [`${r.pokemon_species_id}:${r.local_language_id}`, r.name!]))
    const fName = new Map(formNames.map(r => [`${r.pokemon_form_id}:${r.local_language_id}`, r]))
    const out: Record<string, Record<string, string>> = Object.fromEntries(Object.keys(langs).map(l => [l, {}]))
    for (const f of forms) {
        const p = pokemon.get(f.pokemon_id!)
        if (!p) continue
        if (p.is_default === '1' && f.is_default === '1') continue
        const keys = new Set([f.identifier!])
        if (f.is_default === '1') keys.add(p.identifier!)
        for (const [pack, codes] of Object.entries(langs)) {
            let name: string | undefined
            for (const code of codes) {
                const id = LANG_ID[code]
                const row = id && fName.get(`${f.id}:${id}`)
                const species = id && spName.get(`${p.species_id}:${id}`)
                if (!row || !species) continue
                const full = halfwidth(row.pokemon_name ?? '').trim()
                const form = halfwidth(row.form_name ?? '').trim()
                name = full || (form && (form.includes(species) ? form : `${species} (${form})`)) || undefined
                if (name) break
            }
            if (!name && pack === 'ko') {
                const species = spName.get(`${p.species_id}:${LANG_ID.ko}`)
                const sup = KO_FORM_SUPPLEMENT[f.form_identifier!] ?? (koTypes[f.form_identifier!] ? `${koTypes[f.form_identifier!]} 타입` : undefined)
                if (species && sup) name = sup.startsWith('!') ? sup.slice(1) : `${species} (${sup})`
            }
            if (name) for (const k of keys) out[pack]![k] = name
        }
    }
    // PokeAPI 에 없는 Showdown 폼 슬러그 → 같은 이름의 폼 (테라스탈한 오거폰은 가면 이름 그대로)
    for (const names of Object.values(out)) {
        for (const [alias, key] of Object.entries(FORM_ALIASES)) if (names[key]) names[alias] = names[key]!
    }
    return out
}
const FORM_ALIASES: Record<string, string> = {
    'ogerpon-wellspring-tera': 'ogerpon-wellspring-mask', 'ogerpon-hearthflame-tera': 'ogerpon-hearthflame-mask',
    'ogerpon-cornerstone-tera': 'ogerpon-cornerstone-mask',
}

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/** 기존 pokeapi.json·이름 팩에 폼 이름만 다시 넣는다 (나머지는 그대로) */
async function writeFormNames(): Promise<void> {
    const apiFile = join(ROOT, 'src/data/pokeapi.json')
    const api = JSON.parse(readFileSync(apiFile, 'utf8'))
    const forms = await buildFormNames({ ko: ['ko'], ...NAME_PACKS }, api.types)
    api.forms = sortKeys(forms.ko!)
    writeFileSync(apiFile, JSON.stringify(api))
    for (const lang of Object.keys(NAME_PACKS)) {
        const file = join(ROOT, `src/data/names/${lang}.json`)
        const pack = JSON.parse(readFileSync(file, 'utf8'))
        pack.forms = sortKeys(forms[lang]!)
        writeFileSync(file, JSON.stringify(pack))
    }
    console.log(`form names: ${Object.entries(forms).map(([l, m]) => `${l} ${Object.keys(m).length}`).join(', ')}`)
}

async function main(): Promise<void> {
    if (process.argv.includes('--forms')) return writeFormNames()
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
        collect('species', s, r)
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
        collect('moves', m, r)
    })

    console.log('abilities…')
    const abilityNames = await list('ability')
    const abilities: Record<string, { ko: string | null; ps: string | null }> = {}
    await pool(abilityNames, 12, async a => {
        const ps = abilityToShowdown(a)
        if (!Dex.abilities.get(ps).exists) return
        const r = await get<Names>(`ability/${a}`)
        abilities[a] = { ko: ko(r), ps }
        collect('abilities', a, r)
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
        collect('items', it, r)
    })

    console.log('types / natures…')
    const types: Record<string, string | null> = {}
    for (const t of await list('type')) { const r = await get<Names>(`type/${t}`); types[t] = ko(r); collect('types', t, r) }
    const natures: Record<string, string | null> = {}
    for (const n of await list('nature')) { const r = await get<Names>(`nature/${n}`); natures[n] = ko(r); collect('natures', n, r) }

    const out = { source: 'https://pokeapi.co', fetchedAt: new Date().toISOString().slice(0, 10), species, moves, abilities, items, types, natures }
    writeFileSync(join(ROOT, 'src/data/pokeapi.json'), JSON.stringify(out))
    mkdirSync(join(ROOT, 'src/data/names'), { recursive: true })
    for (const [lang, pack] of Object.entries(packs)) {
        // 키 정렬 → 다시 받아도 diff 가 안정적
        const sorted = Object.fromEntries(Object.entries(pack).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))]))
        writeFileSync(join(ROOT, `src/data/names/${lang}.json`), JSON.stringify(sorted))
    }
    console.log(`name packs: ${Object.keys(packs).join(', ')}`)
    await writeFormNames()
    const missing = species.filter(s => !s.ps).map(s => s.slug)
    console.log(`done: species ${species.length} (unmapped ${missing.length}), moves ${moveNames.length}, abilities ${Object.keys(abilities).length}, items ${Object.keys(items).length}`)
    console.log('unmapped species:', missing.join(' '))
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
