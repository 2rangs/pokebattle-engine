import { useCallback, useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { examples, localizeCode, type DocLang, type ExampleId, type LogKind } from '../examples'
import { useLang } from '../i18n'
import { dataReady } from '../engine'

interface Line { text: string; kind: LogKind }

function collect(id: ExampleId, lang: DocLang): Line[] {
  const out: Line[] = []
  try {
    examples[id].run((text, kind = 'out') => { out.push({ text, kind }) }, lang)
  } catch (err) {
    out.push({ text: `${(err as Error).name}: ${(err as Error).message}`, kind: 'error' })
  }
  return out
}

/** 출력만 보여주는 창 (랜딩용). 마운트 시 한 번 실행 */
export function LogWindow({ id, title, command, maxHeight = 420 }: {
  id: ExampleId
  title: string
  command: string
  maxHeight?: number
}) {
  const { lang } = useLang()
  const [lines, setLines] = useState<Line[] | null>(null)
  useEffect(() => {
    let live = true
    // 엔진 데이터(랜덤배틀 세트 등)가 준비되면 실행. 언어를 바꾸면 그 언어로 다시
    dataReady.then(() => setTimeout(() => { if (live) setLines(collect(id, lang)) }, 0))
    return () => { live = false }
  }, [id, lang])
  return (
    <figure className="logwin">
      <figcaption className="logwin-bar">
        <span className="logwin-title">{title}</span>
        <span className="logwin-meta">{lines ? `${lines.length} lines` : '…'}</span>
      </figcaption>
      <pre className="run-log logwin-body" style={{ maxHeight }} tabIndex={0}>
        <span className="log-prompt">$ {command}{'\n'}</span>
        {lines?.map((l, i) => <span key={i} className={`log-${l.kind}`}>{l.text}{'\n'}</span>)}
      </pre>
    </figure>
  )
}

/** 예제 소스 + 실행 버튼 + 텍스트 로그. 화면 시연 없이 API 결과만 보여준다. */
export function ApiRun({ id, title, maxHeight = 360 }: {
  id: ExampleId
  title?: string
  maxHeight?: number
}) {
  const { t, lang } = useLang()
  const ex = examples[id]
  // 출력은 실행한 언어와 함께 둔다. 언어를 바꾸면 이전 언어의 출력은 숨긴다 (다시 실행하면 새 언어로)
  const [out, setOut] = useState<{ lang: DocLang; lines: Line[] } | null>(null)
  const lines = out?.lang === lang ? out.lines : null
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    setBusy(true)
    await dataReady
    // "실행 중" 상태가 한 번 그려진 뒤에 (동기) 실행
    await new Promise(r => setTimeout(r, 30))
    const t0 = performance.now()
    const result = collect(id, lang)
    setMs(performance.now() - t0)
    setOut({ lang, lines: result })
    setBusy(false)
  }, [id, lang])

  return (
    <div className="run">
      <CodeBlock code={localizeCode(ex.code, lang)} language="ts" title={title} width="100%" container="section" maxHeight={420} />
      <div className="run-bar">
        <span className="run-label">
          {busy ? t('실행 중…', 'Running…') : lines ? `${t('출력', 'Output')} · ${lines.length} ${t('줄', 'lines')} · ${ms.toFixed(0)} ms` : t('출력', 'Output')}
        </span>
        <Button label={lines ? t('다시 실행', 'Run again') : t('실행', 'Run')} size="sm" variant="secondary" onClick={run} isLoading={busy} />
      </div>
      <pre className="run-log" style={{ maxHeight }} aria-live="polite" aria-busy={busy} tabIndex={0}>
        {lines === null
          ? <span className="log-dim">{t('실행을 누르면 브라우저에서 엔진이 돌고, 결과가 여기에 텍스트로 찍힙니다.', 'Press Run to execute the engine in your browser. The output prints here as text.')}</span>
          : lines.length === 0
            ? <span className="log-dim">{t('(출력 없음)', '(no output)')}</span>
            : lines.map((l, i) => <span key={i} className={`log-${l.kind}`}>{l.text}{'\n'}</span>)}
      </pre>
    </div>
  )
}
