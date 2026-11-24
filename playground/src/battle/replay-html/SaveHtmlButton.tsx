// ─── "HTML로 저장" 버튼: 결과 화면·리플레이 화면에서 한 파일짜리 리플레이를 내려받는다 ───
// 파일 하나로 인터넷 없이 재생되게: 재생기 스크립트·장면 데이터·스프라이트(data: URI)를 다 넣는다.
import { useState } from 'react'
import { simulateReplay, type SimulatedReplay } from '../lib/frames'
import type { ReplayData } from '../lib/replay'
import { useBT, useSettings } from '../ui/state'
import { buildOfflineReplay, cardKey, loadSprites, neededSprites } from './offline'
import { buildReplayHtml, htmlText, replayTail, replayResult, sideNamer } from './replayHtml'

/** 지금 페이지 기준 주소 (localhost 에서도 그 서버의 뷰어를 가리킨다) */
function pageBase(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function SaveHtmlButton({ data, encoded, sim, className = 'bd-btn' }: {
  data: ReplayData | null
  encoded: string | null
  /** 이미 재현한 결과 (리플레이 화면). 없으면 누를 때 다시 재현한다 */
  sim?: SimulatedReplay
  className?: string
}) {
  const { lang } = useBT()
  const { sprites: style } = useSettings()
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ready = !!data && !!encoded && !busy
  const save = async () => {
    if (!data || !encoded) return
    setBusy(true)
    setNote(htmlText(lang, 'saving'))
    try {
      const s = sim ?? simulateReplay(data)
      const h = (k: Parameters<typeof htmlText>[1]) => htmlText(lang, k)
      const { sideName, nameOf } = sideNamer(data, lang)
      const offline = buildOfflineReplay({
        sim: s, lang, me: 'p1', sideName,
        names: [nameOf('p1'), nameOf('p2')],
        result: replayResult(data, s, lang),
        tail: replayTail(data, s, lang),
        labels: {
          play: h('play'), pause: h('pause'), restart: h('restart'), prevTurn: h('prevTurn'), nextTurn: h('nextTurn'),
          speed: h('speed'), turn: h('turn'), start: h('start'), progress: h('progress'),
        },
      })
      const team = s.frames[0] ? [...s.frames[0].p1.team, ...s.frames[0].p2.team].map(p => p.setSpecies) : []
      const [{ default: code }, sprites, cardImgs] = await Promise.all([
        import('virtual:offline-player'),
        loadSprites(neededSprites(offline), style === '3d' ? '3d' : '2d'),
        loadSprites([...new Set(team)].map(cardKey), '2d'),
      ])
      offline.sprites = sprites
      const cards = Object.fromEntries(Object.entries(cardImgs).map(([k, v]) => [k.slice(0, -2), v.src]))
      const { html, filename } = buildReplayHtml({
        data, encoded, sim: s, lang,
        viewerBase: `${pageBase()}#/battle/replay?d=`,
        demoUrl: `${pageBase()}#/battle`,
        player: { code, data: offline },
        cards,
      })
      download(filename, html)
      setNote(htmlText(lang, 'saved'))
    } catch {
      setNote(htmlText(lang, 'saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className={className} disabled={!ready} aria-busy={busy} onClick={() => void save()} title={htmlText(lang, 'saveTip')} data-testid="save-replay-html">
        {htmlText(lang, 'save')}
      </button>
      {note && <span className="bd-sr" role="status">{note}</span>}
    </>
  )
}
