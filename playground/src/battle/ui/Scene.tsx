// ─── 배틀 장면: 배경 + 발판 + 애니메이션 스프라이트 + 데이터박스 + 기술 연출 ─────
// 게임 배치 (5세대 블랙·화이트 / 9세대 스칼렛·바이올렛 공통):
//   상대 = 위 오른쪽(앞모습), 상대 데이터박스 = 위 왼쪽 (HP 숫자 없음)
//   우리 = 아래 왼쪽(뒷모습), 우리 데이터박스 = 아래 오른쪽 (HP 숫자)
// 연출은 transform/opacity/filter 애니메이션만 써서 레이아웃이 움직이지 않는다 (prefers-reduced-motion 이면 끔).
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { MoveData, PlayerID } from '../lib/engine'
import { foeOf, sideOfId, type Frame, type PokeView, type SideView } from '../lib/frame'
import { pctOf, stageMultiplier } from '../lib/hud'
import type { Lang } from '../lib/messages'
import { moveName, pokemonLabel, statLabel, statusLongName, typeName, volatileName } from '../lib/names'
import { volatileDesc } from '../lib/status'
import {
  backgroundFor, backgroundUrl, battleSpriteCandidates, fxUrl, moveFx, POKE_BALL, TYPE_COLOR, type FxSprite,
} from '../lib/sprites'
import { FallbackImg, Gender, HpBar, StatusBadge } from './bits'
import { useBT } from './state'

// ─── 위치 (장면 대비 %) ───────────────────────────────────────
const SPOT = {
  foe: { x: 72, y: 54 },
  ours: { x: 27, y: 92 },
}
/** 기술 연출의 목표점 (스프라이트 몸통 가운데쯤) */
const AIM = {
  foe: { x: 72, y: 40 },
  ours: { x: 27, y: 68 },
}

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

function BattleSprite({ p, back, frame, unit, lang }: { p: PokeView; back: boolean; frame: Frame; unit: number; lang: Lang }) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null)
  const sources = battleSpriteCandidates(p.species, back)
  const anim = spriteAnimFor(frame, p)
  const ref = useRef<HTMLSpanElement>(null)
  // 같은 연출이 연달아 와도 (연속기 등) 프레임마다 처음부터
  useLayoutEffect(() => {
    if (!anim) return
    for (const a of ref.current?.getAnimations?.({ subtree: true }) ?? []) {
      a.cancel()
      a.play()
    }
  }, [frame.index, anim])

  // Showdown 은 640px 필드에 1배로 그린다. 게임처럼 우리 쪽(가까운 쪽)을 더 크게
  const k = (back ? 1.5 : 1.1) * unit
  const max = (back ? 185 : 140) * unit
  const scale = size ? Math.min(k, max / size.h) : 0
  const stat = frame.event.type === 'stat_change' && frame.event.pokemon_id === p.id ? frame.event : null
  const status = p.fainted ? null : p.status

  return (
    <span className={`bd-sprite${p.fainted ? ' is-fainted' : ''}`}>
      {anim === 'enter' && <img key={frame.index} className="bd-ball" src={POKE_BALL} alt="" aria-hidden />}
      <span ref={ref} className={`bd-sprite-anim${anim ? ` anim-${anim}${anim === 'lunge' && !back ? '-foe' : ''}` : ''}`}>
        <FallbackImg
          sources={sources}
          alt={pokemonLabel(p, lang)}
          className={`bd-sprite-img${status ? ` tint-${status}` : ''}`}
          style={size ? { width: Math.round(size.w * scale), height: Math.round(size.h * scale) } : { opacity: 0 }}
          onLoad={img => setSize(s => (s?.src === img.src ? s : { src: img.src, w: img.naturalWidth, h: img.naturalHeight }))}
        />
      </span>
      {status === 'sleep' && <span className="bd-zzz" aria-hidden>Z<small>z</small></span>}
      {stat && stat.stages !== 0 && (
        <span key={frame.index} className={`bd-stat-arrows is-${stat.stages > 0 ? 'up' : 'down'}`} aria-hidden>
          {Array.from({ length: 6 }, (_, i) => <i key={i}>{stat.stages > 0 ? '▲' : '▼'}</i>)}
        </span>
      )}
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
        <img
          key={p.id}
          src={POKE_BALL}
          alt=""
          className={`bd-ball-icon is-pixel${p.fainted ? ' is-fainted' : p.status ? ` is-status st-${p.status}` : ''}`}
        />
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

function FxLayer({ frames, frame, me }: { frames: readonly Frame[]; frame: Frame; me: PlayerID }) {
  const e = frame.event
  const where = (id: string) => (sideOfId(id) === me ? AIM.ours : AIM.foe)
  let node: ReactNode = null
  if (e.type === 'move_use' && e.move.name !== 'metronome') {
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

// ─── 장면 ────────────────────────────────────────────────────
export interface SceneProps {
  frames: readonly Frame[]
  frame: Frame
  seed: number
  /** 아래(우리) 쪽 진영 */
  me?: PlayerID
  /** 상대 HP 숫자·테라 타입까지 보여줄지 (관전·리플레이 관전) */
  revealFoe: boolean
  /** 손가락흔들기로 불려 나온 기술 (메시지 프레임이 그 기술일 때) */
  called?: { move: string; type: string; key: number } | null
  children?: ReactNode
}

export function Scene({ frames, frame, seed, me = 'p1', revealFoe, called, children }: SceneProps) {
  const { t, lang } = useBT()
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [bgFailed, setBgFailed] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const unit = Math.max(0.55, Math.min(1.4, width / 640))
  const bg = backgroundFor(seed)
  const mine = frame[me]
  const foe = frame[foeOf(me)]

  return (
    <div
      ref={ref}
      className={`bd-scene${bgFailed ? ' is-fallback' : ''}`}
      data-weather={frame.weather ?? undefined}
      data-terrain={frame.terrain ?? undefined}
      role="img"
      aria-label={`${t('battleScene')}: ${pokemonLabel(foe.active, lang)} vs ${pokemonLabel(mine.active, lang)}`}
      style={{ '--unit': unit } as CSSProperties}
    >
      {!bgFailed && <img className="bd-bg" src={backgroundUrl(bg)} alt="" aria-hidden onError={() => setBgFailed(true)} />}
      <span className="bd-weather" aria-hidden />
      <span className="bd-spot is-foe" style={{ left: `${SPOT.foe.x}%`, top: `${SPOT.foe.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={foe.active.id} p={foe.active} back={false} frame={frame} unit={unit} lang={lang} />
      </span>
      <span className="bd-spot is-ours" style={{ left: `${SPOT.ours.x}%`, top: `${SPOT.ours.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={mine.active.id} p={mine.active} back frame={frame} unit={unit} lang={lang} />
      </span>
      <FxLayer frames={frames} frame={frame} me={me} />
      <Databox side={foe} ours={false} showNumbers={revealFoe} showTera={revealFoe} lang={lang} />
      <Databox side={mine} ours showNumbers showTera lang={lang} />
      {called && (
        <span key={called.key} className="bd-called" style={{ '--type': TYPE_COLOR[called.type] ?? '#888' } as CSSProperties}>
          <span>{moveName('metronome', lang)}</span>
          <b>→ {moveName(called.move, lang)}</b>
        </span>
      )}
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
