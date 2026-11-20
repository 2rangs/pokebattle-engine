// ─── 장면에 남는 효과: 날씨 · 필드 · 장판 · 벽/베일 · 방어 · 순풍 ─────
// 지금 프레임 상태(sceneEffects)만으로 그린다 → 리플레이·되감기에서도 같은 그림.
// 그림은 Pokémon Showdown 클라이언트의 fx 에셋 그대로 (GitHub 저장소 파일을 URL 로), 배치·진하기도 원본 BattleScene 을 따른다:
//   - 날씨·필드(+트릭룸 등)는 장면 전체 배경 층 (포켓몬 아래). 필드 층은 진하게(1), 날씨 층은 0.5 (원시 날씨·난기류 0.9).
//     날씨는 6세대 게임 날씨 영상(webm/mp4)을 반복 재생, 움직임 줄이기면 원본의 정지 그림.
//   - 장판은 그 진영 발판 위의 스프라이트 (rock1/rock2, caltrop 1~3, poisoncaltrop 1~2, web), 원본 addSideCondition 위치·크기.
//   - 벽·베일·방어는 원본처럼 반투명 색 상자 (에셋이 없다, 원본도 CSS 상자). 순풍은 원본에 그림이 없어 바람 줄.
// 레이어: 배경(필드 < 날씨) z0 < 상대 포켓몬 z1 < 상대 진영 효과 z2 < 우리 포켓몬 z3 < 우리 진영 효과 z4 < 기술 연출 z8 < 데이터박스 z10
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactElement } from 'react'
import type { PlayerID } from '../lib/engine'
import type { Frame } from '../lib/frame'
import { sceneEffects, type BarrierFx, type FieldFx, type HazardFx, type TerrainFx, type WeatherFx } from '../lib/effects'
import { psBox, psFracY, psPlaceCss } from '../showdown-anims/coords'
import type { ScenePos, SpriteData } from '../showdown-anims/types'
import { AIM, SPOT } from './layout'
import './effects.css'

const FX = 'https://raw.githubusercontent.com/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com/fx/'

interface Item { key: string; el: ReactElement }

const FADE_MS = 400

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

// ─── 환경 (움직임 줄이기 · 탭 숨김) ───────────────────────────────
const RM = '(prefers-reduced-motion: reduce)'
const subRM = (cb: () => void) => {
  const m = window.matchMedia?.(RM)
  m?.addEventListener('change', cb)
  return () => m?.removeEventListener('change', cb)
}
const useReducedMotion = () => useSyncExternalStore(subRM, () => !!window.matchMedia?.(RM).matches, () => false)
const subVis = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const usePageVisible = () => useSyncExternalStore(subVis, () => document.visibilityState !== 'hidden', () => true)

// ─── 날씨 · 필드 (원본 .xxxweather 그림) ─────────────────────────
const WEATHER: Record<WeatherFx, { still: string; video?: string; intense?: boolean }> = {
  sun: { still: 'weather-sunnyday.jpg', video: 'weather-gen6-sunnyday' },
  harsh_sun: { still: 'weather-sunnyday.jpg', video: 'weather-gen6-sunnyday', intense: true },
  rain: { still: 'weather-raindance.jpg', video: 'weather-gen6-raindance' },
  heavy_rain: { still: 'weather-raindance.jpg', video: 'weather-gen6-raindance', intense: true },
  sandstorm: { still: 'weather-sandstorm.png', video: 'weather-gen6-sandstorm' },
  snow: { still: 'weather-hail.png', video: 'weather-gen6-hail' },
  strong_winds: { still: 'weather-strongwind.png', intense: true },
}
const TERRAIN: Record<TerrainFx | FieldFx, string> = {
  electric: 'weather-electricterrain.png',
  grassy: 'weather-grassyterrain.png',
  misty: 'weather-mistyterrain.png',
  psychic: 'weather-psychicterrain.png',
  trick_room: 'weather-trickroom.png',
  gravity: 'weather-gravity.png',
  magic_room: 'weather-magicroom.png',
  wonder_room: 'weather-wonderroom.png',
}

/** 날씨 영상: 지금 날씨 하나만 재생 (사라지는 중·움직임 줄이기·탭 숨김이면 정지 그림 / 일시정지) */
function WeatherLayer({ id, leaving }: { id: WeatherFx; leaving: boolean }) {
  const w = WEATHER[id]
  const reduced = useReducedMotion()
  const visible = usePageVisible()
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  const still = FX + w.still
  const useVideo = !!w.video && !leaving && !reduced && !failed
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (visible) v.play().catch(() => {})
    else v.pause()
  }, [visible, useVideo])
  return (
    <span className={`bd-efx bd-weather${w.intense ? ' is-intense' : ''}`} data-weather={id}>
      {useVideo ? (
        <video
          ref={ref}
          className="bd-efx-media"
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="auto"
          poster={still}
        >
          <source src={`${FX}${w.video}.webm`} type="video/webm" />
          <source src={`${FX}${w.video}.mp4`} type="video/mp4" onError={() => setFailed(true)} />
        </video>
      ) : (
        <img className="bd-efx-media" src={still} alt="" decoding="async" />
      )}
    </span>
  )
}

// ─── 진영 효과 (원본 BattleScene.addSideCondition / PokemonSprite.addEffect) ─────
// 원본 BattleEffects 의 그림·크기 (기술 애니메이션 표와 같은 값, 표 청크를 불러오지 않으려고 여기 둔다)
const SP: Record<'rock1' | 'rock2' | 'caltrop' | 'poisoncaltrop' | 'web', SpriteData> = {
  rock1: { url: 'rock1.png', w: 64, h: 80 },
  rock2: { url: 'rock2.png', w: 66, h: 72 },
  caltrop: { url: 'caltrop.png', w: 80, h: 80 },
  poisoncaltrop: { url: 'poisoncaltrop.png', w: 80, h: 80 },
  web: { url: 'web.png', w: 120, h: 122 },
}
type Spr = { sp: SpriteData; pos: ScenePos }

/** 원본 위치: 진영 x = y = 0, z = 0(가까운 쪽) / 200(먼 쪽), leftof(o) = 가까운 쪽 -o · 먼 쪽 +o */
function hazardSprites(id: HazardFx, layers: number, far: boolean): Spr[] {
  const z = far ? 200 : 0
  const leftof = (o: number) => (far ? 1 : -1) * o
  switch (id) {
    case 'stealth_rock':
      return [
        { sp: SP.rock1, pos: { x: leftof(-40), y: -10, z, opacity: 0.5, scale: 0.2 } },
        { sp: SP.rock2, pos: { x: leftof(-20), y: -40, z, opacity: 0.5, scale: 0.2 } },
        { sp: SP.rock1, pos: { x: leftof(30), y: -20, z, opacity: 0.5, scale: 0.2 } },
        { sp: SP.rock2, pos: { x: leftof(10), y: -30, z, opacity: 0.5, scale: 0.2 } },
      ]
    case 'spikes':
      return ([[-25, -40], [30, -45], [50, -40]] as const).slice(0, layers).map(([x, y]) => ({ sp: SP.caltrop, pos: { x, y, z, scale: 0.3 } }))
    case 'toxic_spikes':
      return ([[5, -40], [-15, -35]] as const).slice(0, layers).map(([x, y]) => ({ sp: SP.poisoncaltrop, pos: { x, y, z, scale: 0.3 } }))
    case 'sticky_web':
      return [{ sp: SP.web, pos: { x: 15, y: -35, z, opacity: 0.4, scale: 0.7 } }]
  }
}

/** 벽·베일·방어: 원본은 100×50 (방어 100×70) 색 상자, 포켓몬 몸통 가운데·조금 앞(behind(-n)), 쉴 때 진하기 0.3 (방어 0.4) */
const BOX_Z: Record<BarrierFx | 'protect', number> = { aurora_veil: 14, protect: 15, reflect: 17, safeguard: 20, light_screen: 23, mist: 27 }
function boxSprite(id: BarrierFx | 'protect', far: boolean): Spr {
  const z = far ? 200 - BOX_Z[id] : BOX_Z[id]
  return { sp: { w: 100, h: id === 'protect' ? 70 : 50 }, pos: { x: 0, y: 0, z } }
}

/**
 * 벽·방어 상자: 그 진영 포켓몬 몸통 가운데(AIM)에 두고, 원본의 z 차이(behind)로 생기는 어긋남은 원본 크기 그대로(장면 폭/640) 더한다.
 * (아핀 변환을 그대로 쓰면 우리 장면이 원본보다 앞뒤 간격이 넓어 상자가 포켓몬에서 많이 벗어난다)
 */
const boxPlaced = (s: Spr, far: boolean): CSSProperties => {
  const b = psBox(s.pos, s.sp)
  const o = psBox({ ...s.pos, z: far ? 200 : 0 }, s.sp)
  const dx = (b.left + b.width / 2 - (o.left + o.width / 2)) / 6.4
  const dy = (b.top + b.height / 2 - (o.top + o.height / 2)) / 6.4
  const a = AIM[far ? 'foe' : 'ours']
  const { width, height } = psPlaceCss(b)
  return { left: `calc(${a.x}% + ${dx.toFixed(2)}cqw)`, top: `calc(${a.y}% + ${dy.toFixed(2)}cqw)`, width, height }
}

const placed = (s: Spr, dy = 0): CSSProperties => {
  const b = psBox(s.pos, s.sp)
  return { ...psPlaceCss(b, dy) as CSSProperties, '--o': b.opacity } as CSSProperties
}

/**
 * 장판은 원본에서 y = -40 쯤(발밑)에 놓인다. 우리 장면은 스프라이트 몸통(AIM)과 발판(SPOT) 사이가 원본보다 멀어서,
 * 원본의 발밑 높이를 우리 발판 높이로 옮기는 만큼 내린다 (장면 높이 대비 비율).
 */
const groundShift = (far: boolean) => {
  const b = psBox({ x: 0, y: -40, z: far ? 200 : 0 }, { w: 0, h: 0 })
  return SPOT[far ? 'foe' : 'ours'].y / 100 - psFracY(b.top)
}

export function SceneEffects({ frame, me }: { frame: Frame; me: PlayerID }) {
  const fx = useMemo(() => sceneEffects(frame, me), [frame, me])

  // 배경 층: 필드 → 필드 전체(트릭룸 등) → 날씨. 원본은 마지막 것 하나만 보이는 불투명 그림이라 위에 온 것이 보인다
  const bg: Item[] = []
  if (fx.terrain) bg.push({ key: `terrain:${fx.terrain}`, el: <span className="bd-efx bd-terrain" data-terrain={fx.terrain}><img className="bd-efx-media" src={FX + TERRAIN[fx.terrain]} alt="" decoding="async" /></span> })
  for (const id of fx.field) bg.push({ key: `field:${id}`, el: <span className="bd-efx bd-terrain" data-terrain={id}><img className="bd-efx-media" src={FX + TERRAIN[id]} alt="" decoding="async" /></span> })
  const weather = fx.weather
  if (weather) bg.push({ key: `weather:${weather}`, el: <WeatherLayer id={weather} leaving={false} /> })

  const front: Item[] = []
  for (const s of ['foe', 'ours'] as const) {
    const v = fx.sides[s]
    const far = s === 'foe'
    for (const h of v.hazards) {
      hazardSprites(h.id, h.layers, far).forEach((sp, i) => {
        front.push({ key: `${s}:${h.id}:${i}`, el: <img className={`bd-efx bd-hazard is-${s}`} data-hazard={h.id} src={FX + sp.sp.url} style={placed(sp, groundShift(far))} alt="" decoding="async" /> })
      })
    }
    for (const b of v.barriers) front.push({ key: `${s}:${b}`, el: <span className={`bd-efx bd-ps-box is-${s}`} data-ps={b} style={boxPlaced(boxSprite(b, far), far)} /> })
    if (v.protect) front.push({ key: `${s}:protect`, el: <span className={`bd-efx bd-ps-box is-${s}`} data-ps="protect" style={boxPlaced(boxSprite('protect', far), far)} /> })
    if (v.tailwind) front.push({ key: `${s}:tailwind`, el: <span className={`bd-efx bd-tailwind is-${s}`} style={{ left: `${SPOT[s].x}%`, top: `${SPOT[s].y}%` }}><i /><i /><i /></span> })
  }

  const shownBg = usePresence(bg)
  const shownFront = usePresence(front)
  return (
    <>
      <div className="bd-efx-bg" aria-hidden>
        {shownBg.map(i => (
          <span key={i.key} className={`bd-efx-slot${i.leaving ? ' is-leaving' : ''}`}>
            {i.leaving && i.key.startsWith('weather:') ? <WeatherLayer id={i.key.slice(8) as WeatherFx} leaving /> : i.el}
          </span>
        ))}
      </div>
      <div className="bd-efx-layer" aria-hidden>
        {shownFront.map(i => <span key={i.key} className={`bd-efx-slot${i.leaving ? ' is-leaving' : ''}`}>{i.el}</span>)}
      </div>
    </>
  )
}
