// ─── 작은 공용 조각: 대체 이미지, 타입 배지, 상태이상 배지, HP 막대 ─────
import { useState, type CSSProperties } from 'react'
import { hpTone, pctOf, ratioOf } from '../lib/hud'
import { statusShort, typeName } from '../lib/names'
import { statusTip, toxicNext } from '../lib/status'
import { TYPE_COLOR, typeIconUrl } from '../lib/sprites'
import type { Lang } from '../lib/messages'

/** 후보 URL 을 앞에서부터 시도하는 이미지 (실패하면 다음, 다 실패하면 fallback) */
export function FallbackImg({ sources, alt, className, style, fallback = null, pixel = true, onLoad }: {
  sources: string[]
  alt: string
  className?: string
  style?: CSSProperties
  fallback?: React.ReactNode
  pixel?: boolean
  onLoad?: (img: HTMLImageElement) => void
}) {
  const key = sources.join('|')
  const [st, setSt] = useState({ key, i: 0 })
  const i = st.key === key ? st.i : 0
  const src = sources[i]
  if (!src) return <>{fallback}</>
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={`${className ?? ''}${pixel && !src.includes('official-artwork') && !src.includes('/other/home/') ? ' is-pixel' : ''}`}
      style={style}
      decoding="async"
      draggable={false}
      onLoad={e => onLoad?.(e.currentTarget)}
      onError={() => setSt({ key, i: i + 1 })}
    />
  )
}

/** 타입 배지: SV 아이콘 문양 + 현재 언어 이름, 게임 타입 색 */
export function TypeBadge({ type, lang, size = 'md' }: { type: string; lang: Lang; size?: 'sm' | 'md' }) {
  const icon = typeIconUrl(type)
  return (
    <span className={`bd-type is-${size}`} style={{ '--type': TYPE_COLOR[type] ?? '#888' } as CSSProperties}>
      {icon && <span className="bd-type-icon" style={{ backgroundImage: `url(${icon})` }} aria-hidden />}
      <span>{typeName(type, lang)}</span>
    </span>
  )
}

/** 타입 문양만 (기술 버튼 모서리 등) */
export function TypeGlyph({ type }: { type: string }) {
  const icon = typeIconUrl(type)
  return icon ? <span className="bd-type-glyph" style={{ backgroundImage: `url(${icon})` }} aria-hidden /> : null
}

/** 게임식 상태이상 배지 (마비/화상/독/맹독/잠듦/얼음, 게임 색) + 맹독·잠듦 카운터 */
export function StatusBadge({ status, turns, lang }: { status: string; turns?: number | null; lang: Lang }) {
  const tip = statusTip(status, turns, lang)
  const counter = status === 'toxic' && turns !== undefined && turns !== null ? `${toxicNext(turns)}/16`
    : status === 'sleep' && turns ? String(turns) : null
  return (
    <span className={`bd-status is-${status}`} title={tip} aria-label={tip} tabIndex={0}>
      {statusShort(status, lang)}
      {counter && <small aria-hidden>{counter}</small>}
    </span>
  )
}

/** HP 막대: "HP" 태그 + 초록→노랑→빨강, 너비 전환으로 부드럽게 줄어든다 */
export function HpBar({ p, label }: { p: { hp: number; max_hp: number }; label: string }) {
  const ratio = ratioOf(p)
  return (
    <span className="bd-hp" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pctOf(p)}>
      <span className="bd-hp-tag" aria-hidden>HP</span>
      <span className="bd-hp-track">
        <span className={`bd-hp-fill is-${hpTone(ratio)}`} style={{ width: `${ratio * 100}%` }} />
      </span>
    </span>
  )
}

export function Gender({ g }: { g: 'M' | 'F' | null }) {
  if (g === 'M') return <span className="bd-gender is-m" aria-label="♂">♂</span>
  if (g === 'F') return <span className="bd-gender is-f" aria-label="♀">♀</span>
  return null
}
