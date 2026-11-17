import type {
    BattleConfig, BattleState, BattleEvent, BattleEventType, Action, PlayerID, Side,
    BattleRequest, MoveOption, SwitchReason,
} from '../types/battle'
import type { BattlePokemon, PokemonSet, StatStages } from '../types/pokemon'
import type { Weather, Terrain, SideCondition, FieldCondition, PrimaryStatus, VolatileStatus } from '../types/effect'
import type { MoveData, MoveSlot } from '../types/move'
import { calcAllStats, createInitialStages, getStat, getParadoxBoostedStat } from '../calc/stat'
import { canApplyStatus } from '../effects/status'
import { isGrounded } from '../effects/terrain'
import { isImmuneToWeatherDamage, WEATHER_ITEM_MAP, WEATHER_ABILITY_MAP } from '../effects/weather'
import { TERRAIN_ABILITY_MAP } from '../effects/terrain'
import { calcTypeEffectiveness } from '../calc/damage'
import { TurnManager, getEffectivePriority } from './TurnManager'
import { getMove, getSpecies, getTypeChart, isDataLoaded } from '../data/loader'
import { PRNG } from '../utils/rng'
import { toId } from '../utils/id'

type AnyEventListener = (event: BattleEvent) => void

export class BattleError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'BattleError'
    }
}

export const STRUGGLE: MoveData = {
    id: 165, name: 'struggle', type: 'typeless', category: 'physical', power: 50, accuracy: null,
    pp: 1, priority: 0, target: 'random-opponent', effect_chance: null, effect: 'Recoil 1/4 max HP.',
    meta: null, stat_changes: [],
}

const FALLBACK_MOVE = (name: string): MoveData => ({
    id: 0, name, type: 'normal', category: 'physical', power: 50, accuracy: 100, pp: 20, priority: 0,
    target: 'selected-pokemon', effect_chance: null, effect: '', meta: null, stat_changes: [],
})

const STAT_DISPLAY_KEYS: (keyof StatStages)[] = ['attack', 'defense', 'special_attack', 'special_defense', 'speed', 'accuracy', 'evasion']

const STATUS_BERRIES: Record<string, PrimaryStatus[] | 'confusion' | 'all'> = {
    'lum-berry':    'all',
    'chesto-berry': ['sleep'],
    'cheri-berry':  ['paralysis'],
    'rawst-berry':  ['burn'],
    'pecha-berry':  ['poison', 'toxic'],
    'aspear-berry': ['freeze'],
    'persim-berry': 'confusion',
}

export class BattleEngine {
    private state: BattleState
    private listeners: Map<string, AnyEventListener[]> = new Map()
    private turnManager: TurnManager
    readonly rng: PRNG
    readonly maxTurns: number

    private started = false
    /** 이번 턴 실행 대기중인 행동 (유턴 등으로 턴이 중단될 수 있음) */
    private turnQueue: Action[] = []
    private submitted: Partial<Record<PlayerID, Action>> = {}
    private midTurn = false
    private endOfTurnDone = false

    constructor(config: BattleConfig) {
        if (config.format === 'doubles') {
            throw new BattleError('doubles 포맷은 아직 지원하지 않습니다 (singles 만 지원)')
        }
        if (!isDataLoaded()) {
            // 데이터 미로드 시에도 동작은 하지만 종족값/기술이 기본값으로 대체된다
            console.warn('[pokebattle-engine] preloadData() 를 먼저 호출하세요. 기본값으로 대체합니다.')
        }
        if (!config.p1.team.length || !config.p2.team.length) {
            throw new BattleError('양쪽 팀에 최소 1마리의 포켓몬이 필요합니다')
        }
        this.rng = new PRNG(config.seed)
        this.maxTurns = config.maxTurns ?? 1000
        this.state = this.initState(config)
        this.turnManager = new TurnManager(this)
    }

    /** 데이터 로드 후 엔진 생성 */
    static async create(config: BattleConfig): Promise<BattleEngine> {
        const { preloadData } = await import('../data/loader')
        await preloadData()
        return new BattleEngine(config)
    }

    // ─── 상태 조회 ──────────────────────────────────────────────
    /** 내부 상태 (읽기 전용으로 취급할 것). 렌더링용으로는 snapshot() 사용 */
    getState(): Readonly<BattleState> {
        return this.state
    }

    /** 깊은 복사된 상태 (로그 제외). React 등 불변 상태가 필요한 곳에 사용 */
    snapshot(): BattleState {
        const { log: _log, ...rest } = this.state
        void _log
        return structuredClone({ ...rest, log: [] })
    }

    getPokemon(id: string): BattlePokemon | undefined {
        for (const side of Object.values(this.state.sides)) {
            const found = side.team.find(p => p.id === id)
            if (found) return found
        }
    }

    getActivePokemon(player: PlayerID): BattlePokemon[] {
        return this.state.sides[player].active
    }

    getActive(player: PlayerID): BattlePokemon {
        return this.state.sides[player].active[0]!
    }

    getSide(player: PlayerID): Side {
        return this.state.sides[player]
    }

    sideOf(pokemon: BattlePokemon | string): PlayerID {
        const id = typeof pokemon === 'string' ? pokemon : pokemon.id
        return id.startsWith('p1') ? 'p1' : 'p2'
    }

    foeOf(player: PlayerID): PlayerID {
        return player === 'p1' ? 'p2' : 'p1'
    }

    isActive(pokemon: BattlePokemon): boolean {
        return this.state.sides[this.sideOf(pokemon)].active.includes(pokemon)
    }

    // ─── 이벤트 이미터 ──────────────────────────────────────────
    on(eventType: BattleEventType | '*', listener: AnyEventListener): () => void {
        if (!this.listeners.has(eventType)) this.listeners.set(eventType, [])
        this.listeners.get(eventType)!.push(listener)
        return () => this.off(eventType, listener)
    }

    off(eventType: BattleEventType | '*', listener: AnyEventListener): void {
        const list = this.listeners.get(eventType)
        if (!list) return
        const idx = list.indexOf(listener)
        if (idx !== -1) list.splice(idx, 1)
    }

    emit(event: BattleEvent): void {
        this.state.log.push(event)
        for (const fn of this.listeners.get(event.type) ?? []) fn(event)
        for (const fn of this.listeners.get('*') ?? []) fn(event)
    }

    message(text: string): void {
        this.emit({ type: 'message', text })
    }

    // ─── 배틀 시작 ──────────────────────────────────────────────
    /** 선두 포켓몬 등장 처리 (특성 발동 등). submitAction/getRequest 시 자동 호출된다 */
    start(): void {
        if (this.started) return
        this.started = true
        this.emit({
            type: 'battle_start',
            p1: this.state.sides.p1.name ?? 'p1',
            p2: this.state.sides.p2.name ?? 'p2',
            seed: this.rng.initialSeed,
        })
        const leads = this.sortBySpeed([this.getActive('p1'), this.getActive('p2')])
        for (const lead of leads) {
            this.emit({ type: 'switch', player: this.sideOf(lead), out_id: '', in_id: lead.id })
        }
        for (const lead of leads) this.runSwitchInEffects(lead)
        this.checkBattleEnd()
    }

    // ─── 요청 / 가능한 행동 ─────────────────────────────────────
    /** 플레이어가 지금 내려야 할 결정. 입력이 필요 없으면 null */
    getRequest(player: PlayerID): BattleRequest | null {
        this.start()
        const { phase } = this.state
        const side = this.state.sides[player]
        const active = side.active[0]!
        const bench = side.team.filter(p => !p.fainted && !side.active.includes(p))

        if (phase === 'ended' || phase === 'executing') return null

        if (phase === 'switching') {
            const reason = this.state.pending_switches?.[player]
            if (!reason || this.submitted[player]) return null
            return { type: 'switch', player, reason, active, switches: bench }
        }

        if (this.submitted[player]) return null

        const moves = this.getMoveOptions(active)
        const forced = !!active.must_recharge || !!active.locked_move
        const trapped = this.isTrapped(active)
        return {
            type: 'move',
            player,
            active,
            moves,
            switches: forced || trapped ? [] : bench,
            can_switch: !forced && !trapped && bench.length > 0,
            can_terastallize: !side.used_tera && !active.terastallized && !!(active.tera_type) && !forced,
            forced,
        }
    }

    private getMoveOptions(pokemon: BattlePokemon): MoveOption[] {
        const slots = pokemon.moves.filter(Boolean) as MoveSlot[]
        // 강제 행동: 반동/모으기/난동 → 고정 기술 하나만
        if (pokemon.must_recharge || pokemon.locked_move) {
            const idx = pokemon.locked_move?.index ?? 0
            const slot = pokemon.moves[idx]
            if (slot) return [{ index: idx as MoveOption['index'], move: slot.move, pp: slot.pp, max_pp: slot.max_pp, disabled: false }]
        }
        const options: MoveOption[] = slots.map((slot, i) => {
            let reason: string | undefined
            if (slot.pp <= 0) reason = 'PP 없음'
            else if (slot.disabled) reason = '사용 불가'
            else if (pokemon.choice_lock && pokemon.choice_lock !== slot.move.name) reason = '구애 고정'
            else if ('taunt' in pokemon.volatile_statuses && slot.move.category === 'status') reason = '도발'
            else if (pokemon.item === 'assault-vest' && slot.move.category === 'status') reason = '돌격조끼'
            else if (pokemon.ability === 'gorilla-tactics' && pokemon.choice_lock && pokemon.choice_lock !== slot.move.name) reason = '고릴라택틱'
            return {
                index: i as MoveOption['index'], move: slot.move, pp: slot.pp, max_pp: slot.max_pp,
                disabled: !!reason, disabled_reason: reason,
            }
        })
        if (options.every(o => o.disabled)) {
            return [{ index: -1, move: STRUGGLE, pp: 1, max_pp: 1, disabled: false }]
        }
        return options
    }

    /** 현재 제출 가능한 모든 행동 (AI/검증용) */
    getAvailableActions(player: PlayerID): Action[] {
        const req = this.getRequest(player)
        if (!req) return []
        const actions: Action[] = []
        if (req.type === 'move') {
            for (const m of req.moves) {
                if (m.disabled) continue
                actions.push({ type: 'move', player, pokemon_id: req.active.id, move_index: m.index })
                if (req.can_terastallize) {
                    actions.push({ type: 'move', player, pokemon_id: req.active.id, move_index: m.index, terastallize: true })
                }
            }
        }
        for (const p of req.switches) {
            actions.push({ type: 'switch', player, pokemon_id: req.active.id, switch_to_id: p.id })
        }
        return actions
    }

    isTrapped(pokemon: BattlePokemon): boolean {
        if (pokemon.types.includes('ghost')) return false
        if (pokemon.item === 'shed-shell') return false
        if (pokemon.trapped || 'bound' in pokemon.volatile_statuses || 'ingrain' in pokemon.volatile_statuses) return true
        const foe = this.getActive(this.foeOf(this.sideOf(pokemon)))
        if (!foe || foe.fainted) return false
        if (foe.ability === 'shadow-tag' && pokemon.ability !== 'shadow-tag') return true
        if (foe.ability === 'arena-trap' && isGrounded(pokemon)) return true
        if (foe.ability === 'magnet-pull' && pokemon.types.includes('steel')) return true
        return false
    }

    // ─── 행동 제출 ──────────────────────────────────────────────
    submitAction(action: Action): void {
        this.start()
        const { phase } = this.state
        if (phase === 'ended') throw new BattleError('배틀이 이미 종료되었습니다')
        if (phase === 'executing') throw new BattleError('턴 실행 중에는 행동을 제출할 수 없습니다')

        this.validateAction(action)
        this.submitted[action.player] = action

        if (phase === 'switching') {
            const pending = this.state.pending_switches ?? {}
            const waiting = (Object.keys(pending) as PlayerID[]).filter(p => !this.submitted[p])
            if (waiting.length > 0) return
            this.resolveSwitchPhase()
            return
        }

        if (this.submitted.p1 && this.submitted.p2) {
            this.beginTurn()
        }
    }

    /** 두 플레이어의 행동을 한번에 제출 */
    submitActions(p1: Action, p2: Action): void {
        this.submitAction(p1)
        this.submitAction(p2)
    }

    /** 항복 */
    forfeit(player: PlayerID): void {
        if (this.state.phase === 'ended') return
        this.message(`${this.state.sides[player].name ?? player} 항복`)
        this.endBattle(this.foeOf(player))
    }

    private validateAction(action: Action): void {
        const req = this.getRequest(action.player)
        if (!req) throw new BattleError(`${action.player} 는 지금 행동을 제출할 필요가 없습니다`)
        if (action.pokemon_id !== req.active.id) {
            throw new BattleError(`필드의 포켓몬(${req.active.id})이 아닌 ${action.pokemon_id} 로 행동할 수 없습니다`)
        }
        if (action.type === 'switch') {
            if (!req.switches.some(p => p.id === action.switch_to_id)) {
                throw new BattleError(`${action.switch_to_id} 로 교체할 수 없습니다`)
            }
            return
        }
        if (req.type === 'switch') throw new BattleError('교체할 포켓몬을 선택해야 합니다')
        const opt = req.moves.find(m => m.index === action.move_index)
        if (!opt) {
            // 강제 행동인데 다른 기술을 골랐으면 고정 기술로 보정
            if (req.forced) {
                (action as { move_index: number }).move_index = req.moves[0]!.index
                return
            }
            throw new BattleError(`기술 슬롯 ${action.move_index} 은(는) 사용할 수 없습니다`)
        }
        if (opt.disabled) throw new BattleError(`${opt.move.name} 은(는) 사용할 수 없습니다 (${opt.disabled_reason})`)
        if (action.terastallize && !req.can_terastallize) throw new BattleError('테라스탈할 수 없습니다')
    }

    // ─── 턴 진행 ────────────────────────────────────────────────
    private beginTurn(): void {
        const actions = [this.submitted.p1!, this.submitted.p2!]
        this.submitted = {}
        this.state.phase = 'executing'
        this.state.field.turn = this.state.turn
        this.emit({ type: 'turn_start', turn: this.state.turn })

        for (const p of this.allActive()) {
            p.moved_this_turn = false
            p.damaged_this_turn = 0
        }

        // 테라스탈은 행동 순서 결정 전에 처리
        for (const a of actions) {
            if (a.type === 'move' && a.terastallize) this.terastallize(this.getPokemon(a.pokemon_id)!)
        }

        this.turnQueue = this.turnManager.sortActions(actions)
        this.midTurn = true
        this.endOfTurnDone = false
        this.continueTurn()
    }

    /** 행동 큐를 이어서 실행. 도중 교체 요청이 생기면 중단 */
    private continueTurn(): void {
        this.state.phase = 'executing'
        while (this.turnQueue.length > 0) {
            if ((this.state.phase as string) === 'ended') return
            const action = this.turnQueue.shift()!
            this.turnManager.executeAction(action, this.turnQueue)
            if (this.checkBattleEnd()) return
            if (this.state.pending_switches && Object.keys(this.state.pending_switches).length > 0) {
                this.state.phase = 'switching'
                return
            }
        }

        if (!this.endOfTurnDone) {
            this.endOfTurnDone = true
            this.runEndOfTurn()
            if (this.checkBattleEnd()) return
        }
        this.midTurn = false

        // 기절 교체 요청
        const pending: Partial<Record<PlayerID, SwitchReason>> = {}
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            if (this.needsFaintSwitch(player)) pending[player] = 'faint'
        }
        if (Object.keys(pending).length > 0) {
            this.state.pending_switches = pending
            this.state.phase = 'switching'
            return
        }
        this.nextTurn()
    }

    private nextTurn(): void {
        this.state.pending_switches = undefined
        if (this.state.turn >= this.maxTurns) {
            this.message(`${this.maxTurns}턴이 지나 무승부`)
            this.endBattle('draw')
            return
        }
        this.state.turn += 1
        this.state.phase = 'waiting_action'
        this.emit({ type: 'turn_end', turn: this.state.turn, state: this.snapshot() })
    }

    private resolveSwitchPhase(): void {
        const pending = this.state.pending_switches ?? {}
        const actions = (Object.keys(pending) as PlayerID[]).map(p => this.submitted[p]!).filter(Boolean)
        this.submitted = {}
        this.state.pending_switches = undefined

        const incoming: BattlePokemon[] = []
        for (const a of actions) {
            if (a.type !== 'switch') continue
            const inPoke = this.doSwitch(a.player, a.switch_to_id, { runEffects: false })
            if (inPoke) incoming.push(inPoke)
        }
        for (const p of this.sortBySpeed(incoming)) this.runSwitchInEffects(p)
        if (this.checkBattleEnd()) return

        if (this.midTurn) {
            this.continueTurn()
            return
        }
        // 해저드로 다시 쓰러졌으면 재교체
        const again: Partial<Record<PlayerID, SwitchReason>> = {}
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            if (this.needsFaintSwitch(player)) again[player] = 'faint'
        }
        if (Object.keys(again).length > 0) {
            this.state.pending_switches = again
            this.state.phase = 'switching'
            return
        }
        this.nextTurn()
    }

    private needsFaintSwitch(player: PlayerID): boolean {
        const side = this.state.sides[player]
        return side.active.every(p => p.fainted) && side.team.some(p => !p.fainted)
    }

    /** 유턴 등: 행동 도중 교체 요청 */
    requestSelfSwitch(pokemon: BattlePokemon): boolean {
        const player = this.sideOf(pokemon)
        const side = this.state.sides[player]
        if (!side.team.some(p => !p.fainted && !side.active.includes(p))) return false
        this.state.pending_switches = { ...(this.state.pending_switches ?? {}), [player]: 'self_switch' }
        return true
    }

    // ─── 교체 ───────────────────────────────────────────────────
    /** 교체 실행. 등장 효과(해저드/특성)까지 처리 */
    switchPokemon(player: PlayerID, outId: string, inId: string, forced = false): void {
        const side = this.state.sides[player]
        if (side.active[0]?.id !== outId) return
        const p = this.doSwitch(player, inId, { runEffects: true, forced })
        void p
    }

    private doSwitch(player: PlayerID, inId: string, opts: { runEffects: boolean; forced?: boolean }): BattlePokemon | null {
        const side = this.state.sides[player]
        const outgoing = side.active[0]!
        const incoming = side.team.find(p => p.id === inId)
        if (!incoming || incoming.fainted || incoming === outgoing) return null

        if (!outgoing.fainted) this.onSwitchOut(outgoing)
        this.resetVolatile(incoming)
        side.active[0] = incoming
        this.emit({ type: 'switch', player, out_id: outgoing.id, in_id: incoming.id, forced: opts.forced })
        if (opts.runEffects) this.runSwitchInEffects(incoming)
        return incoming
    }

    private onSwitchOut(pokemon: BattlePokemon): void {
        if (pokemon.ability === 'regenerator' && pokemon.hp < pokemon.max_hp) {
            const amount = Math.floor(pokemon.max_hp / 3)
            pokemon.hp = Math.min(pokemon.max_hp, pokemon.hp + amount)
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability: 'regenerator', effect: 'heal' })
        }
        if (pokemon.ability === 'natural-cure' && pokemon.status) {
            const s = pokemon.status
            pokemon.status = null
            pokemon.status_turns = 0
            this.emit({ type: 'status_remove', pokemon_id: pokemon.id, status: s })
        }
        if (pokemon.status === 'toxic') pokemon.status_turns = 1
        this.resetVolatile(pokemon)
        // 테라스탈/특성 변화는 유지, 랭크/휘발성 초기화
    }

    private resetVolatile(pokemon: BattlePokemon): void {
        pokemon.stages = createInitialStages()
        pokemon.volatile_statuses = {}
        pokemon.substitute_hp = 0
        pokemon.trapped = false
        pokemon.must_recharge = false
        pokemon.choice_lock = null
        pokemon.locked_move = null
        pokemon.active_turns = 0
        pokemon.last_move_used = null
        pokemon.ability = pokemon.base_ability ?? pokemon.ability
        if (!pokemon.terastallized) pokemon.types = [...(pokemon.original_types ?? pokemon.types)] as [string, string?]
    }

    /** 등장 시 해저드 → 특성 → 아이템 */
    runSwitchInEffects(pokemon: BattlePokemon): void {
        if (pokemon.fainted) return
        this.applyHazards(pokemon)
        if (pokemon.fainted) return
        this.runEntryAbility(pokemon)
        this.checkBoosterEnergy(pokemon)
        this.checkStatusBerry(pokemon)
    }

    private applyHazards(pokemon: BattlePokemon): void {
        const player = this.sideOf(pokemon)
        const cond = this.state.sides[player].conditions
        const boots = pokemon.item === 'heavy-duty-boots'
        const magicGuard = pokemon.ability === 'magic-guard'

        if (cond.stealth_rock && !boots && !magicGuard) {
            const eff = calcTypeEffectiveness('rock', pokemon.types.filter(Boolean) as string[], getTypeChart())
            this.applyDamage(pokemon.id, Math.max(1, Math.floor(pokemon.max_hp * eff / 8)), 'stealth-rock')
        }
        if (pokemon.fainted) return
        const grounded = this.isGroundedNow(pokemon)
        if (cond.spikes && grounded && !boots && !magicGuard) {
            const layers = cond.spikes.layers ?? 1
            const div = layers >= 3 ? 4 : layers === 2 ? 6 : 8
            this.applyDamage(pokemon.id, Math.max(1, Math.floor(pokemon.max_hp / div)), 'spikes')
        }
        if (pokemon.fainted) return
        if (cond.toxic_spikes && grounded) {
            if (pokemon.types.includes('poison')) {
                delete cond.toxic_spikes
                this.emit({ type: 'side_end', player, condition: 'toxic_spikes' })
            } else if (!boots) {
                const status = (cond.toxic_spikes.layers ?? 1) >= 2 ? 'toxic' : 'poison'
                this.trySetStatus(pokemon, status, null, 'toxic-spikes')
            }
        }
        if (cond.sticky_web && grounded && !boots) {
            this.boost(pokemon, 'speed', -1, null, 'sticky-web')
        }
    }

    private runEntryAbility(pokemon: BattlePokemon): void {
        const ability = pokemon.ability
        const player = this.sideOf(pokemon)
        const foe = this.getActive(this.foeOf(player))

        const weather = WEATHER_ABILITY_MAP[ability]
        if (weather && this.state.field.weather !== weather) {
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'weather' })
            this.setWeather(weather, ability, pokemon)
        }
        const terrain = TERRAIN_ABILITY_MAP[ability]
        if (terrain && this.state.field.terrain !== terrain) {
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'terrain' })
            this.setTerrain(terrain, ability, pokemon)
        }
        if (ability === 'intimidate' && foe && !foe.fainted) {
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'intimidate' })
            const immune = ['inner-focus', 'oblivious', 'own-tempo', 'scrappy']
            if (immune.includes(foe.ability) || foe.substitute_hp > 0) {
                this.emit({ type: 'immune', pokemon_id: foe.id, source: foe.ability })
            } else {
                this.boost(foe, 'attack', -1, pokemon, 'intimidate')
                if (foe.ability === 'rattled') this.boost(foe, 'speed', 1, foe, 'rattled')
            }
        }
        if (ability === 'download' && foe && !foe.fainted) {
            const stat = getStat(foe, 'defense') < getStat(foe, 'special_defense') ? 'attack' : 'special_attack'
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'download' })
            this.boost(pokemon, stat, 1, pokemon, 'download')
        }
        if (ability === 'trace' && foe && !foe.fainted && !['trace', 'multitype', 'stance-change', 'as-one-glastrier', 'as-one-spectrier'].includes(foe.ability)) {
            pokemon.ability = foe.ability
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability: 'trace', effect: foe.ability })
            this.runEntryAbility(pokemon)
            return
        }
        if (ability === 'pressure' || ability === 'mold-breaker' || ability === 'unnerve' || ability === 'teravolt' || ability === 'turboblaze') {
            this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'announce' })
        }
        if (ability === 'supreme-overlord') {
            const fallen = this.state.sides[player].team.filter(p => p.fainted).length
            if (fallen > 0) this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: `fallen_${Math.min(5, fallen)}` })
        }
        if (ability === 'intrepid-sword') this.boost(pokemon, 'attack', 1, pokemon, ability)
        if (ability === 'dauntless-shield') this.boost(pokemon, 'defense', 1, pokemon, ability)
        if (ability === 'slow-start') pokemon.volatile_statuses.slow_start = { turns_remaining: 5 }
        if (ability === 'screen-cleaner') {
            for (const p of ['p1', 'p2'] as PlayerID[]) {
                for (const c of ['reflect', 'light_screen', 'aurora_veil'] as SideCondition[]) this.removeSideCondition(p, c)
            }
        }
        this.checkParadox(pokemon)
    }

    /** 고대활성 / 쿼크차지 */
    checkParadox(pokemon: BattlePokemon): void {
        if (pokemon.fainted) return
        const a = pokemon.ability
        if (a !== 'protosynthesis' && a !== 'quark-drive') return
        if ('paradox_boost' in pokemon.volatile_statuses) return
        const active = a === 'protosynthesis'
            ? (this.state.field.weather === 'sun' || this.state.field.weather === 'harsh_sun')
            : this.state.field.terrain === 'electric'
        if (!active) return
        pokemon.volatile_statuses.paradox_boost = { turns_remaining: Infinity, source: 'field' }
        this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability: a, effect: getParadoxBoostedStat(pokemon.stats) })
    }

    private checkBoosterEnergy(pokemon: BattlePokemon): void {
        const a = pokemon.ability
        if (pokemon.item !== 'booster-energy' || (a !== 'protosynthesis' && a !== 'quark-drive')) return
        if ('paradox_boost' in pokemon.volatile_statuses) return
        this.consumeItem(pokemon)
        pokemon.volatile_statuses.paradox_boost = { turns_remaining: Infinity, source: 'booster-energy' }
        this.emit({ type: 'ability_trigger', pokemon_id: pokemon.id, ability: a, effect: getParadoxBoostedStat(pokemon.stats) })
    }

    // ─── 테라스탈 ──────────────────────────────────────────────
    terastallize(pokemon: BattlePokemon): void {
        const side = this.state.sides[this.sideOf(pokemon)]
        if (side.used_tera || pokemon.terastallized || !pokemon.tera_type) return
        side.used_tera = true
        pokemon.terastallized = true
        if (pokemon.tera_type !== 'stellar') pokemon.types = [pokemon.tera_type]
        this.emit({ type: 'terastallize', pokemon_id: pokemon.id, tera_type: pokemon.tera_type })
    }

    // ─── HP 변화 ───────────────────────────────────────────────
    /** 데미지 적용 (기술 데미지는 TurnManager 가 대타/기합의띠 처리 후 호출) */
    applyDamage(pokemonId: string, amount: number, source: string, extra: { effectiveness?: number; crit?: boolean } = {}): number {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon || pokemon.fainted || amount <= 0) return 0
        const actual = Math.min(Math.floor(amount), pokemon.hp)
        pokemon.hp -= actual
        pokemon.damaged_this_turn = (pokemon.damaged_this_turn ?? 0) + actual
        this.emit({ type: 'damage', pokemon_id: pokemonId, amount: actual, source, hp_after: pokemon.hp, ...extra })
        if (pokemon.hp <= 0) {
            this.faintPokemon(pokemonId)
        } else {
            this.checkHpItems(pokemon)
        }
        return actual
    }

    /** 간접 데미지 (매직가드 면역) */
    applyIndirectDamage(pokemon: BattlePokemon, amount: number, source: string): number {
        if (pokemon.ability === 'magic-guard') return 0
        return this.applyDamage(pokemon.id, Math.max(1, amount), source)
    }

    applyHeal(pokemonId: string, amount: number, source: string): number {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon || pokemon.fainted) return 0
        if ('heal_block' in pokemon.volatile_statuses) return 0
        const actual = Math.min(Math.floor(amount), pokemon.max_hp - pokemon.hp)
        if (actual <= 0) return 0
        pokemon.hp += actual
        this.emit({ type: 'heal', pokemon_id: pokemonId, amount: actual, source, hp_after: pokemon.hp })
        return actual
    }

    faintPokemon(pokemonId: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon || pokemon.fainted) return
        pokemon.hp = 0
        pokemon.fainted = true
        pokemon.status = null
        pokemon.volatile_statuses = {}
        const side = this.state.sides[this.sideOf(pokemon)]
        side.fainted_count = (side.fainted_count ?? 0) + 1
        this.emit({ type: 'faint', pokemon_id: pokemonId })
    }

    // ─── 상태이상 ──────────────────────────────────────────────
    /** 상태이상 시도. 성공 여부 반환 */
    trySetStatus(target: BattlePokemon, status: PrimaryStatus, source: BattlePokemon | null, sourceName = 'move'): boolean {
        if (!status || target.fainted) return false
        const side = this.state.sides[this.sideOf(target)]
        if (side.conditions.safeguard && source && this.sideOf(source) !== this.sideOf(target) && source.ability !== 'infiltrator') return false
        if (target.substitute_hp > 0 && source && source !== target) return false
        // 부식 특성: 독/강철에게도 독
        const corrosion = source?.ability === 'corrosion' && (status === 'poison' || status === 'toxic')
        const check = canApplyStatus(
            corrosion ? { ...target, types: ['normal'] } : target,
            status,
            this.isGroundedNow(target) ? this.state.field.terrain : null,
            this.state.field.weather,
        )
        if (!check.canApply) return false
        if (['comatose', 'purifying-salt'].includes(target.ability)) return false
        if (target.ability === 'leaf-guard' && (this.state.field.weather === 'sun' || this.state.field.weather === 'harsh_sun')) return false
        if (target.ability === 'thermal-exchange' && status === 'burn') return false
        if (target.ability === 'water-veil' && status === 'burn') return false
        if (target.ability === 'insomnia' || target.ability === 'vital-spirit' || target.ability === 'sweet-veil') {
            if (status === 'sleep') return false
        }

        target.status = status
        target.status_turns = status === 'sleep' ? this.rng.int(2, 4) : status === 'toxic' ? 1 : 0
        this.emit({ type: 'status_apply', pokemon_id: target.id, status, source: sourceName })

        // 싱크로
        if (target.ability === 'synchronize' && source && source !== target && ['burn', 'paralysis', 'poison', 'toxic'].includes(status)) {
            this.trySetStatus(source, status === 'toxic' ? 'toxic' : status, target, 'synchronize')
        }
        this.checkStatusBerry(target)
        return true
    }

    /** 하위 호환: 검사 없이 상태이상 부여 */
    applyStatus(pokemonId: string, status: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon) return
        pokemon.status = status as PrimaryStatus
        pokemon.status_turns = status === 'sleep' ? this.rng.int(2, 4) : status === 'toxic' ? 1 : 0
        this.emit({ type: 'status_apply', pokemon_id: pokemonId, status })
    }

    cureStatus(pokemonId: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon?.status) return
        const status = pokemon.status
        pokemon.status = null
        pokemon.status_turns = 0
        this.emit({ type: 'status_remove', pokemon_id: pokemonId, status })
    }

    addVolatile(pokemon: BattlePokemon, volatile: VolatileStatus, turns = Infinity, source?: string): boolean {
        if (volatile in pokemon.volatile_statuses) return false
        pokemon.volatile_statuses[volatile] = { turns_remaining: turns, source }
        this.emit({ type: 'volatile_apply', pokemon_id: pokemon.id, volatile })
        return true
    }

    removeVolatile(pokemon: BattlePokemon, volatile: VolatileStatus, silent = false): void {
        if (!(volatile in pokemon.volatile_statuses)) return
        delete pokemon.volatile_statuses[volatile]
        if (!silent) this.emit({ type: 'volatile_remove', pokemon_id: pokemon.id, volatile })
    }

    tryConfuse(target: BattlePokemon, source: BattlePokemon | null): boolean {
        if (target.fainted || 'confusion' in target.volatile_statuses) return false
        if (target.ability === 'own-tempo') return false
        if (this.state.field.terrain === 'misty' && this.isGroundedNow(target)) return false
        if (source && source !== target && target.substitute_hp > 0) return false
        this.addVolatile(target, 'confusion', this.rng.int(2, 5))
        if (target.item === 'persim-berry') this.checkStatusBerry(target)
        return true
    }

    // ─── 랭크 변화 ──────────────────────────────────────────────
    /** 랭크 변화 (특성/도구 반영). 실제 변화량 반환 */
    boost(target: BattlePokemon, stat: string, change: number, source: BattlePokemon | null, sourceName = 'move'): number {
        if (target.fainted || change === 0) return 0
        const key = stat.replace('special-attack', 'special_attack').replace('special-defense', 'special_defense') as keyof StatStages
        if (!(key in target.stages)) return 0

        const fromFoe = !!source && source !== target && this.sideOf(source) !== this.sideOf(target)
        let delta = change
        if (target.ability === 'contrary') delta = -delta
        if (target.ability === 'simple') delta *= 2

        if (delta < 0 && fromFoe) {
            if (['clear-body', 'white-smoke', 'full-metal-body'].includes(target.ability) || target.item === 'clear-amulet') {
                this.emit({ type: 'immune', pokemon_id: target.id, source: target.item === 'clear-amulet' ? 'clear-amulet' : target.ability })
                return 0
            }
            if (target.ability === 'hyper-cutter' && key === 'attack') return 0
            if (target.ability === 'keen-eye' && key === 'accuracy') return 0
            if (target.ability === 'big-pecks' && key === 'defense') return 0
            if (this.state.sides[this.sideOf(target)].conditions.mist) return 0
            if (target.ability === 'mirror-armor' && source) {
                this.emit({ type: 'ability_trigger', pokemon_id: target.id, ability: 'mirror-armor', effect: 'reflect' })
                return this.boost(source, key, change, target, 'mirror-armor')
            }
        }

        const before = target.stages[key]
        const after = Math.max(-6, Math.min(6, before + delta))
        const actual = after - before
        target.stages[key] = after
        this.emit({ type: 'stat_change', pokemon_id: target.id, stat: key, stages: delta, actual })

        if (actual < 0 && fromFoe) {
            if (target.ability === 'defiant') this.boost(target, 'attack', 2, target, 'defiant')
            if (target.ability === 'competitive') this.boost(target, 'special_attack', 2, target, 'competitive')
        }
        void sourceName
        return actual
    }

    /** 하위 호환 */
    applyStatChange(pokemonId: string, stat: string, change: number): void {
        const p = this.getPokemon(pokemonId)
        if (p) this.boost(p, stat, change, p)
    }

    // ─── 아이템 ────────────────────────────────────────────────
    consumeItem(pokemon: BattlePokemon): void {
        if (!pokemon.item) return
        const item = pokemon.item
        pokemon.item = null
        pokemon.item_consumed = item
        if (pokemon.ability === 'unburden') pokemon.volatile_statuses.unburden = { turns_remaining: Infinity }
        if (item.startsWith('choice-')) pokemon.choice_lock = null
        this.emit({ type: 'item_consume', pokemon_id: pokemon.id, item })
    }

    removeItem(pokemon: BattlePokemon, by: string): string | null {
        if (!pokemon.item) return null
        if (pokemon.ability === 'sticky-hold') return null
        const item = pokemon.item
        pokemon.item = null
        if (pokemon.ability === 'unburden') pokemon.volatile_statuses.unburden = { turns_remaining: Infinity }
        pokemon.choice_lock = null
        this.emit({ type: 'item_consume', pokemon_id: pokemon.id, item })
        void by
        return item
    }

    checkHpItems(pokemon: BattlePokemon): void {
        if (pokemon.fainted || !pokemon.item) return
        const half = pokemon.hp <= Math.floor(pokemon.max_hp / 2)
        const quarter = pokemon.hp <= Math.floor(pokemon.max_hp / 4) || (pokemon.ability === 'gluttony' && half)
        const item = pokemon.item
        if (item === 'sitrus-berry' && half) {
            this.consumeItem(pokemon)
            this.applyHeal(pokemon.id, Math.floor(pokemon.max_hp / 4), 'sitrus-berry')
        } else if (item === 'oran-berry' && half) {
            this.consumeItem(pokemon)
            this.applyHeal(pokemon.id, 10, 'oran-berry')
        } else if (['figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry'].includes(item) && quarter) {
            this.consumeItem(pokemon)
            this.applyHeal(pokemon.id, Math.floor(pokemon.max_hp / 3), item)
        } else if (quarter) {
            const pinch: Record<string, keyof StatStages> = {
                'liechi-berry': 'attack', 'ganlon-berry': 'defense', 'petaya-berry': 'special_attack',
                'apicot-berry': 'special_defense', 'salac-berry': 'speed',
            }
            if (item in pinch) {
                this.consumeItem(pokemon)
                this.boost(pokemon, pinch[item]!, 1, pokemon, item)
            }
        }
    }

    checkStatusBerry(pokemon: BattlePokemon): void {
        if (pokemon.fainted || !pokemon.item) return
        const cures = STATUS_BERRIES[pokemon.item]
        if (!cures) return
        if (cures === 'confusion' || cures === 'all') {
            if ('confusion' in pokemon.volatile_statuses) {
                this.consumeItem(pokemon)
                this.removeVolatile(pokemon, 'confusion')
                return
            }
        }
        if (pokemon.status && (cures === 'all' || (Array.isArray(cures) && cures.includes(pokemon.status)))) {
            this.consumeItem(pokemon)
            this.cureStatus(pokemon.id)
        }
    }

    // ─── 날씨 / 필드 ───────────────────────────────────────────
    setWeather(weather: Weather, source: string, setter?: BattlePokemon): boolean {
        const current = this.state.field.weather
        if (current === weather) return false
        // 원시 날씨는 일반 날씨로 덮어쓸 수 없음
        if (weather && ['harsh_sun', 'heavy_rain', 'strong_winds'].includes(current ?? '') && !['harsh_sun', 'heavy_rain', 'strong_winds'].includes(weather)) return false
        let turns = weather && ['harsh_sun', 'heavy_rain', 'strong_winds'].includes(weather) ? Infinity : 5
        if (weather && setter?.item && WEATHER_ITEM_MAP[setter.item] === weather) turns = 8
        this.state.field.weather = weather
        this.state.field.weather_turns = weather ? { turns_remaining: turns, source } : null
        this.emit({ type: 'weather_change', weather, source })
        for (const p of this.allActive()) this.checkParadox(p)
        return true
    }

    setTerrain(terrain: Terrain, source: string, setter?: BattlePokemon): boolean {
        if (this.state.field.terrain === terrain) return false
        const turns = setter?.item === 'terrain-extender' ? 8 : 5
        this.state.field.terrain = terrain
        this.state.field.terrain_turns = terrain ? { turns_remaining: turns, source } : null
        this.emit({ type: 'terrain_change', terrain, source })
        for (const p of this.allActive()) this.checkParadox(p)
        return true
    }

    addSideCondition(player: PlayerID, condition: SideCondition, turns: number, maxLayers = 1): boolean {
        const conds = this.state.sides[player].conditions
        const existing = conds[condition]
        if (existing) {
            if ((existing.layers ?? 1) >= maxLayers) return false
            existing.layers = (existing.layers ?? 1) + 1
            this.emit({ type: 'side_start', player, condition, layers: existing.layers })
            return true
        }
        conds[condition] = { turns_remaining: turns, layers: 1 }
        this.emit({ type: 'side_start', player, condition, layers: 1 })
        return true
    }

    removeSideCondition(player: PlayerID, condition: SideCondition): boolean {
        const conds = this.state.sides[player].conditions
        if (!conds[condition]) return false
        delete conds[condition]
        this.emit({ type: 'side_end', player, condition })
        return true
    }

    toggleFieldCondition(condition: FieldCondition, turns = 5): void {
        const conds = this.state.field.conditions
        if (conds[condition]) {
            delete conds[condition]
            this.emit({ type: 'field_end', condition })
        } else {
            conds[condition] = { turns_remaining: turns }
            this.emit({ type: 'field_start', condition })
        }
    }

    isGroundedNow(pokemon: BattlePokemon): boolean {
        if (this.state.field.conditions.gravity) return true
        if (pokemon.item === 'iron-ball') return true
        if ('roost' in pokemon.volatile_statuses && pokemon.types.includes('flying')) {
            return isGrounded({ ...pokemon, types: (pokemon.types.filter(t => t !== 'flying') as [string]).length ? pokemon.types.filter(t => t !== 'flying') as [string] : ['normal'] })
        }
        return isGrounded(pokemon)
    }

    // ─── 스피드 ────────────────────────────────────────────────
    getSpeed(pokemon: BattlePokemon): number {
        let speed = getStat(pokemon, 'speed', { weather: this.state.field.weather, terrain: this.state.field.terrain })
        if (this.state.sides[this.sideOf(pokemon)].conditions.tailwind) speed *= 2
        if (pokemon.item === 'iron-ball' || pokemon.item === 'macho-brace') speed = Math.floor(speed / 2)
        return speed
    }

    /** 빠른 순 정렬 (트릭룸 반영, 동속은 랜덤) */
    sortBySpeed(list: BattlePokemon[]): BattlePokemon[] {
        const trickRoom = !!this.state.field.conditions.trick_room
        const keyed = list.map(p => ({ p, s: this.getSpeed(p), r: this.rng.next() }))
        keyed.sort((a, b) => (a.s !== b.s ? (trickRoom ? a.s - b.s : b.s - a.s) : a.r - b.r))
        return keyed.map(k => k.p)
    }

    // ─── 턴 종료 처리 ───────────────────────────────────────────
    private runEndOfTurn(): void {
        const field = this.state.field
        const order = () => this.sortBySpeed(this.allActive().filter(p => !p.fainted))

        // 1. 날씨 지속/데미지
        if (field.weather && field.weather_turns) {
            if (field.weather_turns.turns_remaining !== Infinity) {
                field.weather_turns.turns_remaining -= 1
                if (field.weather_turns.turns_remaining <= 0) {
                    this.setWeather(null, 'end')
                }
            }
        }
        const weather = this.effectiveWeather()
        if (weather === 'sandstorm') {
            for (const p of order()) {
                if (!isImmuneToWeatherDamage(p, weather)) this.applyIndirectDamage(p, Math.floor(p.max_hp / 16), 'sandstorm')
            }
        }
        for (const p of order()) {
            const a = p.ability
            if ((a === 'rain-dish' && (weather === 'rain' || weather === 'heavy_rain')) || (a === 'ice-body' && weather === 'snow')) {
                this.applyHeal(p.id, Math.floor(p.max_hp / 16), a)
            }
            if (a === 'dry-skin') {
                if (weather === 'rain' || weather === 'heavy_rain') this.applyHeal(p.id, Math.floor(p.max_hp / 8), a)
                if (weather === 'sun' || weather === 'harsh_sun') this.applyIndirectDamage(p, Math.floor(p.max_hp / 8), a)
            }
            if (a === 'solar-power' && (weather === 'sun' || weather === 'harsh_sun')) this.applyIndirectDamage(p, Math.floor(p.max_hp / 8), a)
        }

        // 2. 소원
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            const wish = this.state.sides[player].conditions.wish
            if (!wish) continue
            wish.turns_remaining -= 1
            if (wish.turns_remaining <= 0) {
                const target = this.getActive(player)
                if (target && !target.fainted) this.applyHeal(target.id, wish.amount ?? 0, 'wish')
                delete this.state.sides[player].conditions.wish
            }
        }

        // 3. 그래스필드 회복
        if (field.terrain === 'grassy') {
            for (const p of order()) if (this.isGroundedNow(p)) this.applyHeal(p.id, Math.floor(p.max_hp / 16), 'grassy-terrain')
        }

        // 4. 아이템/특성 회복, 상태이상 데미지 등 (포켓몬별)
        for (const p of order()) {
            if (p.fainted) continue
            // 먹다남은음식 / 검은진흙
            if (p.item === 'leftovers') this.applyHeal(p.id, Math.floor(p.max_hp / 16), 'leftovers')
            if (p.item === 'black-sludge') {
                if (p.types.includes('poison')) this.applyHeal(p.id, Math.floor(p.max_hp / 16), 'black-sludge')
                else this.applyIndirectDamage(p, Math.floor(p.max_hp / 8), 'black-sludge')
            }
            if (p.fainted) continue
            if ('aqua_ring' in p.volatile_statuses) this.applyHeal(p.id, Math.floor(p.max_hp / 16 * (p.item === 'big-root' ? 1.3 : 1)), 'aqua-ring')
            if ('ingrain' in p.volatile_statuses) this.applyHeal(p.id, Math.floor(p.max_hp / 16 * (p.item === 'big-root' ? 1.3 : 1)), 'ingrain')

            // 씨뿌리기
            const seed = p.volatile_statuses.seeded
            if (seed) {
                const seeder = this.getActive(this.foeOf(this.sideOf(p)))
                const dmg = this.applyIndirectDamage(p, Math.floor(p.max_hp / 8), 'leech-seed')
                if (seeder && !seeder.fainted && dmg > 0) {
                    if (p.ability === 'liquid-ooze') this.applyDamage(seeder.id, dmg, 'liquid-ooze')
                    else this.applyHeal(seeder.id, Math.floor(dmg * (seeder.item === 'big-root' ? 1.3 : 1)), 'leech-seed')
                }
            }
            if (p.fainted) continue

            // 상태이상 데미지
            if (p.status === 'poison' || p.status === 'toxic') {
                if (p.ability === 'poison-heal') {
                    this.applyHeal(p.id, Math.floor(p.max_hp / 8), 'poison-heal')
                } else if (p.status === 'poison') {
                    this.applyIndirectDamage(p, Math.floor(p.max_hp / 8), 'poison')
                } else {
                    const n = Math.min(15, Math.max(1, p.status_turns))
                    this.applyIndirectDamage(p, Math.floor(p.max_hp * n / 16), 'toxic')
                    p.status_turns = n + 1
                }
            } else if (p.status === 'burn') {
                this.applyIndirectDamage(p, Math.floor(p.max_hp / (p.ability === 'heatproof' ? 32 : 16)), 'burn')
            }
            if (p.fainted) continue

            // 저주 / 소금절이 / 조이기
            if ('curse' in p.volatile_statuses) this.applyIndirectDamage(p, Math.floor(p.max_hp / 4), 'curse')
            if (p.fainted) continue
            if ('salt_cure' in p.volatile_statuses) {
                const div = p.types.includes('water') || p.types.includes('steel') ? 4 : 8
                this.applyIndirectDamage(p, Math.floor(p.max_hp / div), 'salt-cure')
            }
            if (p.fainted) continue
            const bound = p.volatile_statuses.bound
            if (bound) {
                this.applyIndirectDamage(p, Math.floor(p.max_hp / (bound.source === 'binding-band' ? 6 : 8)), 'bind')
                bound.turns_remaining -= 1
                if (bound.turns_remaining <= 0) this.removeVolatile(p, 'bound')
            }
            if (p.fainted) continue

            // 하품
            const yawn = p.volatile_statuses.yawn
            if (yawn) {
                yawn.turns_remaining -= 1
                if (yawn.turns_remaining <= 0) {
                    this.removeVolatile(p, 'yawn', true)
                    this.trySetStatus(p, 'sleep', null, 'yawn')
                }
            }

            // 도발 / 앙코르 등 카운트
            for (const v of ['taunt', 'encore', 'disable', 'heal_block', 'magnet_rise', 'embargo', 'slow_start', 'telekinesis'] as VolatileStatus[]) {
                const eff = p.volatile_statuses[v]
                if (!eff || eff.turns_remaining === Infinity) continue
                eff.turns_remaining -= 1
                if (eff.turns_remaining <= 0) this.removeVolatile(p, v)
            }

            // 특성 (가속 / 나쁜꿈 / 탈피 / 변덕쟁이)
            if (p.ability === 'speed-boost' && (p.active_turns ?? 0) > 0) this.boost(p, 'speed', 1, p, 'speed-boost')
            if (p.ability === 'shed-skin' && p.status && this.rng.chance(1, 3)) this.cureStatus(p.id)
            if (p.ability === 'hydration' && p.status && (weather === 'rain' || weather === 'heavy_rain')) this.cureStatus(p.id)
            if (p.ability === 'bad-dreams') {
                const foe = this.getActive(this.foeOf(this.sideOf(p)))
                if (foe && !foe.fainted && (foe.status === 'sleep' || foe.ability === 'comatose')) this.applyIndirectDamage(foe, Math.floor(foe.max_hp / 8), 'bad-dreams')
            }
            if (p.ability === 'moody') {
                const stats: (keyof StatStages)[] = ['attack', 'defense', 'special_attack', 'special_defense', 'speed']
                const up = this.rng.pick(stats.filter(s => p.stages[s] < 6))
                const down = this.rng.pick(stats.filter(s => s !== up && p.stages[s] > -6))
                if (up) this.boost(p, up, 2, p, 'moody')
                if (down) this.boost(p, down, -1, p, 'moody')
            }
            // 독구슬 / 화염구슬
            if (p.item === 'flame-orb') this.trySetStatus(p, 'burn', p, 'flame-orb')
            if (p.item === 'toxic-orb') this.trySetStatus(p, 'toxic', p, 'toxic-orb')
        }

        // 5. 사이드 / 필드 카운트
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            const conds = this.state.sides[player].conditions
            for (const key of Object.keys(conds) as SideCondition[]) {
                const c = conds[key]!
                if (c.turns_remaining === Infinity || key === 'wish') continue
                c.turns_remaining -= 1
                if (c.turns_remaining <= 0) this.removeSideCondition(player, key)
            }
        }
        for (const key of Object.keys(field.conditions) as FieldCondition[]) {
            const c = field.conditions[key]!
            c.turns_remaining -= 1
            if (c.turns_remaining <= 0) {
                delete field.conditions[key]
                this.emit({ type: 'field_end', condition: key })
            }
        }
        if (field.terrain && field.terrain_turns && field.terrain_turns.turns_remaining !== Infinity) {
            field.terrain_turns.turns_remaining -= 1
            if (field.terrain_turns.turns_remaining <= 0) this.setTerrain(null, 'end')
        }

        // 6. 턴 단위 휘발성 해제
        for (const p of this.allActive()) {
            for (const v of ['flinch', 'protect', 'kings_shield', 'spiky_shield', 'baneful_bunker', 'silk_trap', 'burning_bulwark', 'obstruct', 'endure', 'roost', 'destiny_bond'] as VolatileStatus[]) {
                if (v in p.volatile_statuses) delete p.volatile_statuses[v]
            }
            if (!p.fainted) p.active_turns = (p.active_turns ?? 0) + 1
            // 고대활성/쿼크차지: 조건 소멸 시 해제 (부스트에너지 제외)
            const pb = p.volatile_statuses.paradox_boost
            if (pb && pb.source === 'field') {
                const ok = p.ability === 'protosynthesis'
                    ? (field.weather === 'sun' || field.weather === 'harsh_sun')
                    : field.terrain === 'electric'
                if (!ok) {
                    delete p.volatile_statuses.paradox_boost
                    if (p.item === 'booster-energy') this.checkBoosterEnergy(p)
                }
            }
        }
    }

    /** 구름제거/에어록 반영 날씨 */
    effectiveWeather(): Weather {
        if (this.allActive().some(p => !p.fainted && (p.ability === 'cloud-nine' || p.ability === 'air-lock'))) return null
        return this.state.field.weather
    }

    // ─── 배틀 종료 ──────────────────────────────────────────────
    private checkBattleEnd(): boolean {
        if (this.state.phase === 'ended') return true
        const p1Out = this.state.sides.p1.team.every(p => p.fainted)
        const p2Out = this.state.sides.p2.team.every(p => p.fainted)
        if (!p1Out && !p2Out) return false
        this.endBattle(p1Out && p2Out ? 'draw' : p1Out ? 'p2' : 'p1')
        return true
    }

    private endBattle(winner: PlayerID | 'draw'): void {
        this.state.phase = 'ended'
        this.state.winner = winner
        this.state.pending_switches = undefined
        this.turnQueue = []
        this.emit({ type: 'battle_end', winner })
    }

    // ─── 헬퍼 ───────────────────────────────────────────────────
    allActive(): BattlePokemon[] {
        return [this.state.sides.p1.active[0]!, this.state.sides.p2.active[0]!].filter(Boolean)
    }

    /** 하위 호환 */
    getAllActive(): BattlePokemon[] {
        return this.allActive()
    }

    /** 하위 호환: 포켓몬 객체 갱신 */
    updatePokemon(id: string, updater: (p: BattlePokemon) => BattlePokemon): void {
        const p = this.getPokemon(id)
        if (!p) return
        Object.assign(p, updater({ ...p }))
    }

    getPriority(pokemon: BattlePokemon, move: MoveData): number {
        return getEffectivePriority(this, pokemon, move)
    }

    // ─── 초기 상태 생성 ─────────────────────────────────────────
    private initState(config: BattleConfig): BattleState {
        const makeSide = (player: PlayerID, playerConfig: BattleConfig['p1']): Side => {
            const team = playerConfig.team.slice(0, 6).map((set, i) => createBattlePokemon(set, `${player}_${i}`, player))
            return {
                id:            player,
                name:          playerConfig.name,
                team,
                active:        [team[0]!],
                conditions:    {},
                used_dynamax:  false,
                dynamax_turns: 0,
                used_tera:     false,
                fainted_count: 0,
            }
        }

        return {
            format: config.format,
            sides: {
                p1: makeSide('p1', config.p1),
                p2: makeSide('p2', config.p2),
            },
            field: {
                weather:       null,
                weather_turns: null,
                terrain:       null,
                terrain_turns: null,
                conditions:    {},
                turn:          0,
            },
            turn:   1,
            phase:  'waiting_action',
            winner: null,
            log:    [],
            seed:   this.rng.initialSeed,
        }
    }
}

// ─── PokemonSet → BattlePokemon ─────────────────────────────────
export function createBattlePokemon(set: PokemonSet, id: string, side?: PlayerID): BattlePokemon {
    const speciesId = toId(set.species)
    const speciesData = getSpecies(speciesId)
    const baseStats = speciesData?.base_stats ?? {
        hp: 80, attack: 80, defense: 80, special_attack: 80, special_defense: 80, speed: 80,
    }
    const types = (speciesData?.types?.length ? [...speciesData.types] : ['normal']) as [string, string?]
    const nature = (set.nature ? toId(set.nature) : 'hardy') as PokemonSet['nature']
    const level = set.level ?? 50
    const stats = calcAllStats(baseStats, level, nature, set.evs, set.ivs)
    if (speciesId === 'shedinja') stats.hp = 1
    const ability = toId(set.ability || speciesData?.abilities?.[0]?.name || 'no-ability')

    const moves = set.moves.filter(Boolean).slice(0, 4).map(m => {
        const moveData = getMove(toId(m!)) ?? FALLBACK_MOVE(toId(m!))
        const maxPp = Math.floor(moveData.pp * 8 / 5) // PP 맥스
        return { move: moveData, pp: maxPp, max_pp: maxPp, disabled: false, encore_locked: false }
    })
    if (moves.length === 0) moves.push({ move: STRUGGLE, pp: 1, max_pp: 1, disabled: false, encore_locked: false })

    return {
        id,
        side,
        set: { ...set, species: speciesId, nature, level },
        species:           speciesId,
        nickname:          set.nickname ?? speciesId,
        level,
        gender:            set.gender ?? null,
        ability,
        base_ability:      ability,
        item:              set.item ? toId(set.item) : null,
        types,
        original_types:    [...types] as [string, string?],
        weight:            speciesData?.weight ?? 500,
        tera_type:         set.teraType ? toId(set.teraType) : null,
        terastallized:     false,
        hp:                stats.hp,
        max_hp:            stats.hp,
        stats,
        stages:            createInitialStages(),
        moves:             moves as BattlePokemon['moves'],
        status:            null,
        status_turns:      0,
        volatile_statuses: {},
        substitute_hp:     0,
        last_move_used:    null,
        last_move_target:  null,
        must_recharge:     false,
        trapped:           false,
        transformed:       false,
        fainted:           false,
        active_turns:      0,
        choice_lock:       null,
        locked_move:       null,
        moved_this_turn:   false,
        damaged_this_turn: 0,
        item_consumed:     null,
    }
}

export { STAT_DISPLAY_KEYS }
