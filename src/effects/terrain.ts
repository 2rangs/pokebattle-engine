import type { BattlePokemon } from '../types/pokemon'
import type { Terrain, DurationEffect } from '../types/effect'

export const TERRAIN_TURNS = 5
export const TERRAIN_TURNS_EXTENDED = 8  // 지형연장 아이템

// ─── 지면 접지 여부 ───────────────────────────────────────────
export function isGrounded(pokemon: BattlePokemon): boolean {
    const types = pokemon.types as string[]
    const { ability, item } = pokemon

    if (types.includes('flying'))    return false
    if (ability === 'levitate')      return false
    if (item === 'air-balloon')      return false
    if ('magnet_rise' in pokemon.volatile_statuses) return false
    if ('telekinesis' in pokemon.volatile_statuses) return false

    // 중력 상태는 BattleField에서 처리
    return true
}

// ─── 필드 유발 특성 ───────────────────────────────────────────
export const TERRAIN_ABILITY_MAP: Record<string, NonNullable<Terrain>> = {
    'electric-surge': 'electric',
    'grassy-surge':   'grassy',
    'misty-surge':    'misty',
    'psychic-surge':  'psychic',
}

export function getTerrainFromAbility(ability: string): Terrain | null {
    return TERRAIN_ABILITY_MAP[ability] ?? null
}

// ─── 필드 종료 체크 ───────────────────────────────────────────
export function tickTerrain(duration: DurationEffect): DurationEffect | null {
    const next = duration.turns_remaining - 1
    return next <= 0 ? null : { ...duration, turns_remaining: next }
}

// ─── 그래스필드 턴 종료 회복 ─────────────────────────────────
export function calcGrassyTerrainHeal(pokemon: BattlePokemon, terrain: Terrain): number {
    if (terrain !== 'grassy') return 0
    if (!isGrounded(pokemon)) return 0
    return Math.floor(pokemon.max_hp / 16)
}

// ─── 미스트필드 상태이상 면역 ────────────────────────────────
export function isMistyTerrainImmune(pokemon: BattlePokemon, terrain: Terrain): boolean {
    if (terrain !== 'misty') return false
    return isGrounded(pokemon)
}

// ─── 사이코필드 우선도 차단 ───────────────────────────────────
export function isPsychicTerrainBlocked(
    target:    BattlePokemon,
    terrain:   Terrain,
    priority:  number,
): boolean {
    if (terrain !== 'psychic') return false
    if (priority <= 0)         return false
    return isGrounded(target)
}

// ─── 일렉트릭필드 마비 면역 ──────────────────────────────────
export function isElectricTerrainParalyzeImmune(pokemon: BattlePokemon, terrain: Terrain): boolean {
    if (terrain !== 'electric') return false
    return isGrounded(pokemon)
}

// ─── 필드 데미지 보정 (damage.ts 보완) ───────────────────────
export function getTerrainDamageMod(
    moveType:   string,
    terrain:    Terrain,
    attacker:   BattlePokemon,
    defender:   BattlePokemon,
): number {
    const atkGrounded = isGrounded(attacker)
    const defGrounded = isGrounded(defender)

    if (terrain === 'electric' && moveType === 'electric' && atkGrounded) return 1.3
    if (terrain === 'grassy'   && moveType === 'grass'    && atkGrounded) return 1.3
    if (terrain === 'psychic'  && moveType === 'psychic'  && atkGrounded) return 1.3
    if (terrain === 'misty'    && moveType === 'dragon'   && defGrounded) return 0.5

    // 그래스필드: 지진/매그니튜드/땅고르기 0.5×
    if (terrain === 'grassy' && ['earthquake', 'magnitude', 'bulldoze'].includes(moveType)) return 0.5

    return 1
}