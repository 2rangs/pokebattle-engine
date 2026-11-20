// ─── 텍스처 아틀라스 (Phaser json + png) 받기·그리기 도우미 ─────────
// AtlasSprite(ui) 가 쓰고, 미리 받기·실루엣 마스크에서도 쓴다.

/** PokéRogue 는 포켓몬 스프라이트 애니메이션을 초당 10프레임으로 돌린다 */
export const ATLAS_FPS = 10

export interface Rect { x: number; y: number; w: number; h: number }
export interface AtlasFrame { filename: string; frame: Rect; spriteSourceSize: Rect; sourceSize: { w: number; h: number } }
export interface Atlas {
  img: HTMLImageElement
  frames: { sx: number; sy: number; w: number; h: number; dx: number; dy: number }[]
  /** 한 프레임의 원래 크기 (sourceSize) */
  w: number
  h: number
}

/** Phaser 멀티 아틀라스(textures[]), TexturePacker/Aseprite 배열(frames[]) 또는 해시(frames{이름: …}) */
type AtlasJson = { textures?: { frames: AtlasFrame[] }[]; frames?: AtlasFrame[] | Record<string, Omit<AtlasFrame, 'filename'>> }

/** 프레임 목록 (파일 이름 순 = 재생 순서) */
export function atlasFrames(data: AtlasJson): AtlasFrame[] {
  const f = data.textures?.[0]?.frames ?? data.frames ?? []
  const list = Array.isArray(f) ? [...f] : Object.entries(f).map(([filename, v]) => ({ ...v, filename }))
  return list.sort((a, b) => a.filename.localeCompare(b.filename))
}

const cache = new Map<string, Promise<Atlas>>()

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // raw.githubusercontent 는 CORS 허용 → 캔버스가 오염되지 않아 실루엣 마스크 등에 다시 쓸 수 있다
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`atlas image ${src}`))
    img.src = src
  })
}

/** 아틀라스 받기 (같은 URL 은 한 번만). 실패하면 캐시에서 빼서 다음에 다시 시도할 수 있게 */
export function loadAtlas(json: string, png: string): Promise<Atlas> {
  const hit = cache.get(json)
  if (hit) return hit
  const p = Promise.all([
    fetch(json).then(r => {
      if (!r.ok) throw new Error(`atlas json ${r.status}`)
      return r.json() as Promise<AtlasJson>
    }),
    loadImage(png),
  ]).then(([data, img]) => {
    const raw = atlasFrames(data)
    if (!raw.length) throw new Error('atlas has no frames')
    const { w, h } = raw[0].sourceSize
    return {
      img, w, h,
      frames: raw.map(f => ({ sx: f.frame.x, sy: f.frame.y, w: f.frame.w, h: f.frame.h, dx: f.spriteSourceSize.x, dy: f.spriteSourceSize.y })),
    }
  })
  p.catch(() => cache.delete(json))
  cache.set(json, p)
  return p
}

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 프레임을 그릴 때마다 캔버스에서 `atlasframe` 이벤트가 난다 (버블링 없음).
 * 실루엣 연출 등은 이 이벤트를 받아 `drawSilhouette` 로 같은 프레임을 다른 캔버스에 칠하면 된다.
 */
export const ATLAS_FRAME_EVENT = 'atlasframe'

/** source 캔버스의 지금 프레임 모양 그대로 color 로 칠한다 (능력치 변화 빛 등 마스크용) */
export function drawSilhouette(target: HTMLCanvasElement, source: HTMLCanvasElement, color: string) {
  if (target.width !== source.width) target.width = source.width
  if (target.height !== source.height) target.height = source.height
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.globalCompositeOperation = 'copy'
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.globalCompositeOperation = 'source-over'
}

const firstFrames = new WeakMap<Atlas, string>()
/**
 * 첫 프레임 그림의 data URL (아틀라스마다 한 번). 시트 전체가 아니라 한 프레임이라
 * 능력치 변화 무늬의 CSS mask(`url(...)`) 등에 그대로 쓸 수 있다.
 */
export function firstFrameUrl(a: Atlas): string {
  const hit = firstFrames.get(a)
  if (hit) return hit
  const cv = document.createElement('canvas')
  cv.width = a.w
  cv.height = a.h
  const f = a.frames[0]
  cv.getContext('2d')?.drawImage(a.img, f.sx, f.sy, f.w, f.h, f.dx, f.dy, f.w, f.h)
  let url = a.img.src
  try { url = cv.toDataURL() } catch { /* CORS 로 오염되면 시트 URL */ }
  firstFrames.set(a, url)
  return url
}
