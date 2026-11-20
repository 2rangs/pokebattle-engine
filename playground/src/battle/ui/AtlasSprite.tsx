// ─── 텍스처 아틀라스 애니메이션 스프라이트 (PokéRogue 도트, <canvas>) ─────────
// Phaser 아틀라스(json + png)를 한 번만 받아(URL 별 캐시) 프레임을 일정한 속도로 그린다.
// 캔버스 크기 = sourceSize, 잘린 프레임은 spriteSourceSize 위치에 → 프레임마다 흔들리지 않고 아래가 맞는다.
// 화면 밖·탭 숨김이면 멈추고, 움직임 줄이기면 첫 프레임만.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { ATLAS_FPS, ATLAS_FRAME_EVENT, firstFrameUrl, loadAtlas, reducedMotion, type Atlas } from '../lib/atlas'

export interface AtlasSpriteProps {
  json: string
  png: string
  alt: string
  className?: string
  style?: CSSProperties
  fps?: number
  /** 첫 프레임을 그린 뒤: 원래 크기 (FallbackImg 의 onLoad 와 같은 모양). src 는 첫 프레임 data URL (mask 용) */
  onLoad?: (img: { src: string; naturalWidth: number; naturalHeight: number }) => void
  onError?: () => void
  /** 프레임을 그릴 때마다 */
  onFrame?: (canvas: HTMLCanvasElement) => void
}

export function AtlasSprite({ json, png, alt, className, style, fps = ATLAS_FPS, onLoad, onError, onFrame }: AtlasSpriteProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [atlas, setAtlas] = useState<{ key: string; a: Atlas } | null>(null)
  const cb = useRef({ onLoad, onError, onFrame })
  useLayoutEffect(() => {
    cb.current = { onLoad, onError, onFrame }
  })

  useEffect(() => {
    let live = true
    loadAtlas(json, png).then(
      a => live && setAtlas({ key: json, a }),
      () => live && cb.current.onError?.(),
    )
    return () => { live = false }
  }, [json, png])

  const a = atlas?.key === json ? atlas.a : null
  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx || !a) return
    cv.width = a.w
    cv.height = a.h
    ctx.imageSmoothingEnabled = false
    let i = 0
    const draw = () => {
      const f = a.frames[i]
      ctx.clearRect(0, 0, a.w, a.h)
      ctx.drawImage(a.img, f.sx, f.sy, f.w, f.h, f.dx, f.dy, f.w, f.h)
      cv.dispatchEvent(new Event(ATLAS_FRAME_EVENT))
      cb.current.onFrame?.(cv)
    }
    draw()
    cb.current.onLoad?.({ src: firstFrameUrl(a), naturalWidth: a.w, naturalHeight: a.h })
    if (a.frames.length < 2 || reducedMotion()) return

    let visible = true
    let raf = 0
    let last = 0
    const step = 1000 / fps
    const tick = (t: number) => {
      raf = 0
      if (!last) last = t
      // 밀린 프레임은 건너뛰되 (탭 전환 뒤 등) 한 번에 많이 따라잡지 않는다
      const n = Math.floor((t - last) / step)
      if (n > 0) {
        last = n > 5 ? t : last + n * step
        i = (i + n) % a.frames.length
        draw()
      }
      schedule()
    }
    const schedule = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      last = 0
    }
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => {
        visible = e.isIntersecting
        if (visible) schedule()
        else stop()
      })
      : null
    io?.observe(cv)
    const onVis = () => (document.hidden ? stop() : schedule())
    document.addEventListener('visibilitychange', onVis)
    schedule()
    return () => {
      stop()
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [a, fps, png])

  return (
    <canvas
      ref={ref}
      width={0}
      height={0}
      role="img"
      aria-label={alt}
      data-sprite-src={png}
      className={`${className ?? ''} is-pixel bd-atlas${a && a.frames.length < 2 ? ' is-still' : ''}`}
      style={style}
    />
  )
}
