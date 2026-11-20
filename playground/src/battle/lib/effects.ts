// ─── 장면에 남는 필드 효과 (날씨·필드·장판·벽·필드 전체) ─────────────
// 지금 프레임의 상태만 보고 정한다 → 실시간 배틀·리플레이·되감기에서 같은 그림.
// 한 번 나오는 기술 연출(FxLayer)과 달리, 효과가 남아 있는 동안 계속 그린다.
import type { PlayerID } from './engine'
import { foeOf, type Frame } from './frame'

export type WeatherFx = 'sun' | 'harsh_sun' | 'rain' | 'heavy_rain' | 'sandstorm' | 'snow' | 'strong_winds'
export type TerrainFx = 'electric' | 'grassy' | 'misty' | 'psychic'
export type HazardFx = 'stealth_rock' | 'spikes' | 'toxic_spikes' | 'sticky_web'
export type BarrierFx = 'reflect' | 'light_screen' | 'aurora_veil' | 'safeguard' | 'mist'
export type FieldFx = 'trick_room' | 'gravity' | 'magic_room' | 'wonder_room'

export interface SceneEffects {
  weather: WeatherFx | null
  terrain: TerrainFx | null
  field: FieldFx[]
  /** 진영별 (ours = 아래, foe = 위) */
  sides: Record<'ours' | 'foe', {
    hazards: { id: HazardFx; layers: number }[]
    barriers: BarrierFx[]
    tailwind: boolean
  }>
}

const WEATHERS: readonly WeatherFx[] = ['sun', 'harsh_sun', 'rain', 'heavy_rain', 'sandstorm', 'snow', 'strong_winds']
const TERRAINS: readonly TerrainFx[] = ['electric', 'grassy', 'misty', 'psychic']
const HAZARDS: readonly HazardFx[] = ['stealth_rock', 'spikes', 'toxic_spikes', 'sticky_web']
const BARRIERS: readonly BarrierFx[] = ['reflect', 'light_screen', 'aurora_veil', 'safeguard', 'mist']
const FIELDS: readonly FieldFx[] = ['trick_room', 'gravity', 'magic_room', 'wonder_room']
/** 장판 최대 겹 (압정뿌리기 3, 독압정 2) */
const MAX_LAYERS: Record<HazardFx, number> = { stealth_rock: 1, spikes: 3, toxic_spikes: 2, sticky_web: 1 }

/** 엔진 이름 → 화면 효과 이름 (hail 은 9세대 이전 표기 → 눈과 같은 그림) */
function weatherFx(w: string | null): WeatherFx | null {
  if (!w) return null
  const id = w.replace(/-/g, '_')
  if (id === 'hail') return 'snow'
  return (WEATHERS as readonly string[]).includes(id) ? (id as WeatherFx) : null
}

const norm = (id: string) => id.replace(/-/g, '_').replace(/_terrain$/, '')

export function sceneEffects(f: Pick<Frame, 'weather' | 'terrain' | 'field' | 'p1' | 'p2'>, me: PlayerID = 'p1'): SceneEffects {
  const side = (p: PlayerID) => {
    const conds = f[p].conditions.map(c => ({ ...c, id: norm(c.id) }))
    return {
      hazards: HAZARDS.flatMap(id => {
        const c = conds.find(x => x.id === id)
        return c ? [{ id, layers: Math.max(1, Math.min(MAX_LAYERS[id], c.layers || 1)) }] : []
      }),
      barriers: BARRIERS.filter(id => conds.some(x => x.id === id)),
      tailwind: conds.some(x => x.id === 'tailwind'),
    }
  }
  const terrain = f.terrain ? norm(f.terrain) : null
  return {
    weather: weatherFx(f.weather),
    terrain: terrain && (TERRAINS as readonly string[]).includes(terrain) ? (terrain as TerrainFx) : null,
    field: FIELDS.filter(id => f.field.some(c => norm(c.id) === id)),
    sides: { ours: side(me), foe: side(foeOf(me)) },
  }
}

/** 장면 효과를 한 줄 목록으로 (등장·퇴장 페이드의 키). 같은 효과는 같은 키 */
export function effectKeys(fx: SceneEffects): string[] {
  const out: string[] = []
  if (fx.weather) out.push(`weather:${fx.weather}`)
  if (fx.terrain) out.push(`terrain:${fx.terrain}`)
  for (const id of fx.field) out.push(`field:${id}`)
  for (const s of ['foe', 'ours'] as const) {
    const v = fx.sides[s]
    for (const h of v.hazards) out.push(`${s}:${h.id}:${h.layers}`)
    for (const b of v.barriers) out.push(`${s}:${b}`)
    if (v.tailwind) out.push(`${s}:tailwind`)
  }
  return out
}
