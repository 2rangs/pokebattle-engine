// ─── 배틀 장면: 배경 + 발판 + 애니메이션 스프라이트 + 데이터박스 + 기술 연출 ─────
// 게임 배치 (5세대 블랙·화이트 / 9세대 스칼렛·바이올렛 공통):
//   상대 = 위 오른쪽(앞모습), 상대 데이터박스 = 위 왼쪽 (HP 숫자 없음)
//   우리 = 아래 왼쪽(뒷모습), 우리 데이터박스 = 아래 오른쪽 (HP 숫자)
// 연출은 transform/opacity/filter 애니메이션만 써서 레이아웃이 움직이지 않는다 (prefers-reduced-motion 이면 끔).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { MoveData, PlayerID } from '../lib/engine'
import { foeOf, sideOfId, type Frame, type PokeView, type SideView } from '../lib/frame'
import { moveFrameDelay, pctOf, stageMultiplier } from '../lib/hud'
import type { Lang } from '../lib/messages'
import { pokemonLabel, statLabel, statusLongName, typeName, volatileName } from '../lib/names'
import { volatileDesc } from '../lib/status'
import {
  battleSprite3dCandidates, battleSpriteCandidates, fxUrl, isHomeSprite, showdownAniUrl, moveFx, POKE_BALL,
  spriteIdsOf, TYPE_COLOR, type FxSprite,
} from '../lib/sprites'
import { FallbackImg, Gender, HpBar, StatusBadge } from './bits'
import { useBT, useSettings, type SpriteStyle } from './state'
import { AIM, SPOT } from './layout'
import { SceneEffects } from './SceneEffects'

type SpriteAnim = 'lunge' | 'hit' | 'crit' | 'enter' | 'heal' | 'shimmer' | 'status'

function spriteAnimFor(f: Frame, p: PokeView): SpriteAnim | null {
  const e = f.event
  switch (e.type) {
    case 'move_use': return e.pokemon_id === p.id && e.move.name !== 'metronome' ? 'lunge' : null
    case 'damage': return e.pokemon_id === p.id && e.amount > 0 ? (e.crit ? 'crit' : 'hit') : null
    case 'heal': return e.pokemon_id === p.id ? 'heal' : null
    case 'status_apply': return e.pokemon_id === p.id ? 'status' : null
    case 'switch': return e.in_id === p.id ? 'enter' : null
    case 'terastallize':
    case 'mega_evolve':
    case 'forme_change': return e.pokemon_id === p.id ? 'shimmer' : null
    default: return null
  }
}

function BattleSprite({ p, back, frame, unit, lang, style, psMove }: { p: PokeView; back: boolean; frame: Frame; unit: number; lang: Lang; style: SpriteStyle; psMove: boolean }) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null)
  const sources = style === '3d' ? battleSprite3dCandidates(p.species, back) : battleSpriteCandidates(p.species, back)
  const own = spriteAnimFor(frame, p)
  // Showdown 애니메이션이 공격자를 직접 움직일 때는 우리 돌진 연출을 끈다
  const anim = psMove && own === 'lunge' ? null : own
  const ref = useRef<HTMLSpanElement>(null)
  // 같은 연출이 연달아 와도 (연속기 등) 프레임마다 처음부터
  useLayoutEffect(() => {
    if (!anim) return
    for (const a of ref.current?.getAnimations?.({ subtree: true }) ?? []) {
      // Showdown 기술 애니메이션(WAAPI)은 건드리지 않는다
      if (typeof CSSAnimation !== 'undefined' && !(a instanceof CSSAnimation)) continue
      a.cancel()
      a.play()
    }
  }, [frame.index, anim])

  // Showdown 은 640px 필드에 1배로 그린다. 게임처럼 우리 쪽(가까운 쪽)을 더 크게
  const k = (back ? 1.5 : 1.1) * unit
  const max = (back ? 185 : 140) * unit
  // HOME 렌더는 512px 정사각형 (여백 포함) → 장면 크기에 맞춘 고정 크기 (우리 쪽이 더 크게)
  const home = !!size && isHomeSprite(size.src)
  const scale = !size ? 0 : home ? ((back ? 215 : 155) * unit) / size.h : Math.min(k, max / size.h)
  const stat = frame.event.type === 'stat_change' && frame.event.pokemon_id === p.id ? frame.event : null
  const status = p.fainted ? null : p.status

  return (
    <span className={`bd-sprite${p.fainted ? ' is-fainted' : ''}`}>
      {anim === 'enter' && <img key={frame.index} className="bd-ball" src={POKE_BALL} alt="" aria-hidden />}
      <span ref={ref} className={`bd-sprite-anim${anim ? ` anim-${anim}${anim === 'lunge' && !back ? '-foe' : ''}` : ''}`}>
        <span className="bd-sprite-ps">
        <FallbackImg
          sources={sources}
          alt={pokemonLabel(p, lang)}
          className={`bd-sprite-img${home ? ` is-home${back ? ' is-mirrored' : ''}` : ''}${status ? ` tint-${status}` : ''}`}
          style={size ? { width: Math.round(size.w * scale), height: Math.round(size.h * scale) } : { opacity: 0 }}
          onLoad={img => setSize(s => (s?.src === img.src ? s : { src: img.src, w: img.naturalWidth, h: img.naturalHeight }))}
        />
        </span>
      </span>
      {status === 'sleep' && <span className="bd-zzz" aria-hidden>Z<small>z</small></span>}
      {stat && stat.stages !== 0 && <StatFx key={frame.index} stages={stat.stages} />}
    </span>
  )
}

/**
 * 능력치 변화 연출 (게임처럼 상승 = 붉은색 위로, 하락 = 푸른색 아래로).
 * 스프라이트 색조 + 빛줄기 + 화살표. 단계가 클수록(크게/매우 크게) 줄기가 많고 빠르며 고리가 퍼진다.
 */
const STREAKS = [8, 22, 36, 50, 64, 78, 92, 15, 43, 71, 29, 57, 85, 5]
function StatFx({ stages }: { stages: number }) {
  const up = stages > 0
  const n = Math.min(3, Math.abs(stages))
  const count = n === 1 ? 7 : n === 2 ? 10 : 14
  return (
    <span className={`bd-statfx is-${up ? 'up' : 'down'} lv-${n}`} aria-hidden>
      <span className="bd-statfx-glow" />
      {STREAKS.slice(0, count).map((x, i) => (
        <i key={i} className="bd-statfx-streak" style={{ left: `${x}%`, '--d': `${(i % 7) * 0.06}s`, '--h': `${38 + ((i * 17) % 30)}%` } as CSSProperties} />
      ))}
      {[22, 50, 78].map((x, i) => (
        <b key={i} className="bd-statfx-chevron" style={{ left: `${x}%`, '--d': `${i * 0.08}s` } as CSSProperties}>{up ? '︽' : '︾'}</b>
      ))}
      {n >= 2 && <span className="bd-statfx-ring" />}
    </span>
  )
}

// ─── 데이터박스 ───────────────────────────────────────────────
function PartyBalls({ side, lang }: { side: SideView; lang: Lang }) {
  const { t } = useBT()
  const lines = side.team.map(p => [pokemonLabel(p, lang), p.fainted ? t('fainted') : `${pctOf(p)}%`, !p.fainted && p.status ? statusLongName(p.status, lang) : null].filter(Boolean).join(' · '))
  return (
    <span className="bd-balls" role="img" aria-label={`${t('partyStatus')}: ${lines.join(', ')}`} title={lines.join('\n')}>
      {side.team.map(p => (
        <i key={p.id} className={`bd-dot${p.fainted ? ' is-fainted' : p.status ? ` is-status st-${p.status}` : ''}`} />
      ))}
    </span>
  )
}

function StageChips({ p, lang }: { p: PokeView; lang: Lang }) {
  const { t } = useBT()
  const stages = Object.entries(p.stages)
  const vols = p.volatiles.map(v => [v, volatileName(v, lang)] as const).filter(([, n]) => n)
  if (stages.length === 0 && vols.length === 0) return null
  return (
    <span className="bd-chips">
      {stages.map(([k, v]) => (
        <span key={k} className={`bd-chip is-${v > 0 ? 'up' : 'down'}`} title={t('stageTip', { stat: statLabel(k, lang), x: stageMultiplier(k, v) })}>
          {statLabel(k, lang)} {v > 0 ? `+${v}` : v}
        </span>
      ))}
      {vols.map(([v, n]) => {
        const turns = p.volatileTurns[v] ?? null
        const desc = volatileDesc(v, lang)
        const tip = [desc ? t('statusTip', { name: n!, desc }) : n!, turns !== null ? t('turnsLeft', { n: turns }) : null].filter(Boolean).join(' · ')
        return <span key={v} className="bd-chip is-vol" title={tip}>{n}{turns !== null && <small>{turns}</small>}</span>
      })}
    </span>
  )
}

function Databox({ side, ours, showNumbers, showTera, lang }: { side: SideView; ours: boolean; showNumbers: boolean; showTera: boolean; lang: Lang }) {
  const { t } = useBT()
  const p = side.active
  const name = pokemonLabel(p, lang)
  const hpLabel = showNumbers ? t('hpLabel', { hp: p.hp, max: p.max_hp }) : t('hpPercentLabel', { pct: pctOf(p) })
  return (
    <div className={`bd-box-wrap is-${ours ? 'ours' : 'foe'}`}>
      {ours && <PartyBalls side={side} lang={lang} />}
      <div className={`bd-box${p.fainted ? ' is-fainted' : ''}`} aria-label={`${name} ${t('level', { n: p.level })} ${hpLabel}`}>
        <div className="bd-box-row">
          <span className="bd-box-name">{name}</span>
          <Gender g={p.gender} />
          {p.terastallized && p.tera_type && <span className="bd-tera-mark" style={{ '--type': TYPE_COLOR[p.tera_type] } as CSSProperties} title={t('teraActive', { type: typeName(p.tera_type, lang) })} />}
          {!p.terastallized && showTera && p.tera_type && !side.usedTera && <span className="bd-tera-mark is-unused" style={{ '--type': TYPE_COLOR[p.tera_type] } as CSSProperties} />}
          <span className="bd-box-lv">{t('level', { n: p.level })}</span>
        </div>
        <div className="bd-box-row">
          {p.status && !p.fainted ? <StatusBadge status={p.status} turns={p.statusTurns} lang={lang} /> : <span className="bd-status-gap" />}
          <HpBar p={p} label={hpLabel} />
        </div>
        {showNumbers && (
          <div className="bd-box-hpnum" aria-hidden>
            <span>{p.hp}</span>/<span>{p.max_hp}</span>
          </div>
        )}
      </div>
      {!ours && <PartyBalls side={side} lang={lang} />}
      <StageChips p={p} lang={lang} />
    </div>
  )
}

// ─── 기술 연출 ────────────────────────────────────────────────
function lastMoveBefore(frames: readonly Frame[], index: number): { move: MoveData; user: string } | null {
  for (let i = index; i >= 0; i--) {
    const e = frames[i]!.event
    if (e.type === 'move_use') return { move: e.move, user: e.pokemon_id }
    if (e.type === 'turn_start') return null
  }
  return null
}

function FxLayer({ frames, frame, me, psMove }: { frames: readonly Frame[]; frame: Frame; me: PlayerID; psMove: boolean }) {
  const e = frame.event
  const where = (id: string) => (sideOfId(id) === me ? AIM.ours : AIM.foe)
  let node: ReactNode = null
  if (e.type === 'move_use' && e.move.name !== 'metronome' && !psMove) {
    const fx = moveFx({ ...e.move, flags: e.move.flags })
    const target = e.target_id && e.target_id !== e.pokemon_id ? e.target_id : `${foeOf(sideOfId(e.pokemon_id))}_x`
    if (fx?.projectile) {
      const a = where(e.pokemon_id)
      const b = where(target)
      node = <Shot sprite={fx.projectile} from={a} to={b} />
    } else if (e.move.category === 'status') {
      const a = where(e.pokemon_id)
      node = <span className="bd-fx-aura" style={{ left: `${a.x}%`, top: `${a.y}%`, '--type': TYPE_COLOR[e.move.type] } as CSSProperties} />
    }
  } else if (e.type === 'damage' && e.amount > 0) {
    const last = lastMoveBefore(frames, frame.index)
    const fx = last ? moveFx({ ...last.move, flags: last.move.flags }) : null
    const at = where(e.pokemon_id)
    node = (
      <span className="bd-fx-hit" style={{ left: `${at.x}%`, top: `${at.y}%`, '--type': last ? TYPE_COLOR[last.move.type] : '#fff' } as CSSProperties}>
        {fx && <img src={fxUrl(fx.impact)} alt="" />}
      </span>
    )
  }
  return <div className="bd-fx" aria-hidden key={frame.index}>{node}</div>
}

function Shot({ sprite, from, to }: { sprite: FxSprite; from: { x: number; y: number }; to: { x: number; y: number } }) {
  return (
    <img
      className="bd-fx-shot"
      src={fxUrl(sprite)}
      alt=""
      style={{ '--x0': `${from.x}%`, '--y0': `${from.y}%`, '--x1': `${to.x}%`, '--y1': `${to.y}%` } as CSSProperties}
    />
  )
}

// ─── Showdown 기술 애니메이션 (../showdown-anims, 처음 쓸 때 따로 받는다) ─────
type PsModule = typeof import('../showdown-anims/scene')
let psModule: PsModule | null = null
let psLoading: Promise<PsModule | null> | null = null
const loadPs = () => (psLoading ??= import('../showdown-anims/scene').then(m => (psModule = m), () => null))
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
/** 기술 애니메이션이 이 재생 속도에서 돌아가는지 (아주 빠르게면 간단한 연출만) */
const PS_MIN_SPEED = 250
const SELF_TARGETS = new Set(['user', 'users-field', 'user-and-allies', 'all-allies', 'entire-field', 'user-or-ally', 'ally'])

/**
 * 기술을 쓰는 프레임(move_use)이 차례대로 드러날 때 Showdown 애니메이션을 한 번 돌린다.
 * 반환: 이 프레임을 Showdown 애니메이션이 맡는지 (그러면 우리 간단한 연출·돌진을 끈다).
 * 되감기·건너뛰기(프레임이 하나씩 나아가지 않을 때)와 움직임 줄이기 설정에서는 돌리지 않는다.
 */
function useShowdownMoveAnim(frame: Frame, me: PlayerID, speed: number, scene: React.RefObject<HTMLDivElement | null>, fx: React.RefObject<HTMLDivElement | null>, bg: React.RefObject<HTMLDivElement | null>): boolean {
  const [ready, setReady] = useState(!!psModule)
  const last = useRef(frame.index)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (ready || reducedMotion()) return
    let alive = true
    loadPs().then(m => { if (alive && m) setReady(true) })
    return () => { alive = false }
  }, [ready])
  const e = frame.event
  const handles = ready && !reducedMotion() && speed >= PS_MIN_SPEED && e.type === 'move_use' && e.move.name !== 'metronome'
  useEffect(() => {
    const prev = last.current
    last.current = frame.index
    if (!handles || !psModule || frame.index !== prev + 1 || e.type !== 'move_use') return
    const root = scene.current
    if (!root || !fx.current || !bg.current) return
    stop.current?.()
    stop.current = psModule.playMoveAnim(e.move.name, sideOfId(e.pokemon_id) !== me, SELF_TARGETS.has(e.move.target), {
      fx: fx.current,
      bg: bg.current,
      front: root.querySelector<HTMLElement>('.bd-spot.is-foe .bd-sprite-ps'),
      back: root.querySelector<HTMLElement>('.bd-spot.is-ours .bd-sprite-ps'),
    }, { budget: moveFrameDelay(speed) * 0.95 })
  }, [frame.index, handles, e, me, speed, scene, fx, bg])
  useEffect(() => () => stop.current?.(), [])
  return handles
}

/** 3D: 지금 두 팀의 3D 애니메이션(앞·뒤)을 미리 받아 둔다 (교체 때 늦게 뜨지 않게) */
const preloaded = new Set<string>()
function usePreloadHome(species: string[]) {
  const key = [...new Set(species)].sort().join('|')
  useEffect(() => {
    if (!key) return
    for (const sp of key.split('|')) {
      const ids = spriteIdsOf(sp)
      if (!ids) continue
      for (const url of [showdownAniUrl(ids.form), showdownAniUrl(ids.form, true)]) {
        if (preloaded.has(url)) continue
        preloaded.add(url)
        const img = new Image()
        img.decoding = 'async'
        img.src = url
      }
    }
  }, [key])
}


// ─── 장면 ────────────────────────────────────────────────────
export interface SceneProps {
  frames: readonly Frame[]
  frame: Frame
  /** 아래(우리) 쪽 진영 */
  me?: PlayerID
  /** 상대 HP 숫자·테라 타입까지 보여줄지 (관전·리플레이 관전) */
  revealFoe: boolean
  /** 손가락흔들기로 불려 나온 기술 (메시지 프레임이 그 기술일 때) */
  /** 재생 간격 (ms): 기술 애니메이션을 이 속도에 맞춰 줄인다 */
  speed?: number
  children?: ReactNode
}

export function Scene({ frames, frame, me = 'p1', revealFoe, speed = 650, children }: SceneProps) {
  const { t, lang } = useBT()
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const unit = Math.max(0.55, Math.min(1.4, width / 640))
  const mine = frame[me]
  const foe = frame[foeOf(me)]
  const { sprites } = useSettings()
  const psFxRef = useRef<HTMLDivElement>(null)
  const psBgRef = useRef<HTMLDivElement>(null)
  const psMove = useShowdownMoveAnim(frame, me, speed, ref, psFxRef, psBgRef)
  usePreloadHome(sprites === '3d' ? [...frame.p1.team, ...frame.p2.team].map(x => x.species) : [])

  return (
    <div
      ref={ref}
      className="bd-scene"
      role="img"
      aria-label={`${t('battleScene')}: ${pokemonLabel(foe.active, lang)} vs ${pokemonLabel(mine.active, lang)}`}
      style={{ '--unit': unit } as CSSProperties}
    >
      <div className="bd-psfx-bg" ref={psBgRef} aria-hidden />
      <SceneEffects frame={frame} me={me} />
      <span className="bd-spot is-foe" style={{ left: `${SPOT.foe.x}%`, top: `${SPOT.foe.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={`${foe.active.id}-${sprites}`} p={foe.active} back={false} frame={frame} unit={unit} lang={lang} style={sprites} psMove={psMove} />
      </span>
      <span className="bd-spot is-ours" style={{ left: `${SPOT.ours.x}%`, top: `${SPOT.ours.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={`${mine.active.id}-${sprites}`} p={mine.active} back frame={frame} unit={unit} lang={lang} style={sprites} psMove={psMove} />
      </span>
      <FxLayer frames={frames} frame={frame} me={me} psMove={psMove} />
      <div className="bd-psfx" ref={psFxRef} aria-hidden />
      <Databox side={foe} ours={false} showNumbers={revealFoe} showTera={revealFoe} lang={lang} />
      <Databox side={mine} ours showNumbers showTera lang={lang} />
      {children}
    </div>
  )
}

export function SceneOverlay({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bd-overlay" role="dialog" aria-label={title}>
      <div className="bd-overlay-card">
        <p className="bd-overlay-title">{title}</p>
        <div className="bd-overlay-actions">{children}</div>
      </div>
    </div>
  )
}
