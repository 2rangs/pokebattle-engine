// ─── Showdown 대비 수치 비교 (한눈에) ─────────────────────────
// 측정값은 npm run bench:compare (Node 22, 형식마다 60판, 다섯 번 중 최고) 와 Pokestra 빌드에서 잰 값.
import { Text } from '@astryxdesign/core/Text'
import { useLang } from '../i18n'
import { ApiTable } from './Prose'

const BENCH = [
  { ko: '싱글', en: 'Singles', showdown: 1.001, engine: 0.622 },
  { ko: '더블', en: 'Doubles', showdown: 3.52, engine: 1.893 },
  { ko: '트리플', en: 'Triples', showdown: 5.71, engine: 3.133 },
] as const

const pct = (from: number, to: number) => Math.round((to / from - 1) * 100)

/** 핵심 수치 4개: 바뀐 값과 변화량 */
export function KpiRow() {
  const { t } = useLang()
  const s = BENCH[0]
  const tiles = [
    { label: t('싱글 턴당 시간', 'Time per turn, singles'), from: `${s.showdown.toFixed(3)} ms`, to: `${s.engine.toFixed(3)} ms`, delta: `${pct(s.showdown, s.engine)}%` },
    { label: t('턴 10만 개 처리', '100,000 turns'), from: t(`${(s.showdown * 100).toFixed(0)}초`, `${(s.showdown * 100).toFixed(0)} s`), to: t(`${(s.engine * 100).toFixed(0)}초`, `${(s.engine * 100).toFixed(0)} s`), delta: t(`${((s.showdown - s.engine) * 100).toFixed(0)}초 단축`, `${((s.showdown - s.engine) * 100).toFixed(0)} s saved`) },
    { label: t('앱 번들 (배틀 페이지)', 'App bundle (battle page)'), from: '8.7 MB', to: '3.4 MB', delta: `${pct(8.7, 3.4)}%` },
    { label: t('Showdown과 다른 결과', 'Results differing from Showdown'), from: '', to: t('0 / 20,000판', '0 / 20,000 battles'), delta: t('로그 바이트 단위 비교', 'byte-level log check') },
  ]
  return (
    <dl className="kpis">
      {tiles.map(k => (
        <div key={k.label} className="kpi">
          <dt>{k.label}</dt>
          <dd className="kpi-value">
            <span className="kpi-from">{k.from ? `${k.from} →` : '\u00a0'}</span>
            <span>{k.to}</span>
          </dd>
          <dd className="kpi-delta">{k.delta}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 형식별 턴당 시간: Showdown(회색) vs 이 엔진(파랑), 같은 축 */
export function SpeedBars() {
  const { t, lang } = useLang()
  const max = Math.max(...BENCH.map(b => b.showdown))
  const series = [
    { key: 'showdown' as const, name: t('Showdown 직접', 'Showdown directly'), cls: 'is-base' },
    { key: 'engine' as const, name: 'pokebattle-engine', cls: 'is-ours' },
  ]
  return (
    <figure className="bars" aria-label={t('형식별 턴당 처리 시간 (짧을수록 빠름)', 'Time per turn by format (shorter is faster)')}>
      <figcaption className="bars-head">
        <Text weight="medium">{t('턴당 처리 시간 (ms, 짧을수록 빠름)', 'Time per turn (ms, shorter is faster)')}</Text>
        <ul className="bars-legend">
          {series.map(s => <li key={s.key}><span className={`swatch ${s.cls}`} aria-hidden="true" />{s.name}</li>)}
        </ul>
      </figcaption>
      {BENCH.map(b => (
        <div key={b.en} className="bars-group">
          <div className="bars-label">
            <span>{lang === 'ko' ? b.ko : b.en}</span>
            <span className="bars-speedup">{(b.showdown / b.engine).toFixed(2)}× {t('빠름', 'faster')}</span>
          </div>
          {series.map(s => {
            const v = b[s.key]
            const tip = `${lang === 'ko' ? b.ko : b.en} · ${s.name}: ${v.toFixed(3)} ms/turn`
            return (
              <div key={s.key} className="bars-row" title={tip} aria-label={tip} role="img">
                <span className={`bar ${s.cls}`} style={{ width: `${(v / max) * 100}%` }} />
                <span className="bar-value">{v.toFixed(3)}</span>
              </div>
            )
          })}
        </div>
      ))}
    </figure>
  )
}

/** 기능·수치 차이표 (체크 표시 대신 실제 값) */
export function DiffTable() {
  const { t } = useLang()
  return (
    <ApiTable
      head={t(['항목', 'Showdown(@pkmn/sim) 직접', 'pokebattle-engine'], ['', 'Showdown (@pkmn/sim) directly', 'pokebattle-engine'])}
      rows={[
        [t('턴당 시간 (싱글 · 더블 · 트리플)', 'Time per turn (singles · doubles · triples)'), '1.00 · 3.52 · 5.71 ms', <b>0.62 · 1.89 · 3.13 ms</b>],
        [t('같은 시간에 돌리는 배틀 수', 'Battles in the same time'), '1×', <b>1.61× · 1.86× · 1.82×</b>],
        [t('결과 차이', 'Result difference'), '—', <b>{t('0 (20,000판 로그 비교)', '0 (20,000 battles, logs compared)')}</b>],
        [t('앱 번들 (배틀 페이지)', 'App bundle (battle page)'), t('8.7 MB, eval 경고 1개', '8.7 MB, 1 eval warning'), <b>{t('3.4 MB, 경고 0개', '3.4 MB, 0 warnings')}</b>],
        [t('처음에 받는 데이터', 'Data loaded up front'), t('1~9세대 + 전 세대 기술표', 'Gens 1–9 + all learnsets'), <b>{t('9세대만 (나머지는 필요할 때 60 kB~2.8 MB씩)', 'Gen 9 only (the rest on demand, 60 kB–2.8 MB each)')}</b>],
        [t('행동 입력', 'Actions'), t("문자열 'move 1 2, switch 3'", "Strings 'move 1 2, switch 3'"), <b>{t('객체 + 제출 전 검증 + 가능한 행동 목록', 'Objects + validation + list of legal actions')}</b>],
        [t('결과 형식', 'Output'), t('프로토콜 문자열 (직접 파싱)', 'Protocol strings (parse yourself)'), <b>{t('타입 있는 이벤트 34종', '34 typed event kinds')}</b>],
        [t('배틀 로그 문장', 'Battle log sentences'), t('0개 언어', '0 languages'), <b>{t('3개 언어 (ko·en·ja), 이름 9개 언어', '3 languages (ko, en, ja), names in 9')}</b>],
        [t('랜덤배틀', 'Random battles'), t('팀 생성기 따로 연결', 'Wire up the team generator yourself'), <b>{t('한 줄 (1~9세대, 레벨·역할 조회)', 'One line (Gen 1–9, level and role lookup)')}</b>],
      ]}
    />
  )
}
