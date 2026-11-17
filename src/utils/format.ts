// ─── 배틀 이벤트 → 한국어 로그 문장 ──────────────────────────
import type { BattleEvent, PlayerID } from '../types/battle'
import type { BattlePokemon } from '../types/pokemon'

export const STATUS_NAME_KO: Record<string, string> = {
    burn: '화상', freeze: '얼음', paralysis: '마비', poison: '독', toxic: '맹독', sleep: '잠듦',
}
export const STAT_NAME_KO: Record<string, string> = {
    hp: 'HP', attack: '공격', defense: '방어', special_attack: '특수공격', special_defense: '특수방어',
    speed: '스피드', accuracy: '명중률', evasion: '회피율',
}
export const WEATHER_NAME_KO: Record<string, string> = {
    sun: '쾌청', harsh_sun: '아주 강한 햇살', rain: '비', heavy_rain: '강한 비', sandstorm: '모래바람',
    snow: '설경', strong_winds: '난기류',
}
export const TERRAIN_NAME_KO: Record<string, string> = {
    electric: '일렉트릭필드', grassy: '그래스필드', misty: '미스트필드', psychic: '사이코필드',
}
export const SIDE_CONDITION_KO: Record<string, string> = {
    reflect: '리플렉터', light_screen: '빛의장막', aurora_veil: '오로라베일', spikes: '압정뿌리기',
    toxic_spikes: '독압정', stealth_rock: '스텔스록', sticky_web: '끈적끈적네트', tailwind: '순풍',
    lucky_chant: '주술', safeguard: '신비의부적', mist: '흰안개', wish: '희망사항',
}
export const FIELD_CONDITION_KO: Record<string, string> = {
    trick_room: '트릭룸', gravity: '중력', magic_room: '매직룸', wonder_room: '원더룸', mud_sport: '흙놀이', water_sport: '물놀이',
}
export const VOLATILE_NAME_KO: Record<string, string> = {
    confusion: '혼란', flinch: '풀죽음', seeded: '씨뿌리기', bound: '조이기', infatuation: '헤롱헤롱', curse: '저주',
    aqua_ring: '아쿠아링', ingrain: '뿌리박기', magnet_rise: '전자부유', taunt: '도발', encore: '앙코르',
    yawn: '하품', protect: '방어', kings_shield: '킹실드', spiky_shield: '니들가드', baneful_bunker: '토치카',
    silk_trap: '실크트랩', burning_bulwark: '화염의수호', obstruct: '블로킹', endure: '버티기',
    focus_energy: '기합모으기', substitute: '대타출동', salt_cure: '소금절이', flash_fire: '타오르는불꽃',
    heal_block: '회복봉인', embargo: '금제', destiny_bond: '길동무',
}
export const CANT_MOVE_KO: Record<string, string> = {
    sleep: '쿨쿨 잠들어 있다', freeze: '얼어버려서 움직일 수 없다', paralysis: '몸이 저려서 움직일 수 없다',
    flinch: '풀이 죽어 움직일 수 없다', confusion: '영문도 모른 채 자신을 공격했다', recharge: '공격의 반동으로 움직일 수 없다',
    taunt: '도발당해서 변화 기술을 쓸 수 없다', no_pp: '기술의 남은 PP가 없다', infatuation: '헤롱헤롱해서 기술을 쓸 수 없었다',
    truant: '게으름을 피우고 있다',
}

/** 데미지/회복 출처 (기술·도구·상태 외) */
export const SOURCE_NAME_KO: Record<string, string> = {
    drain: '흡수', recoil: '반동', confusion: '혼란', crash: '착지 실패', 'leech-seed': '씨뿌리기', curse: '저주',
    bind: '조이기', 'salt-cure': '소금절이', 'grassy-terrain': '그래스필드', 'aqua-ring': '아쿠아링', ingrain: '뿌리박기',
    'pain-split': '아픔나누기', 'liquid-ooze': '해감액', 'poison-heal': '포이즌힐', 'rain-dish': '젖은접시',
    'ice-body': '아이스바디', 'dry-skin': '건조피부', 'solar-power': '선파워', 'bad-dreams': '나이트메어',
    regenerator: '재생력', substitute: '대타출동', 'belly-drum': '배북',
}

export interface NameResolver {
    /** 종 slug → 표시 이름 (예: 'garchomp' → '한카리아스') */
    pokemon?: (species: string) => string
    /** 기술 slug → 표시 이름 */
    move?: (name: string) => string
    /** 특성 slug → 표시 이름 */
    ability?: (name: string) => string
    /** 도구 slug → 표시 이름 */
    item?: (name: string) => string
    /** 타입 → 표시 이름 */
    type?: (name: string) => string
}

export interface FormatContext {
    getPokemon: (id: string) => BattlePokemon | undefined
    sideName?: (player: PlayerID) => string
}

const prettify = (slug: string) => slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

/** 배틀 이벤트를 한국어 문장으로 변환. 화면에 보여줄 필요 없는 이벤트는 null */
export function formatEvent(event: BattleEvent, ctx: FormatContext, names: NameResolver = {}): string | null {
    const pName = (id: string) => {
        const p = ctx.getPokemon(id)
        if (!p) return id
        const base = p.nickname && p.nickname !== p.species ? p.nickname : (names.pokemon?.(p.species) ?? prettify(p.species))
        const owner = id.startsWith('p1') ? '' : '상대 '
        return `${owner}${base}`
    }
    const mName = (n: string) => names.move?.(n) ?? prettify(n)
    const aName = (n: string) => names.ability?.(n) ?? prettify(n)
    const iName = (n: string) => names.item?.(n) ?? prettify(n)
    const tName = (n: string) => names.type?.(n) ?? n
    const sideLabel = (p: PlayerID) => ctx.sideName?.(p) ?? (p === 'p1' ? '우리 편' : '상대 편')
    const source = (s: string) => SOURCE_NAME_KO[s] ?? SIDE_CONDITION_KO[s.replace(/-/g, '_')] ?? STATUS_NAME_KO[s] ?? WEATHER_NAME_KO[s] ?? iName(s)

    switch (event.type) {
        case 'battle_start':    return `${event.p1} vs ${event.p2} 배틀 시작!`
        case 'turn_start':      return `── ${event.turn}턴 ──`
        case 'turn_end':        return null
        case 'move_use':        return `${pName(event.pokemon_id)}의 ${mName(event.move.name)}!`
        case 'move_miss':       return `${event.target_id ? pName(event.target_id) + '에게는 ' : ''}맞지 않았다!`
        case 'move_fail':
            if (event.reason === 'protect') return '방어로 공격을 막았다!'
            if (event.reason === 'substitute') return '대타가 대신 막았다!'
            return `하지만 실패했다! ${event.reason && !['실패', '효과가 없다'].includes(event.reason) ? `(${event.reason})` : ''}`.trim()
        case 'cant_move':       return `${pName(event.pokemon_id)}은(는) ${CANT_MOVE_KO[event.reason] ?? event.reason}!`
        case 'damage': {
            const p = ctx.getPokemon(event.pokemon_id)
            if (event.source === 'substitute') return `대타가 ${pName(event.pokemon_id)} 대신 공격을 받았다!`
            const pct = p ? Math.round(event.amount / p.max_hp * 100) : 0
            const parts: string[] = []
            if (event.crit) parts.push('급소에 맞았다!')
            if (event.effectiveness !== undefined) {
                if (event.effectiveness > 1) parts.push('효과가 굉장했다!')
                else if (event.effectiveness > 0 && event.effectiveness < 1) parts.push('효과가 별로인 듯하다…')
            }
            const indirect = !event.effectiveness && event.source && event.source !== 'confusion'
                ? ` (${source(event.source)})` : ''
            return `${parts.join(' ')}${parts.length ? ' ' : ''}${pName(event.pokemon_id)}에게 ${event.amount} 데미지 (-${pct}%)${indirect}`
        }
        case 'heal':            return `${pName(event.pokemon_id)}의 HP가 ${event.amount} 회복되었다${event.source ? ` (${source(event.source)})` : ''}`
        case 'immune':          return `${pName(event.pokemon_id)}에게는 효과가 없는 것 같다…${event.source && event.source !== 'type' ? ` (${aName(event.source)})` : ''}`
        case 'faint':           return `${pName(event.pokemon_id)}은(는) 쓰러졌다!`
        case 'status_apply':    return `${pName(event.pokemon_id)}은(는) ${STATUS_NAME_KO[event.status] ?? event.status} 상태가 되었다!`
        case 'status_remove':   return `${pName(event.pokemon_id)}의 ${STATUS_NAME_KO[event.status] ?? event.status} 상태가 풀렸다!`
        case 'volatile_apply':  return VOLATILE_NAME_KO[event.volatile] ? `${pName(event.pokemon_id)}: ${VOLATILE_NAME_KO[event.volatile]}` : null
        case 'volatile_remove': return VOLATILE_NAME_KO[event.volatile] ? `${pName(event.pokemon_id)}의 ${VOLATILE_NAME_KO[event.volatile]}이(가) 풀렸다` : null
        case 'stat_change': {
            const stat = STAT_NAME_KO[event.stat] ?? event.stat
            const actual = event.actual ?? event.stages
            if (actual === 0) return `${pName(event.pokemon_id)}의 ${stat}은(는) 더 이상 ${event.stages > 0 ? '오르지' : '떨어지지'} 않는다!`
            const amount = Math.abs(actual) >= 3 ? '극적으로' : Math.abs(actual) === 2 ? '크게' : ''
            return `${pName(event.pokemon_id)}의 ${stat}이(가) ${amount ? amount + ' ' : ''}${actual > 0 ? '올라갔다' : '떨어졌다'}!`
        }
        case 'weather_change':  return event.weather ? `${WEATHER_NAME_KO[event.weather]} 상태가 되었다!` : '날씨가 원래대로 돌아왔다.'
        case 'terrain_change':  return event.terrain ? `${TERRAIN_NAME_KO[event.terrain]}가 펼쳐졌다!` : '필드가 원래대로 돌아왔다.'
        case 'side_start':      return `${sideLabel(event.player)}에 ${SIDE_CONDITION_KO[event.condition] ?? event.condition}${(event.layers ?? 1) > 1 ? ` (${event.layers}단계)` : ''}!`
        case 'side_end':        return `${sideLabel(event.player)}의 ${SIDE_CONDITION_KO[event.condition] ?? event.condition}이(가) 사라졌다.`
        case 'field_start':     return `${FIELD_CONDITION_KO[event.condition] ?? event.condition} 상태가 되었다!`
        case 'field_end':       return `${FIELD_CONDITION_KO[event.condition] ?? event.condition} 상태가 끝났다.`
        case 'switch': {
            const inP = pName(event.in_id)
            if (!event.out_id) return `${event.player === 'p1' ? '가랏!' : '상대가 내보냈다:'} ${inP}`
            return event.forced ? `${inP}이(가) 끌려 나왔다!` : `${event.player === 'p1' ? '돌아와!' : '상대는 포켓몬을 교체했다.'} → ${inP}`
        }
        case 'ability_trigger': return `[${aName(event.ability)}] ${pName(event.pokemon_id)}`
        case 'item_consume':    return `${pName(event.pokemon_id)}의 ${iName(event.item)} 사용/소실`
        case 'item_activate':   return `${pName(event.pokemon_id)}: ${iName(event.item)}`
        case 'terastallize':    return `${pName(event.pokemon_id)}이(가) ${tName(event.tera_type)} 테라스탈했다!`
        case 'hit_count':       return `${event.hits}번 맞았다!`
        case 'message':         return event.text
        case 'battle_end':      return event.winner === 'draw' ? '무승부!' : `${sideLabel(event.winner)} 승리!`
    }
}
