// ─── 배틀 AI ──────────────────────────────────────────────────
// 기술 정보: Showdown Dex / 데미지 예측: @smogon/calc
import { Dex } from '@pkmn/sim'
import type { Pokemon as PSPokemon, Side as PSSide } from '@pkmn/sim'
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
    /**
     * 메가진화·울트라버스트·Z기술·다이맥스도 쓴다 (기본 false: 예전 선택 그대로).
     * 메가진화·울트라버스트는 늘, Z기술·다이맥스는 데미지가 크게 늘 때. 기믹 겹치기 배틀이면 함께 쓴다.
     */
    useGimmicks?: boolean
}

interface Scored { action: Action; score: number }

export class HeuristicAI implements BattleAI {
    readonly name = 'heuristic'
    private rng: PRNG
    private randomness: number
    private useTera: boolean
    private useGimmicks: boolean

    constructor(opts: HeuristicAIOptions = {}) {
        this.rng = new PRNG(opts.seed)
        this.randomness = opts.randomness ?? 0.15
        this.useTera = opts.useTera ?? true
        this.useGimmicks = opts.useGimmicks ?? false
    }

    chooseAction(engine: BattleEngine, player: PlayerID): Action | null {
        // 팀 프리뷰: 파티 순서대로 출전
        if (engine.getTeamPreview(player)) return engine.getAvailableActions(player)[0] ?? null
        const req = engine.getRequest(player)
        if (!req) return null
        if (req.type === 'switch') return this.chooseSwitch(engine, req, player)

        const foePlayer = engine.foeOf(player)
        const user = engine.psPokemon(req.active.id)!
        const foe = engine.ps[foePlayer].active[engine.frontSlot]
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
            if (this.useGimmicks) this.gimmickOptions(engine, req, player, opt, base, score, scored)
        }

        if (req.can_switch && foe && !foe.fainted) {
            const best = Math.max(0, ...scored.map(s => s.score))
            const threat = this.threat(engine, foePlayer, player)
            const outspeeds = user.getActionSpeed() > foe.getActionSpeed()
            const inDanger = threat >= user.hp / user.maxhp && !(outspeeds && best >= 100)
            for (const p of req.switches) {
                const m = this.matchup(engine, p.id, player)
                let score = m * 40 - 25 - entryCost(engine.psPokemon(p.id), engine.ps[player]) * 80
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

    /** 메가진화·울트라버스트(늘), Z기술·다이맥스(데미지가 크게 늘 때). 겹치기 배틀이면 한 행동에 함께 */
    private gimmickOptions(
        engine: BattleEngine, req: Extract<BattleRequest, { type: 'move' }>, player: PlayerID,
        opt: Extract<BattleRequest, { type: 'move' }>['moves'][number], base: Extract<Action, { type: 'move' }>, score: number, scored: Scored[],
    ): void {
        const stack = !!(engine.ps.ruleTable as { has(id: string): boolean }).has('stackgimmicksmod')
        const status = opt.move.category === 'status'
        const better = (s: number) => s > score * 1.3 || (s >= 100 && score < 100)
        const form = req.can_mega_evolve ? { mega: true } : req.can_ultra_burst ? { ultra_burst: true } : {}
        const hasForm = Object.keys(form).length > 0
        if (hasForm) scored.push({ action: { ...base, ...form }, score: this.scoreMove(engine, player, opt.index, form) + 1 })
        const keep = stack ? form : {}
        const tera = stack && req.can_terastallize && this.useTera && !status ? { terastallize: true } : {}
        if (req.can_dynamax && !status) {
            const flags = { ...keep, dynamax: true }
            const s = this.scoreMove(engine, player, opt.index, flags)
            if (better(s)) {
                scored.push({ action: { ...base, ...flags }, score: s + 3 })
                if (tera.terastallize) {
                    const t = this.scoreMove(engine, player, opt.index, { ...flags, ...tera })
                    if (t > s * 1.2) scored.push({ action: { ...base, ...flags, ...tera }, score: t + 4 })
                }
            }
        }
        if (req.can_zmove && opt.zmove) {
            const flags = { zmove: true, ...(stack ? tera : {}) }
            const s = this.scoreMove(engine, player, opt.index, flags)
            if (status ? score < 10 : better(s)) scored.push({ action: { ...base, ...flags }, score: (status ? 12 : s) + 3 })
        }
        if (stack && hasForm && tera.terastallize) {
            const s = this.scoreMove(engine, player, opt.index, { ...form, ...tera })
            if (better(s)) scored.push({ action: { ...base, ...form, ...tera }, score: s + 2 })
        }
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
        const side = engine.ps[player]
        const leaving = side.active[engine.frontSlot]
        const scored = req.switches.map(p => {
            const mon = engine.psPokemon(p.id)
            let score = this.matchup(engine, p.id, player) * 50 + p.hp / p.max_hp * 20 - entryCost(mon, side) * 80
            // 배턴터치: 넘겨받는 랭크를 가장 잘 쓰는 포켓몬 / 꼬리자르기: 대타 뒤에서 능력을 올릴 포켓몬
            if (mon && leaving && req.source?.id === 'baton-pass') score += batonValue(leaving, mon) * 12
            if (mon && req.source?.id === 'shed-tail' && mon.moveSlots.some(s => hasSelfBoost(s.id))) score += 15
            return { action: { type: 'switch' as const, player, pokemon_id: req.active.id, switch_to_id: p.id }, score }
        })
        return this.pick(scored)
    }

    /** 상대 현재 포켓몬 → 우리 현재 포켓몬 최대 데미지 비율 */
    private threat(engine: BattleEngine, attacker: PlayerID, _defender: PlayerID): number {
        const a = engine.ps[attacker].active[engine.frontSlot]
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
        const mine = engine.psPokemon(benchId)
        const foe = engine.ps[engine.foeOf(player)].active[engine.frontSlot]
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

    private scoreMove(engine: BattleEngine, player: PlayerID, index: number, gimmick: boolean | Parameters<BattleEngine['previewDamage']>[2]): number {
        const user = engine.ps[player].active[engine.frontSlot]!
        const foe = engine.ps[engine.foeOf(player)].active[engine.frontSlot]
        const slot = user.moveSlots[index]
        if (!slot) return 0
        const move = Dex.moves.get(slot.id)
        const hpRatio = user.hp / user.maxhp
        const foeAlive = !!foe && !foe.fainted
        const foeSide = engine.ps[engine.foeOf(player)]
        const mySide = engine.ps[player]
        const foeBench = foeSide.pokemon.filter(p => !p.fainted && !p.isActive).length
        const myBench = mySide.pokemon.filter(p => !p.fainted && !p.isActive).length
        // 끌어내기(날려버리기·드래곤테일 등)가 통하는지: 흡반·파수견·뿌리박기·다이맥스는 버틴다
        const forceable = foeAlive && foeBench > 0 && canBeForcedOut(foe!)
        const foeBoosted = foeAlive && Object.values(foe!.boosts).some(b => b >= 1)

        if (move.category !== 'Status') {
            if (!foeAlive) return 0
            const r = engine.previewDamage(player, index, typeof gimmick === 'object' ? gimmick : { terastallize: gimmick })
            if (!r) return 0
            const acc = move.accuracy === true ? 1 : move.accuracy / 100
            const avgPct = (r.minPercent + r.maxPercent) / 2 * acc
            const foeHpPct = foe!.hp / foe!.maxhp * 100
            let score = Math.min(avgPct, foeHpPct)
            if (r.min >= foe!.hp) score = 100 + (move.priority > 0 ? 30 : 0)
            else if (r.max >= foe!.hp) score = Math.max(score, 70 + (move.priority > 0 ? 20 : 0))
            if (move.recoil || move.mindBlownRecoil) score -= 10
            if (move.drain && hpRatio < 0.7) score += 10
            if (move.selfSwitch && myBench > 0) score += 8
            if (move.forceSwitch && forceable) score += (foeBoosted ? 20 : 0) + hazardValue(foeSide) * 10
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
        if (move.weather) return engine.ps.field.weather === toWeatherId(move.weather) ? 0 : 22
        if (move.terrain) return engine.ps.field.terrain === move.terrain ? 0 : 22
        if (move.pseudoWeather === 'trickroom') return engine.ps.field.pseudoWeather['trickroom'] ? 0 : (foeAlive && user.getActionSpeed() < foe!.getActionSpeed() ? 40 : 0)
        if (move.heal || move.flags.heal || move.id === 'rest' || move.id === 'strengthsap') return hpRatio > 0.75 ? 0 : (1 - hpRatio) * 90
        if (move.id === 'wish') return (1 - hpRatio) * 60
        if (move.id === 'substitute') return hpRatio > 0.5 && !user.volatiles['substitute'] ? 20 : 0
        if (move.selfSwitch) {
            if (myBench === 0) return 0 // 교체할 포켓몬이 없으면 효과 없음 (꼬리자르기·배턴터치는 실패)
            if (move.id === 'shedtail') return user.hp <= Math.ceil(user.maxhp / 2) || user.volatiles['substitute'] ? 0 : 30
            if (move.id === 'batonpass') {
                const net = Object.values(user.boosts).reduce((a, b) => a + b, 0)
                return Math.max(0, 5 + net * 15 + (user.volatiles['substitute'] ? 15 : 0))
            }
            return 18
        }
        if (move.forceSwitch) {
            if (!forceable) return 0
            return Math.min(70, 5 + (foeBoosted ? 45 : 0) + hazardValue(foeSide) * 15)
        }
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

/** 강제 교체가 통하는지 (흡반·파수견·뿌리박기·다이맥스·거다이맥스는 버틴다) */
function canBeForcedOut(p: PSPokemon): boolean {
    if (p.volatiles['ingrain'] || p.volatiles['dynamax']) return false
    return !p.hasAbility(['suctioncups', 'guarddog'])
}

/** 상대 진영 장판의 가치 (끌어내기와 같이 쓰면 교체될 때마다 피해) */
function hazardValue(side: PSSide): number {
    const c = side.sideConditions as Record<string, { layers?: number } | undefined>
    return (c['stealthrock'] ? 1 : 0) + (c['spikes']?.layers ?? 0) * 0.6 + (c['toxicspikes']?.layers ?? 0) * 0.5 + (c['stickyweb'] ? 0.5 : 0)
}

/**
 * 교체로 들어갈 때 장판에 잃는 HP 비율 (+ 독압정·끈적끈적네트는 대략적인 손해).
 * 통굽부츠는 모든 장판, 매직가드는 피해만 막는다. 땅에 닿지 않으면(비행·부유·풍선) 압정·독압정·네트를 무시한다.
 * 독압정은 땅에 닿은 독타입이 밟으면 사라진다 (오히려 이득).
 */
function entryCost(p: PSPokemon | undefined, side: PSSide): number {
    if (!p) return 0
    const c = side.sideConditions as Record<string, { layers?: number } | undefined>
    if (p.hasItem('heavydutyboots')) return 0
    const types = p.getTypes()
    const grounded = !!p.isGrounded() // 부유 특성이면 null
    const magicGuard = p.hasAbility('magicguard')
    let cost = 0
    if (c['stealthrock'] && !magicGuard) cost += typeFactor('Rock', types) / 8
    const spikes = c['spikes']?.layers ?? 0
    if (spikes && grounded && !magicGuard) cost += [0, 1 / 8, 1 / 6, 1 / 4][spikes]!
    const tspikes = c['toxicspikes']?.layers ?? 0
    if (tspikes && grounded) {
        if (types.includes('Poison')) cost -= 0.1
        else if (!types.includes('Steel') && !p.status) cost += tspikes >= 2 ? 0.15 : 0.08
    }
    if (c['stickyweb'] && grounded && !p.hasAbility(['contrary', 'defiant', 'competitive'])) cost += 0.05
    return cost
}

/** 배턴터치로 넘어가는 랭크가 이 포켓몬에게 얼마나 쓸모 있는지 (공격 랭크는 주로 쓰는 쪽만) */
function batonValue(from: PSPokemon, to: PSPokemon): number {
    const b = from.boosts
    const physical = to.storedStats.atk >= to.storedStats.spa
    return (physical ? b.atk : b.spa) + b.spe * 0.7 + (b.def + b.spd) * 0.3
}

function hasSelfBoost(id: string): boolean {
    const m = Dex.moves.get(id)
    return m.category === 'Status' && m.target === 'self' && !!m.boosts && Object.values(m.boosts).some(v => (v ?? 0) > 0)
}

function typeFactor(moveType: string, defTypes: string[]): number {
    if (!Dex.getImmunity(moveType, defTypes)) return 0
    return 2 ** Dex.getEffectiveness(moveType, defTypes)
}

function toWeatherId(w: string): string {
    return w.toLowerCase()
}

export function createAI(kind: 'random' | 'heuristic' | 'strong', seed?: number, opts: Pick<HeuristicAIOptions, 'useGimmicks'> = {}): BattleAI {
    if (kind === 'random') return new RandomAI(seed)
    if (kind === 'strong') return new HeuristicAI({ seed, randomness: 0.03, ...opts })
    return new HeuristicAI({ seed, ...opts })
}
