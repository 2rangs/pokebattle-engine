// ─── 배틀 AI ──────────────────────────────────────────────────
// 기술 정보: Showdown Dex / 데미지 예측: @smogon/calc
import { Dex } from '@pkmn/sim'
import type { Action, BattleRequest, PlayerID } from '../types/battle'
import type { BattleEngine } from '../engine/BattleEngine'
import { PRNG } from '../utils/rng'

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

        const foePlayer = engine.foeOf(player)
        const user = engine.getShowdownPokemon(req.active.id)!
        const foe = engine.battle[foePlayer].active[0]
        const scored: Scored[] = []

        for (const opt of req.moves) {
            if (opt.disabled) continue
            const base = { type: 'move' as const, player, pokemon_id: req.active.id, move_index: opt.index }
            const score = this.scoreMove(engine, player, opt.index, false)
            scored.push({ action: base, score })
            if (req.can_terastallize && this.useTera && opt.move.category !== 'status') {
                const teraScore = this.scoreMove(engine, player, opt.index, true)
                if (teraScore > score * 1.3 || (teraScore >= 100 && score < 100)) {
                    scored.push({ action: { ...base, terastallize: true }, score: teraScore + 2 })
                }
            }
        }

        if (req.can_switch && foe && !foe.fainted) {
            const best = Math.max(0, ...scored.map(s => s.score))
            const threat = this.threat(engine, foePlayer, player)
            const outspeeds = user.getActionSpeed() > foe.getActionSpeed()
            const inDanger = threat >= user.hp / user.maxhp && !(outspeeds && best >= 100)
            for (const p of req.switches) {
                const m = this.matchup(engine, p.id, player)
                let score = m * 40 - 25
                if (inDanger) score += 30
                if (best < 25) score += 15
                if ((user.boosts.atk ?? 0) <= -2 || (user.boosts.spa ?? 0) <= -2) score += 20
                if (user.volatiles['curse'] || user.volatiles['leechseed'] || (user.status === 'tox' && (user.statusState as { stage?: number }).stage! > 2)) score += 15
                scored.push({ action: { type: 'switch', player, pokemon_id: req.active.id, switch_to_id: p.id }, score })
            }
        }

        if (scored.length === 0) return engine.getAvailableActions(player)[0] ?? null
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
        if (req.switches.length === 0) return null
        const scored = req.switches.map(p => ({
            action: { type: 'switch' as const, player, pokemon_id: req.active.id, switch_to_id: p.id },
            score: this.matchup(engine, p.id, player) * 50 + p.hp / p.max_hp * 20,
        }))
        return this.pick(scored)
    }

    /** 상대 현재 포켓몬 → 우리 현재 포켓몬 최대 데미지 비율 */
    private threat(engine: BattleEngine, attacker: PlayerID, _defender: PlayerID): number {
        const a = engine.battle[attacker].active[0]
        if (!a) return 0
        let best = 0
        a.moveSlots.forEach((_, i) => {
            const r = engine.previewDamage(attacker, i)
            if (r) best = Math.max(best, r.maxPercent / 100)
        })
        return best
    }

    /** 벤치 포켓몬과 상대 현재 포켓몬의 상성 (대략 -1~1) */
    private matchup(engine: BattleEngine, benchId: string, player: PlayerID): number {
        const mine = engine.getShowdownPokemon(benchId)
        const foe = engine.battle[engine.foeOf(player)].active[0]
        if (!mine || !foe || foe.fainted) return 0
        let dealt = 0
        let taken = 0
        for (const slot of mine.moveSlots) {
            const move = Dex.moves.get(slot.id)
            if (move.category === 'Status' || !move.basePower) continue
            dealt = Math.max(dealt, typeFactor(move.type, foe.getTypes()) * (mine.getTypes().includes(move.type) ? 1.5 : 1) * move.basePower / 100)
        }
        for (const slot of foe.moveSlots) {
            const move = Dex.moves.get(slot.id)
            if (move.category === 'Status' || !move.basePower) continue
            taken = Math.max(taken, typeFactor(move.type, mine.getTypes()) * (foe.getTypes().includes(move.type) ? 1.5 : 1) * move.basePower / 100)
        }
        const faster = mine.getStat('spe', false, true) > foe.getActionSpeed() ? 0.2 : 0
        return Math.max(-1.5, Math.min(1.5, (dealt - taken) / 2 + faster)) * (mine.hp / mine.maxhp)
    }

    private scoreMove(engine: BattleEngine, player: PlayerID, index: number, tera: boolean): number {
        const user = engine.battle[player].active[0]!
        const foe = engine.battle[engine.foeOf(player)].active[0]
        const slot = user.moveSlots[index]
        if (!slot) return 0
        const move = Dex.moves.get(slot.id)
        const hpRatio = user.hp / user.maxhp
        const foeAlive = !!foe && !foe.fainted
        const foeSide = engine.battle[engine.foeOf(player)]
        const mySide = engine.battle[player]
        const foeBench = foeSide.pokemon.filter(p => !p.fainted && !p.isActive).length

        if (move.category !== 'Status') {
            if (!foeAlive) return 0
            const r = engine.previewDamage(player, index, { terastallize: tera })
            if (!r) return 0
            const acc = move.accuracy === true ? 1 : move.accuracy / 100
            const avgPct = (r.minPercent + r.maxPercent) / 2 * acc
            const foeHpPct = foe!.hp / foe!.maxhp * 100
            let score = Math.min(avgPct, foeHpPct)
            if (r.min >= foe!.hp) score = 100 + (move.priority > 0 ? 30 : 0)
            else if (r.max >= foe!.hp) score = Math.max(score, 70 + (move.priority > 0 ? 20 : 0))
            if (move.recoil || move.mindBlownRecoil) score -= 10
            if (move.drain && hpRatio < 0.7) score += 10
            if (move.selfSwitch) score += 8
            if (move.id === 'fakeout') score = user.activeTurns <= 1 ? score + 35 : 0
            if (move.id === 'firstimpression' && user.activeTurns > 1) score = 0
            if (move.self?.volatileStatus === 'mustrecharge' && r.min < foe!.hp) score -= 20
            if (move.id === 'suckerpunch') score *= 0.75
            if (move.selfdestruct) score = hpRatio < 0.35 ? score : score * 0.3
            return Math.max(0, score)
        }

        // ── 변화기 ─────────────────────────────────────────────
        if (move.stallingMove) return user.volatiles['stall'] ? 0 : (foeAlive && (foe!.status === 'tox' || foe!.status === 'brn' || foe!.volatiles['leechseed']) ? 30 : 8)
        if (move.sideCondition && move.target === 'foeSide') {
            const cond = foeSide.sideConditions[move.sideCondition] as { layers?: number } | undefined
            const max = move.sideCondition === 'spikes' ? 3 : move.sideCondition === 'toxicspikes' ? 2 : 1
            if ((cond?.layers ?? (cond ? 1 : 0)) >= max || foeBench <= 0) return 0
            return (move.sideCondition === 'stealthrock' ? 45 : 30) * (foeBench / 5 + 0.4)
        }
        if (move.sideCondition) return mySide.sideConditions[move.sideCondition] ? 0 : (move.id === 'auroraveil' && engine.effectiveWeather() !== 'snow' ? 0 : 30)
        if (move.weather) return engine.battle.field.weather === toWeatherId(move.weather) ? 0 : 22
        if (move.terrain) return engine.battle.field.terrain === move.terrain ? 0 : 22
        if (move.pseudoWeather === 'trickroom') return engine.battle.field.pseudoWeather['trickroom'] ? 0 : (foeAlive && user.getActionSpeed() < foe!.getActionSpeed() ? 40 : 0)
        if (move.heal || move.flags.heal || move.id === 'rest' || move.id === 'strengthsap') return hpRatio > 0.75 ? 0 : (1 - hpRatio) * 90
        if (move.id === 'wish') return (1 - hpRatio) * 60
        if (move.id === 'substitute') return hpRatio > 0.5 && !user.volatiles['substitute'] ? 20 : 0
        if (move.selfSwitch) return 18
        if (move.forceSwitch) return foeAlive && foeBench > 0 && Object.values(foe!.boosts).some(b => b >= 1) ? 45 : 5
        if (move.id === 'haze' || move.id === 'clearsmog') return foeAlive && Object.values(foe!.boosts).some(b => b >= 2) ? 50 : 0
        if (move.id === 'defog' || move.id === 'rapidspin' || move.id === 'tidyup' || move.id === 'mortalspin' || move.id === 'courtchange') {
            return ['stealthrock', 'spikes', 'toxicspikes', 'stickyweb'].filter(c => c in mySide.sideConditions).length * 25
        }
        if (move.volatileStatus && foeAlive && move.target !== 'self') {
            if (foe!.volatiles[move.volatileStatus]) return 0
            return move.volatileStatus === 'leechseed' ? (foe!.hasType('Grass') ? 0 : 30) : move.volatileStatus === 'confusion' ? 15 : 15
        }
        if (move.status && foeAlive) {
            if (foe!.status || foe!.volatiles['substitute']) return 0
            if (!foe!.runStatusImmunity(move.status) || (move.type === 'Electric' && !foe!.runImmunity('Electric'))) return 0
            if (move.status === 'slp') return 55
            if (move.status === 'brn') return foe!.storedStats.atk > foe!.storedStats.spa ? 50 : 25
            if (move.status === 'par') return foe!.getActionSpeed() > user.getActionSpeed() ? 45 : 25
            return 38
        }
        const selfBoosts = move.target === 'self' || move.target === 'allySide' || move.target === 'adjacentAllyOrSelf' ? move.boosts : move.self?.boosts
        if (selfBoosts) {
            const gain = Object.values(selfBoosts).reduce((a, b) => a + (b ?? 0), 0)
            const maxed = Object.keys(selfBoosts).every(k => (user.boosts[k as keyof typeof user.boosts] ?? 0) >= 4)
            if (maxed || gain <= 0) return 0
            const safe = !foeAlive || this.threat(engine, engine.foeOf(player), player) < hpRatio * 0.6
            return safe ? 25 + gain * 8 : 6
        }
        if (move.boosts && foeAlive) return foe!.volatiles['substitute'] ? 0 : 12
        return 3
    }
}

function typeFactor(moveType: string, defTypes: string[]): number {
    if (!Dex.getImmunity(moveType, defTypes)) return 0
    return 2 ** Dex.getEffectiveness(moveType, defTypes)
}

function toWeatherId(w: string): string {
    return w.toLowerCase()
}

export function createAI(kind: 'random' | 'heuristic' | 'strong', seed?: number): BattleAI {
    if (kind === 'random') return new RandomAI(seed)
    if (kind === 'strong') return new HeuristicAI({ seed, randomness: 0.03 })
    return new HeuristicAI({ seed })
}
