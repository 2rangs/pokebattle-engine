import { Teams } from '@pkmn/sim'
import type { PokemonSet, EVs, IVs, Nature } from '../types/pokemon'
import { toId } from './id'
import { fromShowdownSet, toShowdownSet } from '../showdown/sets'

// ─── Showdown 포맷 파서 (Showdown Teams.import 사용) ───────────
export function parseShowdown(text: string, defaultLevel = 50): PokemonSet {
    const team = parseShowdownTeam(text, defaultLevel)
    if (team.length === 0) throw new Error('빈 세트입니다')
    return team[0]!
}

export function parseShowdownTeam(text: string, defaultLevel = 50): PokemonSet[] {
    const normalized = text.replace(/\r\n/g, '\n')
    const sets = Teams.import(normalized) ?? []
    return sets.map(ps => {
        const set = fromShowdownSet(ps)
        // "Level:" 줄이 없으면 Showdown 기본값(100) 대신 defaultLevel
        const block = normalized.split(/\n\s*\n/).find(b => b.includes(ps.species) || (ps.name && b.includes(ps.name)))
        if (block && !/^\s*Level:/m.test(block)) set.level = defaultLevel
        return set
    })
}

// ─── Showdown 포맷 내보내기 ──────────────────────────────────
export function exportShowdown(set: PokemonSet): string {
    return Teams.export([toShowdownSet(set, false)]).trim()
}

export function exportShowdownTeam(team: PokemonSet[]): string {
    return Teams.export(team.map(s => toShowdownSet(s, false))).trim()
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
