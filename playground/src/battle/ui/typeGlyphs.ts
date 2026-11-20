// ─── 타입 문양 (흰 실루엣): PokeAPI 의 SV 타입 아이콘에서 문양만 떼어 낸다 ─────
// sprites/types/generation-ix/scarlet-violet/{id}.png 는 200×40 라벨(왼쪽 40×40 원 = 타입 색 바탕 + 흰 문양, 오른쪽 = 영어 글자).
// 원 부분을 캔버스로 읽어 "바탕색 → 문양색" 거리를 알파로 바꾼 흰 그림(data URL)을 만들고,
// 배지에서는 CSS mask 로 써서 글자색(흰색/어두운색)과 같은 색으로 칠한다. raw.githubusercontent.com 은 CORS 허용.
import { useEffect, useSyncExternalStore } from 'react'
import { typeIconUrl } from '../lib/sprites'
import { extractGlyph } from '../lib/typeStyle'

const glyphs = new Map<string, string | null>()
const listeners = new Set<() => void>()

function load(type: string) {
  if (glyphs.has(type) || typeof document === 'undefined') return
  const url = typeIconUrl(type)
  glyphs.set(type, null)
  if (!url) return
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.onload = () => {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 40
      const g = c.getContext('2d')
      if (!g) return
      g.drawImage(img, 0, 0, 40, 40, 0, 0, 40, 40)
      const data = g.getImageData(0, 0, 40, 40)
      data.data.set(extractGlyph(data.data))
      g.putImageData(data, 0, 0)
      glyphs.set(type, c.toDataURL())
      listeners.forEach(f => f())
    } catch { /* 캔버스를 못 쓰면 문양 없이 글자만 */ }
  }
  img.src = url
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

/** 타입 문양 data URL (받는 중·실패면 null) */
export function useTypeGlyph(type: string): string | null {
  useEffect(() => load(type), [type])
  return useSyncExternalStore(subscribe, () => glyphs.get(type) ?? null, () => null)
}
