// ─── 배틀 이벤트 → 언어와 무관한 메시지 ───────────────────────
// 어떤 이벤트를 어떤 문장(키)으로 보여줄지만 정한다. 문장 자체는 로케일(locales/*)에 있다.
// UI 는 describeEvent 결과를 직접 써서 이름을 굵게 하거나 아이콘을 붙일 수도 있다.
import type { BattleEvent, PlayerID } from '../types/battle'
import type { FormatContext, Message } from './types'

/** 로그에 보여줄 휘발성 상태 (나머지는 내부 상태라 문장을 만들지 않는다) */
export const SHOWN_VOLATILES = new Set([
    'confusion', 'flinch', 'seeded', 'bound', 'infatuation', 'curse', 'aqua_ring', 'ingrain', 'magnet_rise', 'taunt',
    'encore', 'yawn', 'protect', 'kings_shield', 'spiky_shield', 'baneful_bunker', 'silk_trap', 'burning_bulwark',
    'obstruct', 'endure', 'focus_energy', 'substitute', 'salt_cure', 'flash_fire', 'heal_block', 'embargo', 'destiny_bond',
    'future-sight', 'doom-desire', 'dynamax',
])

const PS_STATUS: Record<string, string> = { par: 'paralysis', slp: 'sleep', brn: 'burn', frz: 'freeze', psn: 'poison', tox: 'toxic' }

const m = (key: Message['key'], params: Message['params'] = {}, variant?: string): Message => ({ key, params, variant })

/** 배틀 이벤트를 메시지로. 화면에 보여줄 필요 없는 이벤트는 null */
export function describeEvent(event: BattleEvent, ctx: FormatContext): Message[] | null {
    const self: PlayerID = ctx.perspective ?? 'p1'
    const rel = (player: PlayerID) => (player === self ? 'self' : 'foe')
    const named = !!ctx.sideName

    switch (event.type) {
        case 'battle_start':    return [m('battle.start', { p1: { text: event.p1 }, p2: { text: event.p2 } })]
        case 'turn_start':      return [m('turn.start', { turn: event.turn })]
        case 'turn_end':        return null
        case 'move_use':        return [m('move.use', { pokemon: { pokemon: event.pokemon_id }, move: { move: event.move.name } })]
        case 'move_miss':
            return [event.target_id ? m('move.miss.target', { pokemon: { pokemon: event.target_id } }) : m('move.miss')]
        case 'move_fail': {
            const r = event.reason
            if (r === 'protect') return [m('move.fail.protect')]
            if (r === 'substitute') return [m('move.fail.substitute')]
            if (r === 'fail' || r === 'no-target' || !r) return [m('move.fail')]
            // Showdown 상태 코드(par 등)는 상태 이름으로
            return [m('move.fail.reason', { pokemon: { pokemon: event.pokemon_id }, effect: { effect: PS_STATUS[r] ?? r } }, r)]
        }
        case 'cant_move':
            if (event.reason === 'other') {
                return [event.detail
                    ? m('cant.other.detail', { pokemon: { pokemon: event.pokemon_id }, effect: { effect: event.detail } })
                    : m('cant.other', { pokemon: { pokemon: event.pokemon_id } })]
            }
            return [m('cant', { pokemon: { pokemon: event.pokemon_id } }, event.reason)]
        case 'damage': {
            const pokemon = { pokemon: event.pokemon_id }
            if (event.source === 'substitute' && event.amount === 0) {
                return [...(event.crit ? [m('damage.crit')] : []), m('damage.substitute', { pokemon })]
            }
            const max = ctx.getPokemon(event.pokemon_id)?.max_hp ?? 0
            const after = event.hp_after ?? ctx.getPokemon(event.pokemon_id)?.hp ?? 0
            const params = { pokemon, amount: event.amount, percent: max ? Math.round(event.amount / max * 100) : 0, hp: after, max_hp: max }
            const out: Message[] = []
            if (event.crit) out.push(m('damage.crit'))
            const eff = event.effectiveness
            if (eff !== undefined && eff > 1) out.push(m('damage.super'))
            else if (eff !== undefined && eff > 0 && eff < 1) out.push(m('damage.resisted'))
            const indirect = !eff && event.source && event.source !== 'confusion'
            out.push(indirect ? m('damage.from', { ...params, effect: { effect: event.source } }) : m('damage', params))
            return out
        }
        case 'heal': {
            const params = { pokemon: { pokemon: event.pokemon_id }, amount: event.amount }
            return [event.source ? m('heal.from', { ...params, effect: { effect: event.source } }) : m('heal', params)]
        }
        case 'immune':
            return [event.source && event.source !== 'type'
                ? m('immune.from', { pokemon: { pokemon: event.pokemon_id }, effect: { effect: event.source } })
                : m('immune', { pokemon: { pokemon: event.pokemon_id } })]
        case 'faint':           return [m('faint', { pokemon: { pokemon: event.pokemon_id } })]
        case 'status_apply':
            return [m('status.apply', { pokemon: { pokemon: event.pokemon_id }, status: { term: 'status', key: event.status } }, event.status)]
        case 'status_remove':
            return [m('status.remove', { pokemon: { pokemon: event.pokemon_id }, status: { term: 'status', key: event.status } }, event.status)]
        case 'volatile_apply':
        case 'volatile_remove': {
            if (!SHOWN_VOLATILES.has(event.volatile)) return null
            const key = event.type === 'volatile_apply' ? 'volatile.start' : 'volatile.end'
            return [m(key, { pokemon: { pokemon: event.pokemon_id }, volatile: { effect: event.volatile } }, event.volatile)]
        }
        case 'stat_change': {
            const params = { pokemon: { pokemon: event.pokemon_id }, stat: { term: 'stat' as const, key: event.stat } }
            const actual = event.actual ?? event.stages
            if (actual === 0) return [m(event.stages > 0 ? 'stat.up.max' : 'stat.down.min', params)]
            const n = Math.abs(actual)
            return [m(actual > 0 ? 'stat.up' : 'stat.down', params, n >= 3 ? '3' : n === 2 ? '2' : undefined)]
        }
        case 'weather_change':
            return [event.weather ? m('weather.start', { weather: { term: 'weather', key: event.weather } }, event.weather) : m('weather.end')]
        case 'terrain_change':
            return [event.terrain ? m('terrain.start', { terrain: { effect: event.terrain } }, event.terrain) : m('terrain.end')]
        case 'side_start': {
            const out = [m('side.start', { side: { side: event.player }, condition: { effect: event.condition } }, event.condition)]
            if ((event.layers ?? 1) > 1) out.push(m('side.layers', { count: event.layers! }))
            return out
        }
        case 'side_end':
            return [m('side.end', { side: { side: event.player }, condition: { effect: event.condition } }, event.condition)]
        case 'field_start':     return [m('field.start', { condition: { effect: event.condition } }, event.condition)]
        case 'field_end':       return [m('field.end', { condition: { effect: event.condition } }, event.condition)]
        case 'switch': {
            const params = { pokemon: { pokemon: event.in_id }, name: { name: event.in_id }, side: { side: event.player } }
            if (event.forced) return [m('switch.drag', params)]
            const base = event.out_id ? 'switch.replace' : 'switch.in'
            const keys = named ? [`${base}.named`, `${base}.${rel(event.player)}`] : `${base}.${rel(event.player)}`
            return [m(keys, event.out_id ? { ...params, out: { pokemon: event.out_id } } : params)]
        }
        case 'rotate': {
            const params = { side: { side: event.player }, direction: { term: 'direction' as const, key: event.direction }, pokemon: { pokemon: event.in_id } }
            return event.out_id ? [m('rotate.out', { ...params, out: { pokemon: event.out_id } })] : [m('rotate', params)]
        }
        case 'ability_trigger': return [m('ability', { pokemon: { pokemon: event.pokemon_id }, ability: { ability: event.ability } })]
        case 'item_consume':    return [m('item.consume', { pokemon: { pokemon: event.pokemon_id }, item: { item: event.item } })]
        case 'item_activate':   return [m('item.activate', { pokemon: { pokemon: event.pokemon_id }, item: { item: event.item } })]
        case 'terastallize':    return [m('tera', { pokemon: { pokemon: event.pokemon_id }, type: { type: event.tera_type } })]
        case 'mega_evolve':     return [m('mega', { pokemon: { pokemon: event.pokemon_id }, ...(event.item ? { item: { item: event.item } } : {}) }, event.kind)]
        case 'hit_count':       return [m('hits', { count: event.hits })]
        case 'activate': {
            const params: Message['params'] = { effect: { effect: event.effect } }
            if (event.pokemon_id) params.pokemon = { pokemon: event.pokemon_id }
            if (event.detail) params.detail = { effect: event.detail }
            // 효과별 문장이 없으면 일반 문장 (포켓몬이 없으면 보여주지 않음 — 일반 문장이 {pokemon} 을 요구)
            return [m(['activate.' + event.effect, event.detail ? 'activate.detail' : 'activate'], params)]
        }
        case 'forme_change':
            // 메가진화·원시회귀·울트라버스트는 mega_evolve 문장이 따로 있다 (이벤트는 그대로 남는다)
            if (/-mega(-[xyz])?$|-primal$|^necrozma-ultra$/.test(event.species)) return null
            return [m('forme', { pokemon: { pokemon: event.pokemon_id } })]
        case 'message':         return [m('message', { text: { text: event.text } })]
        case 'battle_end':
            if (event.winner === 'draw') return [m('end.draw')]
            return [m(named ? ['end.win.named', `end.win.${rel(event.winner)}`] : `end.win.${rel(event.winner)}`, { side: { side: event.winner } })]
    }
    return null
}
