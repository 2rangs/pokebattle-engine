// ─── 리플레이 화면 (#/battle/replay?d=…) ─────────────────────────
// 링크를 풀어 엔진으로 다시 재생한 프레임을 실제 배틀과 같은 장면·메시지 상자·로그로 그린다.
// 커맨드 자리에 타임라인(턴 슬라이더, 처음/이전/재생/다음/끝)을 둔다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerID } from '../lib/engine'
import { frameText, simulateReplay, type SimulatedReplay } from '../lib/frames'
import { frameDelay, messageFrameIndex } from '../lib/hud'
import { decodeReplay, ReplayError, type ReplayData, type ReplayErrorCode } from '../lib/replay'
import { Scene, SceneOverlay } from './Scene'
import { MessageBox } from './Console'
import { BattleLog, FieldBar, SummaryPanel, TeamsPanel } from './SidePanel'
import { Credits, MoveFxToggle, SpeedSelect, SpriteToggle, ToolButton } from './common'
import { isNarrow, useBattleCries, useDebugHook } from './hooks'
import { useEngineReady } from './useEngineReady'
import { SaveHtmlButton } from '../replay-html/SaveHtmlButton'
import '../battle.css'
import { updateSettings, useBT, useSettings } from './state'

type Decoded = { d: string; data: ReplayData } | { d: string; error: ReplayErrorCode }

function turnEnd(sim: SimulatedReplay, turn: number): number {
  let n = 0
  while (n < sim.frames.length && sim.frames[n]!.turn <= turn) n++
  return Math.max(1, n)
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

export default function ReplayPage({ query }: { query: string }) {
  const { t } = useBT()
  const d = new URLSearchParams(query).get('d') ?? ''
  const [decoded, setDecoded] = useState<Decoded | null>(null)

  useEffect(() => {
    let alive = true
    decodeReplay(d).then(
      data => { if (alive) setDecoded({ d, data }) },
      (e: unknown) => { if (alive) setDecoded({ d, error: e instanceof ReplayError ? e.code : 'corrupt' }) },
    )
    return () => { alive = false }
  }, [d])

  const current = decoded?.d === d ? decoded : null
  const data = current && 'data' in current ? current.data : null
  // 그 세대 데이터를 받은 뒤 재현한다 (세대가 없는 옛 링크 = 9세대)
  const { ready, error: engineError } = useEngineReady(data?.rule === 'normal' ? data.gen ?? 9 : 9)
  const sim = useMemo(() => (ready && data ? simulateReplay(data) : null), [ready, data])

  if (engineError) return <div className="bd-banner is-error" role="alert">{t('loadError')} {engineError.message}</div>
  if (current && 'error' in current) return <ReplayFailure code={current.error} />
  if (!sim || !data) return <div className="bd-loading" role="status">{t('replayLoading')}</div>
  if (sim.frames.length === 0) return <ReplayFailure code="mismatch" />
  return <ReplayViewer key={d} data={data} sim={sim} encoded={d} />
}

function ReplayFailure({ code }: { code: ReplayErrorCode | 'mismatch' }) {
  const { t } = useBT()
  const title = code === 'version' ? t('replayVersion') : code === 'mismatch' ? t('replayMismatch') : t('replayCorrupt')
  return (
    <div className="bd-banner is-error" role="alert">
      <b>{title}</b>
      {code === 'corrupt' && <p>{t('replayCorruptDesc')}</p>}
      <a className="bd-btn is-primary" href="#/battle">{t('replayToDemo')}</a>
    </div>
  )
}

function ReplayViewer({ data, sim, encoded }: { data: ReplayData; sim: SimulatedReplay; encoded: string }) {
  const { t, lang } = useBT()
  const settings = useSettings()
  const total = sim.frames.length
  const [cursor, setCursor] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(settings.speed)
  const rootRef = useRef<HTMLDivElement>(null)

  const f = sim.frames[Math.min(cursor, total) - 1]!
  const atEnd = cursor >= total
  const lastTurn = sim.turns
  const spectating = data.p1.ctrl !== 'human' && data.p2.ctrl !== 'human'

  const cpu1 = t('cpu1')
  const cpu2 = t('cpu2')
  const sideName = useMemo(() => (spectating ? (p: PlayerID) => (p === 'p1' ? cpu1 : cpu2) : undefined), [spectating, cpu1, cpu2])
  const nameOf = (p: PlayerID) => (data[p].ctrl === 'human' ? t('replayYou') : spectating ? sideName!(p) : 'CPU')
  const players = `${t(data.rule === 'metronome' ? 'ruleMetronome' : 'ruleNormal')}${data.rule === 'normal' ? ` · ${t('genShort', { n: data.gen ?? 9 })}` : ''} · ${t('replayVs', { a: nameOf('p1'), b: nameOf('p2') })}`

  const result = sim.winner === null ? null
    : sim.winner === 'draw' ? t('draw')
      : data[sim.winner].ctrl === 'human' ? t('win')
        : data.p1.ctrl === 'human' ? t('lose')
          : t('winnerIs', { name: nameOf(sim.winner) })

  useBattleCries(f, settings.sound && playing, speed)
  useDebugHook(f, 'p1', !spectating, lang, sideName)
  useEffect(() => { document.title = `${t('replayTitle')} - pokebattle-engine` }, [t])

  const go = useCallback((n: number) => {
    setPlaying(false)
    setCursor(Math.max(1, Math.min(total, n)))
  }, [total])
  const prevTurn = useCallback(() => go(turnEnd(sim, f.turn - 1)), [go, sim, f.turn])
  const nextTurn = useCallback(() => {
    const end = turnEnd(sim, f.turn)
    go(cursor < end ? end : turnEnd(sim, f.turn + 1))
  }, [go, sim, f.turn, cursor])
  const togglePlay = useCallback(() => {
    if (playing) return setPlaying(false)
    if (atEnd) setCursor(1)
    setPlaying(true)
  }, [playing, atEnd])

  useEffect(() => {
    if (!playing || cursor >= total) return
    const next = sim.frames[cursor]!
    const timer = setTimeout(() => {
      setCursor(cursor + 1)
      if (cursor + 1 >= total) setPlaying(false)
    }, frameDelay(next, speed))
    return () => clearTimeout(timer)
  }, [playing, cursor, total, sim, speed])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevTurn() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nextTurn() }
      else if (e.key === ' ' && !(e.target instanceof HTMLElement && e.target.closest('button, a'))) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevTurn, nextTurn, togglePlay])

  const msgIndex = messageFrameIndex(sim.frames, cursor)
  const msgFrame = msgIndex === null ? null : sim.frames[msgIndex]!
  const text = atEnd && data.forfeit ? t('replayForfeit', { name: nameOf(data.forfeit) }) : msgFrame ? frameText(msgFrame, lang, sideName) : ''

  return (
    <div className="bd-battle" ref={rootRef}>
      <div className="bd-main">
        {sim.error === 'mismatch' && (
          <div className="bd-banner is-warn" role="alert"><b>{t('replayMismatch')}</b> {t('replayMismatchDesc', { n: lastTurn })}</div>
        )}
        <div className="bd-toolbar">
          <span className="bd-replay-title">{players}</span>
          <span className="bd-toolbar-gap" />
          <SpriteToggle />
          <MoveFxToggle />
          <SpeedSelect value={speed} onChange={v => { setSpeed(v); updateSettings({ speed: v }) }} />
          <ToolButton pressed={settings.sound} onClick={() => updateSettings({ sound: !settings.sound })} label={t('soundTip')}>{t('sound')}</ToolButton>
          <SaveHtmlButton data={data} encoded={encoded.trim()} sim={sim} className="bd-tool" />
          <ToolButton href="#/battle">{t('exit')}</ToolButton>
        </div>
        <div className="bd-game">
          <Scene frames={sim.frames} frame={f} revealFoe={spectating} speed={speed}>
            {atEnd && !playing && result && (
              <SceneOverlay title={result}>
                <button type="button" className="bd-btn is-primary" onClick={() => { setCursor(1); setPlaying(true) }}>{t('replayRestart')}</button>
                <button type="button" className="bd-btn" onClick={prevTurn}>{t('replayPrevTurn')}</button>
                <SaveHtmlButton data={data} encoded={encoded.trim()} sim={sim} />
                <a className="bd-btn is-ghost" href="#/battle">{t('replayToDemo')}</a>
              </SceneOverlay>
            )}
          </Scene>
          <div className="bd-console is-replay">
            <MessageBox text={text} />
            <div className="bd-timeline">
              <div className="bd-timeline-head">
                <span>{t('replayTurnOf', { n: f.turn, total: lastTurn })}</span>
                {atEnd && result && <b>{result}</b>}
              </div>
              <input
                type="range"
                className="bd-range"
                min={0}
                max={Math.max(1, lastTurn)}
                value={f.turn}
                disabled={lastTurn === 0}
                aria-label={t('replayTimeline')}
                aria-valuetext={t('turn', { n: f.turn })}
                onChange={e => go(turnEnd(sim, Number(e.target.value)))}
              />
              <div className="bd-timeline-btns">
                <button type="button" className="bd-tl-btn" aria-label={t('replayFirst')} title={t('replayFirst')} disabled={cursor <= 1} onClick={() => go(1)}>⏮</button>
                <button type="button" className="bd-tl-btn" aria-label={t('replayPrevTurn')} title={t('replayPrevTurn')} disabled={cursor <= 1} onClick={prevTurn}>◀</button>
                <button type="button" className="bd-tl-btn is-play" aria-pressed={playing} onClick={togglePlay}>{playing ? t('pause') : t('play')}</button>
                <button type="button" className="bd-tl-btn" aria-label={t('replayNextTurn')} title={t('replayNextTurn')} disabled={atEnd} onClick={nextTurn}>▶</button>
                <button type="button" className="bd-tl-btn" aria-label={t('replayLast')} title={t('replayLast')} disabled={atEnd} onClick={() => go(total)}>⏭</button>
              </div>
              <p className="bd-hint">{t('replayKeysHint')}</p>
            </div>
          </div>
        </div>
      </div>
      <aside className="bd-side">
        <div className="bd-side-inner">
          <FieldBar frame={f} sideName={sideName} />
          <TeamsPanel frame={f} both revealFoe={spectating} sideName={sideName} />
          <SummaryPanel frame={f} hideFoe={!spectating} sideName={sideName} />
          <BattleLog frames={sim.frames} revealed={cursor} sideName={sideName} defaultOpen={!isNarrow()} />
        </div>
      </aside>
      <Credits />
    </div>
  )
}
