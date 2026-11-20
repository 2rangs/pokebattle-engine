// ─── 2D 배틀 스프라이트: PokéRogue 애니메이션 아틀라스 → (실패 시) 기존 후보 그림 ─────
import { useState, type CSSProperties } from 'react'
import type { AtlasUrls } from '../lib/pokerogue'
import { AtlasSprite } from './AtlasSprite'
import { FallbackImg } from './bits'

export function PokeRogueSprite({ atlas, sources, alt, className, style, onLoad }: {
  /** null 이면 바로 sources (3D 모드 등) */
  atlas: AtlasUrls | null
  sources: string[]
  alt: string
  className?: string
  style?: CSSProperties
  onLoad?: (img: { src: string; naturalWidth: number; naturalHeight: number }) => void
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (atlas && failed !== atlas.json) {
    return <AtlasSprite key={atlas.json} json={atlas.json} png={atlas.png} alt={alt} className={className} style={style} onLoad={onLoad} onError={() => setFailed(atlas.json)} />
  }
  return <FallbackImg sources={sources} alt={alt} className={className} style={style} onLoad={onLoad} />
}
