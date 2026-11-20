// ─── Showdown 기술 애니메이션 표를 우리 장면 위에서 돌리는 어댑터 (이 저장소 코드, MIT) ─────
// 원본 표(./battle-animations*.ts)는 Showdown 의 640×360 무대 좌표(x, y, z)로 효과와 스프라이트를 움직인다.
// 여기서는 그 호출(showEffect / animateEffect / backgroundEffect / wait, sprite.anim / delay)을 기록해
// 요소마다 시간표를 만들고, 끝에 Web Animations API 로 한 번에 재생한다 (jQuery 없음).
// 좌표: Showdown 의 스프라이트 가운데(뒤 z=0 → (210, 245), 앞 z=200 → (430, 135))를
//       우리 장면의 AIM(우리 27%·68%, 상대 72%·40%)에 맞추는 아핀 변환. 크기는 장면 폭/640.
import { BattleEffects, BattleOtherAnims, type AnimTable } from './battle-animations'
import { BattleMoveAnims } from './battle-animations-moves'
import type { BattleScene, EffectHandle, PokemonSprite, ScenePos, SpriteData } from './types'
import { psBox, psFracX, psFracY, type Box } from './coords'

type EaseName = 'linear' | 'swing' | 'quadUp' | 'quadDown' | 'ballisticUp' | 'ballisticDown'
type Eases = Record<keyof Box, EaseName>

const EASE: Record<EaseName, (t: number) => number> = {
  linear: t => t,
  swing: t => 0.5 - Math.cos(Math.PI * t) / 2,
  quadUp: t => 1 - (1 - t) * (1 - t),
  quadDown: t => t * t,
  ballisticUp: t => -3 * t * t + 4 * t,
  ballisticDown: t => 1 - (-3 * (1 - t) * (1 - t) + 4 * (1 - t)),
}

const LINEAR: Eases = { left: 'linear', top: 'linear', width: 'linear', height: 'linear', opacity: 'linear' }

/** 원본 posT 의 전환 이름 → 속성별 이징 (모르는 이름은 linear) */
function easesFor(transition: string | undefined, to: Box, from: Box | null, z: number): Eases {
  const e: Eases = { ...LINEAR }
  const up = from ? to.top < from.top : false
  switch (transition) {
    case 'ballistic': e.top = up ? 'ballisticUp' : 'ballisticDown'; break
    case 'ballisticUnder': e.top = up ? 'ballisticDown' : 'ballisticUp'; break
    case 'ballistic2': e.top = up ? 'quadUp' : 'quadDown'; break
    case 'ballistic2Back': e.top = z > 0 ? 'quadUp' : 'quadDown'; break
    case 'ballistic2Under': e.top = up ? 'quadDown' : 'quadUp'; break
    case 'swing': e.left = e.top = e.width = e.height = 'swing'; break
    case 'accel': e.left = e.top = e.width = e.height = 'quadDown'; break
    case 'decel': e.left = e.top = e.width = e.height = 'quadUp'; break
  }
  return e
}

// ─── 요소 하나의 시간표 ──────────────────────────────────────────
class Track {
  t = 0
  frames: { time: number; box: Box }[] = []
  state: Box
  constructor(box: Box) {
    this.state = box
    this.frames.push({ time: 0, box })
  }
  set(box: Box, at = this.t) {
    this.state = box
    this.frames.push({ time: at, box })
  }
  delay(ms: number) {
    this.frames.push({ time: this.t, box: this.state })
    this.t += Math.max(0, ms)
    this.frames.push({ time: this.t, box: this.state })
  }
  animate(to: Box, ms: number, eases: Eases) {
    const from = this.state
    const t0 = this.t
    const dur = Math.max(0, ms)
    this.frames.push({ time: t0, box: from })
    const curved = Object.values(eases).some(n => n !== 'linear')
    const n = dur === 0 ? 1 : curved ? 8 : 1
    for (let i = 1; i <= n; i++) {
      const k = i / n
      const box = {} as Box
      for (const p of Object.keys(from) as (keyof Box)[]) box[p] = from[p] + (to[p] - from[p]) * EASE[eases[p]](k)
      this.frames.push({ time: t0 + dur * k, box })
    }
    this.t = t0 + dur
    this.state = to
  }
}

interface FxEl { track: Track; img: HTMLElement; ok: boolean; css?: Record<string, string> }

/** 원본 rawHTML 효과(보호·벽 상자)의 class → 우리 CSS class (색은 원본 battle.css 그대로, battle.css 의 .ps-*) */
const rawClass = (html: string) => /class="([a-z-]+)"/.exec(html)?.[1] ?? ''

/** 원본 표의 /sprites/gen6bgs/*.jpg 는 클라이언트 저장소에 없다 (서버에서만 제공) → 같은 배경의 fx/bg-*.png */
export const fixBgUrl = (bg: string) => bg.replace(/\/sprites\/gen6bgs\/(bg-[a-z]+)\.jpg/g, '/fx/$1.png')

/** scene.$bg.animate({ top, bottom }, ms) 기록 (땅울림·불도저·대지의힘: 배경이 흔들린다). 원본 기본 top = -90 */
class BgShake {
  t = 0
  frames: { time: number; dy: number }[] = []
  private dy = 0
  animate(css: { top?: number }, ms = 400) {
    this.frames.push({ time: this.t, dy: this.dy })
    this.t += ms
    if (typeof css.top === 'number') this.dy = css.top + 90
    this.frames.push({ time: this.t, dy: this.dy })
    return this
  }
  delay(ms: number) {
    this.t += ms
    return this
  }
}

const FRONT = { x: 0, y: 0, z: 200 }
const BACK = { x: 0, y: 0, z: 0 }
const SPRITE_SP: SpriteData = { w: 96, h: 96 }

/** 기록용 장면: 원본 표가 부르는 메서드만 */
class RecordingScene implements BattleScene {
  timeOffset = 0
  battle = { mySide: { ...BACK } }
  $bg = new BgShake()
  effects: FxEl[] = []
  backgrounds: { bg: string; duration: number; opacity: number; delay: number }[] = []

  showEffect(effect: string | SpriteData, start: ScenePos, end: ScenePos, transition: string, after?: string, css?: Record<string, string>): EffectHandle {
    const sp = typeof effect === 'string' ? BattleEffects[effect] : effect
    let img: HTMLElement
    let ok = false
    if (sp?.rawHTML) {
      img = document.createElement('div')
      img.dataset.ps = rawClass(sp.rawHTML)
      ok = !!img.dataset.ps
    } else {
      const im = document.createElement('img')
      if (sp?.url) im.src = sp.url
      im.alt = ''
      ok = !!sp?.url
      img = im
    }
    const el: FxEl = { track: new Track({ left: 0, top: 0, width: 0, height: 0, opacity: 0 }), img, ok, css }
    this.effects.push(el)
    return this.animateEffect(el as unknown as EffectHandle, effect, start, end, transition, after)
  }

  animateEffect(handle: EffectHandle, effect: string | SpriteData, start: ScenePos, end: ScenePos, transition: string, after?: string): EffectHandle {
    const el = handle as unknown as FxEl
    const sp = (typeof effect === 'string' ? BattleEffects[effect] : effect) ?? { w: 0, h: 0 }
    const s = { ...start }
    let e = { ...end }
    if (!s.time) s.time = 0
    if (!e.time) e.time = s.time + 500
    s.time += this.timeOffset
    e.time += this.timeOffset
    if (!e.scale && e.scale !== 0 && s.scale) e.scale = s.scale
    if (!e.xscale && e.xscale !== 0 && s.xscale) e.xscale = s.xscale
    if (!e.yscale && e.yscale !== 0 && s.yscale) e.yscale = s.yscale
    e = { ...s, ...e }
    const from = psBox(s, sp)
    const to = psBox(e, sp)
    const tr = el.track
    if (s.time) {
      tr.set({ ...from, opacity: 0 }, tr.frames.length === 1 ? 0 : tr.t)
      tr.delay(s.time)
      tr.animate(from, 1, LINEAR)
    } else {
      tr.animate(from, 0, LINEAR)
    }
    tr.animate(to, e.time! - s.time, easesFor(transition, to, from, e.z ?? 0))
    if (after === 'fade') tr.animate({ ...to, opacity: 0 }, 100, LINEAR)
    if (after === 'explode') {
      const big = psBox({ ...e, scale: (e.scale ?? 1) * 3, xscale: e.xscale ? e.xscale * 3 : e.xscale, yscale: e.yscale ? e.yscale * 3 : e.yscale, opacity: 0 }, sp)
      tr.animate(big, 200, LINEAR)
    }
    return handle
  }

  backgroundEffect(bg: string, duration: number, opacity = 1, delay = 0) {
    this.backgrounds.push({ bg: fixBgUrl(bg), duration, opacity, delay })
  }

  wait(time: number) {
    this.timeOffset += time
  }
}

class RecordingSprite implements PokemonSprite {
  x: number
  y: number
  z: number
  sp = SPRITE_SP
  isMissedPokemon = false
  isSubActive = false
  track: Track
  isFrontSprite: boolean
  constructor(isFrontSprite: boolean) {
    this.isFrontSprite = isFrontSprite
    const p = isFrontSprite ? FRONT : BACK
    this.x = p.x
    this.y = p.y
    this.z = p.z
    this.track = new Track(psBox(p, this.sp))
  }
  anim(end: ScenePos, transition?: string) {
    const e = { x: this.x, y: this.y, z: this.z, scale: 1, opacity: 1, time: 500, ...end }
    const to = psBox(e, this.sp)
    this.track.animate(to, e.time!, easesFor(transition, to, this.track.state, e.z!))
    return this
  }
  delay(time: number) {
    this.track.delay(time)
    return this
  }
  behindx(offset: number) { return this.x + (this.isFrontSprite ? 1 : -1) * offset }
  behindy(offset: number) { return this.y + (this.isFrontSprite ? -1 : 1) * offset }
  leftof(offset: number) { return this.x + (this.isFrontSprite ? 1 : -1) * offset }
  behind(offset: number) { return this.z + (this.isFrontSprite ? 1 : -1) * offset }
}

// ─── 재생 ────────────────────────────────────────────────────────
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export const hasMoveAnim = (move: string) => !!(BattleMoveAnims as AnimTable)[toId(move)]

export interface PlayTargets {
  /** 효과를 붙일 층 (장면 전체 크기, 포켓몬 위) */
  fx: HTMLElement
  /** 배경 효과 층 (포켓몬 아래) */
  bg: HTMLElement
  /** 스프라이트 래퍼: 앞(상대)·뒤(우리) */
  front: HTMLElement | null
  back: HTMLElement | null
  /** 땅(발판·필드 배경): scene.$bg 흔들기를 여기에 (원본은 배경 그림을 흔든다) */
  ground?: HTMLElement[]
}

export interface PlayOptions {
  /** 이 시간(ms) 안에 끝나도록 빠르게 (느리게는 하지 않는다) */
  budget: number
  /** 배경 효과 진하기 (미니멀 화면이라 줄인다) */
  bgOpacity?: number
}

/**
 * 기술 애니메이션 한 번. attackerFront: 공격하는 쪽이 위(상대) 진영인지.
 * selfTarget 이면 원본처럼 [공격자]만 넘긴다. 반환: 지우기 함수 (다음 기술·장면 해제 때).
 */
export function playMoveAnim(move: string, attackerFront: boolean, selfTarget: boolean, t: PlayTargets, opts: PlayOptions): () => void {
  const entry = (BattleMoveAnims as AnimTable)[toId(move)] ?? (BattleOtherAnims as AnimTable).attack
  const scene = new RecordingScene()
  const att = new RecordingSprite(attackerFront)
  const def = selfTarget ? att : new RecordingSprite(!attackerFront)
  try {
    entry.anim(scene as never, (selfTarget ? [att] : [att, def]) as never)
  } catch {
    return () => {}
  }

  const cw = t.fx.clientWidth
  const ch = t.fx.clientHeight
  const k = cw / 640
  const mapX = (px: number) => cw * psFracX(px)
  const mapY = (py: number) => ch * psFracY(py)
  const place = (b: Box) => {
    const w = b.width * k
    const h = b.height * k
    return { left: mapX(b.left + b.width / 2) - w / 2, top: mapY(b.top + b.height / 2) - h / 2, width: w, height: h, opacity: b.opacity }
  }

  const tracks = [...scene.effects.map(e => e.track), att.track, def.track]
  const bgEnd = Math.max(0, scene.$bg.t, ...scene.backgrounds.map(b => b.delay + b.duration))
  const total = Math.max(1, scene.timeOffset, bgEnd, ...tracks.map(tr => Math.max(tr.t, ...tr.frames.map(f => f.time))))
  const rate = Math.max(1, total / Math.max(1, opts.budget))
  const duration = total / rate
  const anims: Animation[] = []
  const nodes: HTMLElement[] = []
  const timing: KeyframeAnimationOptions = { duration, fill: 'both', easing: 'linear' }
  const offsets = (frames: readonly { time: number }[]) => frames.map(f => Math.min(1, f.time / total))

  for (const e of scene.effects) {
    if (!e.ok) continue
    e.img.className = 'bd-psfx-el'
    if (e.css) Object.assign(e.img.style, e.css)
    e.img.onerror = () => e.img.remove()
    const fr = [...e.track.frames].sort((a, b) => a.time - b.time)
    const off = offsets(fr)
    const kf = fr.map((f, i) => {
      const p = place(f.box)
      return { offset: off[i], left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, height: `${p.height}px`, opacity: String(p.opacity) }
    })
    // 마지막 상태를 지나면 숨긴다 (원본은 다음 기술 때 효과 층을 비운다)
    kf.push({ ...kf[kf.length - 1]!, offset: 1, opacity: '0' })
    t.fx.appendChild(e.img)
    nodes.push(e.img)
    anims.push(e.img.animate(kf, timing))
  }

  for (const b of scene.backgrounds) {
    const div = document.createElement('div')
    div.className = 'bd-psfx-bg-el'
    div.style.background = b.bg
    div.style.backgroundSize = 'cover'
    div.style.backgroundPosition = 'center'
    const o = String(Math.min(1, b.opacity) * (opts.bgOpacity ?? 0.5))
    const fade = Math.min(250, b.duration / 2)
    const kf = [
      { offset: 0, opacity: '0' },
      { offset: Math.min(1, b.delay / total), opacity: '0' },
      { offset: Math.min(1, (b.delay + fade) / total), opacity: o },
      { offset: Math.min(1, (b.delay + b.duration - fade) / total), opacity: o },
      { offset: Math.min(1, (b.delay + b.duration) / total), opacity: '0' },
      { offset: 1, opacity: '0' },
    ]
    t.bg.appendChild(div)
    nodes.push(div)
    anims.push(div.animate(kf, timing))
  }

  const spriteAnim = (sprite: RecordingSprite, el: HTMLElement | null) => {
    if (!el || sprite.track.frames.length <= 1) return
    const rest = place(psBox(sprite.isFrontSprite ? FRONT : BACK, sprite.sp))
    const rc = { x: rest.left + rest.width / 2, y: rest.top + rest.height / 2 }
    const fr = sprite.track.frames
    const off = offsets(fr)
    const kf = fr.map((f, i) => {
      const p = place(f.box)
      const dx = p.left + p.width / 2 - rc.x
      const dy = p.top + p.height / 2 - rc.y
      const s = rest.width ? p.width / rest.width : 1
      return { offset: off[i], transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: String(p.opacity) }
    })
    kf.push({ offset: 1, transform: 'none', opacity: '1' })
    anims.push(el.animate(kf, timing))
  }
  if (scene.$bg.frames.length > 0) {
    const fr = scene.$bg.frames
    const off = offsets(fr)
    const kf = fr.map((f, i) => ({ offset: off[i], translate: `0 ${(f.dy * k).toFixed(1)}px` }))
    kf.push({ offset: 1, translate: '0 0' })
    for (const g of t.ground ?? []) anims.push(g.animate(kf, timing))
  }
  spriteAnim(att, attackerFront ? t.front : t.back)
  if (!selfTarget) spriteAnim(def, attackerFront ? t.back : t.front)

  let done = false
  const clear = () => {
    if (done) return
    done = true
    for (const a of anims) a.cancel()
    for (const n of nodes) n.remove()
  }
  const timer = setTimeout(clear, duration + 60)
  return () => { clearTimeout(timer); clear() }
}
