// ─── 작은 공용 조각: 대체 이미지, 타입 배지, 상태이상 배지, HP 막대 ─────
import { useState, type CSSProperties } from 'react'
import { hpTone, pctOf, ratioOf } from '../lib/hud'
import { statusShort, typeName } from '../lib/names'
import { statusTip, toxicNext } from '../lib/status'
import { TYPE_COLOR } from '../lib/sprites'
import { CAT_KEY, CATEGORY_INDEX, CATEGORY_SHEET, typeInk } from '../lib/typeStyle'
import { msg, type Lang } from '../lib/messages'

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

/**
 * 타입 배지: 공식 타입 색 알약 + 현재 언어 이름 (글자만, 아이콘 없음).
 * 글자색은 명도 대비로 (밝은 타입은 어두운 글자, 중간 밝기는 흰 글자 + 외곽선).
 * tera = 테라스탈 표시 (반짝이는 테두리). iconOnly 는 예전 호환용 — 이제 글자를 그대로 보인다.
 */
export function TypeBadge({ type, lang, size = 'md', tera = false, iconOnly = false, text }: {
  type: string; lang: Lang; size?: 'xs' | 'sm' | 'md'; tera?: boolean; iconOnly?: boolean
  /** 타입 이름 대신 쓸 글자 (팀 카드의 기술 칩: 기술 이름) */
  text?: string
}) {
  const { ink, outline } = typeInk(type)
  const name = typeName(type, lang)
  const label = text ? `${text} (${name})` : tera ? `${msg(lang, 'tera')} ${name}` : name
  return (
    <span
      className={`bd-type is-${size}${outline ? ' is-outline' : ''}${tera ? ' is-tera' : ''}`}
      style={{ '--type': TYPE_COLOR[type] ?? '#888', '--ink': ink } as CSSProperties}
      title={label}
      data-compact={iconOnly || undefined}
    >
      <span className="bd-type-name">{tera && <span className="bd-sr">{msg(lang, 'tera')} </span>}{text ?? name}</span>
    </span>
  )
}

/** 기술 분류 아이콘 (물리·특수·변화, PokéRogue categories.png 도트) */
export function CategoryIcon({ category, lang }: { category: string; lang: Lang }) {
  const i = CATEGORY_INDEX[category] ?? 2
  const label = msg(lang, CAT_KEY[category] ?? 'catStatus')
  return (
    <span
      className="bd-cat-icon is-pixel"
      role="img"
      aria-label={label}
      title={label}
      style={{ backgroundImage: `url(${CATEGORY_SHEET})`, backgroundPosition: `${i * 50}% 0` }}
    />
  )
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
