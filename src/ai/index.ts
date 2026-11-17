// ─── 배틀 AI ──────────────────────────────────────────────────
import type { Action, BattleRequest, PlayerID } from '../types/battle'
import type { BattlePokemon } from '../types/pokemon'
import type { MoveData } from '../types/move'
import type { BattleEngine } from '../engine/BattleEngine'
import { calcDamage } from '../calc/damage'
import { getTypeChart } from '../data/loader'
import { PRNG } from '../utils/rng'
import {
    HAZARD_MOVES, HEAL_MOVES, SCREEN_MOVES, SELF_SWITCH_MOVES, WEATHER_MOVES, TERRAIN_MOVES,
    getStatEffects, isSelfTargeting,
} from '../data/moveTable'
import { PROTECT_MOVES } from '../effects/protect'

export interface BattleAI {
    readonly name: string
    chooseAction(engine: BattleEngine, player: PlayerID): Action | null
}

// ─── 무작위 AI ───────────────────────────────────────────────
export class RandomAI implements BattleAI {
    readonly name = 'random'
    private rng: PRNG
    constructor(seed?: number) {
        this.rng = new PRNG(seed)
    }
    chooseAction(engine: BattleEngine, player: PlayerID): Action | null {
        const actions = engine.getAvailableActions(player)
        if (actions.length === 0) return null
        // 교체만 계속 고르지 않도록 기술 선택 비중을 높임
        const moves = actions.filter(a => a.type === 'move' && !a.terastallize)
        if (moves.length > 0 && this.rng.chance(85)) return this.rng.pick(moves)
        return this.rng.pick(actions)
    }
}

// ─── 휴리스틱 AI ─────────────────────────────────────────────
export interface HeuristicAIOptions {
    seed?: number
    /** 0 = 항상 최선, 1 = 꽤 무작위 (기본 0.15) */
    randomness?: number
    /** 테라스탈 사용 여부 (기본 true) */
    useTera?: boolean
}

interface Scored { action: Action; score: number }

export class HeuristicAI implements BattleAI {
    readonly name = 'heuristic'
    private rng: PRNG
    private randomness: number
    private useTera: boolean

    constructor(opts: HeuristicAIOptions = {}) {
        this.rng = new PRNG(opts.seed)
        this.randomness = opts.randomness ?? 0.15
        this.useTera = opts.useTera ?? true
    }

    chooseAction(engine: BattleEngine, player: PlayerID): Action | null {
        const req = engine.getRequest(player)
        if (!req) return null
        if (req.type === 'switch') return this.chooseSwitch(engine, req, player)

        const user = req.active
        const foe = engine.getActive(engine.foeOf(player))
        const scored: Scored[] = []

        for (const opt of req.moves) {
            if (opt.disabled) continue
            const base = { type: 'move' as const, player, pokemon_id: user.id, move_index: opt.index }
            const score = this.scoreMove(engine, user, foe, opt.move, false)
            scored.push({ action: base, score })
            if (req.can_terastallize && this.useTera && opt.move.category !== 'status') {
                const teraScore = this.scoreMove(engine, user, foe, opt.move, true)
                // 테라스탈은 확실한 이득이 있을 때만
                if (teraScore > score * 1.25 || (teraScore >= 100 && score < 100)) {
                    scored.push({ action: { ...base, terastallize: true }, score: teraScore + 2 })
                }
            }
        }

        // 교체 고려: 상대가 우리를 확정적으로 잡고, 우리는 잡지 못할 때
        if (req.can_switch && foe && !foe.fainted) {
            const best = Math.max(0, ...scored.map(s => s.score))
            const threat = this.bestDamageRatio(engine, foe, user)
            const outspeeds = engine.getSpeed(user) > engine.getSpeed(foe)
            const inDanger = threat >= user.hp / user.max_hp && !(outspeeds && best >= 100)
            for (const p of req.switches) {
                const m = this.matchup(engine, p, foe)
                let score = m * 40 - 25
                if (inDanger) score += 30
                if (best < 25) score += 15
                if (user.stages.attack <= -2 || user.stages.special_attack <= -2) score += 20
                if ('curse' in user.volatile_statuses || 'seeded' in user.volatile_statuses || user.status === 'toxic' && user.status_turns > 2) score += 15
                scored.push({ action: { type: 'switch', player, pokemon_id: user.id, switch_to_id: p.id }, score })
            }
        }

        if (scored.length === 0) {
            const any = engine.getAvailableActions(player)
            return any[0] ?? null
        }
        return this.pick(scored)
    }

    private pick(scored: Scored[]): Action {
        const noise = this.randomness
        let best = scored[0]!
        let bestValue = -Infinity
        for (const s of scored) {
            const v = s.score * (1 + (this.rng.next() * 2 - 1) * noise) + this.rng.next() * noise * 10
            if (v > bestValue) { bestValue = v; best = s }
        }
        return best.action
    }

    private chooseSwitch(engine: BattleEngine, req: Extract<BattleRequest, { type: 'switch' }>, player: PlayerID): Action | null {
        const foe = engine.getActive(engine.foeOf(player))
        if (req.switches.length === 0) return null
        const scored = req.switches.map(p => ({
            action: { type: 'switch' as const, player, pokemon_id: req.active.id, switch_to_id: p.id },
            score: (foe && !foe.fainted ? this.matchup(engine, p, foe) * 50 : 0) + p.hp / p.max_hp * 20,
        }))
        return this.pick(scored)
    }

    /** 내 포켓몬 vs 상대: (내가 주는 비율) - (받는 비율) 기반 상성 점수 (-1~1 정도) */
    private matchup(engine: BattleEngine, mine: BattlePokemon, foe: BattlePokemon): number {
        const dealt = Math.min(1.2, this.bestDamageRatio(engine, mine, foe))
        const taken = Math.min(1.2, this.bestDamageRatio(engine, foe, mine) * (mine.max_hp / Math.max(1, mine.hp)))
        const faster = engine.getSpeed(mine) > engine.getSpeed(foe) ? 0.15 : 0
        return dealt - taken + faster
    }

    /** attacker 가 defender 에게 줄 수 있는 최대 데미지 / defender 최대 HP */
    private bestDamageRatio(engine: BattleEngine, attacker: BattlePokemon, defender: BattlePokemon): number {
        let best = 0
        for (const slot of attacker.moves) {
            if (!slot || slot.move.category === 'status' || slot.pp <= 0) continue
            const dmg = this.estimate(engine, attacker, defender, slot.move, false)
            best = Math.max(best, dmg / defender.max_hp)
        }
        // 기술을 모르는 상대(공개 안 됨)는 자속 80 위력 기준으로 추정
        if (best === 0 && attacker.moves.every(s => !s || s.move.category === 'status')) return 0.1
        return best
    }

    private estimate(engine: BattleEngine, attacker: BattlePokemon, defender: BattlePokemon, move: MoveData, tera: boolean): number {
        const state = engine.getState()
        const defSide = state.sides[engine.sideOf(defender)]
        const r = calcDamage({
            attacker, defender, move,
            weather:   engine.effectiveWeather(),
            terrain:   state.field.terrain,
            typeChart: getTypeChart(),
            randomRoll: 92,
            reflect:   !!defSide.conditions.reflect,
            lightScreen: !!defSide.conditions.light_screen,
            auroraVeil:  !!defSide.conditions.aurora_veil,
            isTerastallized: tera,
            faintedAllies: state.sides[engine.sideOf(attacker)].team.filter(p => p.fainted).length,
        })
        const hits = move.meta?.max_hits ? (move.meta.min_hits === move.meta.max_hits ? move.meta.max_hits : 3) : 1
        const acc = move.accuracy ? move.accuracy / 100 : 1
        return r.damage * hits * acc
    }

    private scoreMove(engine: BattleEngine, user: BattlePokemon, foe: BattlePokemon | undefined, move: MoveData, tera: boolean): number {
        const state = engine.getState()
        const userSide = state.sides[engine.sideOf(user)]
        const foeSide = foe ? state.sides[engine.sideOf(foe)] : undefined
        const hpRatio = user.hp / user.max_hp
        const foeAlive = !!foe && !foe.fainted
        const foeBench = foeSide ? foeSide.team.filter(p => !p.fainted).length - 1 : 0

        if (move.category !== 'status') {
            if (!foeAlive) return 0
            const dmg = this.estimate(engine, user, foe!, move, tera)
            let score = Math.min(dmg, foe!.hp) / foe!.max_hp * 100
            if (dmg >= foe!.hp) {
                score = 100 + (engine.getPriority(user, move) > 0 ? 30 : 0)
                // 상대보다 느리고 상대가 나를 잡으면, 선공기가 아닌 이상 가치 하락
            }
            const drain = move.meta?.drain ?? 0
            if (drain < 0) score -= Math.abs(drain) / 100 * 25
            if (drain > 0 && hpRatio < 0.7) score += 10
            if (SELF_SWITCH_MOVES.has(move.name)) score += 8
            if (move.name === 'fake-out' && (user.active_turns ?? 0) === 0) score += 35
            if (['fake-out', 'first-impression'].includes(move.name) && (user.active_turns ?? 0) > 0) return 0
            if (['hyper-beam', 'giga-impact'].includes(move.name) && dmg < foe!.hp) score -= 20
            if (move.name === 'sucker-punch') score *= 0.75
            if (move.name === 'explosion' || move.name === 'self-destruct') score = hpRatio < 0.35 ? score : score * 0.3
            return Math.max(0, score)
        }

        // ── 변화기 ───────────────────────────────────────────
        const name = move.name
        if (name in PROTECT_MOVES) {
            if ('protect_streak' in user.volatile_statuses) return 0
            const poisoned = foeAlive && (foe!.status === 'toxic' || foe!.status === 'burn' || 'seeded' in foe!.volatile_statuses)
            return poisoned ? 30 : 8
        }
        if (name in HAZARD_MOVES) {
            const cond = HAZARD_MOVES[name]!
            const layers = foeSide?.conditions[cond]?.layers ?? 0
            const max = cond === 'spikes' ? 3 : cond === 'toxic_spikes' ? 2 : 1
            if (layers >= max || foeBench <= 0) return 0
            return (cond === 'stealth_rock' ? 45 : 30) * (foeBench / 5 + 0.4)
        }
        if (name in SCREEN_MOVES) {
            const cond = SCREEN_MOVES[name]!
            if (userSide.conditions[cond]) return 0
            if (cond === 'aurora_veil' && engine.effectiveWeather() !== 'snow') return 0
            return cond === 'tailwind' ? 35 : 30
        }
        if (name in WEATHER_MOVES) return state.field.weather === WEATHER_MOVES[name] ? 0 : 22
        if (name in TERRAIN_MOVES) return state.field.terrain === TERRAIN_MOVES[name] ? 0 : 22
        if (name in HEAL_MOVES || name === 'rest' || name === 'strength-sap') {
            if (hpRatio > 0.75) return 0
            return (1 - hpRatio) * 90
        }
        if (name === 'wish') return userSide.conditions.wish ? 0 : (1 - hpRatio) * 60
        if (name === 'substitute') return hpRatio > 0.5 && !('substitute' in user.volatile_statuses) ? 20 : 0
        if (name === 'taunt') return foeAlive && !('taunt' in foe!.volatile_statuses) ? 15 : 0
        if (name === 'trick-room') return state.field.conditions.trick_room ? 0 : (foeAlive && engine.getSpeed(user) < engine.getSpeed(foe!) ? 40 : 0)
        if (name === 'defog' || name === 'rapid-spin' || name === 'tidy-up') {
            const hz = ['stealth_rock', 'spikes', 'toxic_spikes', 'sticky_web'].filter(c => c in userSide.conditions).length
            return hz * 25
        }
        if (name === 'leech-seed') return foeAlive && !foe!.types.includes('grass') && !('seeded' in foe!.volatile_statuses) ? 30 : 0
        if (name === 'yawn') return foeAlive && !foe!.status && !('yawn' in foe!.volatile_statuses) ? 25 : 0
        if (SELF_SWITCH_MOVES.has(name)) return 18
        if (name === 'haze') return foeAlive && Object.values(foe!.stages).some(s => s >= 2) ? 50 : 0
        if (name === 'roar' || name === 'whirlwind') return foeAlive && foeBench > 0 && Object.values(foe!.stages).some(s => s >= 1) ? 45 : 5

        const ailment = move.meta?.ailment
        if (ailment && ailment !== 'none' && foeAlive && !isSelfTargeting(move)) {
            if (ailment === 'confusion') return 'confusion' in foe!.volatile_statuses ? 0 : 15
            if (foe!.status || foe!.substitute_hp > 0) return 0
            if (ailment === 'paralysis' && (foe!.types.includes('electric') || foe!.types.includes('ground') && name === 'thunder-wave')) return 0
            if (ailment === 'burn' && foe!.types.includes('fire')) return 0
            if (ailment === 'poison' && (foe!.types.includes('poison') || foe!.types.includes('steel'))) return 0
            if (ailment === 'sleep') return foe!.ability === 'insomnia' || foe!.ability === 'vital-spirit' ? 0 : 55
            if (ailment === 'burn') return foe!.stats.attack > foe!.stats.special_attack ? 50 : 25
            if (ailment === 'paralysis') return engine.getSpeed(foe!) > engine.getSpeed(user) ? 45 : 25
            return 38
        }

        const stats = getStatEffects(move)
        if (stats.self.length > 0) {
            const gain = stats.self.reduce((a, s) => a + s.change, 0)
            const maxed = stats.self.every(s => user.stages[s.stat as 'attack'] >= 4)
            if (maxed || gain <= 0) return 0
            const safe = !foeAlive || this.bestDamageRatio(engine, foe!, user) < hpRatio * 0.6
            return safe ? 25 + gain * 8 : 6
        }
        if (stats.target.length > 0 && foeAlive) {
            return foe!.substitute_hp > 0 ? 0 : 12
        }
        return 3
    }
}

export function createAI(kind: 'random' | 'heuristic' | 'strong', seed?: number): BattleAI {
    if (kind === 'random') return new RandomAI(seed)
    if (kind === 'strong') return new HeuristicAI({ seed, randomness: 0.03 })
    return new HeuristicAI({ seed })
}
