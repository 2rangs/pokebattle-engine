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
    return <AtlasSprite key={atlas.json} json={atlas.json} png={atlas.png} alt={alt} className={className} style={style} onLoad={onLoad} onError={() => setFailed(atlas.json)} onFrame={syncStatMask} />
  }
  return <FallbackImg sources={sources} alt={alt} className={className} style={style} onLoad={onLoad} />
}

/**
 * 능력치 변화 무늬(.bd-statfx, 같은 부모)는 스프라이트 그림을 CSS mask 로 쓴다.
 * 처음엔 onLoad 의 첫 프레임 data URL, 연출 중에는 지금 프레임으로 바꿔 실루엣이 움직임을 따라간다
 * (연출이 있을 때만 → 평소에는 toDataURL 없음).
 */
function syncStatMask(cv: HTMLCanvasElement) {
  const fx = cv.parentElement?.querySelector<HTMLElement>(':scope > .bd-statfx')
  if (!fx) return
  try { fx.style.setProperty('--mask', `url("${cv.toDataURL()}")`) } catch { /* 오염된 캔버스 */ }
}
