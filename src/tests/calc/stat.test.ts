import { describe, it, expect } from 'vitest'
import { calcHP, calcBaseStat, calcAllStats, applyStage, applyStages, applyStageChange, getNatureMultiplier, createInitialStages } from '../../calc/stat'

// ─── calcHP ───────────────────────────────────────────────────
describe('calcHP', () => {
    it('Garganacl 252HP lv50', () => expect(calcHP(100, 50, 31, 252)).toBe(207))
    it('Darkrai 0HP lv50',     () => expect(calcHP(70,  50, 31, 0  )).toBe(145))
    it('Great Tusk 0HP lv50',  () => expect(calcHP(115, 50, 31, 0  )).toBe(190))
    it('Hatterene 240HP lv50', () => expect(calcHP(57,  50, 31, 240)).toBe(162))
    it('Tornadus-T 184HP lv50',() => expect(calcHP(79,  50, 31, 184)).toBe(177))
    it('Dragonite 152HP lv50', () => expect(calcHP(91,  50, 31, 152)).toBe(185))
})

// ─── getNatureMultiplier ───────────────────────────────────────
describe('getNatureMultiplier', () => {
    // Careful: +SpD -SpA
    it('Careful +SpD', () => expect(getNatureMultiplier('careful', 'special_defense')).toBe(1.1))
    it('Careful -SpA', () => expect(getNatureMultiplier('careful', 'special_attack' )).toBe(0.9))
    it('Careful  Atk', () => expect(getNatureMultiplier('careful', 'attack'         )).toBe(1))
    // Timid: +Spe -Atk
    it('Timid   +Spe', () => expect(getNatureMultiplier('timid', 'speed' )).toBe(1.1))
    it('Timid   -Atk', () => expect(getNatureMultiplier('timid', 'attack')).toBe(0.9))
    it('Timid    SpA', () => expect(getNatureMultiplier('timid', 'special_attack')).toBe(1))
    // Jolly: +Spe -SpA
    it('Jolly   +Spe', () => expect(getNatureMultiplier('jolly', 'speed'         )).toBe(1.1))
    it('Jolly   -SpA', () => expect(getNatureMultiplier('jolly', 'special_attack' )).toBe(0.9))
    it('Jolly    Atk', () => expect(getNatureMultiplier('jolly', 'attack'         )).toBe(1))
    // Relaxed: +Def -Spe
    it('Relaxed +Def', () => expect(getNatureMultiplier('relaxed', 'defense')).toBe(1.1))
    it('Relaxed -Spe', () => expect(getNatureMultiplier('relaxed', 'speed'  )).toBe(0.9))
    // Adamant: +Atk -SpA
    it('Adamant +Atk', () => expect(getNatureMultiplier('adamant', 'attack'        )).toBe(1.1))
    it('Adamant -SpA', () => expect(getNatureMultiplier('adamant', 'special_attack')).toBe(0.9))
    // 무보정
    it('Hardy neutral', () => expect(getNatureMultiplier('hardy', 'attack')).toBe(1))
})

// ─── calcAllStats (전 포켓몬 전 스탯) ─────────────────────────
describe('calcAllStats - Garganacl', () => {
    // base: 100/100/130/45/90/63  EVs: 252HP/16Def/216SpD/24Spe  Careful(+SpD-SpA)
    const base = { hp: 100, attack: 100, defense: 130, special_attack: 45, special_defense: 90, speed: 63 }
    const evs  = { hp: 252, defense: 16, special_defense: 216, speed: 24 }
    const s = calcAllStats(base, 50, 'careful', evs)

    it('HP',  () => expect(s.hp             ).toBe(207)) // 147+60
    it('Atk', () => expect(s.attack         ).toBe(120)) // 115+5 ×1.0
    it('Def', () => expect(s.defense        ).toBe(152)) // 147+5 ×1.0
    it('SpA', () => expect(s.special_attack ).toBe(58 )) // 60+5  ×0.9
    it('SpD', () => expect(s.special_defense).toBe(150)) // 132+5 ×1.1
    it('Spe', () => expect(s.speed          ).toBe(86 )) // 81+5  ×1.0
})

describe('calcAllStats - Darkrai', () => {
    // base: 70/90/90/135/90/125  EVs: 252SpA/4SpD/252Spe  IVs: 0Atk  Timid(+Spe-Atk)
    const base = { hp: 70, attack: 90, defense: 90, special_attack: 135, special_defense: 90, speed: 125 }
    const evs  = {special_attack: 252, special_defense: 4, speed: 252 }
    const ivs  = {hp: 0, attack: 0, defense: 31, special_attack: 31, special_defense: 31, speed: 31 }
    const s = calcAllStats(base, 50, 'timid', evs, ivs)

    it('HP',  () => expect(s.hp             ).toBe(130)) // 85+60
    it('Atk', () => expect(s.attack         ).toBe(85 )) // 90+5  ×0.9  (0IV)
    it('Def', () => expect(s.defense        ).toBe(110)) // 105+5 ×1.0
    it('SpA', () => expect(s.special_attack ).toBe(187)) // 182+5 ×1.0
    it('SpD', () => expect(s.special_defense).toBe(111)) // 106+5 ×1.0
    it('Spe', () => expect(s.speed          ).toBe(194)) // 172+5 ×1.1
})

describe('calcAllStats - Great Tusk', () => {
    // base: 115/131/131/53/53/87  EVs: 252Atk/4Def/252Spe  Jolly(+Spe-SpA)
    const base = { hp: 115, attack: 131, defense: 131, special_attack: 53, special_defense: 53, speed: 87 }
    const evs  = { attack: 252, defense: 4, speed: 252 }
    const s = calcAllStats(base, 50, 'jolly', evs)

    it('HP',  () => expect(s.hp             ).toBe(190)) // 130+60
    it('Atk', () => expect(s.attack         ).toBe(183)) // 178+5 ×1.0
    it('Def', () => expect(s.defense        ).toBe(152)) // 147+5 ×1.0
    it('SpA', () => expect(s.special_attack ).toBe(65 )) // 68+5  ×0.9
    it('SpD', () => expect(s.special_defense).toBe(73 )) // 68+5  ×1.0
    it('Spe', () => expect(s.speed          ).toBe(152)) // 134+5 ×1.1
})

describe('calcAllStats - Hatterene', () => {
    // base: 57/90/95/136/103/29  EVs: 240HP/252Def/16SpA  IVs: 0Spe  Relaxed(+Def-Spe)
    const base = { hp: 57, attack: 90, defense: 95, special_attack: 136, special_defense: 103, speed: 29 }
    const evs  = { hp: 240, defense: 252, special_attack: 16 }
    const ivs  = { speed: 0 }
    const s = calcAllStats(base, 50, 'relaxed', evs, ivs)

    it('HP',  () => expect(s.hp             ).toBe(162)) // 102+60
    it('Atk', () => expect(s.attack         ).toBe(110)) // 105+5 ×1.0
    it('Def', () => expect(s.defense        ).toBe(161)) // 142+5 ×1.1
    it('SpA', () => expect(s.special_attack ).toBe(158)) // 153+5 ×1.0
    it('SpD', () => expect(s.special_defense).toBe(123)) // 118+5 ×1.0
    it('Spe', () => expect(s.speed          ).toBe(30 )) // 29+5  ×0.9  (0IV)
})

describe('calcAllStats - Tornadus-Therian', () => {
    // base: 79/100/80/110/90/121  EVs: 184HP/16Def/68SpD/240Spe  Timid(+Spe-Atk)
    const base = { hp: 79, attack: 100, defense: 80, special_attack: 110, special_defense: 90, speed: 121 }
    const evs  = { hp: 184, defense: 16, special_defense: 68, speed: 240 }
    const s = calcAllStats(base, 50, 'timid', evs)

    it('HP',  () => expect(s.hp             ).toBe(177)) // 117+60
    it('Atk', () => expect(s.attack         ).toBe(108)) // 120   ×0.9
    it('Def', () => expect(s.defense        ).toBe(102)) // 97+5  ×1.0
    it('SpA', () => expect(s.special_attack ).toBe(130)) // 125+5 ×1.0
    it('SpD', () => expect(s.special_defense).toBe(119)) // 114+5 ×1.0
    it('Spe', () => expect(s.speed          ).toBe(188)) // 166+5 ×1.1
})

describe('calcAllStats - Dragonite', () => {
    // base: 91/134/95/100/100/80  EVs: 152HP/252Atk/104Spe  Adamant(+Atk-SpA)
    const base = { hp: 91, attack: 134, defense: 95, special_attack: 100, special_defense: 100, speed: 80 }
    const evs  = { hp: 152, attack: 252, speed: 104 }
    const s = calcAllStats(base, 50, 'adamant', evs)

    it('HP',  () => expect(s.hp             ).toBe(185)) // 125+60
    it('Atk', () => expect(s.attack         ).toBe(204)) // 181+5 ×1.1
    it('Def', () => expect(s.defense        ).toBe(115)) // 110+5 ×1.0
    it('SpA', () => expect(s.special_attack ).toBe(108)) // 120   ×0.9
    it('SpD', () => expect(s.special_defense).toBe(120)) // 115+5 ×1.0
    it('Spe', () => expect(s.speed          ).toBe(113)) // 108+5 ×1.0
})

// ─── applyStage ───────────────────────────────────────────────
describe('applyStage', () => {
    it('+1 → ×1.5', () => expect(applyStage(100, 1)).toBe(150))
    it('+2 → ×2.0', () => expect(applyStage(100, 2)).toBe(200))
    it('+6 → ×4.0', () => expect(applyStage(100, 6)).toBe(400))
    it('-1 → ×0.66',() => expect(applyStage(100, -1)).toBe(66))
    it('-6 → ×0.25',() => expect(applyStage(100, -6)).toBe(25))
    it('+99 clamp', () => expect(applyStage(100, 99)).toBe(applyStage(100, 6)))
    it('-99 clamp', () => expect(applyStage(100, -99)).toBe(applyStage(100, -6)))
})

// ─── applyStages ──────────────────────────────────────────────
describe('applyStages', () => {
    it('Dragon Dance +1Atk +1Spe', () => {
        const stats  = { hp: 185, attack: 204, defense: 115, special_attack: 108, special_defense: 120, speed: 113 }
        const stages = { ...createInitialStages(), attack: 1, speed: 1 }
        const result = applyStages(stats, stages)
        expect(result.hp             ).toBe(185) // HP 불변
        expect(result.attack         ).toBe(306) // 204 × 3/2
        expect(result.speed          ).toBe(169) // 113 × 3/2
        expect(result.defense        ).toBe(115) // 미변화
        expect(result.special_attack ).toBe(108) // 미변화
        expect(result.special_defense).toBe(120) // 미변화
    })
    it('Swords Dance +2Atk', () => {
        const stats  = { hp: 190, attack: 183, defense: 152, special_attack: 65, special_defense: 73, speed: 152 }
        const stages = { ...createInitialStages(), attack: 2 }
        expect(applyStages(stats, stages).attack).toBe(366) // 183 × 2
    })
})

// ─── applyStageChange ─────────────────────────────────────────
describe('applyStageChange', () => {
    it('+2 정상 적용', () => {
        const { stages, actual } = applyStageChange(createInitialStages(), 'attack', 2)
        expect(stages.attack).toBe(2)
        expect(actual).toBe(2)
    })
    it('+6 clamp → actual 0', () => {
        const { actual } = applyStageChange({ ...createInitialStages(), attack: 6 }, 'attack', 1)
        expect(actual).toBe(0)
    })
    it('-6 clamp → actual 0', () => {
        const { actual } = applyStageChange({ ...createInitialStages(), defense: -6 }, 'defense', -1)
        expect(actual).toBe(0)
    })
    it('+5에서 +2 → actual 1 (clamp)', () => {
        const { stages, actual } = applyStageChange({ ...createInitialStages(), attack: 5 }, 'attack', 2)
        expect(stages.attack).toBe(6)
        expect(actual).toBe(1)
    })
})