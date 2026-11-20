// ─── 옆 패널: 필드 줄(남은 턴) · 현황 · 턴별 배틀 로그 (Pokestra 의 정보 패널) ─────
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerID } from '../lib/engine'
import type { Frame } from '../lib/frame'
import { calledMoveIndexes, fieldItems, groupLogByTurn, logTone, type FieldItem } from '../lib/hud'
import { frameText } from '../lib/frames'
import { effectName, weatherName } from '../lib/names'
import { formatBattleSummary, summarizeBattle } from '../lib/summary'
import { useBT } from './state'

export function FieldBar({ frame, me = 'p1', sideName }: { frame: Frame; me?: PlayerID; sideName?: (p: PlayerID) => string }) {
  const { t, lang } = useBT()
  const items = fieldItems(frame, me)
  const label = (it: FieldItem) => {
    const name = it.kind === 'weather' ? weatherName(it.id, lang) : effectName(it.id, lang)
    const who = it.kind === 'side' ? (sideName ? sideName(it.side!) : t(it.side === me ? 'sumSideOurs' : 'sumSideFoe')) : null
    return [who, it.layers > 1 ? `${name} ×${it.layers}` : name].filter(Boolean).join(' · ')
  }
  return (
    <div className="bd-fieldbar" aria-label={t('field')}>
      <span className="bd-turn">{t('turn', { n: frame.turn })}</span>
      {items.length === 0 && <span className="bd-field-none">{t('noField')}</span>}
      {items.map(it => (
        <span key={it.key} className={`bd-field-chip is-${it.kind}${it.side ? ` is-${it.side === me ? 'ours' : 'foe'}` : ''}`}>
          {label(it)}
          {it.turns !== null && <small title={t('turnsLeft', { n: it.turns })}>{it.turns}</small>}
        </span>
      ))}
    </div>
  )
}

export function SummaryPanel({ frame, me = 'p1', hideFoe, sideName }: { frame: Frame; me?: PlayerID; hideFoe: boolean; sideName?: (p: PlayerID) => string }) {
  const { t, lang } = useBT()
  const [copied, setCopied] = useState(false)
  const text = useMemo(
    () => formatBattleSummary(summarizeBattle(frame, { perspective: me, hideFoeExact: hideFoe }), lang, { sideName }),
    [frame, me, hideFoe, lang, sideName],
  )
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }, () => {})
  }
  return (
    <details className="bd-panel">
      <summary>{t('summaryTitle')}</summary>
      <pre className="bd-summary">{text}</pre>
      <button type="button" className="bd-btn is-small" onClick={copy}>{copied ? t('summaryCopied') : t('summaryCopy')}</button>
    </details>
  )
}

export function BattleLog({ frames, revealed, sideName, defaultOpen = true }: {
  frames: readonly Frame[]
  revealed: number
  sideName?: (p: PlayerID) => string
  /** 접힌 상태로 시작 (휴대폰) */
  defaultOpen?: boolean
}) {
  const { t, lang } = useBT()
  const ref = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(true)
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const first = frames[0]
  const [battleOf, setBattleOf] = useState(first)
  if (battleOf !== first) {
    setBattleOf(first)
    setToggled({})
    setStuck(true)
  }

  const shown = useMemo(() => frames.slice(0, revealed), [frames, revealed])
  const called = useMemo(() => calledMoveIndexes(shown), [shown])
  const groups = useMemo(
    () => groupLogByTurn(shown).map(g => ({
      ...g,
      lines: g.items
        .map(f => ({ f, text: frameText(f, lang, sideName) }))
        .filter((x): x is { f: Frame; text: string } => x.text !== null),
    })),
    [shown, lang, sideName],
  )

  useEffect(() => {
    const el = ref.current
    if (el && stuck) el.scrollTop = el.scrollHeight
  }, [revealed, stuck, groups.length])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 32)
  }

  return (
    <details className="bd-panel bd-log-panel" open={defaultOpen}>
      <summary>{t('battleLog')}</summary>
      <div className="bd-log" ref={ref} onScroll={onScroll} tabIndex={0} aria-label={t('battleLog')}>
        {groups.length === 0 && <p className="bd-log-empty">{t('logEmpty')}</p>}
        {groups.map((g, gi) => {
          const recent = gi >= groups.length - 2
          const open = toggled[g.key] ?? recent
          const s = g.summary
          return (
            <details
              key={g.key}
              open={open}
              className="bd-log-turn"
              onToggle={e => {
                const now = (e.currentTarget as HTMLDetailsElement).open
                if (now !== open) setToggled(x => ({ ...x, [g.key]: now }))
              }}
            >
              <summary>
                <span>{g.turn === 0 ? t('logStart') : t('turn', { n: g.turn })}</span>
                {!open && s.faints > 0 && <i className="is-key">{t('sumFaint', { n: s.faints })}</i>}
                {!open && s.crits > 0 && <i>{t('sumCrit', { n: s.crits })}</i>}
                {!open && s.supers > 0 && <i>{t('sumSuper', { n: s.supers })}</i>}
              </summary>
              <ul>
                {g.lines.map(({ f, text }) => {
                  const isCalled = called.has(f.index)
                  return <li key={f.index} className={`tone-${logTone(f.event, isCalled)}`}>{isCalled && <span aria-hidden>↳ </span>}{text}</li>
                })}
              </ul>
            </details>
          )
        })}
      </div>
    </details>
  )
}
