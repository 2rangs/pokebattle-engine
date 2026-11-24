// ─── 배틀 화면: 툴바 + 장면 + 메시지 상자/커맨드 + 옆 패널 ─────────
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlayerID } from '../lib/engine'
import { frameText } from '../lib/frames'
import { lastCalledMoves, messageFrameIndex } from '../lib/hud'
import type { ReplayData } from '../lib/replay'
import { Scene, SceneOverlay } from './Scene'
import { ActionConsole, MessageBox } from './Console'
import { BattleLog, FieldBar, SummaryPanel, TeamsPanel } from './SidePanel'
import { Credits, SpeedSelect, SpriteToggle, ToolButton } from './common'
import { isNarrow, replayHref, replayUrl, useBattleCries, useDebugHook, useEncodedReplay } from './hooks'
import type { BattleSession } from './useBattleSession'
import { SaveHtmlButton } from '../replay-html/SaveHtmlButton'
import { updateSettings, useBT, useSettings } from './state'

function ResultOverlay({ result, replay, onRematch, onExit }: { result: string; replay: () => ReplayData | null; onRematch: () => void; onExit: () => void }) {
  const { t } = useBT()
  const [data] = useState(replay)
  const encoded = useEncodedReplay(data)
  const [note, setNote] = useState<string | null>(null)
  const copy = async () => {
    if (!encoded) return
    try {
      await navigator.clipboard.writeText(replayUrl(encoded))
      setNote(t('replayCopied'))
    } catch {
      setNote(t('replayCopyFailed'))
    }
  }
  return (
    <SceneOverlay title={result}>
      <button type="button" className="bd-btn is-primary" onClick={onRematch}>{t('rematch')}</button>
      <button type="button" className="bd-btn" disabled={!encoded} onClick={copy}>{t('copyReplay')}</button>
      <a className={`bd-btn${encoded ? '' : ' is-disabled'}`} href={encoded ? replayHref(encoded) : undefined} aria-disabled={!encoded}>{t('viewReplay')}</a>
      <SaveHtmlButton data={data} encoded={encoded} />
      <button type="button" className="bd-btn is-ghost" onClick={onExit}>{t('backToTeam')}</button>
      <span className="bd-overlay-note" role="status">{note}</span>
    </SceneOverlay>
  )
}

/** 배틀 화면 맨 위를 (고정된 사이트 헤더 바로 아래로) 스크롤 */
function scrollBelowHeader(el: HTMLElement | null) {
  if (!el) return
  const hdr = document.querySelector('.site-header')
  const off = hdr ? hdr.getBoundingClientRect().bottom : 0
  window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - Math.max(0, off) - 8) })
}

export function BattleView({ session, onExit, onRematch }: { session: BattleSession; onExit: () => void; onRematch: () => void }) {
  const { t, lang } = useBT()
  const { sound } = useSettings()
  const f = session.current
  const spectating = session.isAI('p1') && session.isAI('p2')
  const ended = session.phase === 'ended' && session.allRevealed
  const rootRef = useRef<HTMLDivElement>(null)
  const [logOpen] = useState(() => !isNarrow())

  // 시작하면 배틀 화면을 맨 위로 (휴대폰에서 장면 + 커맨드가 한 화면에 들어온다)
  useEffect(() => { scrollBelowHeader(rootRef.current) }, [session.setup])

  const cpu1 = t('cpu1')
  const cpu2 = t('cpu2')
  const sideName = useMemo(() => (spectating ? (p: PlayerID) => (p === 'p1' ? cpu1 : cpu2) : undefined), [spectating, cpu1, cpu2])

  useBattleCries(f, sound, session.speed)
  useDebugHook(f, 'p1', !spectating, lang, sideName)

  if (!f) return null

  const msgIndex = messageFrameIndex(session.frames, session.revealed)
  const msgFrame = msgIndex === null ? null : session.frames[msgIndex]!
  const forfeited = session.replayData()?.forfeit
  const result = session.winner === 'draw' ? t('draw')
    : session.winner === 'p1' ? (spectating ? t('winnerIs', { name: cpu1 }) : t('win'))
      : spectating ? t('winnerIs', { name: cpu2 }) : t('lose')
  const text = ended && forfeited ? t('replayForfeit', { name: spectating ? sideName!(forfeited) : t('replayYou') })
    : msgFrame ? frameText(msgFrame, lang, sideName) : ''
  const lastCalled = lastCalledMoves(session.frames, session.revealed).get(f.p1.active.id) ?? null

  return (
    <div className="bd-battle" ref={rootRef}>
      <div className="bd-main">
        <div className="bd-toolbar">
          <SpriteToggle />
          <SpeedSelect value={session.speed} onChange={v => { session.setSpeed(v); updateSettings({ speed: v }) }} />
          {spectating && <ToolButton pressed={session.paused} onClick={() => session.setPaused(!session.paused)}>{session.paused ? t('play') : t('pause')}</ToolButton>}
          {!session.allRevealed && <ToolButton onClick={session.skip} label={t('skip')}>{t('skip')} »</ToolButton>}
          <ToolButton pressed={sound} onClick={() => updateSettings({ sound: !sound })} label={t('soundTip')}>{sound ? '♪ ' : ''}{t('sound')}</ToolButton>
          <span className="bd-toolbar-gap" />
          <ToolButton onClick={onExit}>{t('exit')}</ToolButton>
        </div>
        <div className="bd-game">
          <Scene frames={session.frames} frame={f} revealFoe={spectating} speed={session.speed}>
            {ended && <ResultOverlay result={result} replay={session.replayData} onRematch={onRematch} onExit={onExit} />}
          </Scene>
          {spectating || ended
            ? <div className="bd-console is-wait"><MessageBox text={ended ? result : text} more={!session.allRevealed} /></div>
            : (
              <ActionConsole
                key={`${session.frames.length}-${session.allRevealed}`}
                session={session}
                player="p1"
                message={text}
                more={!session.allRevealed}
                team={f.p1.team}
                lastCalled={lastCalled}
              />
            )}
          {session.error && <p className="bd-error" role="alert">{t('actionError', { msg: session.error })}</p>}
        </div>
      </div>
      <aside className="bd-side">
        <div className="bd-side-inner">
          <FieldBar frame={f} sideName={sideName} />
          <TeamsPanel frame={f} both={spectating} revealFoe={spectating} sideName={sideName} />
          <SummaryPanel frame={f} hideFoe={!spectating} sideName={sideName} />
          <BattleLog frames={session.frames} revealed={session.revealed} sideName={sideName} defaultOpen={logOpen} />
        </div>
      </aside>
      <Credits />
    </div>
  )
}
