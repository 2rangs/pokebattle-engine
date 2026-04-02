import type { BattlePokemon } from '../../types/pokemon'
import type { MoveData } from '../../types/move'
import type { StatStages } from '../../types/pokemon'
import { calcAllStats, createInitialStages } from '../../calc/stat'

export function makePokemon(overrides: {
    species:  string
    types:    string[]
    baseStats: {
        hp: number; attack: number; defense: number
        special_attack: number; special_defense: number; speed: number
    }
    set: BattlePokemon['set']
    stages?:           StatStages
    status?:           BattlePokemon['status']
    volatile_statuses?: BattlePokemon['volatile_statuses']
    transformed?:      boolean
    fainted?:          boolean
}): BattlePokemon {
    const { baseStats, set, species, types, ...rest } = overrides
    const stats  = calcAllStats(baseStats, set.level, set.nature, set.evs, set.ivs)
    const max_hp = stats.hp

    return {
        id:                species,
        set,
        species,
        nickname:          set.nickname ?? species,
        level:             set.level,
        gender:            set.gender,
        ability:           set.ability,
        item:              set.item ?? null,
        types:             types as [string, string?],
        hp:                max_hp,
        max_hp,
        stats,
        stages:            createInitialStages(),
        moves:             [{ move: {} as MoveData, pp: 10, max_pp: 10, disabled: false, encore_locked: false }],
        status:            null,
        status_turns:      0,
        volatile_statuses: {},
        substitute_hp:     0,
        last_move_used:    null,
        last_move_target:  null,
        must_recharge:     false,
        trapped:           false,
        transformed:       false,
        fainted:           false,
        ...rest,
    }
}

export function makeMove(overrides: Partial<MoveData> & {
    name:     string
    type:     string
    category: 'physical' | 'special' | 'status'
    power:    number
}): MoveData {
    return {
        id:            0,
        accuracy:      100,
        pp:            10,
        priority:      0,
        target:        'selected-pokemon',
        effect_chance: null,
        effect:        '',
        meta:          null,
        stat_changes:  [],
        ...overrides,
    }
}