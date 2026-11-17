// 원본 JSON(src/data/*.json) → 엔진이 쓰는 필드만 남긴 압축본(src/data/compact/*.json)
// 사용: npx tsx scripts/compact-data.ts   (fetch-data 후 실행)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '../src/data')
const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'))
const write = (f: string, data: unknown) => {
    mkdirSync(join(dir, 'compact'), { recursive: true })
    const text = JSON.stringify(data)
    writeFileSync(join(dir, 'compact', f), text)
    console.log(`compact/${f}: ${(text.length / 1024).toFixed(0)} KB`)
}

const SPECIES_KEYS = ['id', 'name', 'species_name', 'types', 'base_stats', 'abilities', 'gender_rate', 'is_legendary', 'is_mythical', 'is_default', 'weight', 'height']
write('pokemon.json', read('pokemon.json').map((p: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const k of SPECIES_KEYS) if (k in p) out[k] = p[k]
    out.abilities = (p.abilities as { name: string; hidden: boolean; slot: number }[]).map(a => ({ name: a.name, hidden: a.hidden, slot: a.slot }))
    return out
}))
write('moves.json', read('moves.json'))
write('types.json', read('types.json').map((t: { id: number; name: string; damage_relations: unknown }) => ({ id: t.id, name: t.name, damage_relations: t.damage_relations })))
