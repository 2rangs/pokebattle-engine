// ─── 결정적 리플레이: 한 판 → 링크 → 링크만으로 다시 → 같은 해시 ─────────────
import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { useLang } from '../i18n'
import { dataReady } from '../engine'
import type { ReplayProof as Proof } from '../proof/replay-proof'

export function ReplayProof() {
  const { t } = useLang()
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Proof | null>(null)
  const [err, setErr] = useState('')

  const run = async () => {
    setBusy(true); setErr('')
    try {
      const [{ proveReplay }] = await Promise.all([import('../proof/replay-proof'), dataReady])
      await new Promise(r => setTimeout(r, 30))
      setRes(await proveReplay(1 + Math.floor(Math.random() * 100_000)))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  return (
    <div className="rp">
      <ol className="rp-steps">
        <li><b>{t('한 판', 'Play')}</b> {t('무작위 시드, CPU 둘(3 vs 3)', 'random seed, two CPUs (3 vs 3)')}</li>
        <li><b>{t('링크로', 'Encode')}</b> {t('시드 + 팀 + 행동만 압축', 'seed + teams + actions, compressed')}</li>
        <li><b>{t('다시', 'Replay')}</b> {t('링크만으로 새 엔진에서, AI 없이', 'from the link alone, new engine, no AI')}</li>
      </ol>
      <div className="rp-bar">
        <Button label={res ? t('다른 시드로', 'Another seed') : t('돌려 보기', 'Run it')} variant="secondary" size="sm" onClick={run} isLoading={busy} />
        {res && (
          <span className={res.identical ? 'ok' : 'bad'}>
            {res.identical ? t('✓ 같은 배틀', '✓ Same battle') : t('✗ 다름', '✗ Different')}
          </span>
        )}
      </div>
      {err && <p className="verify-empty is-error">{err}</p>}
      {res && (
        <dl className="rp-out">
          <dt>{t('시드 · 행동 · 턴', 'Seed · actions · turns')}</dt>
          <dd className="num">{res.seed} · {res.actions} · {res.turns}</dd>
          <dt>{t('링크 길이', 'Link length')}</dt>
          <dd className="num">{res.link.length.toLocaleString()} {t('자', 'chars')}</dd>
          <dt>{t('원래 배틀 로그', 'Original log')}</dt>
          <dd><code>{res.original.hash.slice(0, 16)}…</code> <span className="muted">{res.original.lines} {t('줄', 'lines')}</span></dd>
          <dt>{t('링크로 다시 돌린 로그', 'Replayed from link')}</dt>
          <dd><code>{res.replayed.hash.slice(0, 16)}…</code> <span className="muted">{res.replayed.lines} {t('줄', 'lines')}</span></dd>
        </dl>
      )}
      {res && (
        <p className="rp-foot">
          <a className="more" href={`#/battle/replay?d=${res.link}`}>{t('이 배틀을 리플레이 화면에서 보기', 'Watch this battle in the replay viewer')} →</a>
        </p>
      )}
      {res && res.original.debug > 0 && (
        <p className="verify-fine">
          {t(`SHA-256은 |debug| 줄 ${res.original.debug}개를 빼고 계산했습니다. CPU가 행동을 고르며 미리 계산해 볼 때 원래 배틀에만 남는 줄로, Showdown도 디버그 모드에서만 내보냅니다.`,
            `The SHA-256 skips ${res.original.debug} |debug| lines: they are left in the original battle only while the CPU previews its options, and Showdown only emits them in debug mode.`)}
        </p>
      )}
    </div>
  )
}
