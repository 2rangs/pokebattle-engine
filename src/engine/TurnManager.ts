import type { Action, PlayerID, Side } from '../types/battle'
import type { BattlePokemon, StatStages } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { PrimaryStatus, SideCondition, VolatileStatus } from '../types/effect'
import type { BattleEngine } from './BattleEngine'
import { STRUGGLE } from './BattleEngine'
import { calcDamage, calcTypeEffectiveness, getMoveType } from '../calc/damage'
import { getStat } from '../calc/stat'
import { getTypeChart } from '../data/loader'
import { PROTECT_MOVES } from '../effects/protect'
import {
    BYPASS_PROTECT, CHARGE_MOVES, FIRST_TURN_ONLY, FIXED_DAMAGE_MOVES, FORCE_SWITCH_MOVES,
    HAZARD_CLEAR_SELF, HAZARD_MOVES, HEAL_MOVES, POWDER_MOVES, RAMPAGE_MOVES, RECHARGE_MOVES,
    SCREEN_MOVES, SELF_SWITCH_MOVES, SOUND_MOVES, TERRAIN_MOVES, WEATHER_MOVES,
    getMovePatch, getStatEffects, isContact, isSelfTargeting,
} from '../data/moveTable'

// ─── 상수 ─────────────────────────────────────────────────────
const ACC_STAGE: Record<number, number> = {
    [-6]: 3 / 9, [-5]: 3 / 8, [-4]: 3 / 7, [-3]: 3 / 6, [-2]: 3 / 5, [-1]: 3 / 4,
    0: 1, 1: 4 / 3, 2: 5 / 3, 3: 2, 4: 7 / 3, 5: 8 / 3, 6: 3,
}
const CRIT_CHANCE = [1 / 24, 1 / 8, 1 / 2, 1]
const THAW_MOVES = new Set(['flame-wheel', 'scald', 'sacred-fire', 'flare-blitz', 'fusion-flare', 'steam-eruption', 'burn-up', 'pyro-ball', 'scorching-sands', 'matcha-gotcha'])
const HEALING_PRIORITY_MOVES = new Set(['recover', 'roost', 'soft-boiled', 'slack-off', 'milk-drink', 'heal-order', 'shore-up', 'morning-sun', 'synthesis', 'moonlight', 'wish', 'rest', 'drain-punch', 'giga-drain', 'draining-kiss', 'horn-leech', 'leech-life', 'oblivion-wing', 'parabolic-charge', 'strength-sap', 'heal-pulse', 'floral-healing', 'bitter-blade', 'matcha-gotcha'])
const AILMENT_MAP: Record<string, PrimaryStatus> = {
    paralysis: 'paralysis', burn: 'burn', freeze: 'freeze', poison: 'poison', sleep: 'sleep', toxic: 'toxic',
}

// ─── 우선도 (특성/필드 반영) ────────────────────────────────────
export function getEffectivePriority(engine: BattleEngine, pokemon: BattlePokemon, move: MoveData): number {
    let priority = move.priority ?? 0
    if (pokemon.ability === 'prankster' && move.category === 'status') priority += 1
    if (pokemon.ability === 'gale-wings' && move.type === 'flying' && pokemon.hp === pokemon.max_hp) priority += 1
    if (pokemon.ability === 'triage' && HEALING_PRIORITY_MOVES.has(move.name)) priority += 3
    if (move.name === 'grassy-glide' && engine.getState().field.terrain === 'grassy' && engine.isGroundedNow(pokemon)) priority += 1
    return priority
}

export class TurnManager {
    private engine: BattleEngine

    constructor(engine: BattleEngine) {
        this.engine = engine
    }

    // ─── 행동 순서 정렬 ─────────────────────────────────────────
    sortActions(actions: Action[]): Action[] {
        const e = this.engine
        const trickRoom = !!e.getState().field.conditions.trick_room
        const keyed = actions.map(action => {
            const poke = e.getPokemon(action.pokemon_id)!
            let priority = 0
            let bracket = 0
            if (action.type === 'switch') {
                priority = 7
            } else {
                const move = this.resolveMove(poke, action.move_index)
                priority = getEffectivePriority(e, poke, move)
                if (poke.item === 'quick-claw' && e.rng.chance(20)) bracket = 1
                if (poke.item === 'lagging-tail' || poke.ability === 'stall') bracket = -1
                if (poke.ability === 'quick-draw' && move.category !== 'status' && e.rng.chance(30)) bracket = 1
            }
            return { action, priority, bracket, speed: e.getSpeed(poke), tie: e.rng.next() }
        })
        keyed.sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority
            if (a.bracket !== b.bracket) return b.bracket - a.bracket
            if (a.speed !== b.speed) return trickRoom ? a.speed - b.speed : b.speed - a.speed
            return a.tie - b.tie
        })
        return keyed.map(k => k.action)
    }

    private resolveMove(pokemon: BattlePokemon, index: number): MoveData {
        if (pokemon.locked_move) return pokemon.moves[pokemon.locked_move.index]?.move ?? STRUGGLE
        if (index === -1) return STRUGGLE
        return pokemon.moves[index]?.move ?? STRUGGLE
    }

    // ─── 행동 실행 ──────────────────────────────────────────────
    executeAction(action: Action, remaining: Action[]): void {
        if (action.type === 'switch') {
            const user = this.engine.getPokemon(action.pokemon_id)
            if (!user || !this.engine.isActive(user)) return
            this.engine.switchPokemon(action.player, action.pokemon_id, action.switch_to_id)
            return
        }
        this.executeMove(action, remaining)
    }

    /** 하위 호환: 큐에 쌓인 행동 전체 실행 */
    executeTurn(): void { /* BattleEngine 이 직접 큐를 관리한다 */ }

    // ─── 기술 실행 ──────────────────────────────────────────────
    private executeMove(action: Extract<Action, { type: 'move' }>, remaining: Action[]): void {
        const e = this.engine
        const user = e.getPokemon(action.pokemon_id)
        if (!user || user.fainted || !e.isActive(user)) return

        let index: number = action.move_index
        if (user.locked_move) index = user.locked_move.index
        const slot = index >= 0 ? user.moves[index] : undefined
        const move = index === -1 || !slot ? STRUGGLE : slot.move
        const continuingLock = !!user.locked_move

        const finish = () => {
            user.moved_this_turn = true
        }

        // ── 반동턴 ──────────────────────────────────────────
        if (user.must_recharge) {
            user.must_recharge = false
            user.locked_move = null
            e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'recharge' })
            return finish()
        }

        // ── 행동 불능 체크 ──────────────────────────────────
        if (!this.canAct(user, move)) {
            user.locked_move = null
            this.resetProtectStreak(user)
            return finish()
        }

        // ── 도발 ────────────────────────────────────────────
        if (move.category === 'status' && 'taunt' in user.volatile_statuses) {
            e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'taunt' })
            return finish()
        }

        // ── PP 소모 ─────────────────────────────────────────
        if (slot && !continuingLock) {
            const foe = e.getActive(e.foeOf(e.sideOf(user)))
            const cost = foe && !foe.fainted && foe.ability === 'pressure' ? 2 : 1
            slot.pp = Math.max(0, slot.pp - cost)
        }
        if (user.item && (user.item.startsWith('choice-') || user.ability === 'gorilla-tactics') && move !== STRUGGLE) {
            user.choice_lock = move.name
        } else if (user.ability === 'gorilla-tactics' && move !== STRUGGLE) {
            user.choice_lock = move.name
        }

        // ── 모으기 기술 ─────────────────────────────────────
        const charge = CHARGE_MOVES[move.name]
        if (charge && !(continuingLock && user.locked_move?.kind === 'charge')) {
            const weather = e.effectiveWeather()
            const instant = !!weather && !!charge.skipInWeather?.includes(weather)
            for (const b of charge.selfBoost ?? []) e.boost(user, b.stat, b.change, user, move.name)
            if (!instant) {
                if (user.item === 'power-herb') {
                    e.consumeItem(user)
                } else {
                    e.emit({ type: 'move_use', pokemon_id: user.id, move, target_id: '' })
                    e.message(`${user.nickname} 은(는) 힘을 모으고 있다!`)
                    user.locked_move = { index, turns: 1, kind: 'charge' }
                    return finish()
                }
            }
        }
        if (continuingLock && user.locked_move?.kind === 'charge') user.locked_move = null

        // ── 첫 턴 전용 기술 ─────────────────────────────────
        const target = isSelfTargeting(move) ? user : e.getActive(e.foeOf(e.sideOf(user)))
        e.emit({ type: 'move_use', pokemon_id: user.id, move, target_id: target?.id ?? '' })
        user.last_move_used = move.name

        if (FIRST_TURN_ONLY.has(move.name) && (user.active_turns ?? 0) > 0) {
            this.fail(user, move, '첫 턴에만 성공한다')
            return finish()
        }

        // ── 보호 계열 (자신에게 사용) ───────────────────────
        if (move.name in PROTECT_MOVES) {
            this.useProtect(user, move, remaining)
            return finish()
        }
        this.resetProtectStreak(user)

        // ── 기습 / 기합펀치 ─────────────────────────────────
        if (move.name === 'sucker-punch' || move.name === 'thunderclap') {
            const foeAction = remaining.find(a => a.player !== e.sideOf(user))
            const foe = foeAction ? e.getPokemon(foeAction.pokemon_id) : undefined
            const foeMove = foe && foeAction?.type === 'move' ? this.resolveMove(foe, foeAction.move_index) : undefined
            if (!foeMove || foeMove.category === 'status') {
                this.fail(user, move, '실패')
                return finish()
            }
        }
        if (move.name === 'focus-punch' && (user.damaged_this_turn ?? 0) > 0) {
            this.fail(user, move, '집중이 흐트러졌다')
            return finish()
        }

        if (!target || target.fainted) {
            if (!isSelfTargeting(move)) {
                this.fail(user, move, '대상이 없다')
                return finish()
            }
        }

        this.useMove(user, target!, move, index, remaining)
        finish()
    }

    // ─── 행동 가능 여부 (수면/얼음/풀죽음/혼란/마비) ─────────────
    private canAct(user: BattlePokemon, move: MoveData): boolean {
        const e = this.engine
        if (user.status === 'sleep') {
            user.status_turns -= user.ability === 'early-bird' ? 2 : 1
            if (user.status_turns <= 0) {
                e.cureStatus(user.id)
            } else if (move.name !== 'sleep-talk' && move.name !== 'snore') {
                e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'sleep' })
                return false
            }
        }
        if (user.status === 'freeze') {
            if (THAW_MOVES.has(move.name) || e.rng.chance(20)) {
                e.cureStatus(user.id)
            } else {
                e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'freeze' })
                return false
            }
        }
        if ('flinch' in user.volatile_statuses) {
            e.removeVolatile(user, 'flinch', true)
            e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'flinch' })
            if (user.ability === 'steadfast') e.boost(user, 'speed', 1, user, 'steadfast')
            return false
        }
        const confusion = user.volatile_statuses.confusion
        if (confusion) {
            confusion.turns_remaining -= 1
            if (confusion.turns_remaining <= 0) {
                e.removeVolatile(user, 'confusion')
            } else if (e.rng.chance(33)) {
                const atk = getStat(user, 'attack')
                const def = getStat(user, 'defense')
                const dmg = Math.floor(Math.floor(Math.floor(2 * user.level / 5 + 2) * 40 * atk / def) / 50) + 2
                e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'confusion' })
                e.applyDamage(user.id, dmg, 'confusion')
                return false
            }
        }
        if (user.status === 'paralysis' && e.rng.chance(25)) {
            e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'paralysis' })
            return false
        }
        if ('infatuation' in user.volatile_statuses && e.rng.chance(50)) {
            e.emit({ type: 'cant_move', pokemon_id: user.id, reason: 'infatuation' })
            return false
        }
        return true
    }

    private fail(user: BattlePokemon, move: MoveData, reason: string): void {
        this.engine.emit({ type: 'move_fail', pokemon_id: user.id, move, reason })
    }

    // ─── 방어 ───────────────────────────────────────────────────
    private resetProtectStreak(user: BattlePokemon): void {
        delete user.volatile_statuses.protect_streak
    }

    private useProtect(user: BattlePokemon, move: MoveData, remaining: Action[]): void {
        const e = this.engine
        const info = PROTECT_MOVES[move.name]!
        const streak = user.volatile_statuses.protect_streak?.turns_remaining ?? 0
        const movesLast = remaining.length === 0
        const success = !movesLast && (info.alwaysSucceeds || streak === 0 || e.rng.next() < Math.pow(1 / 3, streak))
        if (!success) {
            this.resetProtectStreak(user)
            this.fail(user, move, '실패')
            return
        }
        user.volatile_statuses.protect_streak = { turns_remaining: streak + 1 }
        const volatile: VolatileStatus = move.name === 'obstruct' ? 'obstruct' : info.volatile
        user.volatile_statuses[volatile] = { turns_remaining: 1 }
        e.emit({ type: 'volatile_apply', pokemon_id: user.id, volatile })
    }

    /** 보호에 막혔는지 + 접촉 페널티 */
    private checkProtected(user: BattlePokemon, target: BattlePokemon, move: MoveData): boolean {
        const e = this.engine
        if (target === user || BYPASS_PROTECT.has(move.name)) return false
        const vs = target.volatile_statuses
        const kind = (['protect', 'kings_shield', 'spiky_shield', 'baneful_bunker', 'silk_trap', 'burning_bulwark', 'obstruct'] as VolatileStatus[])
            .find(v => v in vs)
        if (!kind) return false
        if (move.category === 'status' && kind !== 'protect' && kind !== 'spiky_shield' && kind !== 'baneful_bunker' && kind !== 'burning_bulwark') return false
        const contact = isContact(move) && user.ability !== 'long-reach' && user.item !== 'protective-pads'
        if (contact && user.ability === 'unseen-fist') return false

        this.fail(user, move, 'protect')
        if (contact) {
            switch (kind) {
                case 'kings_shield':    e.boost(user, 'attack', -1, target, 'kings-shield'); break
                case 'obstruct':        e.boost(user, 'defense', -2, target, 'obstruct'); break
                case 'silk_trap':       e.boost(user, 'speed', -1, target, 'silk-trap'); break
                case 'spiky_shield':    e.applyIndirectDamage(user, Math.floor(user.max_hp / 8), 'spiky-shield'); break
                case 'baneful_bunker':  e.trySetStatus(user, 'poison', target, 'baneful-bunker'); break
                case 'burning_bulwark': e.trySetStatus(user, 'burn', target, 'burning-bulwark'); break
            }
        }
        if (move.name === 'high-jump-kick' || move.name === 'jump-kick' || move.name === 'supercell-slam') {
            e.applyIndirectDamage(user, Math.floor(user.max_hp / 2), 'crash')
        }
        return true
    }

    // ─── 명중 판정 ──────────────────────────────────────────────
    private checkHit(user: BattlePokemon, target: BattlePokemon, move: MoveData): boolean {
        const e = this.engine
        if (target === user) return true
        if (user.ability === 'no-guard' || target.ability === 'no-guard') return true
        const weather = e.effectiveWeather()
        if (move.name === 'toxic' && user.types.includes('poison')) return true
        if ((move.name === 'thunder' || move.name === 'hurricane' || move.name === 'bleakwind-storm' || move.name === 'wildbolt-storm' || move.name === 'sandsear-storm') && (weather === 'rain' || weather === 'heavy_rain')) return true
        if (move.name === 'blizzard' && weather === 'snow') return true

        let accuracy = move.accuracy
        if (accuracy === null || accuracy === undefined) return true
        if (FIXED_DAMAGE_MOVES[move.name] === 'ohko') {
            if (target.level > user.level || target.ability === 'sturdy') return false
            if (move.name === 'sheer-cold' && target.types.includes('ice')) return false
            return e.rng.chance(30 + user.level - target.level)
        }
        if ((move.name === 'thunder' || move.name === 'hurricane') && (weather === 'sun' || weather === 'harsh_sun')) accuracy = 50

        const ignoreEvasion = user.ability === 'keen-eye' || user.ability === 'minds-eye' || user.ability === 'unaware'
        const accStage = target.ability === 'unaware' ? 0 : user.stages.accuracy
        const evaStage = ignoreEvasion ? Math.min(0, target.stages.evasion) : target.stages.evasion
        const net = Math.max(-6, Math.min(6, accStage - evaStage))
        let chance = accuracy * (ACC_STAGE[net] ?? 1)
        if (user.ability === 'compound-eyes') chance *= 1.3
        if (user.ability === 'hustle' && move.category === 'physical') chance *= 0.8
        if (user.item === 'wide-lens') chance *= 1.1
        if (user.item === 'zoom-lens' && target.moved_this_turn) chance *= 1.2
        if (target.item === 'bright-powder') chance *= 0.9
        if (e.getState().field.conditions.gravity) chance *= 5 / 3
        return e.rng.next() * 100 < chance
    }

    // ─── 기술 사용 본체 ─────────────────────────────────────────
    private useMove(user: BattlePokemon, target: BattlePokemon, move: MoveData, index: number, remaining: Action[]): void {
        const e = this.engine
        const field = e.getState().field
        const foeTargeted = !isSelfTargeting(move)

        if (foeTargeted && target !== user) {
            // 사이코필드: 우선도 기술 차단
            if (field.terrain === 'psychic' && e.isGroundedNow(target) && getEffectivePriority(e, user, move) > 0) {
                this.fail(user, move, 'psychic-terrain')
                return
            }
            // 장난꾸러기 → 악타입 무효
            if (user.ability === 'prankster' && move.category === 'status' && target.types.includes('dark')) {
                e.emit({ type: 'immune', pokemon_id: target.id, source: 'dark' })
                return
            }
            if (['dazzling', 'queenly-majesty', 'armor-tail'].includes(target.ability) && getEffectivePriority(e, user, move) > 0) {
                e.emit({ type: 'immune', pokemon_id: target.id, source: target.ability })
                return
            }
            if (this.checkProtected(user, target, move)) {
                if (RAMPAGE_MOVES.has(move.name)) user.locked_move = null
                return
            }
            // 매직미러 (변화기 반사)
            if (move.category === 'status' && target.ability === 'magic-bounce' && !BYPASS_PROTECT.has(move.name) && move.name !== 'roar-of-time') {
                e.emit({ type: 'ability_trigger', pokemon_id: target.id, ability: 'magic-bounce', effect: 'reflect' })
                if (move.target === 'opponents-field') {
                    this.executeStatusMove(target, user, move, remaining)
                } else {
                    this.executeStatusMove(target, user, move, remaining)
                }
                return
            }
            if (move.category === 'status' && target.ability === 'good-as-gold') {
                e.emit({ type: 'immune', pokemon_id: target.id, source: 'good-as-gold' })
                return
            }
            if (!this.checkHit(user, target, move)) {
                e.emit({ type: 'move_miss', pokemon_id: user.id, move, target_id: target.id })
                if (move.name === 'high-jump-kick' || move.name === 'jump-kick' || move.name === 'supercell-slam') {
                    e.applyIndirectDamage(user, Math.floor(user.max_hp / 2), 'crash')
                }
                if (RAMPAGE_MOVES.has(move.name)) user.locked_move = null
                return
            }
        }

        if (move.category === 'status') {
            this.executeStatusMove(user, target, move, remaining)
        } else {
            this.executeDamagingMove(user, target, move, index)
        }
    }

    // ─── 공격기 ─────────────────────────────────────────────────
    private executeDamagingMove(user: BattlePokemon, target: BattlePokemon, move: MoveData, index: number): void {
        const e = this.engine
        const state = e.getState()
        const field = state.field
        const userSide = state.sides[e.sideOf(user)]
        const targetSide = state.sides[e.sideOf(target)]
        const typeChart = getTypeChart()
        const moveType = getMoveType(user, move, e.effectiveWeather(), field.terrain)
        const patch = getMovePatch(move.name)
        const sheerForce = user.ability === 'sheer-force'

        const hits = this.rollHits(user, move)
        let totalDamage = 0
        let hitCount = 0
        let lastEffectiveness = 1
        let anyCrit = false
        let hitSub = false

        for (let h = 0; h < hits; h++) {
            if (target.fainted || user.fainted) break
            const isCrit = this.rollCrit(user, target, move)
            const triplePower = move.name === 'triple-axel' ? { ...move, power: (move.power ?? 20) * (h + 1) } : move
            const result = calcDamage({
                attacker:    user,
                defender:    target,
                move:        triplePower,
                weather:     e.effectiveWeather(),
                terrain:     field.terrain,
                typeChart,
                isCrit,
                randomRoll:  e.rng.int(85, 100),
                reflect:     !!targetSide.conditions.reflect,
                lightScreen: !!targetSide.conditions.light_screen,
                auroraVeil:  !!targetSide.conditions.aurora_veil,
                gravity:     !!field.conditions.gravity,
                faintedAllies: userSide.team.filter(p => p.fainted).length,
            })

            if (h === 0) {
                if (result.immuneReason?.startsWith('ability:')) {
                    this.onAbsorbImmunity(user, target, moveType)
                    if (RAMPAGE_MOVES.has(move.name)) user.locked_move = null
                    return
                }
                if (result.damage === 0 && result.effectiveness === 0) {
                    e.emit({ type: 'immune', pokemon_id: target.id, source: 'type' })
                    if (RAMPAGE_MOVES.has(move.name)) user.locked_move = null
                    if (move.name === 'high-jump-kick' || move.name === 'jump-kick') e.applyIndirectDamage(user, Math.floor(user.max_hp / 2), 'crash')
                    return
                }
                if (result.damage === 0 && result.immuneReason === 'weather') {
                    this.fail(user, move, 'weather')
                    return
                }
                if (result.damage === 0 && FIXED_DAMAGE_MOVES[move.name]) {
                    this.fail(user, move, '실패')
                    return
                }
            }
            lastEffectiveness = result.effectiveness
            anyCrit ||= isCrit

            let damage = result.damage
            // 대타출동
            const bypassSub = SOUND_MOVES.has(move.name) || user.ability === 'infiltrator'
            if (target.substitute_hp > 0 && !bypassSub) {
                const absorbed = Math.min(target.substitute_hp, damage)
                target.substitute_hp -= absorbed
                totalDamage += absorbed
                hitCount++
                hitSub = true
                e.emit({ type: 'damage', pokemon_id: target.id, amount: 0, source: 'substitute', effectiveness: result.effectiveness, crit: isCrit })
                if (target.substitute_hp <= 0) {
                    target.substitute_hp = 0
                    e.removeVolatile(target, 'substitute')
                }
                continue
            }

            // 버티기 / 기합의띠 / 옹골참 / 칼등치기
            if (damage >= target.hp) {
                const full = target.hp === target.max_hp
                if ('endure' in target.volatile_statuses) {
                    damage = target.hp - 1
                    e.message(`${target.nickname} 은(는) 공격을 버텼다!`)
                } else if (move.name === 'false-swipe' || move.name === 'hold-back') {
                    damage = target.hp - 1
                } else if (full && target.ability === 'sturdy') {
                    damage = target.hp - 1
                    e.emit({ type: 'ability_trigger', pokemon_id: target.id, ability: 'sturdy', effect: 'endure' })
                } else if (full && target.item === 'focus-sash') {
                    damage = target.hp - 1
                    e.consumeItem(target)
                }
            }

            const dealt = e.applyDamage(target.id, damage, move.name, { effectiveness: result.effectiveness, crit: isCrit })
            totalDamage += dealt
            hitCount++

            // 풍선 파괴
            if (target.item === 'air-balloon' && dealt > 0) e.removeItem(target, 'pop')

            // 접촉 효과
            if (isContact(move) && user.item !== 'protective-pads' && !user.fainted) {
                this.onContact(user, target)
            }
            if ((target.ability === 'stamina') && dealt > 0 && !target.fainted) e.boost(target, 'defense', 1, target, 'stamina')
            if (target.ability === 'weak-armor' && move.category === 'physical' && dealt > 0 && !target.fainted) {
                e.boost(target, 'defense', -1, target, 'weak-armor')
                e.boost(target, 'speed', 2, target, 'weak-armor')
            }
            if (target.ability === 'justified' && moveType === 'dark' && !target.fainted) e.boost(target, 'attack', 1, target, 'justified')
            if (target.ability === 'rattled' && ['dark', 'bug', 'ghost'].includes(moveType) && !target.fainted) e.boost(target, 'speed', 1, target, 'rattled')
            if (target.ability === 'water-compaction' && moveType === 'water' && !target.fainted) e.boost(target, 'defense', 2, target, 'water-compaction')
            if (target.ability === 'steam-engine' && (moveType === 'water' || moveType === 'fire') && !target.fainted) e.boost(target, 'speed', 6, target, 'steam-engine')
            if (target.ability === 'thermal-exchange' && moveType === 'fire' && !target.fainted) e.boost(target, 'attack', 1, target, 'thermal-exchange')
            if (target.ability === 'anger-shell' && !target.fainted) {
                const before = target.hp + dealt
                if (before > target.max_hp / 2 && target.hp <= target.max_hp / 2) {
                    for (const [s, c] of [['attack', 1], ['special_attack', 1], ['speed', 1], ['defense', -1], ['special_defense', -1]] as const) e.boost(target, s, c, target, 'anger-shell')
                }
            }
        }

        if (hits > 1) e.emit({ type: 'hit_count', pokemon_id: target.id, hits: hitCount })
        if (hitCount === 0) return

        // ── 흡수 / 반동 ──────────────────────────────────────
        const drain = patch?.drain ?? move.meta?.drain ?? 0
        if (drain > 0 && !user.fainted && totalDamage > 0) {
            const amount = Math.max(1, Math.floor(totalDamage * drain / 100 * (user.item === 'big-root' ? 1.3 : 1)))
            if (target.ability === 'liquid-ooze') e.applyIndirectDamage(user, amount, 'liquid-ooze')
            else e.applyHeal(user.id, amount, 'drain')
        }
        if (drain < 0 && !user.fainted && totalDamage > 0 && user.ability !== 'rock-head') {
            e.applyIndirectDamage(user, Math.max(1, Math.floor(totalDamage * Math.abs(drain) / 100)), 'recoil')
        }
        if (move === STRUGGLE && !user.fainted) {
            e.applyDamage(user.id, Math.max(1, Math.floor(user.max_hp / 4)), 'recoil')
        }
        if ((move.name === 'mind-blown' || move.name === 'steel-beam' || move.name === 'chloroblast') && !user.fainted) {
            e.applyIndirectDamage(user, Math.ceil(user.max_hp / 2), 'recoil')
        }
        if (['explosion', 'self-destruct', 'misty-explosion'].includes(move.name) && !user.fainted) {
            e.faintPokemon(user.id)
        }

        // ── 생명의구슬 / 조개껍질방울 ────────────────────────
        const hasSecondary = (move.meta?.ailment_chance ?? 0) > 0 || (move.meta?.flinch_chance ?? 0) > 0 || (patch?.ailmentChance ?? 0) > 0
        if (user.item === 'life-orb' && !user.fainted && user.ability !== 'magic-guard' && !(sheerForce && hasSecondary)) {
            e.applyDamage(user.id, Math.max(1, Math.floor(user.max_hp / 10)), 'life-orb')
        }
        if (user.item === 'shell-bell' && !user.fainted && totalDamage > 0) {
            e.applyHeal(user.id, Math.floor(totalDamage / 8), 'shell-bell')
        }

        // ── 부가효과 ─────────────────────────────────────────
        const blocked = sheerForce || hitSub || target.ability === 'shield-dust' || target.item === 'covert-cloak'
        const serene = user.ability === 'serene-grace' ? 2 : 1
        if (!target.fainted && !blocked) {
            const ailment = patch?.ailment ?? move.meta?.ailment
            const ailmentChance = patch?.ailmentChance ?? move.meta?.ailment_chance ?? 0
            if (ailment && ailment !== 'none' && ailmentChance > 0 && e.rng.chance(ailmentChance * serene)) {
                if (ailment === 'confusion') e.tryConfuse(target, user)
                else if (AILMENT_MAP[ailment]) {
                    // 트라이어택 / 독찌르기 등. 독/화상 기술 타입 면역 반영
                    e.trySetStatus(target, AILMENT_MAP[ailment]!, user, move.name)
                } else if (ailment === 'trap') {
                    this.applyBind(user, target)
                }
            }
            const flinch = patch?.flinch ?? move.meta?.flinch_chance ?? 0
            if (flinch > 0 && !target.moved_this_turn && target.ability !== 'inner-focus' && e.rng.chance(flinch * serene)) {
                target.volatile_statuses.flinch = { turns_remaining: 1 }
            }
            if (!flinch && (user.item === 'kings-rock' || user.item === 'razor-fang' || user.ability === 'stench') && !target.moved_this_turn && e.rng.chance(10)) {
                target.volatile_statuses.flinch = { turns_remaining: 1 }
            }
        }
        const stats = getStatEffects(move)
        if (stats.target.length > 0 && !target.fainted && !blocked && e.rng.chance(stats.chance * serene)) {
            for (const sc of stats.target) e.boost(target, sc.stat, sc.change, user, move.name)
        }
        if (stats.self.length > 0 && !user.fainted) {
            const isBuff = stats.self.some(s => s.change > 0)
            if (!(sheerForce && isBuff && stats.chance < 100) && e.rng.chance(isBuff ? stats.chance * serene : 100)) {
                for (const sc of stats.self) e.boost(user, sc.stat, sc.change, user, move.name)
            }
        }
        // 동적 부가효과 (트리플 화살 등은 패치에서 처리)
        if (move.name === 'ancient-power' || move.name === 'silver-wind' || move.name === 'ominous-wind') {
            // stat_changes 로 처리됨
        }

        // ── 특수 효과 ────────────────────────────────────────
        if (move.name === 'knock-off' && !target.fainted && target.item && !hitSub) e.removeItem(target, 'knock-off')
        if ((move.name === 'thief' || move.name === 'covet') && !user.item && target.item && !hitSub) {
            const stolen = e.removeItem(target, move.name)
            if (stolen) user.item = stolen
        }
        if (HAZARD_CLEAR_SELF.has(move.name) && !user.fainted) this.clearHazards(e.sideOf(user))
        if (move.name === 'mortal-spin' || move.name === 'rapid-spin') {
            e.removeVolatile(user, 'seeded'); e.removeVolatile(user, 'bound')
        }
        if ((move.name === 'stone-axe' || move.name === 'ceaseless-edge') && !hitSub) {
            const hazard: SideCondition = move.name === 'stone-axe' ? 'stealth_rock' : 'spikes'
            e.addSideCondition(e.sideOf(target), hazard, Infinity, hazard === 'spikes' ? 3 : 1)
        }
        if (move.name === 'salt-cure' && !target.fainted && !hitSub) e.addVolatile(target, 'salt_cure')
        if ((move.name === 'brick-break' || move.name === 'psychic-fangs' || move.name === 'raging-bull') && !hitSub) {
            for (const c of ['reflect', 'light_screen', 'aurora_veil'] as SideCondition[]) e.removeSideCondition(e.sideOf(target), c)
        }
        if (move.name === 'ice-spinner' || move.name === 'steel-roller') e.setTerrain(null, move.name)
        if (moveType === 'fire' && target.status === 'freeze' && !target.fainted) e.cureStatus(target.id)
        if (move.name === 'smack-down' || move.name === 'thousand-arrows') {
            if (target.item === 'air-balloon') e.removeItem(target, move.name)
            e.removeVolatile(target, 'magnet_rise')
        }
        if (['fire-spin', 'whirlpool', 'sand-tomb', 'magma-storm', 'infestation', 'bind', 'wrap', 'clamp', 'snap-trap', 'thunder-cage'].includes(move.name) && !target.fainted && !hitSub) {
            this.applyBind(user, target)
        }
        if (move.name === 'make-it-rain') { /* 자기 랭크 하락은 패치에서 처리 */ }

        // ── 반동턴 ───────────────────────────────────────────
        if (RECHARGE_MOVES.has(move.name) && !user.fainted) user.must_recharge = true

        // ── 난동 ─────────────────────────────────────────────
        if (RAMPAGE_MOVES.has(move.name) && !user.fainted) {
            if (!user.locked_move) {
                user.locked_move = { index, turns: e.rng.int(1, 2), kind: 'rampage' }
            } else {
                user.locked_move.turns -= 1
                if (user.locked_move.turns <= 0) {
                    user.locked_move = null
                    e.tryConfuse(user, null)
                }
            }
        }

        // ── 약점보험 ─────────────────────────────────────────
        if (target.item === 'weakness-policy' && lastEffectiveness > 1 && !target.fainted && !hitSub) {
            e.consumeItem(target)
            e.boost(target, 'attack', 2, target, 'weakness-policy')
            e.boost(target, 'special_attack', 2, target, 'weakness-policy')
        }

        // ── 기절시킨 경우 특성 ────────────────────────────────
        if (target.fainted && !user.fainted) {
            if (user.ability === 'moxie' || user.ability === 'chilling-neigh' || user.ability === 'as-one-glastrier') e.boost(user, 'attack', 1, user, user.ability)
            if (user.ability === 'grim-neigh' || user.ability === 'as-one-spectrier') e.boost(user, 'special_attack', 1, user, user.ability)
            if (user.ability === 'beast-boost') {
                const keys: (keyof StatStages)[] = ['attack', 'defense', 'special_attack', 'special_defense', 'speed']
                const best = keys.reduce((a, b) => (user.stats[b as 'attack'] > user.stats[a as 'attack'] ? b : a))
                e.boost(user, best, 1, user, 'beast-boost')
            }
            if ('destiny_bond' in target.volatile_statuses) e.faintPokemon(user.id)
        }
        void anyCrit

        // ── 강제 교체 (드래곤테일 등) ─────────────────────────
        if (FORCE_SWITCH_MOVES.has(move.name) && !target.fainted && !hitSub) {
            this.forceSwitch(target)
        }

        // ── 자신 교체 (유턴 등) ───────────────────────────────
        if (SELF_SWITCH_MOVES.has(move.name) && !user.fainted) {
            e.requestSelfSwitch(user)
        }
    }

    private onAbsorbImmunity(user: BattlePokemon, target: BattlePokemon, moveType: string): void {
        const e = this.engine
        const a = target.ability
        e.emit({ type: 'immune', pokemon_id: target.id, source: a })
        if ((a === 'volt-absorb' && moveType === 'electric') || ((a === 'water-absorb' || a === 'dry-skin') && moveType === 'water') || (a === 'earth-eater' && moveType === 'ground')) {
            e.applyHeal(target.id, Math.floor(target.max_hp / 4), a)
        }
        if (a === 'motor-drive') e.boost(target, 'speed', 1, target, a)
        if (a === 'lightning-rod' || a === 'storm-drain') e.boost(target, 'special_attack', 1, target, a)
        if (a === 'sap-sipper' || a === 'wind-rider') e.boost(target, 'attack', 1, target, a)
        if (a === 'well-baked-body') e.boost(target, 'defense', 2, target, a)
        if (a === 'flash-fire') e.addVolatile(target, 'flash_fire')
        void user
    }

    private onContact(user: BattlePokemon, target: BattlePokemon): void {
        const e = this.engine
        const a = target.ability
        if ((a === 'rough-skin' || a === 'iron-barbs')) e.applyIndirectDamage(user, Math.floor(user.max_hp / 8), a)
        if (target.item === 'rocky-helmet' && !user.fainted) e.applyIndirectDamage(user, Math.floor(user.max_hp / 6), 'rocky-helmet')
        if (user.fainted) return
        if (a === 'static' && e.rng.chance(30)) e.trySetStatus(user, 'paralysis', target, a)
        if (a === 'flame-body' && e.rng.chance(30)) e.trySetStatus(user, 'burn', target, a)
        if (a === 'poison-point' && e.rng.chance(30)) e.trySetStatus(user, 'poison', target, a)
        if (a === 'effect-spore' && !user.types.includes('grass') && user.ability !== 'overcoat' && user.item !== 'safety-goggles' && e.rng.chance(30)) {
            e.trySetStatus(user, e.rng.pick(['sleep', 'paralysis', 'poison'] as PrimaryStatus[]), target, a)
        }
        if ((a === 'gooey' || a === 'tangling-hair')) e.boost(user, 'speed', -1, target, a)
        if (a === 'cute-charm' && e.rng.chance(30)) e.addVolatile(user, 'infatuation')
        if (user.ability === 'poison-touch' && !target.fainted && e.rng.chance(30)) e.trySetStatus(target, 'poison', user, 'poison-touch')
        if (a === 'perish-body' || a === 'cursed-body' || a === 'wandering-spirit' || a === 'mummy' || a === 'lingering-aroma') {
            // 미구현 특성 – 무시
        }
    }

    private applyBind(user: BattlePokemon, target: BattlePokemon): void {
        if ('bound' in target.volatile_statuses || target.fainted) return
        const turns = user.item === 'grip-claw' ? 7 : this.engine.rng.int(4, 5)
        target.volatile_statuses.bound = { turns_remaining: turns, source: user.item === 'binding-band' ? 'binding-band' : user.id }
        this.engine.emit({ type: 'volatile_apply', pokemon_id: target.id, volatile: 'bound' })
    }

    private clearHazards(player: PlayerID): void {
        for (const c of ['stealth_rock', 'spikes', 'toxic_spikes', 'sticky_web'] as SideCondition[]) {
            this.engine.removeSideCondition(player, c)
        }
    }

    private forceSwitch(target: BattlePokemon): boolean {
        const e = this.engine
        const player = e.sideOf(target)
        const side: Side = e.getSide(player)
        if (target.ability === 'suction-cups' || 'ingrain' in target.volatile_statuses) return false
        const bench = side.team.filter(p => !p.fainted && !side.active.includes(p))
        if (bench.length === 0) return false
        const next = e.rng.pick(bench)
        e.switchPokemon(player, target.id, next.id, true)
        return true
    }

    // ─── 다중 히트 / 급소 ────────────────────────────────────────
    private rollHits(user: BattlePokemon, move: MoveData): number {
        const patch = getMovePatch(move.name)
        const min = patch?.minHits ?? move.meta?.min_hits
        const max = patch?.maxHits ?? move.meta?.max_hits
        if (!min || !max) return 1
        if (min === max) return min
        if (user.ability === 'skill-link') return max
        if (user.item === 'loaded-dice') return this.engine.rng.int(Math.max(min, 4), max)
        const roll = this.engine.rng.next()
        // 2:35%, 3:35%, 4:15%, 5:15%
        if (roll < 0.35) return 2
        if (roll < 0.70) return 3
        if (roll < 0.85) return 4
        return 5
    }

    private rollCrit(user: BattlePokemon, target: BattlePokemon, move: MoveData): boolean {
        const e = this.engine
        if (['battle-armor', 'shell-armor'].includes(target.ability)) return false
        if (e.getSide(e.sideOf(target)).conditions.lucky_chant) return false
        if (user.ability === 'merciless' && (target.status === 'poison' || target.status === 'toxic')) return true
        let stage = (move.meta?.crit_rate ?? 0) + (getMovePatch(move.name)?.crit ?? 0)
        if ('focus_energy' in user.volatile_statuses) stage += 2
        if (user.ability === 'super-luck') stage += 1
        if (user.item === 'scope-lens' || user.item === 'razor-claw') stage += 1
        if (user.item === 'leek' && user.species.startsWith('farfetchd') || user.item === 'lucky-punch' && user.species === 'chansey') stage += 2
        stage = Math.min(3, stage)
        return stage >= 3 || e.rng.next() < CRIT_CHANCE[stage]!
    }

    // ─── 변화기 ─────────────────────────────────────────────────
    private executeStatusMove(user: BattlePokemon, target: BattlePokemon, move: MoveData, remaining: Action[]): void {
        const e = this.engine
        const state = e.getState()
        const userPlayer = e.sideOf(user)
        const foePlayer = e.foeOf(userPlayer)
        const name = move.name
        const foe = e.getActive(foePlayer)
        const foeTargeted = !isSelfTargeting(move) && target !== user

        // 대타출동은 상대 대상 변화기를 막는다 (소리 기술 제외)
        if (foeTargeted && target.substitute_hp > 0 && !SOUND_MOVES.has(name) && user.ability !== 'infiltrator') {
            this.fail(user, move, 'substitute')
            return
        }
        // 가루 기술 면역
        if (foeTargeted && POWDER_MOVES.has(name) && (target.types.includes('grass') || target.ability === 'overcoat' || target.item === 'safety-goggles')) {
            e.emit({ type: 'immune', pokemon_id: target.id, source: 'powder' })
            return
        }

        // ── 날씨 / 필드 ──────────────────────────────────────
        if (name in WEATHER_MOVES) {
            if (!e.setWeather(WEATHER_MOVES[name]!, name, user)) this.fail(user, move, '실패')
            if (name === 'chilly-reception') e.requestSelfSwitch(user)
            return
        }
        if (name in TERRAIN_MOVES) {
            if (!e.setTerrain(TERRAIN_MOVES[name]!, name, user)) this.fail(user, move, '실패')
            return
        }

        // ── 해저드 ───────────────────────────────────────────
        if (name in HAZARD_MOVES) {
            const cond = HAZARD_MOVES[name]!
            const max = cond === 'spikes' ? 3 : cond === 'toxic_spikes' ? 2 : 1
            const sidePlayer = user === target && move.target === 'opponents-field' ? foePlayer : (target === user ? foePlayer : e.sideOf(target))
            if (!e.addSideCondition(sidePlayer, cond, Infinity, max)) this.fail(user, move, '실패')
            return
        }

        // ── 스크린 / 순풍 ────────────────────────────────────
        if (name in SCREEN_MOVES) {
            const cond = SCREEN_MOVES[name]!
            if (cond === 'aurora_veil' && e.effectiveWeather() !== 'snow') {
                this.fail(user, move, '실패')
                return
            }
            let turns = cond === 'tailwind' ? 4 : 5
            if ((cond === 'reflect' || cond === 'light_screen' || cond === 'aurora_veil') && user.item === 'light-clay') turns = 8
            if (!e.addSideCondition(userPlayer, cond, turns)) this.fail(user, move, '실패')
            if (cond === 'tailwind' && user.ability === 'wind-rider') e.boost(user, 'attack', 1, user, 'wind-rider')
            return
        }

        switch (name) {
            // ── 필드 상태 ─────────────────────────────────────
            case 'trick-room':
                e.toggleFieldCondition('trick_room', 5)
                return
            case 'gravity':
                if (state.field.conditions.gravity) return this.fail(user, move, '실패')
                e.toggleFieldCondition('gravity', 5)
                return
            case 'magic-room':
            case 'wonder-room':
                e.toggleFieldCondition(name === 'magic-room' ? 'magic_room' : 'wonder_room', 5)
                return
            case 'haze':
                for (const p of e.allActive()) {
                    p.stages = { attack: 0, defense: 0, special_attack: 0, special_defense: 0, speed: 0, accuracy: 0, evasion: 0 }
                }
                e.message('모든 랭크 변화가 원래대로 돌아왔다!')
                return
            case 'defog':
                if (foe && !foe.fainted) e.boost(foe, 'evasion', -1, user, name)
                for (const c of ['reflect', 'light_screen', 'aurora_veil', 'safeguard', 'mist'] as SideCondition[]) e.removeSideCondition(foePlayer, c)
                this.clearHazards(foePlayer)
                this.clearHazards(userPlayer)
                if (state.field.terrain) e.setTerrain(null, 'defog')
                return
            case 'court-change': {
                const a = state.sides.p1.conditions
                state.sides.p1.conditions = state.sides.p2.conditions
                state.sides.p2.conditions = a
                e.message('서로의 필드 효과를 바꿨다!')
                return
            }

            // ── 회복 ──────────────────────────────────────────
            case 'rest':
                if (user.hp >= user.max_hp || user.status === 'sleep' || ['insomnia', 'vital-spirit', 'comatose'].includes(user.ability)) return this.fail(user, move, '실패')
                if (state.field.terrain === 'electric' && e.isGroundedNow(user)) return this.fail(user, move, '실패')
                if (user.status) e.cureStatus(user.id)
                user.status = 'sleep'
                user.status_turns = 3
                e.emit({ type: 'status_apply', pokemon_id: user.id, status: 'sleep', source: 'rest' })
                e.applyHeal(user.id, user.max_hp, 'rest')
                return
            case 'wish': {
                const side = state.sides[userPlayer]
                if (side.conditions.wish) return this.fail(user, move, '실패')
                side.conditions.wish = { turns_remaining: 2, amount: Math.floor(user.max_hp / 2) }
                return
            }
            case 'pain-split': {
                if (!foe || foe.fainted) return this.fail(user, move, '실패')
                const avg = Math.floor((user.hp + foe.hp) / 2)
                for (const p of [user, foe]) {
                    if (p.hp > avg) e.applyDamage(p.id, p.hp - avg, 'pain-split')
                    else e.applyHeal(p.id, avg - p.hp, 'pain-split')
                }
                return
            }
            case 'strength-sap': {
                if (!foe || foe.fainted || foe.stages.attack <= -6) return this.fail(user, move, '실패')
                const amount = getStat(foe, 'attack')
                e.boost(foe, 'attack', -1, user, name)
                e.applyHeal(user.id, amount, name)
                return
            }
            case 'heal-bell':
            case 'aromatherapy':
                for (const p of state.sides[userPlayer].team) if (p.status && !p.fainted) e.cureStatus(p.id)
                return
            case 'refresh':
                if (!user.status || user.status === 'sleep' || user.status === 'freeze') return this.fail(user, move, '실패')
                e.cureStatus(user.id)
                return
            case 'healing-wish':
            case 'lunar-dance':
                e.faintPokemon(user.id)
                return
            case 'memento':
                if (foe && !foe.fainted) {
                    e.boost(foe, 'attack', -2, user, name)
                    e.boost(foe, 'special_attack', -2, user, name)
                }
                e.faintPokemon(user.id)
                return

            // ── 자기 강화 / 상태 ───────────────────────────────
            case 'substitute': {
                const cost = Math.floor(user.max_hp / 4)
                if (user.substitute_hp > 0 || user.hp <= cost) return this.fail(user, move, '실패')
                e.applyDamage(user.id, cost, 'substitute')
                user.substitute_hp = cost
                e.addVolatile(user, 'substitute')
                return
            }
            case 'belly-drum': {
                const cost = Math.floor(user.max_hp / 2)
                if (user.hp <= cost || user.stages.attack >= 6) return this.fail(user, move, '실패')
                e.applyDamage(user.id, cost, 'belly-drum')
                e.boost(user, 'attack', 12, user, name)
                return
            }
            case 'fillet-away': {
                const cost = Math.floor(user.max_hp / 2)
                if (user.hp <= cost) return this.fail(user, move, '실패')
                e.applyDamage(user.id, cost, name)
                for (const s of ['attack', 'special_attack', 'speed']) e.boost(user, s, 2, user, name)
                return
            }
            case 'curse':
                if (user.types.includes('ghost')) {
                    if (!foe || foe.fainted) return this.fail(user, move, '실패')
                    e.applyDamage(user.id, Math.floor(user.max_hp / 2), 'curse')
                    if (!e.addVolatile(foe, 'curse')) this.fail(user, move, '실패')
                } else {
                    e.boost(user, 'speed', -1, user, name)
                    e.boost(user, 'attack', 1, user, name)
                    e.boost(user, 'defense', 1, user, name)
                }
                return
            case 'focus-energy':
            case 'aqua-ring':
            case 'ingrain':
            case 'magnet-rise':
            case 'destiny-bond': {
                const v = name.replace(/-/g, '_') as VolatileStatus
                if (!e.addVolatile(user, v, name === 'magnet-rise' ? 5 : name === 'destiny-bond' ? 1 : Infinity)) this.fail(user, move, '실패')
                if (name === 'ingrain') user.trapped = true
                return
            }
            case 'roost':
                if (user.hp >= user.max_hp) return this.fail(user, move, '실패')
                e.applyHeal(user.id, Math.ceil(user.max_hp / 2), name)
                if (user.types.includes('flying')) user.volatile_statuses.roost = { turns_remaining: 1 }
                return
            case 'shed-tail': {
                const cost = Math.ceil(user.max_hp / 2)
                if (user.hp <= cost) return this.fail(user, move, '실패')
                e.applyDamage(user.id, cost, name)
                e.requestSelfSwitch(user)
                return
            }
            case 'teleport':
            case 'baton-pass':
                if (!e.requestSelfSwitch(user)) this.fail(user, move, '실패')
                return
            case 'parting-shot':
                if (foe && !foe.fainted) {
                    e.boost(foe, 'attack', -1, user, name)
                    e.boost(foe, 'special_attack', -1, user, name)
                }
                e.requestSelfSwitch(user)
                return
            case 'roar':
            case 'whirlwind':
                if (!foe || foe.fainted || !this.forceSwitch(foe)) this.fail(user, move, '실패')
                return
            case 'trick':
            case 'switcheroo': {
                if (!foe || foe.fainted || (!user.item && !foe.item) || foe.ability === 'sticky-hold') return this.fail(user, move, '실패')
                const a = user.item
                user.item = foe.item
                foe.item = a
                user.choice_lock = null
                foe.choice_lock = null
                e.emit({ type: 'item_activate', pokemon_id: user.id, item: user.item ?? '', effect: name })
                e.emit({ type: 'item_activate', pokemon_id: foe.id, item: foe.item ?? '', effect: name })
                return
            }
            case 'taunt':
                if (!foe || foe.fainted || foe.ability === 'oblivious' || !e.addVolatile(foe, 'taunt', 3)) this.fail(user, move, '실패')
                return
            case 'yawn':
                if (!foe || foe.fainted || foe.status || 'yawn' in foe.volatile_statuses) return this.fail(user, move, '실패')
                e.addVolatile(foe, 'yawn', 2)
                return
            case 'leech-seed':
                if (!foe || foe.fainted || foe.types.includes('grass') || !e.addVolatile(foe, 'seeded', Infinity, user.id)) this.fail(user, move, '실패')
                return
            case 'encore':
            case 'disable':
            case 'torment':
            case 'heal-block':
            case 'embargo':
                if (!foe || foe.fainted) return this.fail(user, move, '실패')
                if (name === 'heal-block' || name === 'embargo') {
                    if (!e.addVolatile(foe, name.replace('-', '_') as VolatileStatus, 5)) this.fail(user, move, '실패')
                } else {
                    this.fail(user, move, '미구현')
                }
                return
            case 'sleep-talk': {
                if (user.status !== 'sleep') return this.fail(user, move, '실패')
                const options = (user.moves.filter(Boolean) as { move: MoveData }[])
                    .map(s => s.move).filter(m => m.name !== 'sleep-talk' && !(m.name in CHARGE_MOVES))
                if (options.length === 0) return this.fail(user, move, '실패')
                const picked = e.rng.pick(options)
                const t = isSelfTargeting(picked) ? user : foe
                e.emit({ type: 'move_use', pokemon_id: user.id, move: picked, target_id: t?.id ?? '' })
                if (!t || t.fainted) return
                this.useMove(user, t, picked, user.moves.findIndex(s => s?.move === picked), remaining)
                return
            }
            case 'protect':
                return

            // ── 타입/특성 변경 ─────────────────────────────────
            case 'soak':
            case 'magic-powder':
                if (!foe || foe.fainted || foe.terastallized) return this.fail(user, move, '실패')
                foe.types = [name === 'soak' ? 'water' : 'psychic']
                e.message(`${foe.nickname}의 타입이 바뀌었다!`)
                return
            case 'gastro-acid':
            case 'simple-beam':
            case 'worry-seed':
            case 'entrainment':
            case 'role-play':
            case 'skill-swap': {
                if (!foe || foe.fainted) return this.fail(user, move, '실패')
                if (name === 'gastro-acid') foe.ability = 'no-ability'
                if (name === 'simple-beam') foe.ability = 'simple'
                if (name === 'worry-seed') foe.ability = 'insomnia'
                if (name === 'entrainment') foe.ability = user.ability
                if (name === 'role-play') user.ability = foe.ability
                if (name === 'skill-swap') [user.ability, foe.ability] = [foe.ability, user.ability]
                e.emit({ type: 'ability_trigger', pokemon_id: foe.id, ability: foe.ability, effect: name })
                return
            }

            // ── 회복 계열 ──────────────────────────────────────
            case 'jungle-healing':
            case 'lunar-blessing':
                if (user.hp >= user.max_hp && !user.status) return this.fail(user, move, '실패')
                e.applyHeal(user.id, Math.floor(user.max_hp / 4), name)
                if (user.status) e.cureStatus(user.id)
                return
            case 'take-heart':
                e.boost(user, 'special_attack', 1, user, name)
                e.boost(user, 'special_defense', 1, user, name)
                if (user.status) e.cureStatus(user.id)
                return
            case 'heal-pulse':
            case 'floral-healing':
                // 싱글에서는 상대를 회복시킨다
                if (!foe || foe.fainted || foe.hp >= foe.max_hp) return this.fail(user, move, '실패')
                e.applyHeal(foe.id, Math.ceil(foe.max_hp / 2), name)
                return
            case 'life-dew':
                if (user.hp >= user.max_hp) return this.fail(user, move, '실패')
                e.applyHeal(user.id, Math.floor(user.max_hp / 4), name)
                return

            // ── 랭크 계열 ──────────────────────────────────────
            case 'acupressure': {
                const keys = (['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion'] as (keyof StatStages)[])
                    .filter(k => user.stages[k] < 6)
                if (keys.length === 0) return this.fail(user, move, '실패')
                e.boost(user, e.rng.pick(keys), 2, user, name)
                return
            }
            case 'dragon-cheer':
            case 'laser-focus':
                if (!e.addVolatile(user, 'focus_energy')) this.fail(user, move, '실패')
                return
            case 'speed-swap':
            case 'guard-split':
            case 'power-split':
            case 'heart-swap':
            case 'guard-swap':
            case 'power-swap': {
                if (!foe || foe.fainted) return this.fail(user, move, '실패')
                if (name === 'speed-swap') [user.stats.speed, foe.stats.speed] = [foe.stats.speed, user.stats.speed]
                const pairs: Record<string, (keyof StatStages)[]> = {
                    'guard-split': ['defense', 'special_defense'], 'power-split': ['attack', 'special_attack'],
                    'heart-swap': ['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion'],
                    'guard-swap': ['defense', 'special_defense'], 'power-swap': ['attack', 'special_attack'],
                }
                for (const k of pairs[name] ?? []) {
                    if (name.endsWith('-split') && k !== 'accuracy' && k !== 'evasion') {
                        const sk = k as 'attack'
                        const avg = Math.floor((user.stats[sk] + foe.stats[sk]) / 2)
                        user.stats[sk] = avg
                        foe.stats[sk] = avg
                    } else {
                        [user.stages[k], foe.stages[k]] = [foe.stages[k], user.stages[k]]
                    }
                }
                e.message('능력을 서로 바꿨다!')
                return
            }
            case 'spider-web':
            case 'block':
            case 'mean-look':
                if (!foe || foe.fainted || foe.trapped) return this.fail(user, move, '실패')
                foe.trapped = true
                e.message(`${foe.nickname}은(는) 도망칠 수 없게 되었다!`)
                return
            case 'splash':
            case 'celebrate':
            case 'hold-hands':
            case 'happy-hour':
                e.message('하지만 아무 일도 일어나지 않았다!')
                return
        }

        // ── 고정 비율 회복 ────────────────────────────────────
        if (name in HEAL_MOVES) {
            if (user.hp >= user.max_hp) return this.fail(user, move, '실패')
            const kind = HEAL_MOVES[name]!
            const w = e.effectiveWeather()
            let ratio = typeof kind === 'number' ? kind : 0.5
            if (kind === 'weather') ratio = w === 'sun' || w === 'harsh_sun' ? 2 / 3 : w ? 1 / 4 : 1 / 2
            if (kind === 'sand') ratio = w === 'sandstorm' ? 2 / 3 : 1 / 2
            e.applyHeal(user.id, Math.round(user.max_hp * ratio), name)
            return
        }

        // ── 일반: 랭크 변화 + 상태이상 ────────────────────────
        let didSomething = false
        const stats = getStatEffects(move)
        for (const sc of stats.self) {
            if (e.boost(user, sc.stat, sc.change, user, name) !== 0) didSomething = true
        }
        const statTarget = target === user ? foe : target
        if (stats.target.length > 0 && statTarget && !statTarget.fainted) {
            for (const sc of stats.target) {
                if (e.boost(statTarget, sc.stat, sc.change, user, name) !== 0) didSomething = true
            }
        }

        const ailment = move.meta?.ailment
        if (ailment && ailment !== 'none' && statTarget && !statTarget.fainted) {
            if (ailment === 'confusion') {
                if (e.tryConfuse(statTarget, user)) didSomething = true
            } else if (ailment === 'infatuation') {
                if (e.addVolatile(statTarget, 'infatuation')) didSomething = true
            } else if (AILMENT_MAP[ailment]) {
                let status = AILMENT_MAP[ailment]!
                if (name === 'toxic') status = 'toxic'
                // 전기 기술(전기자석파)은 땅 타입 무효
                const eff = calcTypeEffectiveness(move.type, statTarget.types.filter(Boolean) as string[], getTypeChart())
                if (name === 'thunder-wave' && eff === 0) {
                    e.emit({ type: 'immune', pokemon_id: statTarget.id, source: 'type' })
                    return
                }
                if (e.trySetStatus(statTarget, status, user, name)) didSomething = true
            }
        }

        if (!didSomething && (stats.self.length > 0 || stats.target.length > 0 || (ailment && ailment !== 'none'))) {
            this.fail(user, move, '효과가 없다')
        } else if (!didSomething && stats.self.length === 0 && stats.target.length === 0 && (!ailment || ailment === 'none')) {
            this.fail(user, move, '미구현 기술')
        }
    }
}
