import type { BattlePokemon } from '../types/pokemon'
import type { BattleState, BattleEvent, PlayerID } from '../types/battle'
import type { Weather, Terrain } from '../types/effect'

// ─── 특성 진입 효과 (등장 시 발동) ───────────────────────────
export interface AbilityEntryResult {
    events:         BattleEvent[]
    weatherChange?: Weather
    terrainChange?: Terrain
    statChanges?:   { targetId: string; stat: string; change: number }[]
}

export function onSwitchIn(pokemon: BattlePokemon, state: BattleState): AbilityEntryResult {
    const result: AbilityEntryResult = { events: [] }
    const ability = pokemon.ability

    // ── 날씨 유발 ──────────────────────────────────────────
    const weatherAbilities: Record<string, Weather> = {
        'drought':         'sun',
        'drizzle':         'rain',
        'sand-stream':     'sandstorm',
        'snow-warning':    'snow',
        'desolate-land':   'harsh_sun',
        'primordial-sea':  'heavy_rain',
        'delta-stream':    'strong_winds',
    }
    if (ability in weatherAbilities) {
        result.weatherChange = weatherAbilities[ability]
        result.events.push({
            type: 'weather_change',
            weather: weatherAbilities[ability]!,
            source: ability,
        })
    }

    // ── 필드 유발 ──────────────────────────────────────────
    const terrainAbilities: Record<string, Terrain> = {
        'electric-surge': 'electric',
        'grassy-surge':   'grassy',
        'misty-surge':    'misty',
        'psychic-surge':  'psychic',
    }
    if (ability in terrainAbilities) {
        result.terrainChange = terrainAbilities[ability]
        result.events.push({
            type: 'terrain_change',
            terrain: terrainAbilities[ability]!,
            source: ability,
        })
    }

    // ── 위협: 상대 공격 -1 ─────────────────────────────────
    if (ability === 'intimidate') {
        const foePlayer: PlayerID = pokemon.id.startsWith('p1') ? 'p2' : 'p1'
        const foes = state.sides[foePlayer].active
        for (const foe of foes) {
            // 위협 면역: 내담기/하이퍼커터/클리어바디/화이트스모그/풀파워/거울갑옷
            const immune = [
                'inner-focus', 'oblivious', 'own-tempo', 'scrappy',
                'hyper-cutter', 'clear-body', 'white-smoke', 'full-metal-body',
                'mirror-armor',
            ]
            if (immune.includes(foe.ability)) {
                result.events.push({ type: 'ability_trigger', pokemon_id: foe.id, ability: foe.ability, effect: 'intimidate_immune' })
                continue
            }
            result.statChanges = result.statChanges ?? []
            result.statChanges.push({ targetId: foe.id, stat: 'attack', change: -1 })
            result.events.push({ type: 'stat_change', pokemon_id: foe.id, stat: 'attack', stages: -1 })
        }
    }

    // ── 트레이스: 상대 특성 복사 ───────────────────────────
    // (엔진에서 처리)

    // ── Protosynthesis / Quark Drive ───────────────────────
    if (ability === 'protosynthesis') {
        const sun = state.field.weather === 'sun' || state.field.weather === 'harsh_sun'
        const hasBoosterEnergy = pokemon.item === 'booster-energy'
        if (sun || hasBoosterEnergy) {
            result.events.push({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'paradox_boost' })
            if (hasBoosterEnergy) {
                result.events.push({ type: 'item_consume', pokemon_id: pokemon.id, item: 'booster-energy' })
            }
        }
    }

    if (ability === 'quark-drive') {
        const electric = state.field.terrain === 'electric'
        const hasBoosterEnergy = pokemon.item === 'booster-energy'
        if (electric || hasBoosterEnergy) {
            result.events.push({ type: 'ability_trigger', pokemon_id: pokemon.id, ability, effect: 'paradox_boost' })
            if (hasBoosterEnergy) {
                result.events.push({ type: 'item_consume', pokemon_id: pokemon.id, item: 'booster-energy' })
            }
        }
    }

    return result
}

// ─── 상태이상 면역 체크 ───────────────────────────────────────
export function isStatusImmune(pokemon: BattlePokemon, status: string, weather: Weather,terrain?: Terrain,  ): boolean {
    const ability = pokemon.ability
    const types   = pokemon.types as string[]

    // 타입 면역
    if (status === 'burn'     && types.includes('fire'))    return true
    if (status === 'freeze'   && types.includes('ice'))     return true
    if (status === 'paralysis'&& types.includes('electric'))return true
    if ((status === 'poison' || status === 'toxic') && (types.includes('poison') || types.includes('steel'))) return true

    // 특성 면역
    if (status === 'burn') {
        if (['water-veil', 'water-bubble', 'purifying-salt'].includes(ability)) return true
        if (ability === 'comatose') return true
    }
    if (status === 'paralysis') {
        if (ability === 'limber') return true
        if (ability === 'comatose') return true
    }
    if (status === 'freeze') {
        if (ability === 'magma-armor') return true
        if (weather === 'sun' || weather === 'harsh_sun') return true
        if (ability === 'comatose') return true
    }
    if (status === 'poison' || status === 'toxic') {
        if (['immunity', 'pastel-veil', 'purifying-salt'].includes(ability)) return true
        if (ability === 'comatose') return true
    }
    if (status === 'sleep') {
        if (['insomnia', 'vital-spirit', 'comatose'].includes(ability)) return true
        if (terrain === 'electric') return true  // ← weather → terrain
    }

    return false
}

// ─── 데미지 면역 체크 ────────────────────────────────────────
export function isDamageImmune(
    defender: BattlePokemon,
    moveType: string,
    category: string,
): boolean {
    const ability = defender.ability

    // 방진: 가루기술 면역
    if (ability === 'overcoat' || ability === 'magic-guard') {
        // magic-guard는 간접데미지 면역 (직접 기술은 해당 없음)
    }

    // 플래시파이어: 불꽃 면역
    if (ability === 'flash-fire' && moveType === 'fire') return true

    // 전동기/피뢰침: 전기 면역
    if ((ability === 'motor-drive' || ability === 'lightning-rod') && moveType === 'electric') return true

    // 저수/물흡수: 물 면역
    if ((ability === 'water-absorb' || ability === 'storm-drain' || ability === 'dry-skin') && moveType === 'water') return true

    // 초식: 풀 면역
    if (ability === 'sap-sipper' && moveType === 'grass') return true

    // 방음: 음파기술 면역
    if (ability === 'soundproof' && category === 'sound') return true

    // 총알 방어: 탄환기술 면역
    if (ability === 'bulletproof' && category === 'bullet') return true

    return false
}

// ─── 피격 시 발동 특성 ────────────────────────────────────────
export interface OnHitResult {
    events:      BattleEvent[]
    recoil?:     number   // 공격자 반동 데미지
    heal?:       number   // 방어자 회복량
    statChanges?: { targetId: string; stat: string; change: number }[]
}

export function onDefenderHit(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    moveType: string,
    damage:   number,
): OnHitResult {
    const result: OnHitResult = { events: [] }
    const ability = defender.ability

    // ── 옹골참: 1타 버팀 (엔진에서 처리) ─────────────────

    // ── 마이너스원: 접촉 시 공격 -1 ──────────────────────
    if (ability === 'rough-skin' || ability === 'iron-barbs') {
        const recoil = Math.floor(attacker.max_hp / 8)
        result.recoil = recoil
        result.events.push({ type: 'damage', pokemon_id: attacker.id, amount: recoil, source: ability })
    }

    // ── 플래시파이어: 불꽃 흡수 → 불꽃기술 강화 ──────────
    if (ability === 'flash-fire' && moveType === 'fire') {
        result.events.push({ type: 'ability_trigger', pokemon_id: defender.id, ability, effect: 'flash_fire_boost' })
    }

    // ── 전동기: 전기 흡수 → 스피드 +1 ───────────────────
    if (ability === 'motor-drive' && moveType === 'electric') {
        result.statChanges = [{ targetId: defender.id, stat: 'speed', change: 1 }]
        result.events.push({ type: 'stat_change', pokemon_id: defender.id, stat: 'speed', stages: 1 })
    }

    // ── 피뢰침: 전기 흡수 → 특공 +1 ─────────────────────
    if (ability === 'lightning-rod' && moveType === 'electric') {
        result.statChanges = [{ targetId: defender.id, stat: 'special_attack', change: 1 }]
        result.events.push({ type: 'stat_change', pokemon_id: defender.id, stat: 'special_attack', stages: 1 })
    }

    // ── 저수/물흡수: 물 흡수 → HP 회복 ──────────────────
    if ((ability === 'water-absorb' || ability === 'storm-drain') && moveType === 'water') {
        const heal = Math.floor(defender.max_hp / 4)
        result.heal = heal
        result.events.push({ type: 'heal', pokemon_id: defender.id, amount: heal, source: ability })
    }

    // ── 초식: 풀 흡수 → 특공 +1 ──────────────────────────
    if (ability === 'sap-sipper' && moveType === 'grass') {
        result.statChanges = [{ targetId: defender.id, stat: 'attack', change: 1 }]
        result.events.push({ type: 'stat_change', pokemon_id: defender.id, stat: 'attack', stages: 1 })
    }

    return result
}

// ─── 턴 종료 특성 ────────────────────────────────────────────
export interface EndOfTurnAbilityResult {
    events: BattleEvent[]
    heal?:  number
    damage?: number
}

export function onEndOfTurn(pokemon: BattlePokemon, weather: Weather): EndOfTurnAbilityResult {
    const result: EndOfTurnAbilityResult = { events: [] }
    const ability = pokemon.ability

    // ── 재생력: 교체 시 HP 1/3 회복 (교체 처리에서) ──────

    // ── 포이즌힐: 독 상태 시 HP 1/8 회복 ────────────────
    if (ability === 'poison-heal' && (pokemon.status === 'poison' || pokemon.status === 'toxic')) {
        const heal = Math.floor(pokemon.max_hp / 8)
        result.heal = heal
        result.events.push({ type: 'heal', pokemon_id: pokemon.id, amount: heal, source: ability })
    }

    // ── 레인디쉬: 비 시 HP 1/16 회복 ────────────────────
    if (ability === 'rain-dish' && (weather === 'rain' || weather === 'heavy_rain')) {
        const heal = Math.floor(pokemon.max_hp / 16)
        result.heal = heal
        result.events.push({ type: 'heal', pokemon_id: pokemon.id, amount: heal, source: ability })
    }

    // ── 아이스바디: 눈 시 HP 1/16 회복 ──────────────────
    if (ability === 'ice-body' && weather === 'snow') {
        const heal = Math.floor(pokemon.max_hp / 16)
        result.heal = heal
        result.events.push({ type: 'heal', pokemon_id: pokemon.id, amount: heal, source: ability })
    }

    // ── 태양의힘: 쾌청 시 특공 1.5× (stat에서 처리) ─────
    // ── 드라이스킨: 비 시 HP 1/8 회복 ───────────────────
    if (ability === 'dry-skin') {
        if (weather === 'rain' || weather === 'heavy_rain') {
            const heal = Math.floor(pokemon.max_hp / 8)
            result.heal = heal
            result.events.push({ type: 'heal', pokemon_id: pokemon.id, amount: heal, source: ability })
        }
        if (weather === 'sun' || weather === 'harsh_sun') {
            const damage = Math.floor(pokemon.max_hp / 8)
            result.damage = damage
            result.events.push({ type: 'damage', pokemon_id: pokemon.id, amount: damage, source: ability })
        }
    }

    // ── 스피드스타: 모래바람 시 HP 1/16 데미지 ───────────
    // (모래바람 데미지는 weather.ts에서 처리)

    return result
}