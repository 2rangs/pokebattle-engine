// ─── 배틀·리플레이 화면 공용 조각: 툴바 버튼, 속도, 크레딧 ─────
import type { ReactNode } from 'react'
import { SPEEDS } from '../lib/hud'
import { updateSettings, useBT, useSettings } from './state'

export function ToolButton({ children, onClick, pressed, label, href }: { children: ReactNode; onClick?: () => void; pressed?: boolean; label?: string; href?: string }) {
  if (href) return <a className="bd-tool" href={href} aria-label={label}>{children}</a>
  return (
    <button type="button" className={`bd-tool${pressed ? ' is-on' : ''}`} onClick={onClick} aria-pressed={pressed} aria-label={label} title={label}>
      {children}
    </button>
  )
}

export function SpeedSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useBT()
  return (
    <label className="bd-tool bd-speed">
      <span className="bd-sr">{t('speed')}</span>
      <select value={value} onChange={e => onChange(Number(e.target.value))} aria-label={t('speed')}>
        {SPEEDS.map(s => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
      </select>
    </label>
  )
}

/** 스프라이트 2D / 3D (설정에 저장, 배틀 중에도 바로 바뀐다) */
export function SpriteToggle() {
  const { t } = useBT()
  const { sprites } = useSettings()
  return (
    <span className="bd-seg" role="group" aria-label={t('sprites')}>
      <span className="bd-seg-label" aria-hidden>{t('sprites')}</span>
      {(['2d', '3d'] as const).map(v => (
        <button key={v} type="button" aria-pressed={sprites === v} title={t(v === '3d' ? 'spritesDesc3d' : 'spritesDesc2d')} onClick={() => updateSettings({ sprites: v })}>
          {t(v === '3d' ? 'sprites3d' : 'sprites2d')}
        </button>
      ))}
    </span>
  )
}

export function Credits() {
  const { t } = useBT()
  return (
    <details className="bd-credits">
      <summary>{t('moreCredits')}</summary>
      {t('credits')}{' '}
      <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">PokeAPI/sprites</a>{' · '}
      <a href="https://github.com/PokeAPI/sprites/tree/master/sprites/pokemon/other/home" target="_blank" rel="noreferrer">Pokémon HOME renders</a>{' · '}
      <a href="https://github.com/PokeAPI/cries" target="_blank" rel="noreferrer">PokeAPI/cries</a>{' · '}
      <a href="https://github.com/smogon/pokemon-showdown-client" target="_blank" rel="noreferrer">pokemon-showdown-client</a>{' · '}
      <a href="https://github.com/pagefaultgames/pokerogue-assets" target="_blank" rel="noreferrer">pokerogue-assets</a>
    </details>
  )
}
