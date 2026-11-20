// ─── Showdown 무대 좌표 ↔ 우리 장면 (이 저장소 코드, MIT) ─────
// 기술 애니메이션(./scene.ts, 따로 받는 청크)과 장면에 남는 효과(../ui/SceneEffects.tsx, 본 번들)가 함께 쓴다.
// 그래서 큰 애니메이션 표를 가져오지 않는 작은 파일로 둔다.
import type { ScenePos, SpriteData } from './types'

export type Box = { left: number; top: number; width: number; height: number; opacity: number }

/** Showdown 무대 좌표 → 640×360 무대 위 상자 (원본 BattleScene.pos 와 같은 식) */
export function psBox(loc: ScenePos, obj: SpriteData): Box {
  const l = { x: 0, y: 0, z: 0, scale: 1, opacity: 1, ...loc }
  const xs = !l.xscale && l.xscale !== 0 ? l.scale! : l.xscale
  const ys = !l.yscale && l.yscale !== 0 ? l.scale! : l.yscale
  let scale = obj.gen === 5 ? 2 - l.z! / 200 : 1.5 - 0.5 * (l.z! / 200)
  if (scale < 0.1) scale = 0.1
  let left = 210 + 220 * (l.z! / 200)
  let top = 245 - 110 * (l.z! / 200)
  left += Math.floor(l.x! * scale)
  top -= Math.floor(l.y! * scale)
  const width = Math.floor(obj.w * scale * xs)
  const height = Math.floor(obj.h * scale * ys)
  const hoffset = Math.floor((obj.h - (obj.y || 0) * 2) * scale * ys)
  return { left: left - Math.floor(width / 2), top: top - Math.floor(hoffset / 2), width, height, opacity: l.opacity! }
}

// Showdown 의 스프라이트 가운데(뒤 z=0 → (210, 245), 앞 z=200 → (430, 135))를
// 우리 장면의 AIM(우리 27%·68%, 상대 72%·40%)에 맞추는 아핀 변환. 크기는 장면 폭/640.
/** 무대 x(px) → 장면 폭 대비 비율 */
export const psFracX = (px: number) => 0.27 + (px - 210) * (0.45 / 220)
/** 무대 y(px) → 장면 높이 대비 비율 */
export const psFracY = (py: number) => 0.68 + (py - 245) * (0.28 / 110)

/** 상자 → 장면 안 CSS 위치 (가운데 기준 %, 크기는 장면 폭 기준 cqw: .bd-scene 이 inline-size 컨테이너) */
export function psPlaceCss(b: Box, dy = 0): { left: string; top: string; width: string; height: string } {
  return {
    left: `${(psFracX(b.left + b.width / 2) * 100).toFixed(2)}%`,
    top: `${((psFracY(b.top + b.height / 2) + dy) * 100).toFixed(2)}%`,
    width: `${(b.width / 6.4).toFixed(2)}cqw`,
    height: `${(b.height / 6.4).toFixed(2)}cqw`,
  }
}
