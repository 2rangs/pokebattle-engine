// ─── 능력치 변화 연출: PokéRogue 의 battle_stats.png (CC BY-NC-SA 4.0) ─────
// 32×256 = 32×32 무늬 8장 (순서는 같은 폴더 battle_stats.json: mix, acc, atk, def, eva, spatk, spd, spdef).
// 게임처럼 그 능력치 무늬를 포켓몬 실루엣 위에 깔고 상승은 위로(빨강), 하락은 아래로(파랑, 무늬 상하 반전) 흘린다.
// 시트를 한 번 받아 캔버스로 잘라 data URL 로 둔다 (raw.githubusercontent.com 은 CORS 허용).
import { useEffect, useState } from 'react'

const SHEET = 'https://raw.githubusercontent.com/pagefaultgames/pokerogue-assets/beta/images/effects/battle_stats.png'
const ORDER = ['mix', 'acc', 'atk', 'def', 'eva', 'spatk', 'spd', 'spdef'] as const
export type StatTile = (typeof ORDER)[number]

/** 엔진 능력치 키 → 무늬 이름 */
const TILE_OF: Record<string, StatTile> = {
  attack: 'atk', defense: 'def', special_attack: 'spatk', special_defense: 'spdef', speed: 'spd', accuracy: 'acc', evasion: 'eva',
}
export const statTileOf = (stat: string): StatTile => TILE_OF[stat] ?? 'mix'

/** 게임처럼 색은 둘뿐: 상승 = 빨강, 하락 = 파랑. 무늬의 밝기만 살려 다시 칠한다 */
const RAMP = { up: [[150, 16, 16], [255, 150, 130]], down: [[16, 40, 170], [150, 195, 255]] } as const
function recolor(g: CanvasRenderingContext2D, down: boolean) {
  const img = g.getImageData(0, 0, 32, 32)
  const [lo, hi] = RAMP[down ? 'down' : 'up']
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const k = Math.min(1, (0.3 * d[i]! + 0.59 * d[i + 1]! + 0.11 * d[i + 2]!) / 200)
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(lo[c]! + (hi[c]! - lo[c]!) * k)
  }
  g.putImageData(img, 0, 0)
}

let tiles: Promise<Map<string, string> | null> | null = null
let ready: Map<string, string> | null = null

/** 무늬를 미리 잘라 둔다 (장면이 처음 뜰 때 한 번) */
export function loadStatTiles(): Promise<Map<string, string> | null> {
  if (tiles) return tiles
  tiles = new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const out = new Map<string, string>()
        const c = document.createElement('canvas')
        c.width = c.height = 32
        const g = c.getContext('2d')
        if (!g) return resolve(null)
        g.imageSmoothingEnabled = false
        ORDER.forEach((name, i) => {
          for (const down of [false, true]) {
            g.setTransform(1, 0, 0, down ? -1 : 1, 0, down ? 32 : 0)
            g.clearRect(0, 0, 32, 32)
            g.drawImage(img, 0, i * 32, 32, 32, 0, 0, 32, 32)
            recolor(g, down)
            out.set(`${name}:${down ? 'down' : 'up'}`, c.toDataURL())
          }
        })
        ready = out
        resolve(out)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = SHEET
  })
  return tiles
}

export function useStatTiles(): Map<string, string> | null {
  const [m, setM] = useState(ready)
  useEffect(() => {
    if (m) return
    let alive = true
    loadStatTiles().then(r => { if (alive) setM(r) })
    return () => { alive = false }
  }, [m])
  return m
}

/** 한 번 흐르는 시간 (ms). ±2 는 2번, ±3 이상은 3번 */
export const STAT_PASS_MS = 800
export const statFxDuration = (stages: number) => STAT_PASS_MS * Math.min(3, Math.max(1, Math.abs(stages)))

