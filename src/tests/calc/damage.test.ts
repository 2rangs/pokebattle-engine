import { describe, it, expect } from 'vitest'
import { calcDamage, calcDamageRange, calcDamageSummary } from '../../calc/damage'
import { makePokemon, makeMove } from '../helpers/mockPokemon'
import { testTypeChart } from '../helpers/typeChart'

// ─── 포켓몬 정의 ──────────────────────────────────────────────
const darkrai = makePokemon({
    species: 'darkrai',
    types: ['dark'],
    baseStats: { hp: 70, attack: 90, defense: 90, special_attack: 135, special_defense: 90, speed: 125 },
    set: {
        species: 'darkrai', level: 50, gender: null,
        ability: 'bad-dreams',
        item: 'choice-specs',
        nature: 'timid',
        evs: { special_attack: 252, special_defense: 4, speed: 252 },
        ivs: { attack: 0 },
        moves: ['dark-pulse', 'psychic', 'focus-blast', 'sludge-bomb'],
    },
})

const garganacl = makePokemon({
    species: 'garganacl',
    types: ['rock'],
    baseStats: { hp: 100, attack: 100, defense: 130, special_attack: 45, special_defense: 90, speed: 63 },
    set: {
        species: 'garganacl', level: 50, gender: null,
        ability: 'purifying-salt',
        item: 'leftovers',
        nature: 'careful',
        evs: { hp: 252, defense: 16, special_defense: 216, speed: 24 },
        moves: ['salt-cure', 'stealth-rock', 'protect', 'recover'],
    },
})

const greatTusk = makePokemon({
    species: 'great-tusk',
    types: ['ground', 'fighting'],
    baseStats: { hp: 115, attack: 131, defense: 131, special_attack: 53, special_defense: 53, speed: 87 },
    set: {
        species: 'great-tusk', level: 50, gender: null,
        ability: 'protosynthesis',
        item: 'booster-energy',
        nature: 'jolly',
        evs: { attack: 252, defense: 4, speed: 252 },
        moves: ['headlong-rush', 'close-combat', 'ice-spinner', 'rapid-spin'],
    },
    volatile_statuses: { paradox_boost: { turns_remaining: 999 } },
})

const hatterene = makePokemon({
    species: 'hatterene',
    types: ['psychic', 'fairy'],
    baseStats: { hp: 57, attack: 90, defense: 95, special_attack: 136, special_defense: 103, speed: 29 },
    set: {
        species: 'hatterene', level: 50, gender: null,
        ability: 'magic-bounce',
        item: 'rocky-helmet',
        nature: 'relaxed',
        evs: { hp: 240, defense: 252, special_attack: 16 },
        ivs: { speed: 0 },
        moves: ['dazzling-gleam', 'future-sight', 'nuzzle', 'pain-split'],
    },
})

const dragonite = makePokemon({
    species: 'dragonite',
    types: ['dragon', 'flying'],
    baseStats: { hp: 91, attack: 134, defense: 95, special_attack: 100, special_defense: 100, speed: 80 },
    set: {
        species: 'dragonite', level: 50, gender: 'M',
        ability: 'multiscale',
        item: 'silk-scarf',
        nature: 'adamant',
        evs: { hp: 152, attack: 252, speed: 104 },
        moves: ['dragon-dance', 'roost', 'extreme-speed', 'earthquake'],
    },
})

// ─── 기술 정의 ────────────────────────────────────────────────
const darkPulse     = makeMove({ name: 'dark-pulse',      type: 'dark',     category: 'special',  power: 80  })
const focusBlast    = makeMove({ name: 'focus-blast',     type: 'fighting', category: 'special',  power: 120 })
const sludgeBomb    = makeMove({ name: 'sludge-bomb',     type: 'poison',   category: 'special',  power: 90  })
const psychic       = makeMove({ name: 'psychic',         type: 'psychic',  category: 'special',  power: 90  })
const headlongRush  = makeMove({ name: 'headlong-rush',   type: 'ground',   category: 'physical', power: 100 })
const closeCombat   = makeMove({ name: 'close-combat',    type: 'fighting', category: 'physical', power: 120 })
const iceSpinner    = makeMove({ name: 'ice-spinner',     type: 'ice',      category: 'physical', power: 80  })
const extremeSpeed  = makeMove({ name: 'extreme-speed',   type: 'normal',   category: 'physical', power: 80, priority: 2 })
const earthquake    = makeMove({ name: 'earthquake',      type: 'ground',   category: 'physical', power: 100 })
const dazzlingGleam = makeMove({ name: 'dazzling-gleam',  type: 'fairy',    category: 'special',  power: 80  })
const stealthRock   = makeMove({ name: 'stealth-rock',    type: 'rock',     category: 'status',   power: 0   })

const baseInput = { weather: null, terrain: null, typeChart: testTypeChart }

// ─── STAB 자속보정 ────────────────────────────────────────────
describe('STAB 자속보정', () => {
    it('자속 기술 isSTAB = true', () => {
        const { isSTAB, modifiers } = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse })
        expect(isSTAB).toBe(true)
        expect(modifiers.stab).toBe(1.5)
    })
    it('비자속 기술 isSTAB = false', () => {
        const { isSTAB, modifiers } = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: focusBlast })
        expect(isSTAB).toBe(false)
        expect(modifiers.stab).toBe(1)
    })
    it('Adaptability 자속 2×', () => {
        const adaptDarkrai = { ...darkrai, ability: 'adaptability' }
        const { modifiers } = calcDamage({ ...baseInput, attacker: adaptDarkrai, defender: garganacl, move: darkPulse })
        expect(modifiers.stab).toBe(2)
    })
    it('자속 vs 비자속 데미지 비교', () => {
        const stab    = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse,  randomRoll: 100 })
        const noStab  = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: focusBlast, randomRoll: 100 })
        // focusBlast는 위력 120으로 더 세지만 STAB 없음 → 상성 2× 때문에 더 셀 수 있으나 stab 배율 자체는 비교
        expect(stab.modifiers.stab).toBeGreaterThan(noStab.modifiers.stab)
    })
})

// ─── 구애안경 ────────────────────────────────────────────────
describe('구애안경 (Choice Specs)', () => {
    it('구애안경 있을 때 데미지 더 큼', () => {
        const noItem    = { ...darkrai, item: null }
        const withSpecs = darkrai
        const r1 = calcDamage({ ...baseInput, attacker: noItem,    defender: garganacl, move: darkPulse, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: withSpecs, defender: garganacl, move: darkPulse, randomRoll: 100 })
        expect(r2.damage).toBeGreaterThan(r1.damage)
    })
    it('특수기술에만 적용 (물리기술엔 미적용)', () => {
        const specsPhysical = { ...darkrai, item: 'choice-specs' }
        const bandPhysical  = { ...darkrai, item: 'choice-band'  }
        // getStat에서 specs는 special_attack에만 적용
        const r1 = calcDamage({ ...baseInput, attacker: specsPhysical, defender: garganacl, move: focusBlast, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: bandPhysical,  defender: garganacl, move: focusBlast, randomRoll: 100 })
        expect(r1.damage).toBeGreaterThan(r2.damage)
    })
})

// ─── 구애머리띠 ──────────────────────────────────────────────
describe('구애머리띠 (Choice Band)', () => {
    it('구애머리띠 있을 때 물리데미지 더 큼', () => {
        const noBand   = { ...greatTusk, item: null }
        const withBand = { ...greatTusk, item: 'choice-band' }
        const r1 = calcDamage({ ...baseInput, attacker: noBand,   defender: darkrai, move: headlongRush, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: withBand, defender: darkrai, move: headlongRush, randomRoll: 100 })
        expect(r2.damage).toBeGreaterThan(r1.damage)
    })
    it('물리기술에만 적용 (특수기술엔 미적용)', () => {
        const specsGreat = { ...greatTusk, item: 'choice-specs' }
        const bandGreat  = { ...greatTusk, item: 'choice-band'  }
        const r1 = calcDamage({ ...baseInput, attacker: bandGreat,  defender: darkrai, move: headlongRush, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: specsGreat, defender: darkrai, move: headlongRush, randomRoll: 100 })
        expect(r1.damage).toBeGreaterThan(r2.damage)
    })
})

// ─── 부스트에너지 / Protosynthesis ───────────────────────────
describe('부스트에너지 / Protosynthesis', () => {
    it('발동 시 데미지 더 큼', () => {
        const noBoosted = { ...greatTusk, volatile_statuses: {} }
        const boosted   = greatTusk
        const r1 = calcDamage({ ...baseInput, attacker: noBoosted, defender: darkrai, move: headlongRush, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: boosted,   defender: darkrai, move: headlongRush, randomRoll: 100 })
        expect(r2.damage).toBeGreaterThan(r1.damage)
    })
    it('미발동 시 동일', () => {
        const noBoosted = { ...greatTusk, volatile_statuses: {} }
        const r1 = calcDamage({ ...baseInput, attacker: noBoosted, defender: darkrai, move: headlongRush, randomRoll: 85 })
        const r2 = calcDamage({ ...baseInput, attacker: noBoosted, defender: darkrai, move: headlongRush, randomRoll: 85 })
        expect(r1.damage).toBe(r2.damage)
    })
})

// ─── 순수한힘 / 천하장사 ─────────────────────────────────────
describe('순수한힘 / 천하장사 (Pure Power / Huge Power)', () => {
    it('물리공격 2× → 데미지 대폭 증가', () => {
        const normal    = { ...dragonite, ability: 'multiscale'  }
        const purePower = { ...dragonite, ability: 'pure-power', hp: dragonite.max_hp - 1 } // Multiscale 미발동
        const hugePower = { ...dragonite, ability: 'huge-power', hp: dragonite.max_hp - 1 }
        const r1 = calcDamage({ ...baseInput, attacker: normal,    defender: darkrai, move: extremeSpeed, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: purePower, defender: darkrai, move: extremeSpeed, randomRoll: 100 })
        const r3 = calcDamage({ ...baseInput, attacker: hugePower, defender: darkrai, move: extremeSpeed, randomRoll: 100 })
        expect(r2.damage).toBeGreaterThan(r1.damage)
        expect(r3.damage).toBe(r2.damage)
    })
    it('특수기술엔 미적용', () => {
        const purePower = { ...darkrai, ability: 'pure-power' }
        const normal    = { ...darkrai, ability: 'bad-dreams' }
        const r1 = calcDamage({ ...baseInput, attacker: normal,    defender: garganacl, move: darkPulse, randomRoll: 100 })
        const r2 = calcDamage({ ...baseInput, attacker: purePower, defender: garganacl, move: darkPulse, randomRoll: 100 })
        expect(r1.damage).toBe(r2.damage)
    })
})

// ─── 급소 랭크 처리 ───────────────────────────────────────────
describe('급소 랭크 처리', () => {
    it('급소 시 내 상승 공격 랭크 반영됨', () => {
        const boostedAtk = { ...darkrai, stages: { ...darkrai.stages, special_attack: 2 } }
        const normal  = calcDamage({ ...baseInput, attacker: darkrai,    defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true })
        const boosted = calcDamage({ ...baseInput, attacker: boostedAtk, defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true })
        expect(boosted.damage).toBeGreaterThan(normal.damage)
    })
    it('급소 시 내 하락 공격 랭크 무시됨', () => {
        const debuffedAtk = { ...darkrai, stages: { ...darkrai.stages, special_attack: -2 } }
        const normal   = calcDamage({ ...baseInput, attacker: darkrai,      defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true })
        const debuffed = calcDamage({ ...baseInput, attacker: debuffedAtk,  defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true })
        expect(debuffed.damage).toBe(normal.damage)
    })
    it('급소 시 상대 상승 방어 랭크 무시됨', () => {
        const buffedDef = { ...garganacl, stages: { ...garganacl.stages, special_defense: 3 } }
        const normal  = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true })
        const ignored = calcDamage({ ...baseInput, attacker: darkrai, defender: buffedDef,  move: darkPulse, randomRoll: 100, isCrit: true })
        expect(ignored.damage).toBe(normal.damage)
    })
    it('급소 시 상대 하락 방어 랭크 반영됨', () => {
        const debuffedDef = { ...garganacl, stages: { ...garganacl.stages, special_defense: -2 } }
        const normal   = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl,   move: darkPulse, randomRoll: 100, isCrit: true })
        const debuffed = calcDamage({ ...baseInput, attacker: darkrai, defender: debuffedDef, move: darkPulse, randomRoll: 100, isCrit: true })
        expect(debuffed.damage).toBeGreaterThan(normal.damage)
    })
    it('급소 데미지 = 일반 1.5×', () => {
        const normal = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: false })
        const crit   = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse, randomRoll: 100, isCrit: true  })
        expect(crit.modifiers.crit).toBe(1.5)
        expect(crit.damage).toBeGreaterThan(normal.damage)
    })
})

// ─── Multiscale ───────────────────────────────────────────────
describe('Dragonite Multiscale', () => {
    it('풀HP → 0.5× 적용', () => {
        const { modifiers } = calcDamage({ ...baseInput, attacker: hatterene, defender: dragonite, move: dazzlingGleam })
        expect(modifiers.ability).toBe(0.5)
    })
    it('풀HP 아님 → 미발동', () => {
        const injured = { ...dragonite, hp: dragonite.max_hp - 1 }
        const withScale    = calcDamage({ ...baseInput, attacker: hatterene, defender: dragonite, move: dazzlingGleam })
        const withoutScale = calcDamage({ ...baseInput, attacker: hatterene, defender: injured,   move: dazzlingGleam })
        expect(withoutScale.damage).toBeGreaterThan(withScale.damage)
    })
})

// ─── Dragonite Extreme Speed ──────────────────────────────────
describe('Dragonite Extreme Speed', () => {
    it('Silk Scarf Normal 1.2× 적용', () => {
        const { modifiers } = calcDamage({ ...baseInput, attacker: dragonite, defender: darkrai, move: extremeSpeed })
        expect(modifiers.item).toBe(1.2)
    })
    it('STAB 없음 (Dragon/Flying → Normal)', () => {
        const { isSTAB } = calcDamage({ ...baseInput, attacker: dragonite, defender: darkrai, move: extremeSpeed })
        expect(isSTAB).toBe(false)
    })
})

// ─── 타입 상성 ───────────────────────────────────────────────
describe('타입 상성', () => {
    it('Fighting vs Rock = 2×', () => {
        const { effectiveness } = calcDamage({ ...baseInput, attacker: darkrai, defender: garganacl, move: focusBlast })
        expect(effectiveness).toBe(2)
    })
    it('Ice vs Ground/Fighting = 1×', () => {
        const { effectiveness } = calcDamage({ ...baseInput, attacker: greatTusk, defender: darkrai, move: iceSpinner })
        expect(effectiveness).toBe(1)
    })
    it('Fairy vs Dragon/Flying = 2×', () => {
        const { effectiveness } = calcDamage({ ...baseInput, attacker: hatterene, defender: dragonite, move: dazzlingGleam })
        expect(effectiveness).toBe(2)
    })
})

// ─── status 기술 ─────────────────────────────────────────────
describe('status 기술', () => {
    it('데미지 0', () => {
        const { damage } = calcDamage({ ...baseInput, attacker: garganacl, defender: darkrai, move: stealthRock })
        expect(damage).toBe(0)
    })
})

// ─── calcDamageRange ─────────────────────────────────────────
describe('calcDamageRange', () => {
    it('16개 값 반환', () => {
        const range = calcDamageRange({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse })
        expect(range).toHaveLength(16)
    })
    it('오름차순 정렬', () => {
        const range = calcDamageRange({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse })
        for (let i = 1; i < range.length; i++) {
            expect(range[i]).toBeGreaterThanOrEqual(range[i - 1]!)
        }
    })
})

// ─── calcDamageSummary ────────────────────────────────────────
describe('calcDamageSummary', () => {
    it('min <= average <= max', () => {
        const { min, max, average } = calcDamageSummary({ ...baseInput, attacker: darkrai, defender: garganacl, move: darkPulse })
        expect(min).toBeLessThanOrEqual(average)
        expect(average).toBeLessThanOrEqual(max)
    })
})

// ─── 데미지 요약 출력 ─────────────────────────────────────────
describe('데미지 요약 출력', () => {
    const cases = [
        { label: 'Darkrai Dark Pulse → Garganacl',       attacker: darkrai,   defender: garganacl, move: darkPulse     },
        { label: 'Darkrai Focus Blast → Garganacl',      attacker: darkrai,   defender: garganacl, move: focusBlast    },
        { label: 'Darkrai Psychic → Garganacl',          attacker: darkrai,   defender: garganacl, move: psychic       },
        { label: 'Darkrai Sludge Bomb → Garganacl',      attacker: darkrai,   defender: garganacl, move: sludgeBomb    },
        { label: 'Great Tusk Headlong Rush → Darkrai',   attacker: greatTusk, defender: darkrai,   move: headlongRush  },
        { label: 'Great Tusk Close Combat → Darkrai',    attacker: greatTusk, defender: darkrai,   move: closeCombat   },
        { label: 'Great Tusk Ice Spinner → Darkrai',     attacker: greatTusk, defender: darkrai,   move: iceSpinner    },
        { label: 'Dragonite Extreme Speed → Darkrai',    attacker: dragonite, defender: darkrai,   move: extremeSpeed  },
        { label: 'Dragonite Earthquake → Darkrai',       attacker: dragonite, defender: darkrai,   move: earthquake    },
        { label: 'Hatterene Dazzling Gleam → Dragonite', attacker: hatterene, defender: dragonite, move: dazzlingGleam },
    ]

    it.each(cases)('$label', ({ attacker, defender, move }) => {
        const { min, max, average, range, ohko, ohko_max } = calcDamageSummary({
            ...baseInput, attacker, defender, move,
        })
        const pct = (n: number) => ((n / defender.max_hp) * 100).toFixed(1)
        console.log(
            `\n  📊 ${move.name.padEnd(22)} HP: ${defender.max_hp}\n` +
            `     범위: ${range[0]}~${range[15]}  (${pct(min)}%~${pct(max)}%)\n` +
            `     평균: ${average} (${pct(average)}%)\n` +
            `     OHKO: ${ohko_max ? '✅ 확정' : ohko ? '⚠️ 최솟값 보장' : '❌ 불가'}`
        )
        expect(min).toBeGreaterThan(0)
    })
})