import type { BattlePokemon } from '../types/pokemon'
import type { VolatileStatus, DurationEffect } from '../types/effect'

// ─── 혼란 행동 불능 체크 (33%) ───────────────────────────────
export function isConfused(pokemon: BattlePokemon, rng: () => number): boolean {
    return 'confusion' in pokemon.volatile_statuses && rng() < 0.33
}

// ─── 혼란 자해 데미지 ─────────────────────────────────────────
// Gen 7+: 위력 40 물리기술 (타입 없음, 방어로 계산)
export function calcConfusionDamage(pokemon: BattlePokemon): number {
    const atk = pokemon.stats.attack
    const def = pokemon.stats.defense
    return Math.max(1, Math.floor(
        Math.floor(Math.floor(2 * pokemon.level / 5 + 2) * 40 * atk / def) / 50 + 2
    ))
}

// ─── 씨뿌리기 턴 종료 흡수 ───────────────────────────────────
export function calcLeechSeedDamage(pokemon: BattlePokemon): number {
    if (!('seeded' in pokemon.volatile_statuses)) return 0
    // Liquid Ooze: 대신 데미지
    return Math.floor(pokemon.max_hp / 8)
}

// ─── 대타출동 데미지 처리 ─────────────────────────────────────
export interface SubstituteResult {
    absorbed:       number   // 대타가 받은 데미지
    remaining:      number   // 대타 남은 HP
    subBroken:      boolean  // 대타 파괴 여부
    overflowDamage: number   // 대타 파괴 후 남은 데미지 (Gen 5 이전만, Gen 6+는 0)
}

export function applySubstituteDamage(
    substituteHp: number,
    damage:       number,
): SubstituteResult {
    const absorbed  = Math.min(substituteHp, damage)
    const remaining = substituteHp - absorbed
    return {
        absorbed,
        remaining,
        subBroken:      remaining <= 0,
        overflowDamage: 0,  // Gen 6+: 대타 파괴 시 오버플로우 없음
    }
}

// ─── 대타 HP 계산 (HP 1/4) ────────────────────────────────────
export function calcSubstituteHp(pokemon: BattlePokemon): number {
    return Math.floor(pokemon.max_hp / 4)
}

// ─── 휘발성 상태 tick (턴 감소) ──────────────────────────────
export function tickVolatile(
    volatile: VolatileStatus,
    effect:   DurationEffect,
): DurationEffect | null {
    if (effect.turns_remaining === Infinity) return effect
    const next = effect.turns_remaining - 1
    return next <= 0 ? null : { ...effect, turns_remaining: next }
}

// ─── 혼란 턴 수 결정 (2~5턴) ────────────────────────────────
export function rollConfusionTurns(rng: () => number): number {
    return Math.floor(rng() * 4) + 2
}

// ─── 도발 유효 여부 ───────────────────────────────────────────
export function isTaunted(pokemon: BattlePokemon): boolean {
    return 'taunt' in pokemon.volatile_statuses
}

// ─── 앙코르 유효 여부 ─────────────────────────────────────────
export function isEncored(pokemon: BattlePokemon): boolean {
    return 'encore' in pokemon.volatile_statuses
}

// ─── 기합모으기 체크 (급소율 +2) ─────────────────────────────
export function hasFocusEnergy(pokemon: BattlePokemon): boolean {
    return 'focus_energy' in pokemon.volatile_statuses
}

// ─── 급소율 계산 ──────────────────────────────────────────────
// Gen 6+: 0=1/24, 1=1/8, 2=1/2, 3+=확정
export function calcCritRate(
    baseCritStage: number,
    focusEnergy:   boolean,
    highCritMove:  boolean,  // 연속자르기 등 +1
): number {
    let stage = baseCritStage
    if (focusEnergy) stage += 2
    if (highCritMove) stage += 1
    return Math.min(stage, 3)
}

export function rollCrit(stage: number, rng: () => number): boolean {
    if (stage >= 3) return true
    const thresholds = [1/24, 1/8, 1/2]
    return rng() < (thresholds[stage] ?? 1/24)
}

// ─── 헤롱헤롱 행동 불능 (50%) ────────────────────────────────
export function isInfatuated(pokemon: BattlePokemon, rng: () => number): boolean {
    return 'infatuation' in pokemon.volatile_statuses && rng() < 0.5
}

// ─── 풀죽음 체크 ─────────────────────────────────────────────
export function isFlinched(pokemon: BattlePokemon): boolean {
    return 'flinch' in pokemon.volatile_statuses
}

// ─── 감기기 턴 종료 데미지 ───────────────────────────────────
export function calcBindDamage(pokemon: BattlePokemon): number {
    if (!('bound' in pokemon.volatile_statuses)) return 0
    // Binding Band: 1/6, 없으면 1/8
    const divisor = pokemon.item === 'binding-band' ? 6 : 8
    return Math.floor(pokemon.max_hp / divisor)
}

// ─── 저주 턴 종료 데미지 ─────────────────────────────────────
export function calcCurseDamage(pokemon: BattlePokemon): number {
    if (!('curse' in pokemon.volatile_statuses)) return 0
    return Math.floor(pokemon.max_hp / 4)
}

// ─── 아쿠아링 회복 ───────────────────────────────────────────
export function calcAquaRingHeal(pokemon: BattlePokemon): number {
    if (!('aqua_ring' in pokemon.volatile_statuses)) return 0
    // Big Root: 1.3×
    const mult = pokemon.item === 'big-root' ? 1.3 : 1
    return Math.floor(pokemon.max_hp / 16 * mult)
}

// ─── 뿌리박기 회복 ───────────────────────────────────────────
export function calcIngrainHeal(pokemon: BattlePokemon): number {
    if (!('ingrain' in pokemon.volatile_statuses)) return 0
    const mult = pokemon.item === 'big-root' ? 1.3 : 1
    return Math.floor(pokemon.max_hp / 16 * mult)
}