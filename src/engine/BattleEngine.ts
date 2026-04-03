import type { BattleConfig, BattleState, BattleEvent, Action, PlayerID, Side } from '../types/battle'
import type { BattlePokemon } from '../types/pokemon'
import type { Weather, Terrain } from '../types/effect'
import { calcAllStats, createInitialStages } from '../calc/stat'
import { onSwitchIn } from '../effects/ability'
import { calcWeatherDamage } from '../effects/weather'
import { calcStatusDamage, tickToxic } from '../effects/status'
import { calcLeechSeedDamage, calcBindDamage, calcCurseDamage, calcAquaRingHeal, calcIngrainHeal, tickVolatile } from '../effects/volatile'
import { TurnManager } from './TurnManager'
import {getMove, getSpecies} from '../data/loader'

type AnyEventListener = (event: BattleEvent) => void

export class BattleEngine {
    private state: BattleState
    private listeners: Map<string, AnyEventListener[]> = new Map()
    private turnManager: TurnManager

    constructor(config: BattleConfig) {
        this.state = this.initState(config)
        this.turnManager = new TurnManager(this)
    }

    // ─── 상태 조회 ──────────────────────────────────────────────
    getState(): Readonly<BattleState> {
        return this.state
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

    // ─── 이벤트 이미터 ──────────────────────────────────────────
    on(eventType: string, listener: AnyEventListener): void {
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, [])
        }
        this.listeners.get(eventType)!.push(listener)
    }

    off(eventType: string, listener: AnyEventListener): void {
        const list = this.listeners.get(eventType)
        if (!list) return
        const idx = list.indexOf(listener)
        if (idx !== -1) list.splice(idx, 1)
    }

    emit(event: BattleEvent): void {
        this.state.log.push(event)
        const typed = this.listeners.get(event.type) ?? []
        for (const fn of typed) fn(event)
        const all = this.listeners.get('*') ?? []
        for (const fn of all) fn(event)
    }

    // ─── 행동 제출 ──────────────────────────────────────────────
    submitAction(action: Action): void {
        if (this.state.phase !== 'waiting_action' && this.state.phase !== 'switching') {
            throw new Error(`Cannot submit action in phase: ${this.state.phase}`)
        }
        this.turnManager.queueAction(action)

        // switching 페이즈는 교체가 필요한 쪽만 체크
        if (this.state.phase === 'switching') {
            if (this.isSwitchingComplete()) {
                this.turnManager.executeTurn(this.state)
                if (!this.checkBattleEnd()) {
                    if (this.checkNeedSwitch()) {
                        // 아직 교체 필요한 쪽 있음
                    } else {
                        this.state = { ...this.state, turn: this.state.turn + 1, phase: 'waiting_action' }
                        this.emit({ type: 'turn_end', turn: this.state.turn, state: this.state })
                    }
                }
            }
            return
        }

        if (this.turnManager.isReady()) {
            this.executeTurn()
        }
    }

    private isSwitchingComplete(): boolean {
        for (const [player, side] of Object.entries(this.state.sides) as [PlayerID, Side][]) {
            const needsSwitch = side.active.every(p => p.fainted) && side.team.some(p => !p.fainted)
            if (needsSwitch && !this.turnManager.queueHas(player as PlayerID)) {
                return false
            }
        }
        return true
    }

    // ─── 턴 실행 ────────────────────────────────────────────────
    private executeTurn(): void {
        this.state = { ...this.state, phase: 'executing' }
        this.emit({ type: 'turn_start', turn: this.state.turn })
        this.turnManager.executeTurn(this.state)
        this.runEndOfTurn()

        if (!this.checkBattleEnd()) {
            if (this.checkNeedSwitch()) {
                this.state = { ...this.state, phase: 'switching' }
            } else {
                this.state = { ...this.state, turn: this.state.turn + 1, phase: 'waiting_action' }
                this.emit({ type: 'turn_end', turn: this.state.turn, state: this.state })
            }
        }
    }

    // ─── 턴 종료 처리 ───────────────────────────────────────────
    private runEndOfTurn(): void {
        const { field } = this.state
        const allActive = this.getAllActive()

        for (const pokemon of allActive) {
            if (pokemon.fainted) continue

            // 날씨 데미지
            const weatherDmg = calcWeatherDamage(pokemon, field.weather)
            if (weatherDmg) {
                this.applyDamage(pokemon.id, weatherDmg.damage, 'weather')
            }

            // 상태이상 데미지
            const statusDmg = calcStatusDamage(pokemon, Math.random)
            if (statusDmg) {
                if (statusDmg.cured) {
                    this.cureStatus(pokemon.id)
                } else if (statusDmg.damage > 0) {
                    this.applyDamage(pokemon.id, statusDmg.damage, pokemon.status ?? 'status')
                }
            }

            // 맹독 턴 증가
            if (pokemon.status === 'toxic') {
                this.updatePokemon(pokemon.id, p => ({ ...p, status_turns: tickToxic(p) }))
            }

            // 씨뿌리기
            const leechDmg = calcLeechSeedDamage(pokemon)
            if (leechDmg > 0) {
                this.applyDamage(pokemon.id, leechDmg, 'seeded')
                // TODO: 씨뿌린 쪽 회복
            }

            // 감기기
            const bindDmg = calcBindDamage(pokemon)
            if (bindDmg > 0) {
                this.applyDamage(pokemon.id, bindDmg, 'bound')
            }

            // 저주
            const curseDmg = calcCurseDamage(pokemon)
            if (curseDmg > 0) {
                this.applyDamage(pokemon.id, curseDmg, 'curse')
            }

            // 아쿠아링
            const aquaHeal = calcAquaRingHeal(pokemon)
            if (aquaHeal > 0) {
                this.applyHeal(pokemon.id, aquaHeal, 'aqua_ring')
            }

            // 뿌리박기
            const ingrainHeal = calcIngrainHeal(pokemon)
            if (ingrainHeal > 0) {
                this.applyHeal(pokemon.id, ingrainHeal, 'ingrain')
            }

            // 휘발성 상태 tick
            this.tickVolatileStatuses(pokemon.id)
        }

        this.tickWeather()
        this.tickTerrain()
    }

    // ─── 데미지 적용 ────────────────────────────────────────────
    applyDamage(pokemonId: string, amount: number, source: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon || pokemon.fainted) return

        const actual = Math.min(amount, pokemon.hp)
        this.updatePokemon(pokemonId, p => ({ ...p, hp: p.hp - actual }))
        this.emit({ type: 'damage', pokemon_id: pokemonId, amount: actual, source })

        const updated = this.getPokemon(pokemonId)!
        if (updated.hp <= 0) {
            this.faintPokemon(pokemonId)
        }
    }

    // ─── 회복 적용 ──────────────────────────────────────────────
    applyHeal(pokemonId: string, amount: number, source: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon || pokemon.fainted) return

        const actual = Math.min(amount, pokemon.max_hp - pokemon.hp)
        if (actual <= 0) return
        this.updatePokemon(pokemonId, p => ({ ...p, hp: p.hp + actual }))
        this.emit({ type: 'heal', pokemon_id: pokemonId, amount: actual, source })
    }

    // ─── 기절 처리 ──────────────────────────────────────────────
    faintPokemon(pokemonId: string): void {
        this.updatePokemon(pokemonId, p => ({ ...p, hp: 0, fainted: true }))
        this.emit({ type: 'faint', pokemon_id: pokemonId })
    }

    // ─── 상태이상 적용 ──────────────────────────────────────────
    applyStatus(pokemonId: string, status: string): void {
        this.updatePokemon(pokemonId, p => ({
            ...p,
            status: status as BattlePokemon['status'],
            status_turns: 0,
        }))
        this.emit({ type: 'status_apply', pokemon_id: pokemonId, status })
    }

    // ─── 상태이상 해제 ──────────────────────────────────────────
    cureStatus(pokemonId: string): void {
        const pokemon = this.getPokemon(pokemonId)
        if (!pokemon?.status) return
        const status = pokemon.status
        this.updatePokemon(pokemonId, p => ({ ...p, status: null, status_turns: 0 }))
        this.emit({ type: 'status_remove', pokemon_id: pokemonId, status })
    }

    // ─── 스탯 랭크 변경 ─────────────────────────────────────────
    applyStatChange(pokemonId: string, stat: string, change: number): void {
        const normalizedStat = stat
            .replace('special-attack',  'special_attack')
            .replace('special-defense', 'special_defense')

        this.updatePokemon(pokemonId, p => {
            const current = p.stages[normalizedStat as keyof typeof p.stages] ?? 0
            const next    = Math.max(-6, Math.min(6, current + change))
            const actual  = next - current
            if (actual === 0) return p
            return { ...p, stages: { ...p.stages, [normalizedStat]: next } }
        })
        this.emit({ type: 'stat_change', pokemon_id: pokemonId, stat: normalizedStat, stages: change })
    }

    // ─── 교체 처리 ──────────────────────────────────────────────
    switchPokemon(player: PlayerID, outId: string, inId: string): void {
        const side = this.state.sides[player]
        const outIdx = side.active.findIndex(p => p.id === outId)
        const incoming = side.team.find(p => p.id === inId)
        if (outIdx === -1 || !incoming) return

        const cleanIncoming = {
            ...incoming,
            stages:            createInitialStages(),
            volatile_statuses: {},
            substitute_hp:     0,
            trapped:           false,
            must_recharge:     false,
        }

        const newActive = [...side.active]
        newActive[outIdx] = cleanIncoming

        this.state = {
            ...this.state,
            sides: {
                ...this.state.sides,
                [player]: { ...side, active: newActive },
            },
        }

        this.emit({ type: 'switch', player, out_id: outId, in_id: inId })

        const entryResult = onSwitchIn(cleanIncoming, this.state)
        for (const event of entryResult.events) {
            this.emit(event)
        }
        if (entryResult.weatherChange) {
            this.setWeather(entryResult.weatherChange, 'ability')
        }
        if (entryResult.terrainChange) {
            this.setTerrain(entryResult.terrainChange, 'ability')
        }
        if (entryResult.statChanges) {
            for (const sc of entryResult.statChanges) {
                this.applyStatChange(sc.targetId, sc.stat, sc.change)
            }
        }
        if (this.state.phase === 'switching' && !this.checkNeedSwitch()) {
            this.state = { ...this.state, turn: this.state.turn + 1, phase: 'waiting_action' }
            this.emit({ type: 'turn_end', turn: this.state.turn, state: this.state })
        }
    }

    // ─── 날씨 변경 ──────────────────────────────────────────────
    setWeather(weather: Weather, source: string): void {
        this.state = {
            ...this.state,
            field: {
                ...this.state.field,
                weather,
                weather_turns: weather ? { turns_remaining: 5 } : null,
            },
        }
        this.emit({ type: 'weather_change', weather, source })
    }

    // ─── 필드 변경 ──────────────────────────────────────────────
    setTerrain(terrain: Terrain, source: string): void {
        this.state = {
            ...this.state,
            field: {
                ...this.state.field,
                terrain,
                terrain_turns: terrain ? { turns_remaining: 5 } : null,
            },
        }
        this.emit({ type: 'terrain_change', terrain, source })
    }

    // ─── 날씨 틱 ────────────────────────────────────────────────
    private tickWeather(): void {
        const { weather, weather_turns } = this.state.field
        if (!weather || !weather_turns) return
        if (weather_turns.turns_remaining === Infinity) return

        const next = weather_turns.turns_remaining - 1
        if (next <= 0) {
            this.state = {
                ...this.state,
                field: { ...this.state.field, weather: null, weather_turns: null },
            }
            this.emit({ type: 'weather_change', weather: null, source: 'end' })
        } else {
            this.state = {
                ...this.state,
                field: { ...this.state.field, weather_turns: { turns_remaining: next } },
            }
        }
    }

    // ─── 필드 틱 ────────────────────────────────────────────────
    private tickTerrain(): void {
        const { terrain, terrain_turns } = this.state.field
        if (!terrain || !terrain_turns) return
        if (terrain_turns.turns_remaining === Infinity) return

        const next = terrain_turns.turns_remaining - 1
        if (next <= 0) {
            this.state = {
                ...this.state,
                field: { ...this.state.field, terrain: null, terrain_turns: null },
            }
            this.emit({ type: 'terrain_change', terrain: null, source: 'end' })
        } else {
            this.state = {
                ...this.state,
                field: { ...this.state.field, terrain_turns: { turns_remaining: next } },
            }
        }
    }

    // ─── 휘발성 상태 틱 ────────────────────────────────────────
    private tickVolatileStatuses(pokemonId: string): void {
        this.updatePokemon(pokemonId, p => {
            const next = { ...p.volatile_statuses }
            for (const key of Object.keys(next) as (keyof typeof next)[]) {
                const effect = next[key]
                if (!effect) continue
                const ticked = tickVolatile(key, effect)
                if (!ticked) {
                    delete next[key]
                } else {
                    next[key] = ticked
                }
            }
            return { ...p, volatile_statuses: next }
        })
    }

    // ─── 배틀 종료 체크 ─────────────────────────────────────────
    private checkBattleEnd(): boolean {
        for (const [player, side] of Object.entries(this.state.sides) as [PlayerID, Side][]) {
            const allFainted = side.team.every(p => p.fainted)
            if (allFainted) {
                const winner: PlayerID = player === 'p1' ? 'p2' : 'p1'
                this.state = { ...this.state, phase: 'ended', winner }
                this.emit({ type: 'battle_end', winner })
                return true
            }
        }
        return false
    }
    private checkNeedSwitch(): boolean {
        for (const side of Object.values(this.state.sides)) {
            const activeAllFainted = side.active.every(p => p.fainted)
            const hasAlive = side.team.some(p => !p.fainted)
            if (activeAllFainted && hasAlive) return true
        }
        return false
    }
    // ─── 헬퍼 ───────────────────────────────────────────────────
    getAllActive(): BattlePokemon[] {
        return Object.values(this.state.sides).flatMap(s => s.active)
    }

    updatePokemon(id: string, updater: (p: BattlePokemon) => BattlePokemon): void {
        for (const player of ['p1', 'p2'] as PlayerID[]) {
            const side = this.state.sides[player]
            const teamIdx = side.team.findIndex(p => p.id === id)
            if (teamIdx !== -1) {
                const newTeam = [...side.team]
                newTeam[teamIdx] = updater(newTeam[teamIdx]!)

                const activeIdx = side.active.findIndex(p => p.id === id)
                const newActive = [...side.active]
                if (activeIdx !== -1) {
                    newActive[activeIdx] = newTeam[teamIdx]!
                }

                this.state = {
                    ...this.state,
                    sides: {
                        ...this.state.sides,
                        [player]: { ...side, team: newTeam, active: newActive },
                    },
                }
                return
            }
        }
    }

    // ─── 초기 상태 생성 ─────────────────────────────────────────
    private initState(config: BattleConfig): BattleState {
        const makeSide = (player: PlayerID, playerConfig: BattleConfig['p1']): Side => {
            const team = playerConfig.team.map((set, i) => {
                const speciesData = getSpecies(set.species)

                const baseStats = speciesData?.base_stats ?? {
                    hp: 45, attack: 45, defense: 45,
                    special_attack: 45, special_defense: 45, speed: 45,
                }
                const types = (speciesData?.types ?? ['normal']) as [string, string?]
                const stats  = calcAllStats(baseStats, set.level, set.nature, set.evs, set.ivs)
                const max_hp = stats.hp

                const pokemon: BattlePokemon = {
                    id:                `${player}_${i}`,
                    set,
                    species:           set.species,
                    nickname:          set.nickname ?? set.species,
                    level:             set.level,
                    gender:            set.gender,
                    ability:           set.ability,
                    item:              set.item ?? null,
                    types,
                    hp:                max_hp,
                    max_hp,
                    stats,
                    stages:            createInitialStages(),
// initState 내부 moves 부분 교체
                    moves: (set.moves.filter(Boolean).map(m => {
                        const moveData = getMove(m!)
                        return {
                            move: moveData ?? {
                                id: 0, name: m!, type: 'normal',
                                category: 'physical' as const,
                                power: 50, accuracy: 100, pp: 20, priority: 0,
                                target: 'selected-pokemon' as const,
                                effect_chance: null, effect: '', meta: null, stat_changes: [],
                            },
                            pp:            moveData?.pp ?? 20,
                            max_pp:        moveData?.pp ?? 20,
                            disabled:      false,
                            encore_locked: false,
                        }
                    }) as unknown) as BattlePokemon['moves'],
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
                }
                return pokemon
            })

            return {
                id:            player,
                team,
                active:        [team[0]!],
                conditions:    {},
                used_dynamax:  false,
                dynamax_turns: 0,
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
        }
    }
}