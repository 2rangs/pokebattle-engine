// ─── @kyasi/pokebattle-engine ──────────────────────────────────
// 포켓몬 싱글 배틀 엔진 (Gen 9 기준)

// 엔진
export { BattleEngine, BattleError, createBattlePokemon, STRUGGLE } from './engine/BattleEngine'
export { getEffectivePriority } from './engine/TurnManager'

// 데이터
export {
    preloadData, registerData, isDataLoaded,
    loadPokemonData, loadMoveData, loadTypeChart, buildTypeChart, normalizeMove,
    getSpecies, getMove, getTypeChart, listSpecies, listMoves,
} from './data/loader'
export type { SpeciesData, TypeData } from './data/loader'
export { getMoveFlags, getStatEffects, isContact, isSelfTargeting } from './data/moveTable'
export type { MoveFlags } from './data/moveTable'

// 계산기
export {
    calcDamage, calcDamageRange, calcDamageSummary, calcTypeEffectiveness,
    getMoveType, getMoveCategory, getBasePower,
} from './calc/damage'
export type { DamageCalcInput, DamageCalcResult, DamageSummary, TypeChart } from './calc/damage'
export {
    calcHP, calcBaseStat, calcAllStats, getNatureMultiplier, applyStage, getStat,
    createInitialStages, STAT_KEYS, NATURE_TABLE,
} from './calc/stat'
export type { StatKey, BattleStatKey } from './calc/stat'

// AI / 시뮬레이션
export { RandomAI, HeuristicAI, createAI } from './ai'
export type { BattleAI, HeuristicAIOptions } from './ai'
export { simulateBattle, generateRandomSet, generateRandomTeam, bst } from './sim'
export type { SimulateOptions, SimulateResult, RandomSetOptions, RandomTeamOptions } from './sim'

// 유틸
export { PRNG } from './utils/rng'
export type { RandomFn } from './utils/rng'
export { toId } from './utils/id'
export { parseShowdown, parseShowdownTeam, exportShowdown, exportShowdownTeam, loadTeam, loadTeamFromJSON } from './utils/parseShowdown'
export {
    formatEvent, STATUS_NAME_KO, STAT_NAME_KO, WEATHER_NAME_KO, TERRAIN_NAME_KO,
    SIDE_CONDITION_KO, FIELD_CONDITION_KO, VOLATILE_NAME_KO, CANT_MOVE_KO, SOURCE_NAME_KO,
} from './utils/format'
export type { NameResolver, FormatContext } from './utils/format'

// 타입
export type * from './types/battle'
export type * from './types/pokemon'
export type * from './types/move'
export type * from './types/effect'
