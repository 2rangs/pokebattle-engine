// ─── 5세대풍 기술 연출 재생기 (Showdown 연출과 같은 자리·같은 인터페이스) ─────
// 저해상도 캔버스(가로 256px)에 30fps 로 그리고 CSS 로 도트 그대로 확대한다.
// 스프라이트 돌진·흔들림·깜빡임, 화면 번쩍임·색조·흔들림은 스타일로 직접 준다.
import { AIM } from '../ui/layout'
import { TEX, rgba, type Palette, type Rgb, type TexName } from './art'
import { recipeFor, type MoveInfo } from './recipes'
import { FxSim, type Draw, type ScreenFx } from './sim'

export interface PlayTargets {
  fx: HTMLElement
  bg: HTMLElement
  front: HTMLElement | null
  back: HTMLElement | null
  ground: HTMLElement[]
}

export interface PlayOptions {
  /** 이 시간(ms) 안에 끝나도록 빠르게 (느리게는 하지 않는다) */
  budget: number
  seed?: number
}

const LOW_W = 256
const FRAME_MS = 1000 / 30

const texCache = new Map<string, HTMLCanvasElement>()
function texImage(name: TexName, pal: Palette): HTMLCanvasElement {
  const key = `${name}|${pal.flat().join(',')}`
  const hit = texCache.get(key)
  if (hit) return hit
  const t = TEX[name]
  const c = document.createElement('canvas')
  c.width = t.w
  c.height = t.h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(t.w, t.h)
  for (let i = 0; i < t.px.length; i++) {
    const v = t.px[i]!
    if (!v) continue
    const col = pal[v - 1]!
    img.data.set([col[0], col[1], col[2], 255], i * 4)
  }
  ctx.putImageData(img, 0, 0)
  texCache.set(key, c)
  return c
}

/** 도트 선 (안티에일리어싱 없이 사각형으로) */
function pixelLine(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], w: number) {
  const half = Math.floor(w / 2)
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[i + 1]!
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n) - half, Math.round(y0 + ((y1 - y0) * k) / n) - half, w, w)
  }
}

function pixelRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, thick: number) {
  const n = Math.max(12, Math.ceil(r * 6))
  const ry = r * 0.55
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * ry), thick, thick)
  }
}

function draw(ctx: CanvasRenderingContext2D, list: Draw[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  for (const d of list) {
    ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha))
    if (d.t === 'tex') {
      const img = texImage(d.tex, d.pal)
      const s = Math.max(0.5, Math.round(d.scale * 2) / 2)
      const w = img.width * s, h = img.height * s
      if (d.rot) {
        ctx.save()
        ctx.translate(Math.round(d.x), Math.round(d.y))
        ctx.rotate(Math.round(d.rot / (Math.PI / 4)) * (Math.PI / 4))
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
        ctx.restore()
      } else ctx.drawImage(img, Math.round(d.x - w / 2), Math.round(d.y - h / 2), w, h)
    } else if (d.t === 'line') {
      ctx.fillStyle = rgba(d.pal[d.shade])
      pixelLine(ctx, d.pts, d.width)
    } else {
      ctx.fillStyle = rgba(d.pal[1])
      pixelRing(ctx, d.x, d.y, d.r, d.thick + 1)
      ctx.fillStyle = rgba(d.pal[2])
      pixelRing(ctx, d.x, d.y, d.r, d.thick)
    }
  }
  ctx.globalAlpha = 1
}

const shadeColor = (pal: Palette, s: NonNullable<ScreenFx['flash']>['shade']): Rgb =>
  s === 'white' ? [255, 255, 255] : s === 'black' ? [8, 8, 16] : pal[s === 'dark' ? 0 : s === 'mid' ? 1 : 2]

/**
 * 기술 연출 한 번. attackerFront: 공격하는 쪽이 위(상대) 진영인지. selfTarget: 자기 자신이 대상.
 * 반환: 중간에 멈추는 함수 (스타일을 원래대로 돌린다).
 */
export function playGen5MoveAnim(move: MoveInfo, attackerFront: boolean, selfTarget: boolean, t: PlayTargets, opts: PlayOptions): () => void {
  const recipe = recipeFor(move)
  const cw = t.fx.clientWidth || 640
  const ch = t.fx.clientHeight || 360
  const lowH = Math.round((LOW_W * ch) / cw)
  const px = (p: { x: number; y: number }) => [(p.x / 100) * LOW_W, (p.y / 100) * lowH] as const
  const att = px(attackerFront ? AIM.foe : AIM.ours)
  const def = selfTarget ? att : px(attackerFront ? AIM.ours : AIM.foe)
  const sim = new FxSim(recipe, { w: LOW_W, h: lowH, att, def }, opts.seed ?? (Date.now() & 0xffff))
  const scaleCss = cw / LOW_W

  const canvas = document.createElement('canvas')
  canvas.className = 'bd-g5fx'
  canvas.width = LOW_W
  canvas.height = lowH
  const ctx = canvas.getContext('2d')
  const flash = document.createElement('div')
  flash.className = 'bd-g5fx-flash'
  const tint = document.createElement('div')
  tint.className = 'bd-g5fx-tint'
  t.fx.append(canvas, flash)
  t.bg.append(tint)
  if (ctx) ctx.imageSmoothingEnabled = false

  const attEl = attackerFront ? t.front : t.back
  const defEl = selfTarget ? attEl : attackerFront ? t.back : t.front
  const moved = [...new Set([attEl, defEl, ...t.ground].filter((e): e is HTMLElement => !!e))]
  const saved = moved.map(el => ({ el, transform: el.style.transform, opacity: el.style.opacity }))

  const frameMs = Math.min(FRAME_MS, Math.max(4, opts.budget / Math.max(1, recipe.frames + 8)))
  const start = performance.now()
  let raf = 0
  let stopped = false

  const apply = () => {
    const sc = sim.screen()
    const [qx, qy] = sc.quake
    for (const g of t.ground) g.style.transform = qx || qy ? `translate(${qx * scaleCss}px, ${qy * scaleCss}px)` : ''
    // 자기 대상이면 공격자 한 마리에 두 쪽 움직임을 합친다
    const targets: [HTMLElement | null, ('att' | 'def')[]][] = selfTarget ? [[attEl, ['att', 'def']]] : [[attEl, ['att']], [defEl, ['def']]]
    for (const [el, whos] of targets) {
      if (!el) continue
      let dx = qx, dy = qy, sx = 1, sy = 1, op = 1
      for (const who of whos) {
        const s = sim.sprite(who, attackerFront)
        dx += s.dx; dy += s.dy; sx *= s.sx; sy *= s.sy; op = Math.min(op, s.opacity)
      }
      el.style.transform = `translate(${dx * scaleCss}px, ${dy * scaleCss}px) scale(${sx}, ${sy})`
      el.style.opacity = String(op)
    }
    flash.style.background = sc.flash ? rgba(shadeColor(recipe.pal, sc.flash.shade), sc.flash.alpha) : 'transparent'
    tint.style.background = sc.tint ? rgba(shadeColor(recipe.pal, sc.tint.shade), sc.tint.alpha) : 'transparent'
    if (ctx) draw(ctx, sim.draws())
  }

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    canvas.remove()
    flash.remove()
    tint.remove()
    for (const s of saved) { s.el.style.transform = s.transform; s.el.style.opacity = s.opacity }
  }

  const tick = (now: number) => {
    if (stopped) return
    const want = Math.floor((now - start) / frameMs)
    let changed = false
    while (sim.frame < want && sim.frame < sim.maxFrames && !sim.done) { sim.step(); changed = true }
    if (changed) apply()
    if (sim.done || sim.frame >= sim.maxFrames) { stop(); return }
    raf = requestAnimationFrame(tick)
  }
  apply()
  raf = requestAnimationFrame(tick)
  return stop
}
