// ─── @kyasi/pokebattle-engine ──────────────────────────────────
// Pokémon Showdown 시뮬레이터(@pkmn/sim) 기반 배틀 엔진 + @smogon/calc 데미지 계산기
// 포켓몬 슬러그·한국어 이름은 PokeAPI 데이터 사용

// 엔진
export { BattleEngine, BattleError, STATUS_FROM_PS, WEATHER_FROM_PS, TERRAIN_FROM_PS, SIDE_FROM_PS, ACTIVE_PER_SIDE, optionsToRules } from './engine/BattleEngine'
export type { EngineOptions } from './engine/BattleEngine'
export { replayInputLog, comparableLog } from './engine/replay'
export type { ReplayOptions } from './engine/replay'

// 데이터
export {
    getSpecies, getMove, listSpecies, listMoves, getTypeChart, preloadData, isDataLoaded, getLearnset, getItem, listItems,
    speciesSlug, moveSlug, abilitySlug, itemSlug, koName, getPokeApiSpecies, listPokeApiSpecies,
    STAT_FROM_PS, STAT_TO_PS,
} from './data/dex'
export type { SpeciesData, ItemData } from './data/dex'
export {
    speciesToShowdown, moveToShowdown, abilityToShowdown, itemToShowdown, natureToShowdown, typeToShowdown, toSlug,
} from './showdown/ids'
export { toShowdownSet, fromShowdownSet, SetError } from './showdown/sets'

// 계산기
export { calculateDamage, formatKO, toCalcPokemon, toCalcField } from './calc/damage'
export type { CalcPokemonInput, CalcFieldInput, DamageResult } from './calc/damage'
export {
    calcHP, calcBaseStat, calcAllStats, getNatureMultiplier, applyStage, createInitialStages, STAT_KEYS, NATURE_TABLE,
} from './calc/stat'
export type { StatKey, BattleStatKey } from './calc/stat'

// AI / 시뮬레이션
export { RandomAI, HeuristicAI, createAI } from './ai'
export type { BattleAI, HeuristicAIOptions } from './ai'
export { simulateBattle, generateRandomSet, generateRandomTeam, generateChaosTeam, bst } from './sim'
export type { SimulateOptions, SimulateResult, RandomSetOptions, RandomTeamOptions, ChaosTeamOptions } from './sim'

// 랜덤배틀 (Showdown 공식 랜덤배틀 생성기·데이터, 1~9세대)
export {
    createRandomBattle, getRandomBattleSets, getRandomBattleSet, randomBattleFormatId, randomBattleLevelStats, RANDOM_BATTLE_FORMATS,
} from './random'
export type { RandomBattleOptions, RandomBattleFormat, RandomBattleSpecies, RandomBattleRole } from './random'

// 손가락흔들기 모드 (기술 = 손가락흔들기 고정, 자유 능력치, 고른/랜덤 포켓몬)
export { createMetronomeBattle, buildMetronomeTeam, metronomeSpeciesPool, METRONOME_MOVE } from './metronome'
export type { MetronomeBattleOptions, MetronomeSideOptions, MetronomePokemonInput, MetronomeStats, MetronomeFormat } from './metronome'
export { CUSTOM_STATS_RULE, CUSTOM_STAT_MIN, CUSTOM_STAT_MAX } from './engine/customstats'
export { toCustomStats } from './showdown/sets'

// 유틸
export { PRNG } from './utils/rng'
export type { RandomFn } from './utils/rng'
export { toId } from './utils/id'
export { parseShowdown, parseShowdownTeam, exportShowdown, exportShowdownTeam, loadTeam, loadTeamFromJSON } from './utils/parseShowdown'
export {
    formatEvent, fixParticles, STATUS_NAME_KO, STAT_NAME_KO, WEATHER_NAME_KO, TERRAIN_NAME_KO,
    SIDE_CONDITION_KO, FIELD_CONDITION_KO, VOLATILE_NAME_KO, CANT_MOVE_KO, SOURCE_NAME_KO,
} from './utils/format'
export type { NameResolver, FormatContext } from './utils/format'

// 다국어 로그 (ko / en / ja 내장, 이름 팩: ja·zh-hans·zh-hant·fr·de·es·it)
export {
    createFormatter, describeEvent, registerLocale, getLocale, listLocales, loadNames, registerNames, getNames,
    NAME_PACKS, CONDITION_ENTITY, SHOWN_VOLATILES, capitalizeSentences, ko, en, ja,
} from './i18n'
export type { Formatter, FormatterOptions, Message, Arg, Template, Locale, TermGroup, NameLookup, NamePack, EntityKind } from './i18n'

// 타입
export type * from './types/battle'
export type * from './types/pokemon'
export type * from './types/move'
export type * from './types/effect'
