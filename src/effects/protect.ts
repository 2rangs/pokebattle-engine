import type { BattlePokemon } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { VolatileStatus } from '../types/effect'

// ─── 보호 기술 정의 ───────────────────────────────────────────
export interface ProtectMoveInfo {
    volatile:       VolatileStatus
    blocksStatus:   boolean   // 변화기 차단 여부
    priority:       number
    alwaysSucceeds: boolean   // 연속사용 성공률 감소 예외
}

export const PROTECT_MOVES: Record<string, ProtectMoveInfo> = {
    // 우선도 +4, 변화기 차단 X
    'protect':          { volatile: 'protect',         blocksStatus: true,  priority: 4, alwaysSucceeds: false },
    'detect':           { volatile: 'protect',         blocksStatus: true,  priority: 4, alwaysSucceeds: false },
    'kings-shield':     { volatile: 'kings_shield',    blocksStatus: false, priority: 4, alwaysSucceeds: false },
    'baneful-bunker':   { volatile: 'baneful_bunker',  blocksStatus: false, priority: 4, alwaysSucceeds: false },
    'spiky-shield':     { volatile: 'spiky_shield',    blocksStatus: false, priority: 4, alwaysSucceeds: false },
    'silk-trap':        { volatile: 'silk_trap',       blocksStatus: false, priority: 4, alwaysSucceeds: false },
    'burning-bulwark':  { volatile: 'burning_bulwark', blocksStatus: false, priority: 4, alwaysSucceeds: false },
    'obstruct':         { volatile: 'protect',         blocksStatus: false, priority: 4, alwaysSucceeds: false }, // 블로킹
    // 우선도 +3, 항상 성공
    'wide-guard':       { volatile: 'protect',         blocksStatus: true,  priority: 3, alwaysSucceeds: true  },
    'quick-guard':      { volatile: 'protect',         blocksStatus: true,  priority: 3, alwaysSucceeds: true  }, // 패스트가드
    'crafty-shield':    { volatile: 'protect',         blocksStatus: true,  priority: 3, alwaysSucceeds: true  }, // 트릭가드
    // 우선도 +0
    'mat-block':        { volatile: 'protect',         blocksStatus: true,  priority: 0, alwaysSucceeds: false }, // 마룻바닥세워막기
    // 버티기 (따로 처리)
    'endure':           { volatile: 'endure',          blocksStatus: true,  priority: 4, alwaysSucceeds: false },
}

// ─── 보호 관통 기술 ───────────────────────────────────────────
export const BYPASS_PROTECT_MOVES = new Set([
    'feint',            // 페인트 - 관통 + 해제
    'shadow-force',     // 섀도다이브
    'phantom-force',    // 고스트다이브
    'hyperspace-hole',  // 이차원홀
    'hyperspace-fury',  // 이차원러시
])

// ─── 접촉 기술 여부 ───────────────────────────────────────────
const NON_CONTACT_PHYSICAL = new Set([
    'earthquake', 'rock-slide', 'rock-blast', 'magnitude',
    'bulldoze', 'razor-wind', 'self-destruct', 'explosion',
    'sand-attack', 'bone-club', 'bonemerang', 'bone-rush',
    'fissure', 'aerial-ace', 'rock-throw', 'rock-tomb',
    'stone-edge', 'ancient-power', 'power-gem',
])

export function isContactMove(move: MoveData): boolean {
    if (move.category !== 'physical') return false
    return !NON_CONTACT_PHYSICAL.has(move.name)
}

// ─── 현재 보호 상태 ───────────────────────────────────────────
export type ProtectStatus =
    | 'protect'
    | 'kings_shield'
    | 'spiky_shield'
    | 'baneful_bunker'
    | 'silk_trap'
    | 'burning_bulwark'
    | null

export function getProtectStatus(pokemon: BattlePokemon): ProtectStatus {
    const vs = pokemon.volatile_statuses
    if ('kings_shield'    in vs) return 'kings_shield'
    if ('spiky_shield'    in vs) return 'spiky_shield'
    if ('baneful_bunker'  in vs) return 'baneful_bunker'
    if ('silk_trap'       in vs) return 'silk_trap'
    if ('burning_bulwark' in vs) return 'burning_bulwark'
    if ('protect'         in vs) return 'protect'
    return null
}

// ─── 연속 사용 성공 여부 ──────────────────────────────────────
// 연속 사용 시 1/3씩 감소: 1회→100%, 2회→33%, 3회→11%...
export function canUseProtect(pokemon: BattlePokemon, moveName: string): boolean {
    const info = PROTECT_MOVES[moveName]
    if (!info) return true
    if (info.alwaysSucceeds) return true

    const streak = (pokemon.volatile_statuses as any).protect_streak?.turns_remaining ?? 0
    if (streak === 0) return true

    const chance = Math.pow(1/3, streak)
    return Math.random() < chance
}

// ─── 보호 차단 여부 체크 ──────────────────────────────────────
export interface ProtectCheckResult {
    blocked:  boolean
    volatile: ProtectStatus
}

export function checkProtect(
    defender: BattlePokemon,
    move:     MoveData,
): ProtectCheckResult {
    const protectStatus = getProtectStatus(defender)
    if (!protectStatus) return { blocked: false, volatile: null }

    // 보호 관통 기술 (페인트 등)
    if (BYPASS_PROTECT_MOVES.has(move.name)) {
        return { blocked: false, volatile: protectStatus }
    }

    // 킹실드/블로킹/니들가드/토치카/실크트랩/화염의수호는 변화기 통과
    const blocksStatus = protectStatus === 'protect'
    if (move.category === 'status' && !blocksStatus) {
        return { blocked: false, volatile: protectStatus }
    }

    return { blocked: true, volatile: protectStatus }
}

// ─── 보호 접촉 부가효과 ───────────────────────────────────────
export interface ProtectContactResult {
    damage?:     number
    status?:     string
    statChanges?: { stat: string; change: number }[]
}

export function applyProtectContact(
    attacker:      BattlePokemon,
    protectStatus: ProtectStatus,
    move:          MoveData,
): ProtectContactResult | null {
    if (!protectStatus) return null

    // 보이지않는주먹 특성: 접촉기 부가효과 무시
    if (attacker.ability === 'unseen-fist') return null

    if (!isContactMove(move)) return null

    switch (protectStatus) {
        case 'kings_shield':
            return { statChanges: [{ stat: 'attack', change: -2 }] }
        case 'spiky_shield':
            return { damage: Math.floor(attacker.max_hp / 8) }
        case 'baneful_bunker':
            return { status: 'poison' }
        case 'silk_trap':
            return { statChanges: [{ stat: 'speed', change: -1 }] }
        case 'burning_bulwark':
            return { status: 'burn' }
        default:
            return null
    }
}

// ─── 페인트: 보호 상태 해제 ───────────────────────────────────
export function breakProtect(pokemon: BattlePokemon): BattlePokemon {
    const vs = { ...pokemon.volatile_statuses }
    delete vs.protect
    delete vs.kings_shield
    delete vs.spiky_shield
    delete vs.baneful_bunker
    delete vs.silk_trap
    delete vs.burning_bulwark
    return { ...pokemon, volatile_statuses: vs }
}

// ─── 보호 스트릭 업데이트 ────────────────────────────────────
export function updateProtectStreak(pokemon: BattlePokemon, used: boolean): BattlePokemon {
    const vs = { ...pokemon.volatile_statuses } as any
    if (used) {
        const prev = vs.protect_streak?.turns_remaining ?? 0
        vs.protect_streak = { turns_remaining: prev + 1 }
    } else {
        delete vs.protect_streak
    }
    return { ...pokemon, volatile_statuses: vs }
}