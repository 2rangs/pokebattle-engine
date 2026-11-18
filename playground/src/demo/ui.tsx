// ─── 데모 공용 UI 조각 (Pokestra components/ui 에서 데모에 필요한 것만) ─────
import { useState } from 'react'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack } from '@astryxdesign/core/HStack'
import { Text } from '@astryxdesign/core/Text'
import { useLang } from './lang'
import { cx } from './cx'
import { artworkUrl, spriteUrl, TYPE_COLOR, typeName } from './names'


const KNOWN_TYPE_ICONS = new Set([
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
])

function TypeIconDot({ type, className }: { type: string; className: string }) {
  if (!KNOWN_TYPE_ICONS.has(type)) {
    return <span aria-hidden className={cx('inline-block shrink-0 rounded-full', className)} style={{ background: TYPE_COLOR[type] ?? '#8a93b3' }} />
  }
  return <img src={`${import.meta.env.BASE_URL}assets/types/${type}.svg`} alt="" aria-hidden className={cx('shrink-0', className)} width={16} height={16} />
}

/** 타입 표시: 아이콘 + 현재 언어의 이름 */
export function TypeBadge({ type, size = 'sm', className, title }: {
  type: string
  size?: 'xs' | 'sm'
  className?: string
  title?: string
}) {
  const lang = useLang()
  const s = {
    xs: { box: 'gap-1 px-1.5 py-px text-[11px]', icon: 'h-3 w-3' },
    sm: { box: 'gap-1 px-2 py-0.5 text-xs', icon: 'h-3.5 w-3.5' },
  }[size]
  return (
    <span
      title={title}
      className={cx('inline-flex shrink-0 items-center rounded-full border border-border bg-surface font-medium whitespace-nowrap text-primary', s.box, className)}
    >
      <TypeIconDot type={type} className={s.icon} />
      {typeName(type, lang)}
    </span>
  )
}

/** 작은 포켓몬 그림: 도트 → 공식 일러스트 → 빈칸 */
export function PokeIcon({ id, size, className }: { id: number | undefined; size: number; className?: string }) {
  const sources = id ? [spriteUrl(id), artworkUrl(id)] : []
  const key = sources.join('|')
  const [state, setState] = useState({ key, i: 0 })
  const i = state.key === key ? state.i : 0
  const src = sources[i]
  if (!src) return <span aria-hidden className={className} style={{ width: size, height: size }} />
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setState({ key, i: i + 1 })}
      className={cx('object-contain', i === 0 && 'pixelated', className)}
    />
  )
}

/** 불러오는 중 */
export function Loading({ label }: { label: string }) {
  return (
    <HStack role="status" gap={2} vAlign="center" hAlign="center" className="min-h-60">
      <Spinner size="sm" aria-label={label} />
      <Text color="secondary">{label}</Text>
    </HStack>
  )
}
