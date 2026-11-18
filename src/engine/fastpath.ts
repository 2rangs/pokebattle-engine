// ─── 빠른 경로 (Showdown 핫패스 런타임 패치) ──────────────────
// Showdown 은 이벤트(runEvent 등)마다 상태·휘발성·특성·도구·종·필드 효과 객체 전부에서
// `effect['on' + 이벤트]` 를 문자열 키로 찾는다. 효과 객체는 종류마다 모양이 달라 이 조회가
// 메가모픽이 되고, 대부분은 "없음" 이라 프로토타입 체인 끝까지 걷는다. 배틀 시간의 절반 가까이가 여기다.
//
// 패치: 효과 객체마다 'on' 으로 시작하는 속성만 담은 사전(prototype 없는 객체)을 처음 조회할 때 한 번 만든다.
// 이후 조회는 그 사전 하나에서 끝난다. 효과 데이터는 배틀 중 바뀌지 않으므로(Showdown 데이터는 정적)
// 결과는 원본과 같다 — scripts/bench-compare.ts 와 퍼징이 같은 시드의 프로토콜 로그가 바이트 단위로
// 같은지 확인한다.
//
// 패치는 프로토타입에 한 번 설치하고, battle.fastPath 가 true 인 배틀에서만 동작한다.
// 같은 프로세스의 다른 @pkmn/sim 사용자(fastPath 를 켜지 않은 Battle)는 원본 경로 그대로다.
import { Battle, Pokemon, Side } from '@pkmn/sim'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any

/** 사전을 만들 수 없는 효과 (getter 가 있는 등) */
const UNSAFE = Object.freeze(Object.create(null)) as Record<string, unknown>

// 효과 객체 → on* 사전. 효과 객체에 속성을 붙이면 조회가 다시 메가모픽이 되므로 바깥 맵에 둔다.
// 배틀마다 새로 만들어지는 효과(커스텀 규칙 포맷 등)가 남지 않게 WeakMap
const tables = new WeakMap<object, Record<string, unknown>>()

/** 효과 객체의 on* 속성 사전. 프로토타입 체인 포함, 가까운 쪽 우선 (일반 속성 조회와 같은 규칙) */
function callbacksOf(effect: any): Record<string, unknown> {
    const cached = tables.get(effect)
    if (cached !== undefined) return cached
    let table: Record<string, unknown> = Object.create(null)
    for (let o = effect; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
        for (const key of Object.getOwnPropertyNames(o)) {
            if (key.charCodeAt(0) !== 111 /* o */ || key.charCodeAt(1) !== 110 /* n */ || key in table) continue
            const desc = Object.getOwnPropertyDescriptor(o, key)!
            if (desc.get || desc.set) { table = UNSAFE; break }
            table[key] = desc.value
        }
        if (table === UNSAFE) break
    }
    tables.set(effect, table)
    return table
}

// findEventHandlers 의 이벤트 이름 조합 캐시 (원본은 호출마다 문자열을 새로 만든다)
const NO_PREFIX = new Set(['BeforeTurn', 'Update', 'Weather', 'WeatherChange', 'TerrainChange'])
interface Names { on: string; ally: string; any: string; foe: string; source: string; prefixed: boolean }
const NAMES = new Map<string, Names>()
function namesOf(eventName: string): Names {
    let n = NAMES.get(eventName)
    if (!n) {
        n = {
            on: `on${eventName}`, ally: `onAlly${eventName}`, any: `onAny${eventName}`, foe: `onFoe${eventName}`,
            source: `onSource${eventName}`, prefixed: !NO_PREFIX.has(eventName),
        }
        NAMES.set(eventName, n)
    }
    return n
}

/** concat / push(...spread) 와 같은 순서로 덧붙인다 (새 배열·인자 펼침 없음) */
function append(dst: any[], src: any[]): void {
    for (let i = 0; i < src.length; i++) dst.push(src[i])
}

let installed = false

export function installFastPath(): void {
    if (installed) return
    installed = true
    const B = Battle.prototype as any
    const origGetCallback = B.getCallback as AnyFn
    const origFindEventHandlers = B.findEventHandlers as AnyFn
    const origFindPokemonEventHandlers = B.findPokemonEventHandlers as AnyFn

    /** getCallback 과 같은 결과. onSwitchIn 은 특성·도구의 onStart 를 대신 쓰는 특수 규칙이 있어 원본에 맡긴다 */
    function callback(battle: any, target: unknown, effect: any, callbackName: string): unknown {
        if (callbackName === 'onSwitchIn' || !effect || typeof effect !== 'object') {
            return origGetCallback.call(battle, target, effect, callbackName)
        }
        const table = callbacksOf(effect)
        return table === UNSAFE ? origGetCallback.call(battle, target, effect, callbackName) : table[callbackName]
    }

    B.getCallback = function (this: any, target: unknown, effect: any, callbackName: string) {
        if (this.fastPath !== true) return origGetCallback.call(this, target, effect, callbackName)
        return callback(this, target, effect, callbackName)
    }

    // 원본(sim/battle.ts findPokemonEventHandlers)과 같은 순서·같은 핸들러. getCallback 호출만 인라인
    B.findPokemonEventHandlers = function (this: any, pokemon: any, callbackName: string, getKey?: string) {
        if (this.fastPath !== true || callbackName === 'onSwitchIn') {
            return origFindPokemonEventHandlers.call(this, pokemon, callbackName, getKey)
        }
        const handlers: any[] = []
        const status = pokemon.getStatus()
        let cb = callback(this, pokemon, status, callbackName)
        if (cb !== undefined || (getKey && pokemon.statusState[getKey])) {
            handlers.push(this.resolvePriority({
                effect: status, callback: cb, state: pokemon.statusState, end: pokemon.clearStatus, effectHolder: pokemon,
            }, callbackName))
        }
        for (const id in pokemon.volatiles) {
            const volatileState = pokemon.volatiles[id]
            const volatile = this.dex.conditions.getByID(id)
            cb = callback(this, pokemon, volatile, callbackName)
            if (cb !== undefined || (getKey && volatileState[getKey])) {
                handlers.push(this.resolvePriority({
                    effect: volatile, callback: cb, state: volatileState, end: pokemon.removeVolatile, effectHolder: pokemon,
                }, callbackName))
            }
        }
        const ability = pokemon.getAbility()
        cb = callback(this, pokemon, ability, callbackName)
        if (cb !== undefined || (getKey && pokemon.abilityState[getKey])) {
            handlers.push(this.resolvePriority({
                effect: ability, callback: cb, state: pokemon.abilityState, end: pokemon.clearAbility, effectHolder: pokemon,
            }, callbackName))
        }
        const item = pokemon.getItem()
        cb = callback(this, pokemon, item, callbackName)
        if (cb !== undefined || (getKey && pokemon.itemState[getKey])) {
            handlers.push(this.resolvePriority({
                effect: item, callback: cb, state: pokemon.itemState, end: pokemon.clearItem, effectHolder: pokemon,
            }, callbackName))
        }
        const species = pokemon.baseSpecies
        cb = callback(this, pokemon, species, callbackName)
        if (cb !== undefined) {
            handlers.push(this.resolvePriority({
                effect: species, callback: cb, state: pokemon.speciesState, end() {}, effectHolder: pokemon,
            }, callbackName))
        }
        const side = pokemon.side
        for (const conditionid in side.slotConditions[pokemon.position]) {
            const slotConditionState = side.slotConditions[pokemon.position][conditionid]
            const slotCondition = this.dex.conditions.getByID(conditionid)
            cb = callback(this, pokemon, slotCondition, callbackName)
            if (cb !== undefined || (getKey && slotConditionState[getKey])) {
                handlers.push(this.resolvePriority({
                    effect: slotCondition,
                    callback: cb,
                    state: slotConditionState,
                    end: side.removeSlotCondition,
                    endCallArgs: [side, pokemon, slotCondition.id],
                    effectHolder: pokemon,
                }, callbackName))
            }
        }
        return handlers
    }

    // 원본(sim/battle.ts findEventHandlers)과 같은 순서·같은 핸들러.
    // 차이: 이벤트 이름 문자열·접두 판정 캐시, concat 대신 제자리 덧붙이기
    B.findEventHandlers = function (this: any, target: any, eventName: string, source?: any) {
        if (this.fastPath !== true) return origFindEventHandlers.call(this, target, eventName, source)
        let handlers: any[] = []
        if (Array.isArray(target)) {
            for (const [i, pokemon] of target.entries()) {
                const curHandlers = this.findEventHandlers(pokemon, eventName, source)
                for (const handler of curHandlers) {
                    handler.target = pokemon
                    handler.index = i
                }
                append(handlers, curHandlers)
            }
            return handlers
        }
        const n = namesOf(eventName)
        const shouldBubbleDown = target instanceof Side
        const prefixedHandlers = n.prefixed
        if (target instanceof Pokemon && ((target as any).isActive || source?.isActive)) {
            handlers = this.findPokemonEventHandlers(target, n.on)
            if (prefixedHandlers) {
                for (const allyActive of (target as any).alliesAndSelf()) {
                    append(handlers, this.findPokemonEventHandlers(allyActive, n.ally))
                    append(handlers, this.findPokemonEventHandlers(allyActive, n.any))
                }
                for (const foeActive of (target as any).foes()) {
                    append(handlers, this.findPokemonEventHandlers(foeActive, n.foe))
                    append(handlers, this.findPokemonEventHandlers(foeActive, n.any))
                }
            }
            target = (target as any).side
        }
        if (source && prefixedHandlers) {
            append(handlers, this.findPokemonEventHandlers(source, n.source))
        }
        if (target instanceof Side) {
            for (const side of this.sides) {
                if (shouldBubbleDown) {
                    for (const active of side.active) {
                        if (side === target || side === (target as any).allySide) {
                            append(handlers, this.findPokemonEventHandlers(active, n.on))
                        } else if (prefixedHandlers) {
                            append(handlers, this.findPokemonEventHandlers(active, n.foe))
                        }
                        if (prefixedHandlers) append(handlers, this.findPokemonEventHandlers(active, n.any))
                    }
                }
                if (side.n < 2 || !side.allySide) {
                    if (side === target || side === (target as any).allySide) {
                        append(handlers, this.findSideEventHandlers(side, n.on))
                    } else if (prefixedHandlers) {
                        append(handlers, this.findSideEventHandlers(side, n.foe))
                    }
                    if (prefixedHandlers) append(handlers, this.findSideEventHandlers(side, n.any))
                }
            }
        }
        append(handlers, this.findFieldEventHandlers(this.field, n.on))
        append(handlers, this.findBattleEventHandlers(n.on))
        return handlers
    }
}

/** 이 Battle 에 빠른 경로를 켠다 (설치 포함) */
export function enableFastPath(battle: Battle): void {
    installFastPath()
    ;(battle as unknown as { fastPath: boolean }).fastPath = true
}
