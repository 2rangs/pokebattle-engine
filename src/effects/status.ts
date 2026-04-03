import type { BattlePokemon } from '../types/pokemon'
import type { PrimaryStatus } from '../types/effect'
import type { Weather, Terrain } from '../types/effect'
import { isGrounded } from './terrain'  // ← require 제거, import로
// ─── 상태이상 적용 가능 여부 ──────────────────────────────────
export interface StatusCheckResult {
    canApply: boolean
    reason?:  string
}

export function canApplyStatus(
    target:  BattlePokemon,
    status:  PrimaryStatus,
    terrain: Terrain,
    weather: Weather,
): StatusCheckResult {
    if (!status) return { canApply: false, reason: 'no status' }
    if (target.fainted) return { canApply: false, reason: 'fainted' }  // ← 이 줄
    // 이미 상태이상
    if (target.status !== null) {
        return { canApply: false, reason: 'already has status' }
    }

    const types   = target.types as string[]
    const ability = target.ability

    // 미스트필드
    if (terrain === 'misty') {
        if (isGrounded(target)) return { canApply: false, reason: 'misty terrain' }
    }

    // 신비의베일 특성
    if (ability === 'safeguard') return { canApply: false, reason: 'safeguard' }

    switch (status) {
        case 'burn':
            if (types.includes('fire'))                         return { canApply: false, reason: 'fire type immune' }
            if (['water-veil', 'water-bubble', 'purifying-salt'].includes(ability))
                return { canApply: false, reason: `${ability} immune` }
            if (weather === 'heavy_rain')                       return { canApply: false, reason: 'heavy rain' }
            break

        case 'freeze':
            if (types.includes('ice'))                          return { canApply: false, reason: 'ice type immune' }
            if (ability === 'magma-armor')                      return { canApply: false, reason: 'magma armor immune' }
            if (weather === 'harsh_sun' || weather === 'sun')   return { canApply: false, reason: 'sunny weather' }
            break

        case 'paralysis':
            if (types.includes('electric'))                     return { canApply: false, reason: 'electric type immune' }
            if (ability === 'limber')                           return { canApply: false, reason: 'limber immune' }
            if (terrain === 'electric')                         return { canApply: false, reason: 'electric terrain' }
            break

        case 'poison':
        case 'toxic':
            if (types.includes('poison') || types.includes('steel'))
                return { canApply: false, reason: 'poison/steel immune' }
            if (['immunity', 'pastel-veil', 'purifying-salt'].includes(ability))
                return { canApply: false, reason: `${ability} immune` }
            break

        case 'sleep':
            if (ability === 'insomnia' || ability === 'vital-spirit')
                return { canApply: false, reason: `${ability} immune` }
            if (terrain === 'electric')                         return { canApply: false, reason: 'electric terrain' }
            break
    }

    return { canApply: true }
}

// ─── 수면 턴 수 결정 (1~3턴) ─────────────────────────────────
export function rollSleepTurns(rng: () => number): number {
    return Math.floor(rng() * 3) + 1
}

// ─── 빙결 해제 확률 ───────────────────────────────────────────
export function rollFreezeThaw(rng: () => number): boolean {
    return rng() < 0.2  // 20% 해제
}

// ─── 턴 종료 상태이상 데미지 ─────────────────────────────────
export interface StatusDamageResult {
    damage:  number
    status:  PrimaryStatus
    cured?:  boolean  // 빙결 해제 등
}

export function calcStatusDamage(
    pokemon: BattlePokemon,
    rng:     () => number,
): StatusDamageResult | null {
    switch (pokemon.status) {
        case 'burn':
            // 화상: 1/16 (Gen 6+)
            // Heatproof: 1/32
            return {
                damage: Math.floor(pokemon.max_hp / (pokemon.ability === 'heatproof' ? 32 : 16)),
                status: 'burn',
            }

        case 'poison':
            // 독: 1/8
            return {
                damage: Math.floor(pokemon.max_hp / 8),
                status: 'poison',
            }

        case 'toxic': {
            // 맹독: 1/16 × 경과턴 (최대 15/16)
            const turns = Math.min(pokemon.status_turns, 15)
            return {
                damage: Math.floor(pokemon.max_hp * turns / 16),
                status: 'toxic',
            }
        }

        case 'freeze': {
            // 빙결: 20% 해제
            const thawed = rollFreezeThaw(rng)
            return thawed ? { damage: 0, status: 'freeze', cured: true } : null
        }

        case 'sleep': {
            // 수면: 턴 차감
            return null  // 엔진에서 turn 처리
        }

        default:
            return null
    }
}

// ─── 화상 공격 배율 ──────────────────────────────────────────
export function getBurnAttackMod(pokemon: BattlePokemon): number {
    if (pokemon.status !== 'burn')     return 1
    if (pokemon.ability === 'guts')    return 1
    return 0.5
}

// ─── 마비 스피드 배율 ─────────────────────────────────────────
export function getParalysisSpeedMod(pokemon: BattlePokemon): number {
    if (pokemon.status !== 'paralysis') return 1
    if (pokemon.ability === 'quick-feet') return 1
    return 0.5
}

// ─── 마비 행동 불능 체크 (25%) ───────────────────────────────
export function isParalyzed(pokemon: BattlePokemon, rng: () => number): boolean {
    if (pokemon.status !== 'paralysis') return false
    return rng() < 0.25
}

// ─── 수면 체크 ────────────────────────────────────────────────
export function isAsleep(pokemon: BattlePokemon): boolean {
    return pokemon.status === 'sleep' && pokemon.status_turns > 0
}

// ─── 맹독 턴 증가 ────────────────────────────────────────────
export function tickToxic(pokemon: BattlePokemon): number {
    return pokemon.status === 'toxic' ? pokemon.status_turns + 1 : pokemon.status_turns
}