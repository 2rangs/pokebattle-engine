// ─── 직접 확인: 이 브라우저에서 Showdown 직접 vs pokebattle-engine ─────────────
// 계산은 웹 워커(src/proof/verify.worker.ts)에서. 취소 = 워커 종료. 결과는 기기마다 다르다.
import { useEffect, useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { useLang } from '../i18n'
import type { CompareResult } from '../proof/compare'
import type { FromWorker, Reference, ToWorker } from '../proof/verify.worker'

const SIZES = [10, 20, 50, 100] as const
const ROUNDS = 3

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; phase: string; done: number; total: number; started: number }
  | { kind: 'done'; result: CompareResult; reference: Reference; elapsed: number }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' }

/** 브라우저·OS 를 짧게 (결과가 어느 기기의 값인지 밝히려고) */
function deviceLabel(): string {
  const ua = navigator.userAgent
  const browser =
    /Edg\/(\d+)/.exec(ua)?.[1] ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
    : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /HeadlessChrome\/(\d+)/.exec(ua) ? `Headless Chrome ${/HeadlessChrome\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`
    : /Version\/([\d.]+).*Safari/.exec(ua) ? `Safari ${/Version\/([\d.]+)/.exec(ua)![1]}`
    : 'Browser'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const cores = navigator.hardwareConcurrency ? ` · ${navigator.hardwareConcurrency} cores` : ''
  return `${browser}${os ? ` · ${os}` : ''}${cores}`
}

const short = (h: string) => `${h.slice(0, 10)}…`

export function VerifyNow() {
  const { t } = useLang()
  const [n, setN] = useState<number>(20)
  const [reference, setReference] = useState<Reference>('bundled')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [diff, setDiff] = useState<number | null>(null)
  const worker = useRef<Worker | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => () => worker.current?.terminate(), [])
  // 남은 시간 표시용 시계
  useEffect(() => {
    if (status.kind !== 'running') return
    const id = setInterval(() => setNow(performance.now()), 500)
    return () => clearInterval(id)
  }, [status.kind])

  const run = () => {
    worker.current?.terminate()
    const w = new Worker(new URL('../proof/verify.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    const started = performance.now()
    setDiff(null)
    setNow(started)
    setStatus({ kind: 'running', phase: 'load', done: 0, total: 0, started })
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data
      if (m.type === 'progress') setStatus({ kind: 'running', phase: m.progress.phase, done: m.progress.done, total: m.progress.total, started })
      else if (m.type === 'result') { setStatus({ kind: 'done', result: m.result, reference, elapsed: performance.now() - started }); w.terminate(); worker.current = null }
      else { setStatus({ kind: 'error', message: m.message }); w.terminate(); worker.current = null }
    }
    w.onerror = e => { setStatus({ kind: 'error', message: e.message || 'worker failed to start' }); w.terminate(); worker.current = null }
    // 시드는 실행마다 새로 (미리 계산해 둔 값이 아님을 보이려고). 화면에 표시한다
    const seedBase = 1 + Math.floor(Math.random() * 1_000_000)
    const msg: ToWorker = { type: 'run', n, seedBase, rounds: ROUNDS, reference }
    w.postMessage(msg)
  }
  const cancel = () => { worker.current?.terminate(); worker.current = null; setStatus({ kind: 'cancelled' }) }

  const running = status.kind === 'running'
  const phaseName = (p: string) => ({
    load: t('엔진·데이터 받는 중', 'Loading engine and data'),
    record: t('배틀 기록 중 (시드마다 팀·선택 생성)', 'Recording battles (teams and choices from each seed)'),
    warmup: t('워밍업 + 두 쪽 로그 수집', 'Warm-up + collecting both logs'),
    timing: t(`시간 측정 (${ROUNDS}라운드 번갈아)`, `Timing (${ROUNDS} alternating rounds)`),
  } as Record<string, string>)[p] ?? p

  let eta = ''
  if (status.kind === 'running' && status.total > 0 && status.done > 0) {
    const el = (now - status.started) / 1000
    const left = Math.max(0, (el / status.done) * (status.total - status.done))
    eta = t(`약 ${Math.ceil(left)}초 남음`, `~${Math.ceil(left)} s left`)
  }

  return (
    <div className="verify">
      <div className="verify-controls">
        <div className="verify-field">
          <span className="verify-label" id="verify-n">{t('배틀 수 (싱글)', 'Battles (singles)')}</span>
          <SegmentedControl label={t('배틀 수', 'Number of battles')} size="sm" value={String(n)} onChange={v => setN(Number(v))} isDisabled={running}>
            {SIZES.map(s => <SegmentedControlItem key={s} value={String(s)} label={String(s)} />)}
          </SegmentedControl>
        </div>
        <div className="verify-field">
          <span className="verify-label">{t('Showdown 쪽', 'Showdown side')}</span>
          <SegmentedControl label={t('Showdown 쪽 코드', 'Showdown side code')} size="sm" value={reference} onChange={v => setReference(v as Reference)} isDisabled={running}>
            <SegmentedControlItem value="bundled" label={t('엔진에 든 원본', 'Bundled original')} />
            <SegmentedControlItem value="npm" label="npm @pkmn/sim" />
          </SegmentedControl>
        </div>
        <div className="verify-go">
          {running
            ? <Button label={t('취소', 'Cancel')} variant="secondary" onClick={cancel} />
            : <Button label={status.kind === 'done' ? t('새 시드로 다시', 'Run again, new seeds') : t(`${n}판 돌려서 확인`, `Run ${n} battles`)} variant="primary" onClick={run} />}
        </div>
      </div>
      <p className="verify-note">
        {reference === 'bundled'
          ? t('Showdown 쪽은 엔진 번들에 들어 있는 @pkmn/sim 을 빠른 경로 없이(fast: false, 원본 코드 경로) 돌립니다. 이 번들이 npm 원본과 같은 배틀을 하는지는 CI가 매번 확인합니다.',
            'The Showdown side runs the @pkmn/sim copy inside the engine bundle with the fast path off (fast: false, the original code path). CI checks on every push that this bundle plays the same battles as the npm original.')
          : t('Showdown 쪽은 엔진 코드가 전혀 섞이지 않은 npm @pkmn/sim 패키지를 따로 받아 돌립니다 (gzip 약 1 MB 더 받음).',
            'The Showdown side downloads the npm @pkmn/sim package on its own — no engine code involved (about 1 MB extra, gzipped).')}
      </p>

      <div className="verify-out" aria-live="polite" aria-busy={running}>
        {status.kind === 'idle' && (
          <p className="verify-empty">
            {t('버튼을 누르면 무작위 시드로 배틀을 만들고, 같은 배틀을 Showdown 시뮬레이터와 이 엔진에 각각 넣습니다. 두 프로토콜 로그의 SHA-256과 턴당 시간을 이 기기에서 잽니다.',
              'Press the button to create battles from random seeds and feed each one to the Showdown simulator and to this engine. Both protocol logs are hashed with SHA-256 and both are timed, on this device.')}
          </p>
        )}
        {status.kind === 'running' && (
          <div className="verify-progress">
            <div className="verify-progress-row">
              <span>{phaseName(status.phase)}</span>
              <span className="num">{status.total ? `${Math.floor((status.done / status.total) * 100)}%` : '…'}{eta && ` · ${eta}`}</span>
            </div>
            <progress max={status.total || 1} value={status.total ? status.done : undefined} aria-label={t('진행', 'Progress')} />
          </div>
        )}
        {status.kind === 'cancelled' && <p className="verify-empty">{t('취소했습니다.', 'Cancelled.')}</p>}
        {status.kind === 'error' && <p className="verify-empty is-error">{t('실패: ', 'Failed: ')}{status.message}</p>}
        {status.kind === 'done' && <Result result={status.result} reference={status.reference} elapsed={status.elapsed} diff={diff} setDiff={setDiff} />}
      </div>
    </div>
  )
}

function Result({ result: r, reference, elapsed, diff, setDiff }: {
  result: CompareResult; reference: Reference; elapsed: number; diff: number | null; setDiff: (k: number | null) => void
}) {
  const { t } = useLang()
  const same = r.battles.filter(b => b.identical).length
  const all = same === r.n
  const sdTurn = r.showdownMs / r.turns, enTurn = r.engineMs / r.turns
  const ratio = r.showdownMs / r.engineMs
  const ref = reference === 'npm' ? 'npm @pkmn/sim' : t('Showdown (번들 원본 경로)', 'Showdown (bundled, original path)')
  return (
    <div className="verify-result">
      <dl className="verify-kpis">
        <div className={`vk ${all ? 'is-ok' : 'is-bad'}`}>
          <dt>{t('바이트 단위로 같은 배틀', 'Byte-identical battles')}</dt>
          <dd className="vk-value">{all ? '✓ ' : '✗ '}{same}/{r.n}</dd>
          <dd className="vk-sub">{t('프로토콜 로그 SHA-256 일치', 'protocol log SHA-256 match')}</dd>
        </div>
        <div className="vk">
          <dt>{t('이 기기에서 잰 속도', 'Speed on this device')}</dt>
          <dd className="vk-value">{ratio.toFixed(2)}× {ratio >= 1 ? t('빠름', 'faster') : t('느림', 'slower')}</dd>
          <dd className="vk-sub">pokebattle-engine vs {reference === 'npm' ? 'npm @pkmn/sim' : 'Showdown'}</dd>
        </div>
        <div className="vk">
          <dt>{t('턴당 시간', 'Time per turn')}</dt>
          <dd className="vk-value vk-pair">
            <span><span className="swatch is-base" aria-hidden="true" /> {sdTurn.toFixed(3)} ms <small>{reference === 'npm' ? '@pkmn/sim' : 'Showdown'}</small></span>
            <span><span className="swatch is-ours" aria-hidden="true" /> {enTurn.toFixed(3)} ms <small>engine</small></span>
          </dd>
        </div>
      </dl>
      <p className="verify-fine">
        {t(
          `${deviceLabel()} · ${r.n}판, ${r.turns.toLocaleString()}턴, 시드 ${r.seedBase}–${r.seedBase + r.n - 1} · 워밍업 1회 뒤 ${r.rounds}라운드 번갈아 잰 최고값 · 전체 ${(elapsed / 1000).toFixed(1)}초. 웹 워커 안의 브라우저 측정이라 기기·브라우저·발열에 따라 달라지며, README의 Node 22 벤치(1.6–1.9배)와 같은 값이 아닙니다.`,
          `${deviceLabel()} · ${r.n} battles, ${r.turns.toLocaleString()} turns, seeds ${r.seedBase}–${r.seedBase + r.n - 1} · best of ${r.rounds} alternating rounds after one warm-up · ${(elapsed / 1000).toFixed(1)} s total. This is a browser measurement inside a web worker, so it varies with device, browser and thermals; it is not the README’s Node 22 benchmark (1.6–1.9×).`,
        )}
      </p>

      <details className="verify-battles">
        <summary>{t(`배틀 ${r.n}개의 해시 보기`, `Show the hashes of all ${r.n} battles`)}</summary>
        <div className="vb-wrap" tabIndex={0}>
          <table className="vb">
            <thead>
              <tr>
                <th>#</th><th>{t('시드', 'Seed')}</th><th>{t('턴', 'Turns')}</th>
                <th>Showdown SHA-256</th><th>engine SHA-256</th><th aria-label={t('일치', 'Match')} /><th />
              </tr>
            </thead>
            <tbody>
              {r.battles.map((b, k) => (
                <tr key={b.seed} className={diff === k ? 'is-open' : undefined}>
                  <td className="num">{k + 1}</td>
                  <td className="num">{b.seed}</td>
                  <td className="num">{b.turns}</td>
                  <td><code title={b.showdownHash}>{short(b.showdownHash)}</code></td>
                  <td><code title={b.engineHash}>{short(b.engineHash)}</code></td>
                  <td className={b.identical ? 'ok' : 'bad'}>{b.identical ? '✓' : '✗'}</td>
                  <td><button type="button" className="vb-btn" onClick={() => setDiff(diff === k ? null : k)} aria-expanded={diff === k}>{diff === k ? t('닫기', 'Close') : t('비교', 'Diff')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {/* 첫 배틀의 비교는 바로 열 수 있게 */}
      {diff === null
        ? <button type="button" className="vb-open" onClick={() => setDiff(0)}>{t('배틀 #1의 두 로그를 나란히 보기', 'Show both logs of battle #1 side by side')} →</button>
        : <LogDiff k={diff} r={r} reference={ref} go={setDiff} />}
    </div>
  )
}

function LogDiff({ k, r, reference, go }: { k: number; r: CompareResult; reference: string; go: (k: number | null) => void }) {
  const { t } = useLang()
  const a = r.logs.showdown[k]!.split('\n'), b = r.logs.engine[k]!.split('\n')
  const rows = Math.max(a.length, b.length)
  let differ = 0
  for (let i = 0; i < rows; i++) if (a[i] !== b[i]) differ++
  const bt = r.battles[k]!
  return (
    <figure className="ldiff" aria-label={t(`배틀 #${k + 1} 로그 비교`, `Battle #${k + 1} log comparison`)}>
      <figcaption className="ldiff-head">
        <span>
          <b>{t(`배틀 #${k + 1}`, `Battle #${k + 1}`)}</b> · {t('시드', 'seed')} {bt.seed} · {rows} {t('줄', 'lines')} ·{' '}
          <span className={differ ? 'bad' : 'ok'}>{differ ? t(`다른 줄 ${differ}개`, `${differ} differing lines`) : t('다른 줄 0개', '0 differing lines')}</span>
        </span>
        <span className="ldiff-nav">
          <button type="button" className="vb-btn" disabled={k === 0} onClick={() => go(k - 1)} aria-label={t('이전 배틀', 'Previous battle')}>←</button>
          <button type="button" className="vb-btn" disabled={k === r.n - 1} onClick={() => go(k + 1)} aria-label={t('다음 배틀', 'Next battle')}>→</button>
          <button type="button" className="vb-btn" onClick={() => go(null)}>{t('닫기', 'Close')}</button>
        </span>
      </figcaption>
      <div className="ldiff-cols" aria-hidden="true">
        <span />
        <span>{reference}<code>{bt.showdownHash}</code></span>
        <span>pokebattle-engine<code>{bt.engineHash}</code></span>
      </div>
      <div className="ldiff-body" tabIndex={0}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`ldiff-row${a[i] !== b[i] ? ' is-diff' : ''}`}>
            <span className="ldiff-n">{i + 1}</span>
            <span>{a[i] ?? ''}</span>
            <span>{b[i] ?? ''}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}
