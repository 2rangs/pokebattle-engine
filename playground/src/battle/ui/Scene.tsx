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
  battleSprite3dCandidates, battleSpriteCandidates, fxUrl, gimmickFxUrl, isHomeSprite, showdownAniUrl, moveFx, POKE_BALL,
  spriteIdsOf, TYPE_COLOR, type FxSprite,
} from '../lib/sprites'
import { pokeRogueAtlas } from '../lib/pokerogue'
import { spriteSpeciesOf } from '../lib/gimmick'
import { Gender, HpBar, StatusBadge, TypeBadge } from './bits'
import { PokeRogueSprite } from './PokeRogueSprite'
import { usePreloadPokeRogue } from './usePreloadPokeRogue'
import { useBT, useSettings, type SpriteStyle } from './state'
import { AIM, SPOT } from './layout'
import { SceneEffects } from './SceneEffects'
import { StatFx } from './statFx'
import { playGen5MoveAnim } from '../gen5fx/play'
import { loadStatTiles, statFxDuration, statTileOf, type StatTile } from './statTiles'

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

/**
 * 기믹 연출 (그 포켓몬, 이 프레임):
 *  react  = 키스톤 반응 / 울트라버스트 직전 (무지개빛)   burst = 메가진화·원시회귀·울트라버스트 순간 (빛이 터짐)
 *  zpower = Z파워를 두름 (Z 문양)                          dmax  = 다이맥스 (붉은 빛)   undmax = 원래 크기로
 */
type GimmickFx = 'react' | 'burst' | 'zpower' | 'dmax' | 'undmax'
function gimmickFxFor(f: Frame, p: PokeView): GimmickFx | null {
  const e = f.event
  if (!('pokemon_id' in e) || e.pokemon_id !== p.id) return null
  if (e.type === 'mega_evolve') return f.part === 0 ? 'react' : 'burst'
  if (e.type === 'activate' && e.effect === 'z-power') return 'zpower'
  if (e.type === 'volatile_apply' && e.volatile === 'dynamax') return 'dmax'
  if (e.type === 'volatile_remove' && e.volatile === 'dynamax') return 'undmax'
  return null
}

/** 다이맥스 크기: 1.75배까지, 발판에서 위로 장면 안에 들어오게 (우리 쪽은 상대 데이터박스 높이만큼 덜) */
function dynamaxScale(back: boolean, spriteH: number, sceneH: number, unit: number): number {
  if (!spriteH || !sceneH) return 1.6
  const room = back ? sceneH * 0.92 - 70 * unit : sceneH * 0.54 - 6
  return Math.max(1.25, Math.min(1.75, room / spriteH))
}

/** 능력치 변화 (그 포켓몬, 0 이 아닌 단계). 같은 기술로 여러 능력치가 같은 쪽으로 바뀌면(앞뒤 프레임) 무늬는 mix */
interface StatEv { key: number; stages: number; tile: StatTile }
function statEventOf(frames: readonly Frame[], frame: Frame, id: string): StatEv | null {
  const e = frame.event
  if (e.type !== 'stat_change' || e.pokemon_id !== id || !e.stages) return null
  const sibling = (f: Frame | undefined) =>
    !!f && f.event.type === 'stat_change' && f.event.pokemon_id === id && Math.sign(f.event.stages) === Math.sign(e.stages) && f.event.stat !== e.stat
  const mix = sibling(frames[frame.index - 1]) || sibling(frames[frame.index + 1])
  return { key: frame.index, stages: e.stages, tile: mix ? 'mix' : statTileOf(e.stat) }
}

/** 능력치 연출은 프레임이 넘어가도 끝까지 (한 번 흐르는 데 0.8초, ±2 두 번, ±3 세 번) */
function useStatFx(stat: StatEv | null): StatEv | null {
  const [shown, setShown] = useState<StatEv | null>(null)
  if (stat && stat.key !== shown?.key) setShown(stat)
  useEffect(() => {
    if (!shown) return
    const t = setTimeout(() => setShown(s => (s === shown ? null : s)), statFxDuration(shown.stages))
    return () => clearTimeout(t)
  }, [shown])
  return shown
}

function BattleSprite({ p, back, frame, stat, unit, sceneH, lang, style, psMove }: { p: PokeView; back: boolean; frame: Frame; stat: StatEv | null; unit: number; sceneH: number; lang: Lang; style: SpriteStyle; psMove: boolean }) {
  const [size, setSize] = useState<{ src: string; w: number; h: number } | null>(null)
  const species = spriteSpeciesOf(p)
  const sources = style === '3d' ? battleSprite3dCandidates(species, back) : battleSpriteCandidates(species, back)
  const gfx = gimmickFxFor(frame, p)
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
  const statFx = useStatFx(stat)
  const status = p.fainted ? null : p.status
  const shownH = size ? Math.round(size.h * scale) : 0
  const dmax = p.dynamax && !p.fainted

  return (
    <span
      className={`bd-sprite${p.fainted ? ' is-fainted' : ''}${dmax ? ` is-dmax${p.gmax ? ' is-gmax' : ''}` : ''}`}
      style={dmax ? { '--dmax': dynamaxScale(back, shownH, sceneH, unit) } as CSSProperties : undefined}
    >
      {gfx && <GimmickFxLayer key={frame.index} fx={gfx} height={shownH} />}
      {anim === 'enter' && <img key={frame.index} className="bd-ball" src={POKE_BALL} alt="" aria-hidden />}
      <span ref={ref} className={`bd-sprite-anim${anim ? ` anim-${anim}${anim === 'lunge' && !back ? '-foe' : ''}` : ''}`}>
        <span className="bd-sprite-ps">
        <PokeRogueSprite
          atlas={style === '2d' ? pokeRogueAtlas(species, back, p.gender) : null}
          sources={sources}
          alt={pokemonLabel(p, lang)}
          className={`bd-sprite-img${home ? ` is-home${back ? ' is-mirrored' : ''}` : ''}${status ? ` tint-${status}` : ''}`}
          style={size ? { width: Math.round(size.w * scale), height: Math.round(size.h * scale) } : { opacity: 0 }}
          onLoad={img => setSize(s => (s?.src === img.src ? s : { src: img.src, w: img.naturalWidth, h: img.naturalHeight }))}
        />
        {statFx && size && !p.fainted && (
          <StatFx
            key={statFx.key}
            stages={statFx.stages}
            tile={statFx.tile}
            src={size.src}
            mirrored={home && back}
            tilePx={Math.round(32 * (home ? 1.6 : Math.max(1, scale)) )}
          />
        )}
        </span>
      </span>
      {status === 'sleep' && <span className="bd-zzz" aria-hidden>Z<small>z</small></span>}
    </span>
  )
}

/** 기믹 연출 그림 (Showdown fx: shine·rainbow·z-symbol) — 스프라이트 몸통 가운데에 */
function GimmickFxLayer({ fx, height }: { fx: GimmickFx; height: number }) {
  const img = fx === 'zpower' ? 'z-symbol' : fx === 'react' ? 'rainbow' : fx === 'burst' ? 'shine' : null
  return (
    <span className={`bd-gfx is-${fx}`} style={{ '--h': `${Math.max(48, height)}px` } as CSSProperties} aria-hidden>
      {img && <img src={gimmickFxUrl(img)} alt="" />}
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

/** 데이터박스 타입: 지금 타입 (테라스탈했으면 테라 타입 하나 + 테라 표시) */
function BoxTypes({ p, lang }: { p: PokeView; lang: Lang }) {
  const { t } = useBT()
  const tera = p.terastallized && p.tera_type
  const types = tera ? [p.tera_type!] : p.types
  if (!types.length) return null
  return (
    <span className="bd-box-types" title={tera ? t('teraActive', { type: typeName(p.tera_type!, lang) }) : undefined}>
      {types.map(ty => <TypeBadge key={ty} type={ty} lang={lang} size="xs" tera={!!tera} />)}
    </span>
  )
}

function Databox({ side, ours, showNumbers, lang }: { side: SideView; ours: boolean; showNumbers: boolean; lang: Lang }) {
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
          <BoxTypes p={p} lang={lang} />
          <span className="bd-box-lv">{t('level', { n: p.level })}</span>
        </div>
        {p.dynamax && !p.fainted && p.dynamaxTurns !== null && (
          <div className="bd-box-row">
            <span className="bd-box-dmax" title={t('dynamaxTip', { n: p.dynamaxTurns })}>{t(p.gmax ? 'gigantamaxBadge' : 'dynamaxBadge', { n: p.dynamaxTurns })}</span>
          </div>
        )}
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
  const { moveFx } = useSettings()
  const gen5 = moveFx === 'gen5'
  const [ready, setReady] = useState(!!psModule)
  const last = useRef(frame.index)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (gen5 || ready || reducedMotion()) return
    let alive = true
    loadPs().then(m => { if (alive && m) setReady(true) })
    return () => { alive = false }
  }, [ready, gen5])
  const e = frame.event
  const handles = (gen5 || ready) && !reducedMotion() && speed >= PS_MIN_SPEED && e.type === 'move_use' && e.move.name !== 'metronome'
  useEffect(() => {
    const prev = last.current
    last.current = frame.index
    if (!handles || frame.index !== prev + 1 || e.type !== 'move_use') return
    const root = scene.current
    if (!root || !fx.current || !bg.current) return
    stop.current?.()
    const targets = {
      fx: fx.current,
      bg: bg.current,
      front: root.querySelector<HTMLElement>('.bd-spot.is-foe .bd-sprite-ps'),
      back: root.querySelector<HTMLElement>('.bd-spot.is-ours .bd-sprite-ps'),
      ground: [...root.querySelectorAll<HTMLElement>('.bd-shadow, .bd-efx-bg')],
    }
    const attackerFront = sideOfId(e.pokemon_id) !== me
    const self = SELF_TARGETS.has(e.move.target)
    const budget = moveFrameDelay(speed) * 0.95
    if (gen5) stop.current = playGen5MoveAnim(e.move, attackerFront, self, targets, { budget })
    else if (psModule) stop.current = psModule.playMoveAnim(e.move.name, attackerFront, self, targets, { budget })
  }, [frame.index, handles, e, me, speed, scene, fx, bg, gen5])
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
  const [height, setHeight] = useState(360)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    setHeight(el.clientHeight)
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setHeight(el.clientHeight) })
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
  useEffect(() => { void loadStatTiles() }, [])
  usePreloadHome(sprites === '3d' ? [...frame.p1.team, ...frame.p2.team].map(spriteSpeciesOf) : [])
  usePreloadPokeRogue(sprites === '2d', mine.team, foe.team)

  return (
    <div
      ref={ref}
      className="bd-scene"
      role="img"
      aria-label={`${t('battleScene')}: ${pokemonLabel(foe.active, lang)} vs ${pokemonLabel(mine.active, lang)}`}
      style={{ '--unit': unit } as CSSProperties}
    >
      <SceneEffects frame={frame} me={me} />
      <div className="bd-psfx-bg" ref={psBgRef} aria-hidden />
      <span className="bd-spot is-foe" style={{ left: `${SPOT.foe.x}%`, top: `${SPOT.foe.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={`${foe.active.id}-${sprites}`} p={foe.active} back={false} frame={frame} stat={statEventOf(frames, frame, foe.active.id)} unit={unit} sceneH={height} lang={lang} style={sprites} psMove={psMove} />
      </span>
      <span className="bd-spot is-ours" style={{ left: `${SPOT.ours.x}%`, top: `${SPOT.ours.y}%` }}>
        <span className="bd-shadow" />
        <BattleSprite key={`${mine.active.id}-${sprites}`} p={mine.active} back frame={frame} stat={statEventOf(frames, frame, mine.active.id)} unit={unit} sceneH={height} lang={lang} style={sprites} psMove={psMove} />
      </span>
      <FxLayer frames={frames} frame={frame} me={me} psMove={psMove} />
      <div className="bd-psfx" ref={psFxRef} aria-hidden />
      <Databox side={foe} ours={false} showNumbers={revealFoe} lang={lang} />
      <Databox side={mine} ours showNumbers lang={lang} />
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
