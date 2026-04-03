import type { PokemonSet, EVs, IVs, Nature } from '../types/pokemon'

// ─── Showdown 포맷 파서 ───────────────────────────────────────
export function parseShowdown(text: string): PokemonSet {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)

    const moves: string[] = []
    let species = ''
    let nickname: string | undefined
    let item: string | undefined
    let ability = ''
    let nature: Nature = 'hardy'
    let teraType: string | undefined
    let shiny = false
    let gender: 'M' | 'F' | null = null
    const evs: EVs = {}
    const ivs: IVs = {}

    const firstLine = lines[0]!
    const atSplit = firstLine.split(' @ ')
    item = atSplit[1]?.trim()

    const left = atSplit[0]!.trim()
    const genderMatch = left.match(/\(([MF])\)\s*$/)
    if (genderMatch) {
        gender = genderMatch[1] as 'M' | 'F'
    }

    const speciesMatch = left.replace(/\s*\([MF]\)\s*$/, '').trim()
    const nicknameMatch = speciesMatch.match(/^(.+?)\s+\((.+)\)$/)
    if (nicknameMatch) {
        nickname = nicknameMatch[1]!.trim()
        species = nicknameMatch[2]!.trim().toLowerCase().replace(' ', '-')
    } else {
        species = speciesMatch.toLowerCase().replace(' ', '-')
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!

        if (line.startsWith('- ')) {
            moves.push(line.slice(2).trim().toLowerCase().replace(' ', '-'))
            continue
        }

        const [key, ...rest] = line.split(':')
        const value = rest.join(':').trim()

        if (key === 'Ability')   ability = value.toLowerCase().replace(' ', '-')
        if (key === 'Shiny')     shiny = value === 'Yes'
        if (key === 'Tera Type') teraType = value.toLowerCase()
        if (line.endsWith('Nature')) {
            nature = line.replace(' Nature', '').trim().toLowerCase() as Nature
        }
        if (key === 'EVs') {
            value.split('/').map(s => s.trim()).forEach(entry => {
                const [num, stat] = entry.split(' ')
                const mapped = mapStat(stat!)
                if (mapped) (evs as any)[mapped] = parseInt(num!)
            })
        }
        if (key === 'IVs') {
            value.split('/').map(s => s.trim()).forEach(entry => {
                const [num, stat] = entry.split(' ')
                const mapped = mapStat(stat!)
                if (mapped) (ivs as any)[mapped] = parseInt(num!)
            })
        }
    }

    return {
        species,
        nickname,
        level: 50,
        gender,
        ability,
        nature,
        item,
        teraType,
        shiny,
        moves: moves as PokemonSet['moves'],
        evs,
        ivs,
    }
}

export function parseShowdownTeam(text: string): PokemonSet[] {
    return text
        .split(/\n\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(parseShowdown)
}

function mapStat(raw: string): keyof EVs | null {
    const map: Record<string, keyof EVs> = {
        'HP':  'hp',
        'Atk': 'attack',
        'Def': 'defense',
        'SpA': 'special_attack',
        'SpD': 'special_defense',
        'Spe': 'speed',
    }
    return map[raw] ?? null
}

// ─── JSON 팀 로더 ─────────────────────────────────────────────
interface RawPokemon {
    name:      string
    item?:     string
    ability:   string
    shiny?:    boolean
    teraType?: string
    evs?:      Record<string, number>
    ivs?:      Record<string, number>
    nature:    string
    moves:     string[]
}

interface RawTeam {
    pokemons: RawPokemon[]
}

function toSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const EV_IV_KEY_MAP: Record<string, keyof EVs> = {
    hp:  'hp',
    atk: 'attack',
    def: 'defense',
    spa: 'special_attack',
    spd: 'special_defense',
    spe: 'speed',
}

function mapRawStats(raw?: Record<string, number>): EVs {
    if (!raw) return {}
    return Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [EV_IV_KEY_MAP[k.toLowerCase()] ?? k, v])
    ) as EVs
}

export function loadTeam(raw: RawTeam): PokemonSet[] {
    return raw.pokemons.map(p => ({
        species:  toSlug(p.name),
        nickname: p.name,
        level:    50,
        gender:   null,
        ability:  toSlug(p.ability),
        nature:   p.nature.toLowerCase() as Nature,
        item:     p.item ? toSlug(p.item) : undefined,
        teraType: p.teraType?.toLowerCase(),
        shiny:    p.shiny ?? false,
        evs:      mapRawStats(p.evs),
        ivs:      mapRawStats(p.ivs) as IVs,
        moves:    p.moves.slice(0, 4).map(toSlug) as PokemonSet['moves'],
    }))
}

export function loadTeamFromJSON(json: string): PokemonSet[] {
    return loadTeam(JSON.parse(json))
}