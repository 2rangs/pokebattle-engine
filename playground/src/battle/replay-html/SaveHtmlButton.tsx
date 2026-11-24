// ─── "HTML로 저장" 버튼: 결과 화면·리플레이 화면에서 한 파일짜리 리플레이를 내려받는다 ───
import { useState } from 'react'
import { simulateReplay, type SimulatedReplay } from '../lib/frames'
import type { ReplayData } from '../lib/replay'
import { useBT } from '../ui/state'
import { buildReplayHtml, htmlText } from './replayHtml'

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
  const [note, setNote] = useState<string | null>(null)
  const ready = !!data && !!encoded
  const save = () => {
    if (!data || !encoded) return
    try {
      const { html, filename } = buildReplayHtml({
        data, encoded, sim: sim ?? simulateReplay(data), lang,
        viewerBase: `${pageBase()}#/battle/replay?d=`,
        demoUrl: `${pageBase()}#/battle`,
      })
      download(filename, html)
      setNote(htmlText(lang, 'saved'))
    } catch {
      setNote(htmlText(lang, 'saveFailed'))
    }
  }
  return (
    <>
      <button type="button" className={className} disabled={!ready} onClick={save} title={htmlText(lang, 'saveTip')} data-testid="save-replay-html">
        {htmlText(lang, 'save')}
      </button>
      {note && <span className="bd-sr" role="status">{note}</span>}
    </>
  )
}
