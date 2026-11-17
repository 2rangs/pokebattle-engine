import type { PokemonSet, EVs, IVs, Nature, Stats } from '../types/pokemon'
import { toId } from './id'

const STAT_FROM_SHOWDOWN: Record<string, keyof Stats> = {
    HP: 'hp', Atk: 'attack', Def: 'defense', SpA: 'special_attack', SpD: 'special_defense', Spe: 'speed',
}
const STAT_TO_SHOWDOWN: Record<keyof Stats, string> = {
    hp: 'HP', attack: 'Atk', defense: 'Def', special_attack: 'SpA', special_defense: 'SpD', speed: 'Spe',
}

function parseSpread(value: string): Partial<Stats> {
    const out: Partial<Stats> = {}
    for (const entry of value.split('/')) {
        const [num, stat] = entry.trim().split(/\s+/)
        const key = STAT_FROM_SHOWDOWN[stat ?? '']
        if (key && num !== undefined && !Number.isNaN(parseInt(num))) out[key] = parseInt(num)
    }
    return out
}

// ─── Showdown 포맷 파서 ───────────────────────────────────────
export function parseShowdown(text: string, defaultLevel = 50): PokemonSet {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) throw new Error('빈 세트입니다')

    const moves: string[] = []
    let nickname: string | undefined
    let ability = ''
    let nature: Nature = 'hardy'
    let teraType: string | undefined
    let shiny = false
    let level = defaultLevel
    let evs: EVs = {}
    let ivs: IVs = {}

    const firstLine = lines[0]!
    const [left, itemPart] = firstLine.split(' @ ')
    const item = itemPart?.trim() ? toId(itemPart.trim()) : undefined

    let rest = left!.trim()
    let gender: 'M' | 'F' | null = null
    const genderMatch = rest.match(/\s*\(([MF])\)\s*$/)
    if (genderMatch) {
        gender = genderMatch[1] as 'M' | 'F'
        rest = rest.slice(0, genderMatch.index).trim()
    }
    let species: string
    const nicknameMatch = rest.match(/^(.+?)\s+\((.+)\)$/)
    if (nicknameMatch) {
        nickname = nicknameMatch[1]!.trim()
        species = toId(nicknameMatch[2]!)
    } else {
        species = toId(rest)
    }

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!
        if (line.startsWith('- ') || line.startsWith('~ ')) {
            // "Hidden Power [Fire]" 같은 표기 대응
            moves.push(toId(line.slice(2).replace(/\[.*\]/, '')))
            continue
        }
        if (/^\w+ Nature$/.test(line)) {
            nature = toId(line.replace(/ Nature$/, '')) as Nature
            continue
        }
        const idx = line.indexOf(':')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        const value = line.slice(idx + 1).trim()
        switch (key) {
            case 'Ability':   ability = toId(value); break
            case 'Shiny':     shiny = value.toLowerCase() === 'yes'; break
            case 'Tera Type': teraType = toId(value); break
            case 'Level':     level = parseInt(value) || defaultLevel; break
            case 'EVs':       evs = parseSpread(value); break
            case 'IVs':       ivs = parseSpread(value); break
        }
    }

    return {
        species, nickname, level, gender, ability, nature, item, teraType, shiny,
        moves: moves.slice(0, 4) as PokemonSet['moves'],
        evs, ivs,
    }
}

export function parseShowdownTeam(text: string, defaultLevel = 50): PokemonSet[] {
    return text
        .replace(/\r\n/g, '\n')
        .split(/\n\s*\n+/)
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('==='))
        .map(s => parseShowdown(s, defaultLevel))
}

// ─── Showdown 포맷 내보내기 ──────────────────────────────────
const title = (slug: string) => slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

export function exportShowdown(set: PokemonSet): string {
    const name = set.nickname && set.nickname !== set.species ? `${set.nickname} (${title(set.species)})` : title(set.species)
    const lines = [`${name}${set.gender ? ` (${set.gender})` : ''}${set.item ? ` @ ${title(set.item)}` : ''}`]
    if (set.ability) lines.push(`Ability: ${title(set.ability)}`)
    if (set.level && set.level !== 100) lines.push(`Level: ${set.level}`)
    if (set.shiny) lines.push('Shiny: Yes')
    if (set.teraType) lines.push(`Tera Type: ${title(set.teraType)}`)
    const spread = (s: Partial<Stats> | undefined, skip: number) => Object.entries(s ?? {})
        .filter(([, v]) => v !== undefined && v !== skip)
        .map(([k, v]) => `${v} ${STAT_TO_SHOWDOWN[k as keyof Stats]}`).join(' / ')
    const ev = spread(set.evs, 0)
    if (ev) lines.push(`EVs: ${ev}`)
    lines.push(`${title(set.nature)} Nature`)
    const iv = spread(set.ivs, 31)
    if (iv) lines.push(`IVs: ${iv}`)
    for (const m of set.moves) if (m) lines.push(`- ${title(m)}`)
    return lines.join('\n')
}

export function exportShowdownTeam(team: PokemonSet[]): string {
    return team.map(exportShowdown).join('\n\n')
}

// ─── JSON 팀 로더 ─────────────────────────────────────────────
interface RawPokemon {
    name:      string
    item?:     string
    ability:   string
    shiny?:    boolean
    teraType?: string
    level?:    number
    evs?:      Record<string, number | undefined>
    ivs?:      Record<string, number | undefined>
    nature:    string
    moves:     string[]
}

export interface RawTeam {
    pokemons: RawPokemon[]
}

const EV_IV_KEY_MAP: Record<string, keyof EVs> = {
    hp: 'hp', atk: 'attack', def: 'defense', spa: 'special_attack', spd: 'special_defense', spe: 'speed',
    attack: 'attack', defense: 'defense', special_attack: 'special_attack', special_defense: 'special_defense', speed: 'speed',
}

function mapRawStats(raw?: Record<string, number | undefined>): EVs {
    if (!raw) return {}
    return Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v !== undefined).map(([k, v]) => [EV_IV_KEY_MAP[k.toLowerCase()] ?? k, v])
    ) as EVs
}

export function loadTeam(raw: RawTeam): PokemonSet[] {
    return raw.pokemons.map(p => ({
        species:  toId(p.name),
        nickname: p.name,
        level:    p.level ?? 50,
        gender:   null,
        ability:  toId(p.ability),
        nature:   toId(p.nature) as Nature,
        item:     p.item ? toId(p.item) : undefined,
        teraType: p.teraType ? toId(p.teraType) : undefined,
        shiny:    p.shiny ?? false,
        evs:      mapRawStats(p.evs),
        ivs:      mapRawStats(p.ivs) as IVs,
        moves:    p.moves.slice(0, 4).map(toId) as PokemonSet['moves'],
    }))
}

export function loadTeamFromJSON(json: string): PokemonSet[] {
    return loadTeam(JSON.parse(json))
}
