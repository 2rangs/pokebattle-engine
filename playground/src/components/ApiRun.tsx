import { useCallback, useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { examples, type ExampleId, type LogKind } from '../examples'
import { useLang } from '../i18n'

interface Line { text: string; kind: LogKind }

function collect(id: ExampleId): Line[] {
  const out: Line[] = []
  try {
    examples[id].run((text, kind = 'out') => { out.push({ text, kind }) })
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
  const [lines, setLines] = useState<Line[] | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setLines(collect(id)), 0)
    return () => clearTimeout(t)
  }, [id])
  return (
    <figure className="logwin">
      <figcaption className="logwin-bar">
        <span className="logwin-title">{title}</span>
        <span className="logwin-meta">{lines ? `${lines.length} lines` : 'running…'}</span>
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
  const { t } = useLang()
  const ex = examples[id]
  const [lines, setLines] = useState<Line[] | null>(null)
  const [ms, setMs] = useState(0)

  const run = useCallback(() => {
    const t0 = performance.now()
    const out = collect(id)
    setMs(performance.now() - t0)
    setLines(out)
  }, [id])

  return (
    <div className="run">
      <CodeBlock code={ex.code} language="ts" title={title} width="100%" container="section" maxHeight={420} />
      <div className="run-bar">
        <span className="run-label">
          {lines ? `${t('출력', 'Output')} · ${lines.length} ${t('줄', 'lines')} · ${ms.toFixed(0)} ms` : t('출력', 'Output')}
        </span>
        <Button label={lines ? t('다시 실행', 'Run again') : t('실행', 'Run')} size="sm" variant={lines ? 'secondary' : 'primary'} onClick={run} />
      </div>
      <pre className="run-log" style={{ maxHeight }} aria-live="polite" tabIndex={0}>
        {lines === null
          ? <span className="log-dim">{t('실행을 누르면 브라우저에서 엔진이 돌고, 결과가 여기에 텍스트로 찍힙니다.', 'Press Run to execute the engine in your browser. The output prints here as text.')}</span>
          : lines.length === 0
            ? <span className="log-dim">{t('(출력 없음)', '(no output)')}</span>
            : lines.map((l, i) => <span key={i} className={`log-${l.kind}`}>{l.text}{'\n'}</span>)}
      </pre>
    </div>
  )
}
