// ─── 장면에 남는 효과: 날씨 · 필드 · 장판 · 벽/베일 · 순풍 · 필드 전체 ─────
// 지금 프레임 상태(sceneEffects)만으로 그린다 → 리플레이·되감기에서도 같은 그림.
// 생기면 짧게 나타나고, 없어지면 짧게 사라진다 (usePresence). 움직임 줄이기 설정이면 정지 그림.
// 레이어: 땅(필드·장판·트릭룸 바닥) z0 < 포켓몬 z1~2 < 벽·순풍 z3 < 날씨·필드 전체 z5 < 기술 연출 z8 < 데이터박스 z10
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react'
import type { PlayerID } from '../lib/engine'
import type { Frame } from '../lib/frame'
import { sceneEffects, type HazardFx } from '../lib/effects'
import { SPOT } from './layout'
import './effects.css'

interface Item { key: string; el: ReactElement }

const FADE_MS = 360

/** 사라진 항목을 FADE_MS 동안 더 그려서 페이드아웃 (같은 키면 그 자리에서 바뀜) */
function usePresence(items: Item[]): (Item & { leaving: boolean })[] {
  const sig = items.map(i => i.key).join('|')
  const [seen, setSeen] = useState<{ sig: string; items: Item[]; gone: Item[] }>({ sig, items, gone: [] })
  if (seen.sig !== sig) {
    const keys = new Set(items.map(i => i.key))
    const gone = new Map<string, Item>()
    for (const i of [...seen.gone, ...seen.items]) if (!keys.has(i.key)) gone.set(i.key, i)
    setSeen({ sig, items, gone: [...gone.values()] })
  }
  useEffect(() => {
    if (seen.gone.length === 0) return
    const t = setTimeout(() => setSeen(s => ({ ...s, gone: [] })), FADE_MS)
    return () => clearTimeout(t)
  }, [seen.gone])
  return [...items.map(i => ({ ...i, leaving: false })), ...seen.gone.map(i => ({ ...i, leaving: true }))]
}

// ─── 장판 ─────────────────────────────────────────────────────
// 위치는 발판 가운데 기준 (단위 px × --unit × --s). 앞줄(아래)·뒷줄(위)로 나눠 포켓몬을 가리지 않게 양옆에 둔다.
const ROCKS = [[-88, -14], [-62, 4], [64, -6], [90, 10]] as const
const SPIKE_ROWS = [
  [[-44, 18], [-30, 20], [-16, 21]],
  [[16, 21], [30, 20], [44, 18]],
  [[-6, 23], [6, 23], [-58, 14]],
] as const
const TSPIKES = [
  [[-72, -4], [-60, -6]],
  [[60, -6], [72, -4]],
] as const

const at = (x: number, y: number): CSSProperties => ({ '--x': x, '--y': y } as CSSProperties)

function Hazard({ id, layers }: { id: HazardFx; layers: number }) {
  switch (id) {
    case 'stealth_rock':
      return <>{ROCKS.map(([x, y], i) => <i key={i} className="bd-rock" style={{ ...at(x, y), '--d': `${i * -0.7}s` } as CSSProperties} />)}</>
    case 'spikes':
      return <>{SPIKE_ROWS.slice(0, layers).flat().map(([x, y], i) => <i key={i} className="bd-spike" style={at(x, y)} />)}</>
    case 'toxic_spikes':
      return <>{TSPIKES.slice(0, layers).flat().map(([x, y], i) => <i key={i} className="bd-spike is-toxic" style={at(x, y)} />)}</>
    case 'sticky_web':
      return (
        <svg className="bd-web" viewBox="-60 -20 120 40" aria-hidden>
          {[0, 30, 60, 90, 120, 150].map(a => {
            const r = (a * Math.PI) / 180
            return <line key={a} x1={-58 * Math.cos(r)} y1={-18 * Math.sin(r)} x2={58 * Math.cos(r)} y2={18 * Math.sin(r)} />
          })}
          {[0.3, 0.55, 0.8, 1].map(k => <ellipse key={k} cx={0} cy={0} rx={58 * k} ry={18 * k} />)}
        </svg>
      )
  }
}

export function SceneEffects({ frame, me }: { frame: Frame; me: PlayerID }) {
  const fx = useMemo(() => sceneEffects(frame, me), [frame, me])
  const items: Item[] = []
  if (fx.terrain) items.push({ key: `terrain:${fx.terrain}`, el: <span className={`bd-efx bd-terrain is-${fx.terrain}`} /> })
  for (const id of fx.field) items.push({ key: `field:${id}`, el: <span className={`bd-efx bd-fieldfx is-${id}`} /> })
  for (const s of ['foe', 'ours'] as const) {
    const v = fx.sides[s]
    const pos = { left: `${SPOT[s].x}%`, top: `${SPOT[s].y}%` }
    for (const h of v.hazards) {
      items.push({
        key: `${s}:${h.id}`,
        el: <span className={`bd-efx bd-hazard is-${h.id} is-${s}`} style={pos} data-layers={h.layers}><Hazard id={h.id} layers={h.layers} /></span>,
      })
    }
    v.barriers.forEach((b, i) => {
      items.push({ key: `${s}:${b}`, el: <span className={`bd-efx bd-barrier is-${b} is-${s}`} style={{ ...pos, '--i': i } as CSSProperties} /> })
    })
    if (v.tailwind) items.push({ key: `${s}:tailwind`, el: <span className={`bd-efx bd-tailwind is-${s}`} style={pos}><i /><i /><i /></span> })
  }
  if (fx.weather) items.push({ key: `weather:${fx.weather}`, el: <span className={`bd-efx bd-weather is-${fx.weather}`} /> })
  const shown = usePresence(items)
  return (
    <div className="bd-efx-layer" aria-hidden>
      {shown.map(i => <span key={i.key} className={`bd-efx-slot${i.leaving ? ' is-leaving' : ''}`}>{i.el}</span>)}
    </div>
  )
}
