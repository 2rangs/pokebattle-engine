// ─── 옆 패널: 필드 줄(남은 턴) · 팀 · 현황 · 턴별 배틀 로그 (Pokestra 의 정보 패널) ─────
// 높이는 배틀 화면이 정한다: 데스크톱은 배틀 열 높이에 맞추고 로그가 남은 칸을 채워 안에서 스크롤,
// 휴대폰은 접어서 시작하고 펼치면 고정 높이(40vh) 안에서 스크롤 → 줄이 늘어도 장면·메뉴·페이지 스크롤이 움직이지 않는다.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlayerID } from '../lib/engine'
import type { Frame, SideView } from '../lib/frame'
import { calledMoveIndexes, fieldItems, groupLogByTurn, logTone, pctOf, type FieldItem } from '../lib/hud'
import { frameText } from '../lib/frames'
import { effectName, pokemonLabel, weatherName } from '../lib/names'
import { iconCandidates } from '../lib/sprites'
import { formatBattleSummary, summarizeBattle } from '../lib/summary'
import { FallbackImg, HpBar, StatusBadge } from './bits'
import { useBT } from './state'
import { isNarrow } from './hooks'

/** 접고 펼치는 패널 (머리 = 44px 버튼). grow: 데스크톱에서 남은 높이를 채운다 */
export function Panel({ title, defaultOpen = true, grow, className, children }: {
  title: ReactNode
  defaultOpen?: boolean
  grow?: boolean
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`bd-panel${open ? ' is-open' : ''}${grow ? ' is-grow' : ''}${className ? ` ${className}` : ''}`}>
      <button type="button" className="bd-panel-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{title}</button>
      {open && <div className="bd-panel-body" id={id}>{children}</div>}
    </section>
  )
}

/** 한 진영의 팀: 아이콘 · 이름 · HP 막대(상대는 % 만) · 상태이상 · 기절 */
function PartyList({ side, title, numbers }: { side: SideView; title?: string; numbers: boolean }) {
  const { t, lang } = useBT()
  return (
    <div className="bd-plist">
      {title && <p className="bd-plist-title">{title}</p>}
      <ul>
        {side.team.map(p => {
          const name = pokemonLabel(p, lang)
          const active = p.id === side.active.id && !p.fainted
          return (
            <li key={p.id} className={`${p.fainted ? 'is-fainted' : ''}${active ? ' is-active' : ''}`}>
              <span className="bd-plist-icon"><FallbackImg sources={iconCandidates(p.species)} alt="" /></span>
              <span className="bd-plist-body">
                <span className="bd-plist-row">
                  <b>{name}</b>
                  {active && <span className="bd-plist-on" title={t('inBattle')} aria-label={t('inBattle')} />}
                  {p.status && !p.fainted && <StatusBadge status={p.status} turns={p.statusTurns} lang={lang} />}
                  <span className="bd-plist-hp">{p.fainted ? t('fainted') : numbers ? `${p.hp}/${p.max_hp}` : `${pctOf(p)}%`}</span>
                </span>
                <HpBar p={p} label={numbers ? t('hpLabel', { hp: p.hp, max: p.max_hp }) : t('hpPercentLabel', { pct: pctOf(p) })} />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** 팀 패널: 상대 팀 (관전·리플레이는 두 팀 모두) */
export function TeamsPanel({ frame, me = 'p1', both, revealFoe, sideName }: {
  frame: Frame
  me?: PlayerID
  both: boolean
  revealFoe: boolean
  sideName?: (p: PlayerID) => string
}) {
  const { t } = useBT()
  const foe: PlayerID = me === 'p1' ? 'p2' : 'p1'
  const name = (p: PlayerID) => (sideName ? sideName(p) : t(p === me ? 'myTeam' : 'foeTeam'))
  return (
    <Panel title={both ? t('teamsTitle') : t('foeTeam')} defaultOpen={!isNarrow()} className="bd-teams-panel">
      <div className={`bd-teams${both ? ' is-both' : ''}`}>
        <PartyList side={frame[foe]} title={both ? name(foe) : undefined} numbers={revealFoe} />
        {both && <PartyList side={frame[me]} title={name(me)} numbers />}
      </div>
    </Panel>
  )
}

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
    <Panel title={t('summaryTitle')} defaultOpen={false} className="bd-summary-panel">
      <pre className="bd-summary">{text}</pre>
      <button type="button" className="bd-btn is-small" onClick={copy}>{copied ? t('summaryCopied') : t('summaryCopy')}</button>
    </Panel>
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

  // 맨 아래를 보고 있을 때만 새 줄을 따라간다 (로그 상자 안에서만 스크롤, 페이지 스크롤은 건드리지 않는다)
  useEffect(() => {
    const el = ref.current
    if (el && stuck) el.scrollTop = el.scrollHeight
  }, [revealed, stuck, groups.length])
  // 접었다 펼치면 새 상자 → 맨 아래부터
  const followRef = useCallback((el: HTMLDivElement | null) => {
    ref.current = el
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 32)
  }

  return (
    <Panel title={t('battleLog')} defaultOpen={defaultOpen} grow className="bd-log-panel">
      <div className="bd-log" ref={followRef} onScroll={onScroll} tabIndex={0} aria-label={t('battleLog')}>
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
    </Panel>
  )
}
