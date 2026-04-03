import type { Action, BattleState, PlayerID } from '../types/battle'
import type { BattlePokemon } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { BattleEngine } from './BattleEngine'
import { ActionQueue } from './ActionQueue'
import { calcDamage } from '../calc/damage'
import { getStat, compareSpeed } from '../calc/stat'
import { canApplyStatus } from '../effects/status'
import { isDamageImmune } from '../effects/ability'
import { getTypeChart } from '../data/loader'
import {
    PROTECT_MOVES,
    checkProtect,
    applyProtectContact,
    breakProtect,
    canUseProtect,
    updateProtectStreak,
} from '../effects/protect'

// ─── 기습 계열 ───────────────────────────────────────────────
const SUCKER_PUNCH_MOVES = new Set(['sucker-punch', 'upper-hand'])

// ─── 자기 타겟 기술 ──────────────────────────────────────────
const SELF_TARGET_MOVES = new Set([
    // 회복
    'rest', 'recover', 'roost', 'softboiled', 'slack-off',
    'morning-sun', 'synthesis', 'moonlight', 'shore-up',
    'milk-drink', 'heal-order', 'jungle-healing', 'wish',
    'healing-wish', 'lunar-dance',
    // 랭크업
    'swords-dance', 'hone-claws', 'coil', 'bulk-up',
    'dragon-dance', 'quiver-dance', 'shell-smash', 'belly-drum',
    'growth', 'work-up', 'victory-dance', 'nasty-plot',
    'calm-mind', 'tail-glow', 'geomancy', 'charge',
    'iron-defense', 'amnesia', 'acid-armor', 'barrier',
    'stockpile', 'autotomize', 'minimize', 'defense-curl',
    // 상태
    'focus-energy', 'ingrain', 'aqua-ring', 'magnet-rise',
    // 기타
    'substitute', 'bide', 'conversion', 'power-trick',
])

// ─── 우선도 오버라이드 ────────────────────────────────────────
const MOVE_PRIORITY_OVERRIDE: Record<string, number> = {
    'helping-hand':     5,
    'protect':          4, 'detect':          4,
    'kings-shield':     4, 'spiky-shield':    4,
    'baneful-bunker':   4, 'silk-trap':       4,
    'burning-bulwark':  4, 'obstruct':        4,
    'endure':           4, 'magic-coat':      4, 'snatch': 4,
    'wide-guard':       3, 'quick-guard':     3, 'crafty-shield': 3,
    'extreme-speed':    2, 'feint':           2,
    'aqua-jet':         1, 'baby-doll-eyes':  1,
    'bullet-punch':     1, 'ice-shard':       1,
    'mach-punch':       1, 'quick-attack':    1,
    'shadow-sneak':     1, 'sucker-punch':    1,
    'upper-hand':       3, 'grassy-glide':    1,
    'water-shuriken':   1, 'accelerock':      1,
    'first-impression': 1, 'fake-out':        3,
    'vital-throw':      0,
    'bide':            -1,
    'whirlwind':       -3, 'roar':           -3,
    'dragon-tail':     -3, 'circle-throw':   -3,
    'teleport':        -4,
    'trick-room':      -5, 'healing-wish':   -5, 'lunar-dance': -5,
    'focus-punch':     -6, 'shell-trap':     -6, 'beak-blast':  -6,
}

function getMovePriority(move: MoveData): number {
    return MOVE_PRIORITY_OVERRIDE[move.name] ?? move.priority ?? 0
}

export class TurnManager {
    private engine: BattleEngine
    private queue: ActionQueue = new ActionQueue()

    constructor(engine: BattleEngine) {
        this.engine = engine
    }

    queueAction(action: Action): void {
        this.queue.add(action)
    }

    isReady(): boolean {
        const state = this.engine.getState()
        const players = Object.keys(state.sides) as PlayerID[]
        return players.every(p => this.queue.has(p))
    }

    executeTurn(state: BattleState): void {
        const sorted = this.sortActions(this.queue.getAll(), state)
        for (const action of sorted) {
            const currentState = this.engine.getState()
            if (currentState.phase === 'ended') break
            if (action.type === 'switch')      this.executeSwitch(action)
            else if (action.type === 'move')   this.executeMove(action, currentState)
        }
        this.queue.clear()
    }

    // ─── 행동 순서 정렬 ─────────────────────────────────────────
    private sortActions(actions: Action[], state: BattleState): Action[] {
        return [...actions].sort((a, b) => {
            if (a.type === 'switch' && b.type !== 'switch') return -1
            if (b.type === 'switch' && a.type !== 'switch') return 1

            if (a.type === 'move' && b.type === 'move') {
                const pokeA = this.engine.getPokemon(a.pokemon_id)
                const pokeB = this.engine.getPokemon(b.pokemon_id)
                if (!pokeA || !pokeB) return 0

                const prioA = getMovePriority(pokeA.moves[a.move_index]?.move ?? { priority: 0 } as any)
                const prioB = getMovePriority(pokeB.moves[b.move_index]?.move ?? { priority: 0 } as any)
                const spdA  = getStat(pokeA, 'speed', { weather: state.field.weather })
                const spdB  = getStat(pokeB, 'speed', { weather: state.field.weather })
                const trickRoom = 'trick_room' in state.field.conditions

                return compareSpeed(
                    { speed: spdA, priority: prioA },
                    { speed: spdB, priority: prioB },
                    trickRoom,
                )
            }
            return 0
        })
    }

    // ─── 교체 실행 ──────────────────────────────────────────────
    private executeSwitch(action: Extract<Action, { type: 'switch' }>): void {
        this.engine.switchPokemon(action.player, action.pokemon_id, action.switch_to_id)
    }

    // ─── 기술 실행 ──────────────────────────────────────────────
    private executeMove(action: Extract<Action, { type: 'move' }>, state: BattleState): void {
        const attacker = this.engine.getPokemon(action.pokemon_id)
        if (!attacker || attacker.fainted) return

        const moveSlot = attacker.moves[action.move_index]
        if (!moveSlot || moveSlot.disabled) return
        const move = moveSlot.move

        // ── 반동턴 체크 ──────────────────────────────────────
        if (attacker.must_recharge) {
            this.engine.updatePokemon(attacker.id, p => ({ ...p, must_recharge: false }))
            this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '반동턴' })
            return
        }

        // ── 수면 체크 ────────────────────────────────────────
        if (attacker.status === 'sleep') {
            if (attacker.status_turns <= 0) {
                this.engine.cureStatus(attacker.id)
                // 수면에서 깨어난 턴은 행동 불가
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '잠에서 깨어났다!' })
                return
            } else {
                this.engine.updatePokemon(attacker.id, p => ({ ...p, status_turns: p.status_turns - 1 }))
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '잠들어 있다!' })
                return
            }
        }

        // ── 마비 행동 불능 (25%) ──────────────────────────────
        if (attacker.status === 'paralysis' && attacker.ability !== 'quick-feet') {
            if (Math.random() < 0.25) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '몸이 마비되어 움직일 수 없다!' })
                return
            }
        }

        // ── 혼란 체크 ────────────────────────────────────────
        if ('confusion' in attacker.volatile_statuses) {
            const confusion = attacker.volatile_statuses.confusion!
            if (confusion.turns_remaining <= 0) {
                this.engine.updatePokemon(attacker.id, p => {
                    const vs = { ...p.volatile_statuses }
                    delete vs.confusion
                    return { ...p, volatile_statuses: vs }
                })
                this.engine.emit({ type: 'volatile_remove', pokemon_id: attacker.id, volatile: 'confusion' })
            } else {
                this.engine.updatePokemon(attacker.id, p => ({
                    ...p,
                    volatile_statuses: {
                        ...p.volatile_statuses,
                        confusion: { turns_remaining: confusion.turns_remaining - 1 },
                    },
                }))
                if (Math.random() < 0.33) {
                    // 혼란 자해
                    const selfDmg = this.calcConfusionDamage(attacker)
                    this.engine.applyDamage(attacker.id, selfDmg, '혼란')
                    this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '혼란으로 자해!' })
                    return
                }
            }
        }

        // ── 보호 기술 ────────────────────────────────────────
        if (move.name in PROTECT_MOVES) {
            const info = PROTECT_MOVES[move.name]!
            if (!canUseProtect(attacker, move.name)) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '보호 실패' })
                this.engine.updatePokemon(attacker.id, p => updateProtectStreak(p, false))
                this.consumePP(attacker.id, action.move_index, move)
                return
            }
            this.consumePP(attacker.id, action.move_index, move)
            this.engine.emit({ type: 'move_use', pokemon_id: attacker.id, move, target_id: attacker.id })
            this.engine.updatePokemon(attacker.id, p => {
                const updated = updateProtectStreak(p, true)
                return {
                    ...updated,
                    volatile_statuses: {
                        ...updated.volatile_statuses,
                        [info.volatile]: { turns_remaining: 1 },
                    },
                }
            })
            this.engine.emit({ type: 'volatile_apply', pokemon_id: attacker.id, volatile: info.volatile })
            return
        }

        // ── 기습 체크 ────────────────────────────────────────
        if (SUCKER_PUNCH_MOVES.has(move.name)) {
            const foePlayer: PlayerID = action.player === 'p1' ? 'p2' : 'p1'
            const foeAction = this.queue.getAll().find(a => a.player === foePlayer)
            const foeIsAttacking = foeAction?.type === 'move' && (() => {
                const foePoke = this.engine.getPokemon((foeAction as any).pokemon_id)
                const foeMove = foePoke?.moves[(foeAction as any).move_index]?.move
                return foeMove && foeMove.category !== 'status'
            })()
            if (!foeIsAttacking) {
                this.consumePP(attacker.id, action.move_index, move)
                this.engine.emit({ type: 'move_use', pokemon_id: attacker.id, move, target_id: '' })
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '기습 실패!' })
                this.engine.updatePokemon(attacker.id, p => updateProtectStreak(p, false))
                return
            }
        }

        // ── 타겟 결정 ────────────────────────────────────────
        const isSelfTarget = SELF_TARGET_MOVES.has(move.name)
            || move.target === 'user'
            || move.target === 'user-and-allies'

        const targetId = isSelfTarget
            ? attacker.id
            : (action.target_id ?? this.getDefaultTarget(action.player, state))

        const target = targetId ? this.engine.getPokemon(targetId) : undefined
        if (!target || (!isSelfTarget && target.fainted)) return

        // PP 소모 + emit
        this.consumePP(attacker.id, action.move_index, move)
        this.engine.emit({ type: 'move_use', pokemon_id: attacker.id, move, target_id: target.id })

        // 보호 스트릭 초기화
        this.engine.updatePokemon(attacker.id, p => updateProtectStreak(p, false))

        // ── 변화기 ───────────────────────────────────────────
        if (move.category === 'status') {
            // 자기 타겟이 아닌 변화기는 보호 체크
            if (!isSelfTarget) {
                const currentTarget = this.engine.getPokemon(target.id)!
                const protectResult = checkProtect(currentTarget, move)
                if (protectResult.blocked) {
                    this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '보호됨' })
                    return
                }
            }
            this.executeStatusMove(attacker, target, move, state, action)
            return
        }

        // ── 명중 체크 ────────────────────────────────────────
        if (!this.checkAccuracy(attacker, target, move)) {
            this.engine.emit({ type: 'move_miss', pokemon_id: attacker.id, move })
            return
        }

        // ── 타입 면역 체크 ───────────────────────────────────
        if (isDamageImmune(target, move.type, move.category)) {
            this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: 'immune' })
            return
        }

        // ── 보호 체크 ────────────────────────────────────────
        const currentTarget = this.engine.getPokemon(target.id)!
        const protectResult = checkProtect(currentTarget, move)
        if (protectResult.blocked) {
            this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '보호됨' })
            const contactResult = applyProtectContact(attacker, protectResult.volatile, move)
            if (contactResult) {
                if (contactResult.damage)      this.engine.applyDamage(attacker.id, contactResult.damage, protectResult.volatile!)
                if (contactResult.status)      this.engine.applyStatus(attacker.id, contactResult.status)
                if (contactResult.statChanges) {
                    for (const sc of contactResult.statChanges) {
                        this.engine.applyStatChange(attacker.id, sc.stat, sc.change)
                    }
                }
            }
            return
        }

        // ── 페인트: 보호 해제 ────────────────────────────────
        if (move.name === 'feint') {
            this.engine.updatePokemon(target.id, p => breakProtect(p))
            this.engine.emit({ type: 'volatile_remove', pokemon_id: target.id, volatile: 'protect' })
        }

        // ── 데미지 계산 ──────────────────────────────────────
        const result = calcDamage({
            attacker,
            defender:  currentTarget,
            move,
            weather:   state.field.weather,
            terrain:   state.field.terrain,
            typeChart: getTypeChart(),
            isCrit:    this.rollCrit(attacker),
        })

        if (result.damage > 0) {
            this.engine.applyDamage(target.id, result.damage, move.name)
        }

        // ── 다중 히트 ────────────────────────────────────────
        const hits = this.calcHits(move)
        for (let i = 1; i < hits; i++) {
            const updated = this.engine.getPokemon(target.id)
            if (!updated || updated.fainted) break
            const r = calcDamage({
                attacker, defender: updated, move,
                weather: state.field.weather, terrain: state.field.terrain,
                typeChart: getTypeChart(),
            })
            this.engine.applyDamage(target.id, r.damage, move.name)
        }

        // ── 반동 ─────────────────────────────────────────────
        if ((move.meta?.drain ?? 0) < 0) {
            const recoil = Math.floor(result.damage * Math.abs(move.meta!.drain) / 100)
            this.engine.applyDamage(attacker.id, recoil, 'recoil')
        }

        // ── 흡수 ─────────────────────────────────────────────
        if ((move.meta?.drain ?? 0) > 0) {
            const heal = Math.floor(result.damage * move.meta!.drain / 100)
            this.engine.applyHeal(attacker.id, heal, 'drain')
        }

        // ── 부가효과: 상태이상 ───────────────────────────────
        if (move.meta?.ailment && move.meta.ailment !== 'none') {
            const chance = move.meta.ailment_chance
            if (chance === 0 || Math.random() * 100 < chance) {
                const t = this.engine.getPokemon(target.id)
                if (t && !t.fainted) {
                    const check = canApplyStatus(t, move.meta.ailment as any, state.field.terrain, state.field.weather)
                    if (check.canApply) this.engine.applyStatus(target.id, move.meta.ailment)
                }
            }
        }

        // ── 부가효과: 스탯 변화 ──────────────────────────────
        if (move.stat_changes.length > 0) {
            const statChance = move.meta?.stat_chance ?? 0
            if (statChance === 0 || Math.random() * 100 < statChance) {
                const statTarget = move.stat_changes.some(sc => sc.change < 0) ? target : attacker
                for (const sc of move.stat_changes) {
                    this.engine.applyStatChange(statTarget.id, sc.stat, sc.change)
                }
            }
        }

        // ── 반동턴 ───────────────────────────────────────────
        if (move.meta?.category === 'damage+recharge') {
            this.engine.updatePokemon(attacker.id, p => ({ ...p, must_recharge: true }))
        }

        // ── 아이템 제거 (걷어차기 계열) ──────────────────────
        if (move.name === 'knock-off') {
            const t = this.engine.getPokemon(target.id)
            if (t && t.item) {
                this.engine.updatePokemon(target.id, p => ({ ...p, item: null }))
                this.engine.emit({ type: 'item_consume', pokemon_id: target.id, item: t.item! })
            }
        }
    }

    // ─── 변화 기술 실행 ─────────────────────────────────────────
    private executeStatusMove(
        attacker: BattlePokemon,
        target:   BattlePokemon,
        move:     MoveData,
        state:    BattleState,
        action:   Extract<Action, { type: 'move' }>,
    ): void {

        // ── 잠자기 ───────────────────────────────────────────
        if (move.name === 'rest') {
            if (attacker.hp >= attacker.max_hp && !attacker.status) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '효과가 없다!' })
                return
            }
            if (attacker.status) this.engine.cureStatus(attacker.id)
            this.engine.updatePokemon(attacker.id, p => ({ ...p, status: 'sleep' as const, status_turns: 3 }))
            this.engine.emit({ type: 'status_apply', pokemon_id: attacker.id, status: 'sleep' })
            this.engine.applyHeal(attacker.id, attacker.max_hp, 'rest')
            return
        }

        // ── 고정 회복 (HP 1/2) ───────────────────────────────
        if (new Set(['recover','roost','softboiled','slack-off','milk-drink','heal-order','shore-up']).has(move.name)) {
            if (attacker.hp >= attacker.max_hp) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '효과가 없다!' })
                return
            }
            this.engine.applyHeal(attacker.id, Math.floor(attacker.max_hp / 2), move.name)
            return
        }

        // ── 날씨 회복 ────────────────────────────────────────
        if (new Set(['morning-sun','synthesis','moonlight']).has(move.name)) {
            const w = state.field.weather
            const ratio = (w === 'sun' || w === 'harsh_sun')   ? 2/3
                : (w === 'rain' || w === 'heavy_rain'
                    || w === 'sandstorm' || w === 'snow')           ? 1/4
                    : 1/2
            this.engine.applyHeal(attacker.id, Math.floor(attacker.max_hp * ratio), move.name)
            return
        }

        // ── 소원빌기 ─────────────────────────────────────────
        if (move.name === 'wish') {
            this.engine.updatePokemon(attacker.id, p => ({
                ...p,
                volatile_statuses: {
                    ...p.volatile_statuses,
                    wish: { turns_remaining: 2, source: attacker.id },
                },
            }))
            return
        }

        // ── 자기희생 회복 ────────────────────────────────────
        if (move.name === 'healing-wish' || move.name === 'lunar-dance') {
            this.engine.faintPokemon(attacker.id)
            return
        }

        // ── 대타출동 ─────────────────────────────────────────
        if (move.name === 'substitute') {
            const cost = Math.floor(attacker.max_hp / 4)
            if (attacker.hp <= cost) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: 'HP가 부족하다!' })
                return
            }
            if ('substitute' in attacker.volatile_statuses) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '이미 대타가 있다!' })
                return
            }
            this.engine.applyDamage(attacker.id, cost, 'substitute')
            this.engine.updatePokemon(attacker.id, p => ({
                ...p,
                substitute_hp: cost,
                volatile_statuses: { ...p.volatile_statuses, substitute: { turns_remaining: Infinity } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: attacker.id, volatile: 'substitute' })
            return
        }

        // ── 아쿠아링 ─────────────────────────────────────────
        if (move.name === 'aqua-ring') {
            this.engine.updatePokemon(attacker.id, p => ({
                ...p,
                volatile_statuses: { ...p.volatile_statuses, aqua_ring: { turns_remaining: Infinity } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: attacker.id, volatile: 'aqua_ring' })
            return
        }

        // ── 뿌리박기 ─────────────────────────────────────────
        if (move.name === 'ingrain') {
            this.engine.updatePokemon(attacker.id, p => ({
                ...p,
                trapped: true,
                volatile_statuses: { ...p.volatile_statuses, ingrain: { turns_remaining: Infinity } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: attacker.id, volatile: 'ingrain' })
            return
        }

        // ── 기합모으기 ────────────────────────────────────────
        if (move.name === 'focus-energy') {
            this.engine.updatePokemon(attacker.id, p => ({
                ...p,
                volatile_statuses: { ...p.volatile_statuses, focus_energy: { turns_remaining: Infinity } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: attacker.id, volatile: 'focus_energy' })
            return
        }

        // ── 배북 ─────────────────────────────────────────────
        if (move.name === 'belly-drum') {
            if (attacker.hp <= Math.floor(attacker.max_hp / 2)) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: 'HP가 부족하다!' })
                return
            }
            this.engine.applyDamage(attacker.id, Math.floor(attacker.max_hp / 2), 'belly-drum')
            this.engine.applyStatChange(attacker.id, 'attack', 12) // +6으로 clamp됨
            return
        }

        // ── 껍질깨기 ─────────────────────────────────────────
        if (move.name === 'shell-smash') {
            this.engine.applyStatChange(attacker.id, 'defense',        -1)
            this.engine.applyStatChange(attacker.id, 'special_defense', -1)
            this.engine.applyStatChange(attacker.id, 'attack',         +2)
            this.engine.applyStatChange(attacker.id, 'special_attack', +2)
            this.engine.applyStatChange(attacker.id, 'speed',          +2)
            return
        }

        // ── 저주 ─────────────────────────────────────────────
        if (move.name === 'curse') {
            const isGhost = (attacker.types as string[]).includes('ghost')
            if (isGhost) {
                this.engine.applyDamage(attacker.id, Math.floor(attacker.max_hp / 2), 'curse')
                this.engine.updatePokemon(target.id, p => ({
                    ...p,
                    volatile_statuses: { ...p.volatile_statuses, curse: { turns_remaining: Infinity } },
                }))
                this.engine.emit({ type: 'volatile_apply', pokemon_id: target.id, volatile: 'curse' })
            } else {
                this.engine.applyStatChange(attacker.id, 'attack',  +1)
                this.engine.applyStatChange(attacker.id, 'defense', +1)
                this.engine.applyStatChange(attacker.id, 'speed',   -1)
            }
            return
        }

        // ── 하품 ─────────────────────────────────────────────
        if (move.name === 'yawn') {
            if (target.status !== null) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '효과가 없다!' })
                return
            }
            this.engine.updatePokemon(target.id, p => ({
                ...p,
                volatile_statuses: { ...p.volatile_statuses, yawn: { turns_remaining: 2 } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: target.id, volatile: 'yawn' })
            return
        }

        // ── 도발 ─────────────────────────────────────────────
        if (move.name === 'taunt') {
            if ('taunt' in target.volatile_statuses) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '이미 도발 중!' })
                return
            }
            this.engine.updatePokemon(target.id, p => ({
                ...p,
                volatile_statuses: { ...p.volatile_statuses, taunt: { turns_remaining: 3 } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: target.id, volatile: 'taunt' })
            return
        }

        // ── 씨뿌리기 ─────────────────────────────────────────
        if (move.name === 'leech-seed') {
            if ((target.types as string[]).includes('grass')) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '효과가 없다!' })
                return
            }
            if ('seeded' in target.volatile_statuses) {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: '이미 씨뿌리기 중!' })
                return
            }
            this.engine.updatePokemon(target.id, p => ({
                ...p,
                volatile_statuses: { ...p.volatile_statuses, seeded: { turns_remaining: Infinity, source: attacker.id } },
            }))
            this.engine.emit({ type: 'volatile_apply', pokemon_id: target.id, volatile: 'seeded' })
            return
        }

        // ── 날씨 기술 ────────────────────────────────────────
        const weatherMoves: Record<string, string> = {
            'sunny-day':         'sun',
            'rain-dance':        'rain',
            'sandstorm':         'sandstorm',
            'snowscape':         'snow',
            'chilly-reception':  'snow',
        }
        if (move.name in weatherMoves) {
            this.engine.setWeather(weatherMoves[move.name]! as any, move.name)
            return
        }

        // ── 필드 기술 ────────────────────────────────────────
        const terrainMoves: Record<string, string> = {
            'electric-terrain': 'electric',
            'grassy-terrain':   'grassy',
            'misty-terrain':    'misty',
            'psychic-terrain':  'psychic',
        }
        if (move.name in terrainMoves) {
            this.engine.setTerrain(terrainMoves[move.name]! as any, move.name)
            return
        }

        // ── 독독 / 맹독 ──────────────────────────────────────
        if (move.name === 'toxic') {
            const check = canApplyStatus(target, 'toxic', state.field.terrain, state.field.weather)
            if (check.canApply) {
                this.engine.applyStatus(target.id, 'toxic')
            } else {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: check.reason ?? 'failed' })
            }
            return
        }

        // ── 도그파이트 / 랭크 올리기 (stat_changes 기반) ─────
        if (move.stat_changes.length > 0) {
            const isSelf = SELF_TARGET_MOVES.has(move.name)
                || move.target === 'user'
                || move.stat_changes.every(sc => sc.change > 0)
            const statTarget = isSelf ? attacker : target
            for (const sc of move.stat_changes) {
                this.engine.applyStatChange(statTarget.id, sc.stat, sc.change)
            }
        }

        // ── 상태이상 (ailment 기반) ───────────────────────────
        if (move.meta?.ailment && move.meta.ailment !== 'none') {
            const check = canApplyStatus(
                target,
                move.meta.ailment as any,
                state.field.terrain,
                state.field.weather,
            )
            if (check.canApply) {
                this.engine.applyStatus(target.id, move.meta.ailment)
            } else {
                this.engine.emit({ type: 'move_fail', pokemon_id: attacker.id, move, reason: check.reason ?? 'failed' })
            }
        }
    }

    // ─── PP 소모 ────────────────────────────────────────────────
    private consumePP(pokemonId: string, moveIndex: number, move: MoveData): void {
        this.engine.updatePokemon(pokemonId, p => {
            const newMoves = [...p.moves] as BattlePokemon['moves']
            const slot = newMoves[moveIndex]
            if (slot) newMoves[moveIndex] = { ...slot, pp: Math.max(0, slot.pp - 1) }
            return { ...p, moves: newMoves, last_move_used: move.name }
        })
    }

    // ─── 혼란 자해 데미지 ────────────────────────────────────────
    private calcConfusionDamage(pokemon: BattlePokemon): number {
        const atk = pokemon.stats.attack
        const def = pokemon.stats.defense
        return Math.max(1, Math.floor(
            Math.floor(Math.floor(2 * pokemon.level / 5 + 2) * 40 * atk / def) / 50 + 2
        ))
    }

    // ─── 명중 체크 ──────────────────────────────────────────────
    private checkAccuracy(attacker: BattlePokemon, target: BattlePokemon, move: MoveData): boolean {
        if (move.accuracy === null) return true
        const baseAcc = move.accuracy / 100
        const net = Math.max(-6, Math.min(6, attacker.stages.accuracy - target.stages.evasion))
        const stageTable: Record<number, number> = {
            [-6]: 33, [-5]: 36, [-4]: 43, [-3]: 50, [-2]: 60, [-1]: 75,
            0: 100, 1: 133, 2: 166, 3: 200, 4: 250, 5: 300, 6: 350,
        }
        return Math.random() < baseAcc * ((stageTable[net] ?? 100) / 100)
    }

    // ─── 급소 체크 ──────────────────────────────────────────────
    private rollCrit(attacker: BattlePokemon): boolean {
        const stage = 'focus_energy' in attacker.volatile_statuses ? 2 : 0
        if (stage >= 3) return true
        const thresholds = [1/24, 1/8, 1/2]
        return Math.random() < (thresholds[stage] ?? 1/24)
    }

    // ─── 다중 히트 ──────────────────────────────────────────────
    private calcHits(move: MoveData): number {
        const min = move.meta?.min_hits
        const max = move.meta?.max_hits
        if (!min || !max) return 1
        if (min === max) return min
        const roll = Math.random()
        if (roll < 0.375) return 2
        if (roll < 0.75)  return 3
        if (roll < 0.875) return 4
        return 5
    }
    queueHas(player: PlayerID): boolean {
        return this.queue.has(player)
    }
    // ─── 기본 타겟 ──────────────────────────────────────────────
    private getDefaultTarget(player: PlayerID, state: BattleState): string | undefined {
        const foe: PlayerID = player === 'p1' ? 'p2' : 'p1'
        return state.sides[foe].active.find(p => !p.fainted)?.id
    }
}