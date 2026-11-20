// 능력치 변화 무늬 (PokéRogue battle_stats.png) — 불러오기·자르기는 ./statTiles.ts
import type { CSSProperties } from 'react'
import { STAT_PASS_MS, statFxDuration, useStatTiles, type StatTile } from './statTiles'

/** 스프라이트 그림 위에 겹치는 무늬 (같은 크기·위치, 실루엣 = 그 그림의 mask) */
export function StatFx({ stages, tile, src, tilePx, mirrored }: { stages: number; tile: StatTile; src: string; tilePx: number; mirrored: boolean }) {
  const map = useStatTiles()
  const up = stages > 0
  const url = map?.get(`${tile}:${up ? 'up' : 'down'}`)
  const n = Math.min(3, Math.abs(stages))
  const style = {
    '--tile': url ? `url("${url}")` : 'none',
    '--mask': `url("${src}")`,
    '--ts': `${tilePx}px`,
    '--n': n,
    '--pass': `${STAT_PASS_MS}ms`,
    '--dur': `${statFxDuration(stages)}ms`,
  } as CSSProperties
  return <span className={`bd-statfx is-${up ? 'up' : 'down'}${mirrored ? ' is-mirrored' : ''}`} data-tile={tile} data-stages={stages} style={style} aria-hidden />
}
