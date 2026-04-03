import { describe, it, expect } from 'vitest'
import { makePokemon, makeMove } from '../helpers/mockPokemon'
import { testTypeChart } from '../helpers/typeChart'
import { calcDamage } from '../../calc/damage'

// weather.ts
import {
    isImmuneToWeatherDamage,
    calcWeatherDamage,
    getWeatherFromAbility,
    getSandstormSpDefBoost,
    getSnowDefBoost,
    tickWeather,
} from '../../effects/weather'

// status.ts
import {
    canApplyStatus,
    calcStatusDamage,
    getBurnAttackMod,
    getParalysisSpeedMod,
    tickToxic,
} from '../../effects/status'

// volatile.ts
import {
    calcConfusionDamage,
    calcLeechSeedDamage,
    applySubstituteDamage,
    calcSubstituteHp,
    calcBindDamage,
    calcCurseDamage,
    calcAquaRingHeal,
    calcIngrainHeal,
    calcCritRate,
    rollCrit,
    isTaunted,
    isEncored,
    hasFocusEnergy,
    isFlinched,
} from '../../effects/volatile'

// ability.ts
import {
    isStatusImmune,
    isDamageImmune,
    onDefenderHit,
    onEndOfTurn,
} from '../../effects/ability'

// ─── 픽스처 ───────────────────────────────────────────────────
const darkrai = makePokemon({
    species: 'darkrai', types: ['dark'],
    baseStats: { hp: 70, attack: 90, defense: 90, special_attack: 135, special_defense: 90, speed: 125 },
    set: {
        species: 'darkrai', level: 50, gender: null,
        ability: 'bad-dreams', item: 'choice-specs', nature: 'timid',
        evs: { special_attack: 252, special_defense: 4, speed: 252 },
        ivs: { attack: 0 },
        moves: ['dark-pulse', 'psychic', 'focus-blast', 'sludge-bomb'],
    },
})

const garganacl = makePokemon({
    species: 'garganacl', types: ['rock'],
    baseStats: { hp: 100, attack: 100, defense: 130, special_attack: 45, special_defense: 90, speed: 63 },
    set: {
        species: 'garganacl', level: 50, gender: null,
        ability: 'purifying-salt', item: 'leftovers', nature: 'careful',
        evs: { hp: 252, defense: 16, special_defense: 216, speed: 24 },
        moves: ['salt-cure', 'stealth-rock', 'protect', 'recover'],
    },
})

const greatTusk = makePokemon({
    species: 'great-tusk', types: ['ground', 'fighting'],
    baseStats: { hp: 115, attack: 131, defense: 131, special_attack: 53, special_defense: 53, speed: 87 },
    set: {
        species: 'great-tusk', level: 50, gender: null,
        ability: 'protosynthesis', item: 'booster-energy', nature: 'jolly',
        evs: { attack: 252, defense: 4, speed: 252 },
        moves: ['headlong-rush', 'close-combat', 'ice-spinner', 'rapid-spin'],
    },
})

const dragonite = makePokemon({
    species: 'dragonite', types: ['dragon', 'flying'],
    baseStats: { hp: 91, attack: 134, defense: 95, special_attack: 100, special_defense: 100, speed: 80 },
    set: {
        species: 'dragonite', level: 50, gender: 'M',
        ability: 'multiscale', item: 'silk-scarf', nature: 'adamant',
        evs: { hp: 152, attack: 252, speed: 104 },
        moves: ['dragon-dance', 'roost', 'extreme-speed', 'earthquake'],
    },
})

const baseInput = { weather: null, terrain: null, typeChart: testTypeChart }

// ═══════════════════════════════════════════════════════════════
// 날씨 (Weather)
// ═══════════════════════════════════════════════════════════════

describe('isImmuneToWeatherDamage', () => {
    it('모래바람: 바위 타입 면역',   () => expect(isImmuneToWeatherDamage({ ...darkrai, types: ['rock']   }, 'sandstorm')).toBe(true))
    it('모래바람: 강철 타입 면역',   () => expect(isImmuneToWeatherDamage({ ...darkrai, types: ['steel']  }, 'sandstorm')).toBe(true))
    it('모래바람: 땅 타입 면역',     () => expect(isImmuneToWeatherDamage({ ...darkrai, types: ['ground'] }, 'sandstorm')).toBe(true))
    it('모래바람: Sand Veil 면역',   () => expect(isImmuneToWeatherDamage({ ...darkrai, ability: 'sand-veil'    }, 'sandstorm')).toBe(true))
    it('모래바람: Magic Guard 면역', () => expect(isImmuneToWeatherDamage({ ...darkrai, ability: 'magic-guard'  }, 'sandstorm')).toBe(true))
    it('모래바람: 방진고글 면역',    () => expect(isImmuneToWeatherDamage({ ...darkrai, item: 'safety-goggles' }, 'sandstorm')).toBe(true))
    it('모래바람: 다크 타입 비면역', () => expect(isImmuneToWeatherDamage(darkrai, 'sandstorm')).toBe(false))
    it('눈: 얼음 타입 면역',         () => expect(isImmuneToWeatherDamage({ ...darkrai, types: ['ice'] }, 'snow')).toBe(true))
    it('눈: Ice Body 면역',          () => expect(isImmuneToWeatherDamage({ ...darkrai, ability: 'ice-body' }, 'snow')).toBe(true))
    it('눈: 비얼음 타입 비면역',      () => expect(isImmuneToWeatherDamage(darkrai, 'snow')).toBe(false))
    it('쾌청: 모두 면역 없음',        () => expect(isImmuneToWeatherDamage(darkrai, 'sun')).toBe(false))
    it('날씨 없음: 면역 없음',        () => expect(isImmuneToWeatherDamage(darkrai, null)).toBe(false))
})

describe('calcWeatherDamage', () => {
    it('모래바람: 비면역 1/16 데미지',        () => expect(calcWeatherDamage(darkrai, 'sandstorm')?.damage).toBe(Math.floor(darkrai.max_hp / 16)))
    it('모래바람: 바위 타입 → null',          () => expect(calcWeatherDamage(garganacl, 'sandstorm')).toBeNull())
    it('눈: Gen9 데미지 없음 → null',         () => expect(calcWeatherDamage(darkrai, 'snow')).toBeNull())
    it('쾌청/비: null',                       () => {
        expect(calcWeatherDamage(darkrai, 'sun')).toBeNull()
        expect(calcWeatherDamage(darkrai, 'rain')).toBeNull()
    })
    it('날씨 없음: null',                     () => expect(calcWeatherDamage(darkrai, null)).toBeNull())
    it('pokemon_id 포함',                     () => expect(calcWeatherDamage(darkrai, 'sandstorm')?.pokemon_id).toBe(darkrai.id))
})

describe('getWeatherFromAbility', () => {
    it('drought → sun',          () => expect(getWeatherFromAbility('drought'       )).toBe('sun'       ))
    it('drizzle → rain',         () => expect(getWeatherFromAbility('drizzle'       )).toBe('rain'      ))
    it('sand-stream → sandstorm',() => expect(getWeatherFromAbility('sand-stream'   )).toBe('sandstorm' ))
    it('snow-warning → snow',    () => expect(getWeatherFromAbility('snow-warning'  )).toBe('snow'      ))
    it('desolate-land → harsh_sun',() => expect(getWeatherFromAbility('desolate-land')).toBe('harsh_sun'))
    it('primordial-sea → heavy_rain',() => expect(getWeatherFromAbility('primordial-sea')).toBe('heavy_rain'))
    it('delta-stream → strong_winds',() => expect(getWeatherFromAbility('delta-stream')).toBe('strong_winds'))
    it('없는 특성 → null',       () => expect(getWeatherFromAbility('intimidate'    )).toBeNull()        )
})

describe('getSandstormSpDefBoost', () => {
    it('모래바람 + 바위 타입 → 1.5×',    () => expect(getSandstormSpDefBoost(garganacl, 'sandstorm')).toBe(1.5))
    it('모래바람 + 비바위 타입 → 1×',    () => expect(getSandstormSpDefBoost(darkrai,   'sandstorm')).toBe(1  ))
    it('다른 날씨 → 1×',                 () => expect(getSandstormSpDefBoost(garganacl, 'sun'      )).toBe(1  ))
})

describe('getSnowDefBoost', () => {
    it('눈 + 얼음 타입 → 1.5×',  () => expect(getSnowDefBoost({ ...darkrai, types: ['ice'] }, 'snow')).toBe(1.5))
    it('눈 + 비얼음 타입 → 1×',  () => expect(getSnowDefBoost(darkrai, 'snow'              )).toBe(1  ))
    it('다른 날씨 → 1×',          () => expect(getSnowDefBoost({ ...darkrai, types: ['ice'] }, 'sun' )).toBe(1  ))
})

describe('tickWeather', () => {
    it('5턴 → 4턴',      () => expect(tickWeather({ turns_remaining: 5 })?.turns_remaining).toBe(4))
    it('1턴 → null',     () => expect(tickWeather({ turns_remaining: 1 })).toBeNull())
    it('Infinity → 유지', () => expect(tickWeather({ turns_remaining: Infinity })?.turns_remaining).toBe(Infinity))
})

describe('날씨 데미지 보정 (calcDamage)', () => {
    const fireMove  = makeMove({ name: 'flamethrower', type: 'fire',  category: 'special', power: 90 })
    const waterMove = makeMove({ name: 'surf',         type: 'water', category: 'special', power: 90 })

    it('쾌청: 불꽃 1.5×', () => {
        const normal = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: fireMove,  weather: null  })
        const sunny  = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: fireMove,  weather: 'sun' })
        expect(sunny.modifiers.weather).toBe(1.5)
        expect(sunny.damage).toBeGreaterThan(normal.damage)
    })
    it('쾌청: 물 0.5×', () => {
        const normal = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: waterMove, weather: null  })
        const sunny  = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: waterMove, weather: 'sun' })
        expect(sunny.modifiers.weather).toBe(0.5)
        expect(sunny.damage).toBeLessThan(normal.damage)
    })
    it('비: 물 1.5×', () => {
        const rainy = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: waterMove, weather: 'rain' })
        expect(rainy.modifiers.weather).toBe(1.5)
    })
    it('비: 불꽃 0.5×', () => {
        const rainy = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: fireMove,  weather: 'rain' })
        expect(rainy.modifiers.weather).toBe(0.5)
    })
    it('강한 햇살: 물 기술 데미지 0', () => {
        const result = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: waterMove, weather: 'harsh_sun' })
        expect(result.damage).toBe(0)
        expect(result.modifiers.weather).toBe(0)
    })
    it('폭우: 불꽃 기술 데미지 0', () => {
        const result = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: fireMove,  weather: 'heavy_rain' })
        expect(result.damage).toBe(0)
        expect(result.modifiers.weather).toBe(0)
    })
})

// ═══════════════════════════════════════════════════════════════
// 상태이상 (Status)
// ═══════════════════════════════════════════════════════════════

describe('canApplyStatus', () => {
    it('상태이상 없음 → 가능',           () => expect(canApplyStatus({ ...darkrai, status: null    }, 'burn',      null, null).canApply).toBe(true ))
    it('이미 상태이상 → 불가',           () => expect(canApplyStatus({ ...darkrai, status: 'burn'  }, 'paralysis', null, null).canApply).toBe(false))
    it('기절 포켓몬 → 불가',             () => expect(canApplyStatus({ ...darkrai, fainted: true   }, 'burn',      null, null).canApply).toBe(false))
    it('불꽃 타입 → 화상 불가',          () => expect(canApplyStatus({ ...darkrai, types: ['fire'] }, 'burn',      null, null).canApply).toBe(false))
    it('전기 타입 → 마비 불가',          () => expect(canApplyStatus({ ...darkrai, types: ['electric'] }, 'paralysis', null, null).canApply).toBe(false))
    it('독 타입 → 독/맹독 불가',         () => expect(canApplyStatus({ ...darkrai, types: ['poison'] }, 'poison', null, null).canApply).toBe(false))
    it('강철 타입 → 독/맹독 불가',       () => expect(canApplyStatus({ ...darkrai, types: ['steel']  }, 'toxic',  null, null).canApply).toBe(false))
    it('얼음 타입 → 빙결 불가',          () => expect(canApplyStatus({ ...darkrai, types: ['ice']    }, 'freeze', null, null).canApply).toBe(false))
    it('림버 특성 → 마비 불가',          () => expect(canApplyStatus({ ...darkrai, ability: 'limber'        }, 'paralysis', null, null).canApply).toBe(false))
    it('수의베일 특성 → 화상 불가',      () => expect(canApplyStatus({ ...darkrai, ability: 'water-veil'    }, 'burn',      null, null).canApply).toBe(false))
    it('면역 특성 → 독 불가',            () => expect(canApplyStatus({ ...darkrai, ability: 'immunity'      }, 'poison',    null, null).canApply).toBe(false))
    it('불면 특성 → 수면 불가',          () => expect(canApplyStatus({ ...darkrai, ability: 'insomnia'      }, 'sleep',     null, null).canApply).toBe(false))
    it('활기 특성 → 수면 불가',          () => expect(canApplyStatus({ ...darkrai, ability: 'vital-spirit'  }, 'sleep',     null, null).canApply).toBe(false))
    it('용암갑옷 특성 → 빙결 불가',      () => expect(canApplyStatus({ ...darkrai, ability: 'magma-armor'   }, 'freeze',    null, null).canApply).toBe(false))
    it('쾌청 → 빙결 불가',               () => expect(canApplyStatus(darkrai, 'freeze', null, 'sun').canApply).toBe(false))
    it('폭우 → 화상 불가',               () => expect(canApplyStatus(darkrai, 'burn',   null, 'heavy_rain').canApply).toBe(false))
    it('미스트필드 → 상태이상 불가',     () => expect(canApplyStatus(darkrai, 'burn',   'misty', null).canApply).toBe(false))
    it('일렉트릭필드 → 수면 면역', () =>
        expect(isStatusImmune(darkrai, 'sleep', null, 'electric')).toBe(true)
    )
    it('정화의소금 → 화상/독 불가', () => {
        const purifying = { ...darkrai, ability: 'purifying-salt' }
        expect(canApplyStatus(purifying, 'burn',   null, null).canApply).toBe(false)
        expect(canApplyStatus(purifying, 'poison', null, null).canApply).toBe(false)
    })
})

describe('calcStatusDamage', () => {
    const rng = () => 0.5

    it('화상: 1/16 데미지',       () => expect(calcStatusDamage({ ...darkrai, status: 'burn'  }, rng)?.damage).toBe(Math.floor(darkrai.max_hp / 16)))
    it('독: 1/8 데미지',          () => expect(calcStatusDamage({ ...darkrai, status: 'poison'}, rng)?.damage).toBe(Math.floor(darkrai.max_hp / 8 )))
    it('맹독 1턴: 1/16',          () => expect(calcStatusDamage({ ...darkrai, status: 'toxic', status_turns: 1 }, rng)?.damage).toBe(Math.floor(darkrai.max_hp * 1 / 16)))
    it('맹독 3턴: 3/16',          () => expect(calcStatusDamage({ ...darkrai, status: 'toxic', status_turns: 3 }, rng)?.damage).toBe(Math.floor(darkrai.max_hp * 3 / 16)))
    it('맹독 15턴 clamp',         () => expect(calcStatusDamage({ ...darkrai, status: 'toxic', status_turns: 15}, rng)?.damage).toBe(Math.floor(darkrai.max_hp * 15 / 16)))
    it('화상 + Heatproof: 1/32',  () => expect(calcStatusDamage({ ...darkrai, status: 'burn', ability: 'heatproof' }, rng)?.damage).toBe(Math.floor(darkrai.max_hp / 32)))
    it('마비: null',              () => expect(calcStatusDamage({ ...darkrai, status: 'paralysis' }, rng)).toBeNull())
    it('수면: null',              () => expect(calcStatusDamage({ ...darkrai, status: 'sleep'     }, rng)).toBeNull())
    it('상태이상 없음: null',      () => expect(calcStatusDamage({ ...darkrai, status: null        }, rng)).toBeNull())
})

describe('getBurnAttackMod', () => {
    it('화상: 0.5×',              () => expect(getBurnAttackMod({ ...darkrai, status: 'burn'     })).toBe(0.5))
    it('화상 + Guts: 1×',         () => expect(getBurnAttackMod({ ...darkrai, status: 'burn', ability: 'guts' })).toBe(1))
    it('상태이상 없음: 1×',        () => expect(getBurnAttackMod({ ...darkrai, status: null       })).toBe(1  ))
    it('마비: 1× (화상만 적용)',   () => expect(getBurnAttackMod({ ...darkrai, status: 'paralysis'})).toBe(1  ))
})

describe('getParalysisSpeedMod', () => {
    it('마비: 0.5×',               () => expect(getParalysisSpeedMod({ ...darkrai, status: 'paralysis'                          })).toBe(0.5))
    it('마비 + Quick Feet: 1×',    () => expect(getParalysisSpeedMod({ ...darkrai, status: 'paralysis', ability: 'quick-feet'   })).toBe(1  ))
    it('상태이상 없음: 1×',         () => expect(getParalysisSpeedMod({ ...darkrai, status: null                                 })).toBe(1  ))
})

describe('tickToxic', () => {
    it('맹독 1턴 → 2턴', () => expect(tickToxic({ ...darkrai, status: 'toxic', status_turns: 1 })).toBe(2))
    it('맹독 5턴 → 6턴', () => expect(tickToxic({ ...darkrai, status: 'toxic', status_turns: 5 })).toBe(6))
    it('독: 변화 없음',   () => expect(tickToxic({ ...darkrai, status: 'poison',status_turns: 1 })).toBe(1))
})

describe('화상 데미지 보정 (calcDamage)', () => {
    const physMove = makeMove({ name: 'headlong-rush', type: 'ground', category: 'physical', power: 100 })
    const specMove = makeMove({ name: 'dark-pulse',    type: 'dark',   category: 'special',  power: 80  })

    it('화상: 물리기술 0.5×', () => {
        const normal = calcDamage({ ...baseInput, attacker: greatTusk,                                 defender: darkrai, move: physMove, randomRoll: 100 })
        const burned = calcDamage({ ...baseInput, attacker: { ...greatTusk, status: 'burn' as const }, defender: darkrai, move: physMove, randomRoll: 100 })
        expect(burned.modifiers.burn).toBe(0.5)
        expect(burned.damage).toBeLessThan(normal.damage)
    })
    it('화상: 특수기술 영향 없음', () => {
        const normal = calcDamage({ ...baseInput, attacker: darkrai,                                 defender: garganacl, move: specMove, randomRoll: 100 })
        const burned = calcDamage({ ...baseInput, attacker: { ...darkrai, status: 'burn' as const }, defender: garganacl, move: specMove, randomRoll: 100 })
        expect(burned.modifiers.burn).toBe(1)
        expect(burned.damage).toBe(normal.damage)
    })
    it('화상 + Guts: 1.5× 보너스', () => {
        const guts   = calcDamage({ ...baseInput, attacker: { ...greatTusk, ability: 'guts', status: 'burn' as const }, defender: darkrai, move: physMove, randomRoll: 100 })
        const normal = calcDamage({ ...baseInput, attacker: greatTusk,                                                  defender: darkrai, move: physMove, randomRoll: 100 })
        expect(guts.modifiers.burn).toBe(1)
        expect(guts.damage).toBeGreaterThan(normal.damage)
    })
})

// ═══════════════════════════════════════════════════════════════
// 휘발성 상태 (Volatile)
// ═══════════════════════════════════════════════════════════════

describe('calcConfusionDamage', () => {
    it('혼란 자해: 양수', () => expect(calcConfusionDamage(darkrai)).toBeGreaterThan(0))
    it('혼란 자해: 자신 공격/방어 기반', () => {
        const high = calcConfusionDamage({ ...darkrai, stats: { ...darkrai.stats, attack: 200 } })
        const low  = calcConfusionDamage({ ...darkrai, stats: { ...darkrai.stats, attack: 50  } })
        expect(high).toBeGreaterThan(low)
    })
})

describe('calcLeechSeedDamage', () => {
    it('씨뿌리기 있음: 1/8 데미지',   () => expect(calcLeechSeedDamage({ ...darkrai, volatile_statuses: { seeded: { turns_remaining: 999 } } })).toBe(Math.floor(darkrai.max_hp / 8)))
    it('씨뿌리기 없음: 0',            () => expect(calcLeechSeedDamage({ ...darkrai, volatile_statuses: {}                                   })).toBe(0))
})

describe('applySubstituteDamage', () => {
    it('데미지 < 대타HP: 대타 유지',    () => {
        const result = applySubstituteDamage(50, 30)
        expect(result.absorbed).toBe(30)
        expect(result.remaining).toBe(20)
        expect(result.subBroken).toBe(false)
    })
    it('데미지 >= 대타HP: 대타 파괴', () => {
        const result = applySubstituteDamage(50, 60)
        expect(result.absorbed).toBe(50)
        expect(result.remaining).toBe(0)
        expect(result.subBroken).toBe(true)
    })
    it('Gen6+: 오버플로우 없음',       () => expect(applySubstituteDamage(50, 100).overflowDamage).toBe(0))
})

describe('calcSubstituteHp', () => {
    it('HP 1/4',  () => expect(calcSubstituteHp(darkrai)).toBe(Math.floor(darkrai.max_hp / 4)))
})

describe('calcBindDamage', () => {
    it('감기기 있음: 1/8',           () => expect(calcBindDamage({ ...darkrai, volatile_statuses: { bound: { turns_remaining: 3 } } })).toBe(Math.floor(darkrai.max_hp / 8)))
    it('감기기 + Binding Band: 1/6', () => expect(calcBindDamage({ ...darkrai, item: 'binding-band', volatile_statuses: { bound: { turns_remaining: 3 } } })).toBe(Math.floor(darkrai.max_hp / 6)))
    it('감기기 없음: 0',             () => expect(calcBindDamage({ ...darkrai, volatile_statuses: {} })).toBe(0))
})

describe('calcCurseDamage', () => {
    it('저주 있음: 1/4',  () => expect(calcCurseDamage({ ...darkrai, volatile_statuses: { curse: { turns_remaining: 999 } } })).toBe(Math.floor(darkrai.max_hp / 4)))
    it('저주 없음: 0',    () => expect(calcCurseDamage({ ...darkrai, volatile_statuses: {} })).toBe(0))
})

describe('calcAquaRingHeal', () => {
    it('아쿠아링 있음: 1/16',          () => expect(calcAquaRingHeal({ ...darkrai, volatile_statuses: { aqua_ring: { turns_remaining: 999 } } })).toBe(Math.floor(darkrai.max_hp / 16)))
    it('아쿠아링 + Big Root: 1.3×',   () => expect(calcAquaRingHeal({ ...darkrai, item: 'big-root', volatile_statuses: { aqua_ring: { turns_remaining: 999 } } })).toBe(Math.floor(darkrai.max_hp / 16 * 1.3)))
    it('아쿠아링 없음: 0',             () => expect(calcAquaRingHeal({ ...darkrai, volatile_statuses: {} })).toBe(0))
})

describe('calcIngrainHeal', () => {
    it('뿌리박기 있음: 1/16',          () => expect(calcIngrainHeal({ ...darkrai, volatile_statuses: { ingrain: { turns_remaining: 999 } } })).toBe(Math.floor(darkrai.max_hp / 16)))
    it('뿌리박기 없음: 0',             () => expect(calcIngrainHeal({ ...darkrai, volatile_statuses: {} })).toBe(0))
})

describe('휘발성 상태 플래그', () => {
    it('isTaunted: 도발 있음',         () => expect(isTaunted({ ...darkrai, volatile_statuses: { taunt:        { turns_remaining: 3 } } })).toBe(true ))
    it('isTaunted: 도발 없음',         () => expect(isTaunted({ ...darkrai, volatile_statuses: {}                                       })).toBe(false))
    it('isEncored: 앙코르 있음',       () => expect(isEncored({ ...darkrai, volatile_statuses: { encore:       { turns_remaining: 3 } } })).toBe(true ))
    it('isEncored: 앙코르 없음',       () => expect(isEncored({ ...darkrai, volatile_statuses: {}                                       })).toBe(false))
    it('hasFocusEnergy: 기합 있음',    () => expect(hasFocusEnergy({ ...darkrai, volatile_statuses: { focus_energy: { turns_remaining: 999 } } })).toBe(true ))
    it('hasFocusEnergy: 기합 없음',    () => expect(hasFocusEnergy({ ...darkrai, volatile_statuses: {}                                         })).toBe(false))
    it('isFlinched: 풀죽음 있음',      () => expect(isFlinched({ ...darkrai, volatile_statuses: { flinch:       { turns_remaining: 1 } } })).toBe(true ))
    it('isFlinched: 풀죽음 없음',      () => expect(isFlinched({ ...darkrai, volatile_statuses: {}                                      })).toBe(false))
})

describe('calcCritRate', () => {
    it('기본 0단계',            () => expect(calcCritRate(0, false, false)).toBe(0))
    it('기합모으기 +2',         () => expect(calcCritRate(0, true,  false)).toBe(2))
    it('고급소기술 +1',         () => expect(calcCritRate(0, false, true )).toBe(1))
    it('기합 + 고급소 = 3',     () => expect(calcCritRate(0, true,  true )).toBe(3))
    it('최대 3 clamp',          () => expect(calcCritRate(3, true,  true )).toBe(3))
})

describe('rollCrit', () => {
    it('0단계: 1/24 이하 → 급소',  () => expect(rollCrit(0, () => 0.04)).toBe(true ))
    it('0단계: 1/24 초과 → 아님',  () => expect(rollCrit(0, () => 0.05)).toBe(false))
    it('3단계: 확정 급소',          () => expect(rollCrit(3, () => 0.99)).toBe(true ))
    it('2단계: 1/2 이하 → 급소',   () => expect(rollCrit(2, () => 0.49)).toBe(true ))
})

// ═══════════════════════════════════════════════════════════════
// 특성 (Ability)
// ═══════════════════════════════════════════════════════════════

describe('isStatusImmune', () => {
    it('불꽃 타입 → 화상 면역',          () => expect(isStatusImmune({ ...darkrai, types: ['fire']     }, 'burn',      null)).toBe(true ))
    it('얼음 타입 → 빙결 면역',          () => expect(isStatusImmune({ ...darkrai, types: ['ice']      }, 'freeze',    null)).toBe(true ))
    it('전기 타입 → 마비 면역',          () => expect(isStatusImmune({ ...darkrai, types: ['electric'] }, 'paralysis', null)).toBe(true ))
    it('독 타입 → 독 면역',             () => expect(isStatusImmune({ ...darkrai, types: ['poison']   }, 'poison',    null)).toBe(true ))
    it('강철 타입 → 맹독 면역',         () => expect(isStatusImmune({ ...darkrai, types: ['steel']    }, 'toxic',     null)).toBe(true ))
    it('수의베일 → 화상 면역',           () => expect(isStatusImmune({ ...darkrai, ability: 'water-veil'   }, 'burn',      null)).toBe(true ))
    it('림버 → 마비 면역',               () => expect(isStatusImmune({ ...darkrai, ability: 'limber'       }, 'paralysis', null)).toBe(true ))
    it('면역 → 독 면역',                 () => expect(isStatusImmune({ ...darkrai, ability: 'immunity'     }, 'poison',    null)).toBe(true ))
    it('불면 → 수면 면역',               () => expect(isStatusImmune({ ...darkrai, ability: 'insomnia'     }, 'sleep',     null)).toBe(true ))
    it('활기 → 수면 면역',               () => expect(isStatusImmune({ ...darkrai, ability: 'vital-spirit' }, 'sleep',     null)).toBe(true ))
    it('용암갑옷 → 빙결 면역',           () => expect(isStatusImmune({ ...darkrai, ability: 'magma-armor'  }, 'freeze',    null)).toBe(true ))
    it('쾌청 → 빙결 면역',               () => expect(isStatusImmune(darkrai, 'freeze', 'sun'                            )).toBe(true ))
    it('정화의소금 → 화상 면역',         () => expect(isStatusImmune({ ...darkrai, ability: 'purifying-salt' }, 'burn',   null)).toBe(true ))
    it('정화의소금 → 독 면역',           () => expect(isStatusImmune({ ...darkrai, ability: 'purifying-salt' }, 'poison', null)).toBe(true ))
    it('일반 포켓몬 → 화상 비면역',      () => expect(isStatusImmune(darkrai, 'burn', null                               )).toBe(false))
})

describe('isDamageImmune', () => {
    it('플래시파이어: 불꽃 면역',        () => expect(isDamageImmune({ ...darkrai, ability: 'flash-fire'    }, 'fire',     'special')).toBe(true ))
    it('전동기: 전기 면역',              () => expect(isDamageImmune({ ...darkrai, ability: 'motor-drive'   }, 'electric', 'special')).toBe(true ))
    it('피뢰침: 전기 면역',              () => expect(isDamageImmune({ ...darkrai, ability: 'lightning-rod' }, 'electric', 'special')).toBe(true ))
    it('물흡수: 물 면역',                () => expect(isDamageImmune({ ...darkrai, ability: 'water-absorb'  }, 'water',    'special')).toBe(true ))
    it('저수: 물 면역',                  () => expect(isDamageImmune({ ...darkrai, ability: 'storm-drain'   }, 'water',    'special')).toBe(true ))
    it('드라이스킨: 물 면역',            () => expect(isDamageImmune({ ...darkrai, ability: 'dry-skin'      }, 'water',    'special')).toBe(true ))
    it('초식: 풀 면역',                  () => expect(isDamageImmune({ ...darkrai, ability: 'sap-sipper'    }, 'grass',    'special')).toBe(true ))
    it('일반 특성: 면역 없음',           () => expect(isDamageImmune(darkrai, 'dark', 'special'                                      )).toBe(false))
})

describe('onDefenderHit', () => {
    it('까칠한피부: 공격자 1/8 반동', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'rough-skin' }, 'normal', 50)
        expect(result.recoil).toBe(Math.floor(darkrai.max_hp / 8))
    })
    it('철가시: 공격자 1/8 반동', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'iron-barbs' }, 'normal', 50)
        expect(result.recoil).toBe(Math.floor(darkrai.max_hp / 8))
    })
    it('전동기: 전기 피격 시 스피드 +1', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'motor-drive' }, 'electric', 50)
        expect(result.statChanges?.some(s => s.stat === 'speed' && s.change === 1)).toBe(true)
    })
    it('피뢰침: 전기 피격 시 특공 +1', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'lightning-rod' }, 'electric', 50)
        expect(result.statChanges?.some(s => s.stat === 'special_attack' && s.change === 1)).toBe(true)
    })
    it('물흡수: 물 피격 시 HP 1/4 회복', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'water-absorb' }, 'water', 50)
        expect(result.heal).toBe(Math.floor(garganacl.max_hp / 4))
    })
    it('저수: 물 피격 시 HP 1/4 회복', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'storm-drain' }, 'water', 50)
        expect(result.heal).toBe(Math.floor(garganacl.max_hp / 4))
    })
    it('초식: 풀 피격 시 공격 +1', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'sap-sipper' }, 'grass', 50)
        expect(result.statChanges?.some(s => s.stat === 'attack' && s.change === 1)).toBe(true)
    })
    it('플래시파이어: 불꽃 피격 시 ability_trigger 이벤트', () => {
        const result = onDefenderHit(darkrai, { ...garganacl, ability: 'flash-fire' }, 'fire', 50)
        expect(result.events.some(e => e.type === 'ability_trigger')).toBe(true)
    })
    it('일반 특성: 반동/회복 없음', () => {
        const result = onDefenderHit(darkrai, garganacl, 'dark', 50)
        expect(result.recoil).toBeUndefined()
        expect(result.heal).toBeUndefined()
    })
})

describe('onEndOfTurn', () => {
    it('포이즌힐: 독 → 1/8 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'poison-heal', status: 'poison' }, null)
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 8))
    })
    it('포이즌힐: 맹독 → 1/8 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'poison-heal', status: 'toxic' }, null)
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 8))
    })
    it('포이즌힐: 상태이상 없음 → 회복 없음', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'poison-heal', status: null }, null)
        expect(result.heal).toBeUndefined()
    })
    it('레인디쉬: 비 → 1/16 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'rain-dish' }, 'rain')
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 16))
    })
    it('레인디쉬: 폭우 → 1/16 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'rain-dish' }, 'heavy_rain')
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 16))
    })
    it('레인디쉬: 날씨 없음 → 회복 없음', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'rain-dish' }, null)
        expect(result.heal).toBeUndefined()
    })
    it('아이스바디: 눈 → 1/16 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'ice-body' }, 'snow')
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 16))
    })
    it('드라이스킨: 비 → 1/8 회복', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'dry-skin' }, 'rain')
        expect(result.heal).toBe(Math.floor(darkrai.max_hp / 8))
    })
    it('드라이스킨: 쾌청 → 1/8 데미지', () => {
        const result = onEndOfTurn({ ...darkrai, ability: 'dry-skin' }, 'sun')
        expect(result.damage).toBe(Math.floor(darkrai.max_hp / 8))
    })
})

describe('특성 면역 (calcDamage 연동)', () => {
    const fireMove     = makeMove({ name: 'flamethrower', type: 'fire',     category: 'special', power: 90 })
    const electricMove = makeMove({ name: 'thunderbolt',  type: 'electric', category: 'special', power: 90 })
    const waterMove    = makeMove({ name: 'surf',         type: 'water',    category: 'special', power: 90 })
    const grassMove    = makeMove({ name: 'energy-ball',  type: 'grass',    category: 'special', power: 90 })

    it('플래시파이어: 불꽃 데미지 0',    () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'flash-fire'    }, move: fireMove     }).damage).toBe(0))
    it('전동기: 전기 데미지 0',          () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'motor-drive'   }, move: electricMove }).damage).toBe(0))
    it('피뢰침: 전기 데미지 0',          () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'lightning-rod' }, move: electricMove }).damage).toBe(0))
    it('물흡수: 물 데미지 0',            () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'water-absorb'  }, move: waterMove    }).damage).toBe(0))
    it('저수: 물 데미지 0',              () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'storm-drain'   }, move: waterMove    }).damage).toBe(0))
    it('초식: 풀 데미지 0',              () => expect(calcDamage({ ...baseInput, attacker: garganacl, defender: { ...darkrai, ability: 'sap-sipper'    }, move: grassMove    }).damage).toBe(0))
})

describe('Solid Rock / Filter / Prism Armor', () => {
    const superMove = makeMove({ name: 'focus-blast', type: 'fighting', category: 'special', power: 120 })
    it('효과 절대 시 0.75× 경감', () => {
        const normal    = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl,                                   move: superMove })
        const solidRock = calcDamage({ ...baseInput, attacker: darkrai, defender: { ...garganacl, ability: 'solid-rock'  },    move: superMove })
        const filter    = calcDamage({ ...baseInput, attacker: darkrai, defender: { ...garganacl, ability: 'filter'      },    move: superMove })
        const prism     = calcDamage({ ...baseInput, attacker: darkrai, defender: { ...garganacl, ability: 'prism-armor' },    move: superMove })
        expect(solidRock.damage).toBeLessThan(normal.damage)
        expect(filter.damage).toBe(solidRock.damage)
        expect(prism.damage).toBe(solidRock.damage)
    })
})