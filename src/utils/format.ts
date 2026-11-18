// ─── 배틀 이벤트 → 로그 문장 (하위 호환 진입점) ────────────────
// 실제 구현은 src/i18n (언어별 로케일 + 이름 데이터). 여기 있는 것은 예전 API 그대로 유지하는 얇은 층이다.
//   새 코드: createFormatter({ locale: 'en', getPokemon }).format(event)
import type { BattleEvent } from '../types/battle'
import { createFormatter, ko, CONDITION_ENTITY, getNames } from '../i18n'
import type { FormatContext, NameResolver } from '../i18n'

export type { FormatContext, NameResolver } from '../i18n'
export { fixParticles } from '../i18n'

/** 배틀 이벤트를 한국어 문장으로 변환. 화면에 보여줄 필요 없는 이벤트는 null (= createFormatter({ locale: 'ko' })) */
export function formatEvent(event: BattleEvent, ctx: FormatContext, names: NameResolver = {}): string | null {
    return createFormatter({ ...ctx, locale: 'ko', names }).format(event)
}

// ─── 예전 이름표 (한국어) — 로케일·이름 데이터에서 만든다 ─────────
const koNames = getNames('ko')!
const fromEntities = (keys: string[]) => Object.fromEntries(keys.map(k => {
    const e = CONDITION_ENTITY[k]!
    return [k, (e.move ? koNames.move(e.move) : koNames.ability(e.ability!)) ?? k]
}))

export const STATUS_NAME_KO: Record<string, string> = { ...ko.terms.status }
export const STAT_NAME_KO: Record<string, string> = { ...ko.terms.stat }
export const WEATHER_NAME_KO: Record<string, string> = { ...ko.terms.weather }
export const TERRAIN_NAME_KO: Record<string, string> = fromEntities(['electric', 'grassy', 'misty', 'psychic'])
export const SIDE_CONDITION_KO: Record<string, string> = fromEntities([
    'reflect', 'light_screen', 'aurora_veil', 'spikes', 'toxic_spikes', 'stealth_rock', 'sticky_web', 'tailwind',
    'lucky_chant', 'safeguard', 'mist', 'wish',
])
export const FIELD_CONDITION_KO: Record<string, string> = fromEntities(['trick_room', 'gravity', 'magic_room', 'wonder_room', 'mud_sport', 'water_sport'])
export const VOLATILE_NAME_KO: Record<string, string> = {
    confusion: ko.terms.volatile!.confusion!, flinch: ko.terms.volatile!.flinch!,
    ...fromEntities([
        'seeded', 'bound', 'infatuation', 'curse', 'aqua_ring', 'ingrain', 'magnet_rise', 'taunt', 'encore', 'yawn', 'protect',
        'kings_shield', 'spiky_shield', 'baneful_bunker', 'silk_trap', 'burning_bulwark', 'obstruct', 'endure', 'focus_energy',
        'substitute', 'salt_cure', 'flash_fire', 'heal_block', 'embargo', 'destiny_bond',
    ]),
}
/** 행동 불가 사유 (문장 일부) */
export const CANT_MOVE_KO: Record<string, string> = Object.fromEntries(
    Object.entries(ko.messages)
        .filter(([k]) => k.startsWith('cant.') && !k.startsWith('cant.other'))
        .map(([k, v]) => [k.slice(5), String(v).replace(/^\{pokemon\}은\(는\) /, '').replace(/!$/, '')]),
)
/** 데미지/회복 출처 이름 (기술·도구·특성 외) */
export const SOURCE_NAME_KO: Record<string, string> = { ...ko.terms.effect, confusion: ko.terms.volatile!.confusion! }
