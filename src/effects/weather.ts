import type { BattlePokemon } from '../types/pokemon'
import type { Weather, DurationEffect } from '../types/effect'

// ─── 날씨 지속 턴 ─────────────────────────────────────────────
export const WEATHER_TURNS: Record<NonNullable<Weather>, number> = {
    sun:           5,
    harsh_sun:     Infinity,  // 원시그란돈
    rain:          5,
    heavy_rain:    Infinity,  // 원시카이오가
    sandstorm:     5,
    snow:          5,
    strong_winds:  Infinity,  // 메가레쿠쟈
}

// 기상암석/습기바위/얼음바위/열기바위 → 8턴
export const WEATHER_TURNS_EXTENDED = 8

// ─── 날씨 면역 ────────────────────────────────────────────────
export function isImmuneToWeatherDamage(pokemon: BattlePokemon, weather: Weather): boolean {
    const types = pokemon.types as string[]
    const ability = pokemon.ability

    if (weather === 'sandstorm') {
        if (['rock', 'steel', 'ground'].some(t => types.includes(t))) return true
        if (['sand-veil', 'sand-rush', 'sand-force', 'overcoat', 'magic-guard'].includes(ability)) return true
        if (pokemon.item === 'safety-goggles') return true
    }

    if (weather === 'snow') {
        if (types.includes('ice')) return true
        if (['overcoat', 'magic-guard', 'ice-body', 'slush-rush'].includes(ability)) return true
        if (pokemon.item === 'safety-goggles') return true
    }

    return false
}

// ─── 날씨 턴 종료 데미지 ─────────────────────────────────────
export interface WeatherDamageResult {
    pokemon_id: string
    damage:     number
    weather:    Weather
}

export function calcWeatherDamage(pokemon: BattlePokemon, weather: Weather): WeatherDamageResult | null {
    if (isImmuneToWeatherDamage(pokemon, weather)) return null

    if (weather === 'sandstorm') {
        return {
            pokemon_id: pokemon.id,
            damage:     Math.floor(pokemon.max_hp / 16),
            weather,
        }
    }

    if (weather === 'snow') {
        // Gen 9: 눈은 데미지 없음 (우박은 있었으나 눈으로 바뀜)
        return null
    }

    return null
}

// ─── 날씨 유발 특성 ───────────────────────────────────────────
export const WEATHER_ABILITY_MAP: Record<string, Weather> = {
    'drought':        'sun',
    'desolate-land':  'harsh_sun',
    'drizzle':        'rain',
    'primordial-sea': 'heavy_rain',
    'sand-stream':    'sandstorm',
    'snow-warning':   'snow',
    'delta-stream':   'strong_winds',
}

export function getWeatherFromAbility(ability: string): Weather | null {
    return WEATHER_ABILITY_MAP[ability] ?? null
}

// ─── 날씨 아이템 매핑 (지속 턴 연장) ─────────────────────────
export const WEATHER_ITEM_MAP: Record<string, NonNullable<Weather>> = {
    'heat-rock':    'sun',
    'damp-rock':    'rain',
    'smooth-rock':  'sandstorm',
    'icy-rock':     'snow',
}

// ─── 날씨 종료 체크 ───────────────────────────────────────────
export function tickWeather(duration: DurationEffect): DurationEffect | null {
    if (duration.turns_remaining === Infinity) return duration
    const next = duration.turns_remaining - 1
    return next <= 0 ? null : { ...duration, turns_remaining: next }
}

// ─── 날씨별 스탯 보정 (stat.ts getStat에서 참고) ─────────────
// Chlorophyll, Swift Swim 등은 stat.ts에서 처리
// 여기서는 날씨 관련 추가 보정만

// 모래바람: 바위타입 특방 1.5×
export function getSandstormSpDefBoost(pokemon: BattlePokemon, weather: Weather): number {
    if (weather !== 'sandstorm') return 1
    if ((pokemon.types as string[]).includes('rock')) return 1.5
    return 1
}

// 눈: 얼음타입 방어 1.5×
export function getSnowDefBoost(pokemon: BattlePokemon, weather: Weather): number {
    if (weather !== 'snow') return 1
    if ((pokemon.types as string[]).includes('ice')) return 1.5
    return 1
}