// ─── 5세대풍 기술 연출: 레시피 → 프레임별 그리기 목록 (DOM 없음, 테스트 가능) ─────
// 저해상도 캔버스 좌표(px)로 계산한다. 30fps 한 프레임씩 step() 한다.
import type { Palette, TexName } from './art'
import type { Anchor, ParticleSpec, Recipe, Step, Who } from './recipes'

type XY = readonly [number, number]

export type Draw =
  | { t: 'tex'; tex: TexName; pal: Palette; x: number; y: number; scale: number; alpha: number; rot: number }
  | { t: 'line'; pts: XY[]; width: number; shade: 0 | 1 | 2; alpha: number; pal: Palette }
  | { t: 'ring'; x: number; y: number; r: number; thick: number; alpha: number; pal: Palette }

export interface SpriteFx { dx: number; dy: number; sx: number; sy: number; opacity: number }
export interface ScreenFx {
  flash: { shade: 'light' | 'mid' | 'dark' | 'white' | 'black'; alpha: number } | null
  tint: { shade: 'light' | 'mid' | 'dark' | 'white' | 'black'; alpha: number } | null
  quake: XY
}

interface Particle {
  tex: TexName
  pal: Palette
  x: number; y: number; vx: number; vy: number
  gravity: number; drag: number
  life: number; age: number
  s0: number; s1: number
  fade: number
  rot: number; spin: number
}

interface Shot { x0: number; y0: number; x1: number; y1: number; start: number; travel: number; arc: number; step: Extract<Step, { kind: 'shot' }> }

export interface FxLayout {
  /** 저해상도 캔버스 크기 */
  w: number
  h: number
  /** 공격자·대상 몸통 가운데 (px) */
  att: XY
  def: XY
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class FxSim {
  readonly recipe: Recipe
  readonly layout: FxLayout
  frame = 0
  private rand: () => number
  private particles: Particle[] = []
  private shots: Shot[] = []
  private boltPts: XY[] = []

  constructor(recipe: Recipe, layout: FxLayout, seed = 1) {
    this.recipe = recipe
    this.layout = layout
    this.rand = rng(seed)
  }

  get done(): boolean {
    return this.frame >= this.recipe.frames && this.particles.length === 0 && this.shots.length === 0
  }

  /** 끝까지 기다리는 최대 프레임 (레시피 길이 + 남은 파티클) */
  get maxFrames(): number { return this.recipe.frames + 40 }

  private r(a: number, b: number) { return a + (b - a) * this.rand() }

  private anchor(a: Anchor): XY {
    const { att, def, w, h } = this.layout
    switch (a) {
      case 'att': return att
      case 'def': return def
      case 'mid': return [(att[0] + def[0]) / 2, (att[1] + def[1]) / 2]
      case 'sky': return [def[0], -8]
      case 'screen': return [this.r(0, w), -8]
      case 'ground': return [w / 2, h * 0.82]
    }
  }

  private aimAngle(): number {
    const { att, def } = this.layout
    return (Math.atan2(def[1] - att[1], def[0] - att[0]) * 180) / Math.PI
  }

  private spawn(p: ParticleSpec, at: XY, pal: Palette) {
    const base = p.aim ? this.aimAngle() : 0
    for (let i = 0; i < p.count; i++) {
      const ang = ((base + this.r(p.angle?.[0] ?? 0, p.angle?.[1] ?? 360)) * Math.PI) / 180
      const sp = this.r(p.speed?.[0] ?? 0, p.speed?.[1] ?? 0)
      const rad = this.r(0, p.spread ?? 0)
      const ra = this.r(0, Math.PI * 2)
      this.particles.push({
        tex: p.tex, pal: p.pal ?? pal,
        x: at[0] + Math.cos(ra) * rad, y: at[1] + Math.sin(ra) * rad,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        gravity: p.gravity ?? 0, drag: p.drag ?? 1,
        life: Math.max(1, Math.round(this.r(p.life[0], p.life[1]))), age: 0,
        s0: p.scale?.[0] ?? 1, s1: p.scale?.[1] ?? (p.scale?.[0] ?? 1),
        fade: p.fade ?? 0.6,
        rot: p.spin ? this.r(0, Math.PI * 2) : 0, spin: p.spin ? this.r(-p.spin, p.spin) : 0,
      })
    }
  }

  private shotPos(s: Shot, f: number): XY {
    const t = Math.min(1, (f - s.start) / s.travel)
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0
    const len = Math.hypot(dx, dy) || 1
    const arc = Math.sin(Math.PI * t) * s.arc
    return [s.x0 + dx * t + (dy / len) * arc, s.y0 + dy * t - (dx / len) * arc]
  }

  /** 한 프레임 진행 */
  step(): void {
    const f = this.frame
    const pal = this.recipe.pal
    for (const s of this.recipe.steps) {
      if (s.kind === 'burst') {
        const dur = s.dur ?? 1
        const every = s.every ?? 1
        if (f >= s.at && f < s.at + dur && (f - s.at) % every === 0) this.spawn(s.p, this.anchor(s.anchor), pal)
      } else if (s.kind === 'shot') {
        for (let i = 0; i < s.count; i++) {
          if (f !== s.at + i * s.interval) continue
          const a = this.anchor(s.from), b = this.anchor(s.to)
          const j = s.jitter ?? 0
          this.shots.push({ x0: a[0], y0: a[1], x1: b[0] + this.r(-j, j), y1: b[1] + this.r(-j, j), start: f, travel: s.travel, arc: s.arc ?? 0, step: s })
        }
      } else if (s.kind === 'bolt' && f >= s.at && f < s.at + s.dur && (f - s.at) % 2 === 0) {
        const a = this.anchor(s.from), b = this.anchor(s.to)
        const n = 7
        this.boltPts = Array.from({ length: n + 1 }, (_, i) => {
          const t = i / n
          const off = i === 0 || i === n ? 0 : this.r(-10, 10)
          return [a[0] + (b[0] - a[0]) * t + off, a[1] + (b[1] - a[1]) * t] as XY
        })
      }
    }
    for (const s of [...this.shots]) {
      const pos = this.shotPos(s, f)
      if (s.step.trail) this.spawn(s.step.trail, pos, s.step.pal ?? pal)
      if (f - s.start >= s.travel) {
        this.shots.splice(this.shots.indexOf(s), 1)
        if (s.step.impact) this.spawn(s.step.impact, pos, s.step.pal ?? pal)
      }
    }
    for (const p of [...this.particles]) {
      p.vx *= p.drag; p.vy = p.vy * p.drag + p.gravity
      p.x += p.vx; p.y += p.vy
      p.rot += p.spin
      p.age++
      if (p.age >= p.life) this.particles.splice(this.particles.indexOf(p), 1)
    }
    this.frame++
  }

  /** 지금 프레임을 그릴 목록 (뒤 → 앞) */
  draws(): Draw[] {
    const f = this.frame
    const pal = this.recipe.pal
    const out: Draw[] = []
    const within = (s: { at: number; dur: number }) => f >= s.at && f < s.at + s.dur
    const k = (s: { at: number; dur: number }) => (f - s.at) / Math.max(1, s.dur)
    for (const s of this.recipe.steps) {
      if (s.kind === 'ring') {
        const n = s.count ?? 1
        for (let i = 0; i < n; i++) {
          const at = s.at + i * (s.interval ?? 0)
          const r = { at, dur: s.dur }
          if (!within(r)) continue
          const t = k(r)
          const [x, y] = this.anchor(s.anchor)
          // 크기가 그대로인 링(방어막)은 끝에서만 사라진다
          const alpha = s.r0 === s.r1 ? (t < 0.8 ? 1 : (1 - t) / 0.2) : 1 - t * 0.8
          out.push({ t: 'ring', x, y, r: s.r0 + (s.r1 - s.r0) * t, thick: s.thick, alpha, pal: s.pal ?? pal })
        }
      } else if (s.kind === 'beam' && within(s)) {
        const a = this.anchor(s.from), b = this.anchor(s.to)
        const grow = Math.min(1, (f - s.at + 1) / 3)
        const end: XY = [a[0] + (b[0] - a[0]) * grow, a[1] + (b[1] - a[1]) * grow]
        const wob = (f % 2) * 1
        const fadeOut = Math.min(1, (s.at + s.dur - f) / 3)
        out.push({ t: 'line', pts: [a, end], width: s.width + 2 + wob, shade: 0, alpha: fadeOut, pal })
        out.push({ t: 'line', pts: [a, end], width: s.width + wob, shade: 1, alpha: fadeOut, pal })
        out.push({ t: 'line', pts: [a, end], width: Math.max(1, s.width - 3), shade: 2, alpha: fadeOut, pal })
      } else if (s.kind === 'bolt' && within(s) && this.boltPts.length) {
        out.push({ t: 'line', pts: this.boltPts, width: 4, shade: 1, alpha: 1, pal })
        out.push({ t: 'line', pts: this.boltPts, width: 2, shade: 2, alpha: 1, pal })
      } else if (s.kind === 'slash' && within(s)) {
        const t = k(s)
        const [cx, cy] = this.anchor(s.anchor)
        for (let i = 0; i < s.count; i++) {
          const ang = ((s.angle + i * 25) * Math.PI) / 180
          const dx = Math.cos(ang) * s.len / 2, dy = Math.sin(ang) * s.len / 2
          const off = (i - (s.count - 1) / 2) * 7
          const grow = Math.min(1, t * 2)
          const a: XY = [cx - dx + off, cy - dy - off]
          const b: XY = [cx - dx + dx * 2 * grow + off, cy - dy + dy * 2 * grow - off]
          out.push({ t: 'line', pts: [a, b], width: 3, shade: 1, alpha: 1 - Math.max(0, t - 0.5) * 2, pal })
          out.push({ t: 'line', pts: [a, b], width: 1, shade: 2, alpha: 1 - Math.max(0, t - 0.5) * 2, pal })
        }
      } else if (s.kind === 'orbit' && within(s)) {
        const t = k(s)
        const [cx, cy0] = this.anchor(s.anchor)
        const cy = cy0 + (s.rise ?? 0) * t
        for (let i = 0; i < s.count; i++) {
          const a = (i / s.count + t * s.turns) * Math.PI * 2
          out.push({ t: 'tex', tex: s.tex, pal: s.pal ?? pal, x: cx + Math.cos(a) * s.radius, y: cy + Math.sin(a) * s.radius * 0.45, scale: 1, alpha: 1 - Math.max(0, t - 0.7) / 0.3, rot: 0 })
        }
      }
    }
    for (const p of this.particles) {
      const t = p.age / p.life
      out.push({ t: 'tex', tex: p.tex, pal: p.pal, x: p.x, y: p.y, scale: p.s0 + (p.s1 - p.s0) * t, alpha: t < p.fade ? 1 : 1 - (t - p.fade) / (1 - p.fade), rot: p.rot })
    }
    for (const s of this.shots) {
      const [x, y] = this.shotPos(s, f)
      out.push({ t: 'tex', tex: s.step.tex, pal: s.step.pal ?? pal, x, y, scale: s.step.scale ?? 1, alpha: 1, rot: s.step.spin ? f * s.step.spin : 0 })
    }
    return out
  }

  /** 스프라이트 움직임 (공격자·대상) */
  sprite(who: Who, attackerFront: boolean): SpriteFx {
    const f = this.frame
    const out: SpriteFx = { dx: 0, dy: 0, sx: 1, sy: 1, opacity: 1 }
    // 공격자가 위(상대)면 대상은 왼쪽 아래 → 돌진 방향
    const dirX = attackerFront ? -1 : 1, dirY = attackerFront ? 1 : -1
    for (const s of this.recipe.steps) {
      if (!('who' in s) || s.who !== who || f < s.at || f >= s.at + s.dur) continue
      const t = (f - s.at) / s.dur
      const amp = s.amp ?? 1
      switch (s.kind) {
        case 'lunge': { const e = Math.sin(Math.PI * t) * 14 * amp; out.dx += dirX * e; out.dy += dirY * e * 0.5; break }
        case 'hop': out.dy -= Math.sin(Math.PI * t) * 6; break
        case 'shake': out.dx += (f % 2 ? 1 : -1) * amp * (1 - t); break
        case 'blink': out.opacity = Math.floor(f / 2) % 2 ? 0.25 : 1; break
        case 'squash': { const e = Math.sin(Math.PI * 2 * t * 2) * amp; out.sx *= 1 + e; out.sy *= 1 - e; break }
      }
    }
    return out
  }

  /** 화면 효과 (번쩍임·색조·흔들림) */
  screen(): ScreenFx {
    const f = this.frame
    const out: ScreenFx = { flash: null, tint: null, quake: [0, 0] }
    for (const s of this.recipe.steps) {
      if (f < s.at || !('dur' in s) || f >= s.at + (s.dur ?? 0)) continue
      const t = (f - s.at) / (s.dur ?? 1)
      if (s.kind === 'flash') out.flash = { shade: s.color, alpha: s.alpha * (1 - t) }
      else if (s.kind === 'tint') out.tint = { shade: s.color, alpha: s.alpha * Math.min(1, (1 - t) * 4, t * 8) }
      else if (s.kind === 'quake') out.quake = [(f % 2 ? 1 : -1) * s.amp * (1 - t), ((f >> 1) % 2 ? 1 : -1) * s.amp * 0.5 * (1 - t)]
    }
    return out
  }
}
