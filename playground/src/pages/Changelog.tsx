import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CHANGELOG, type ChangeArea, type ChangeEntry, type ChangeKind } from '../changelog'
import { useLang } from '../i18n'
import './changelog.css'

const KIND: Record<ChangeKind, [string, string]> = {
  new: ['새 기능', 'New'],
  improved: ['개선', 'Improved'],
  fixed: ['수정', 'Fixed'],
}
const AREA: Record<ChangeArea, [string, string]> = {
  demo: ['배틀 데모', 'Battle demo'],
  engine: ['엔진', 'Engine'],
  site: ['문서·사이트', 'Docs & site'],
}

/** 같은 날짜끼리 묶는다. 배열 순서(최신이 위)를 그대로 따른다 */
function byDate(list: readonly ChangeEntry[]): [string, ChangeEntry[]][] {
  const out: [string, ChangeEntry[]][] = []
  for (const e of list) {
    const last = out[out.length - 1]
    if (last && last[0] === e.date) last[1].push(e)
    else out.push([e.date, [e]])
  }
  return out
}

function formatDate(iso: string, lang: 'ko' | 'en') {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  // 시간대와 무관하게 적힌 날짜 그대로
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

export function Changelog() {
  const { t, lang } = useLang()
  const pick = (v: readonly [string, string]) => (lang === 'ko' ? v[0] : v[1])
  return (
    <article className="doc changelog" key={lang}>
      <p className="doc-eyebrow">pokebattle-engine</p>
      <Heading level={1} className="doc-title">{t('업데이트 내역', 'Changelog')}</Heading>
      <Text as="p" display="block" type="large" color="secondary" className="doc-lead">
        {t('배틀 데모, 엔진, 문서에 새로 생기거나 바뀐 것을 날짜별로 모았습니다. 최신 소식이 위에 있습니다.',
          'What’s new and changed in the battle demo, the engine and the docs, by date. Newest first.')}
      </Text>
      <div className="cl-days">
        {byDate(CHANGELOG).map(([date, entries]) => (
          <section key={date} className="cl-day" aria-labelledby={`cl-${date}`}>
            <h2 className="cl-date" id={`cl-${date}`}><time dateTime={date}>{formatDate(date, lang)}</time></h2>
            <div className="cl-entries">
              {entries.map(e => (
                <div key={e.title[1]} className="cl-entry">
                  <div className="cl-meta">
                    <span className={`cl-kind cl-kind-${e.kind}`}>{pick(KIND[e.kind])}</span>
                    <span className="cl-area">{pick(AREA[e.area])}</span>
                  </div>
                  <h3 className="cl-title">{pick(e.title)}</h3>
                  <ul className="cl-points">
                    {e.points.map(p => <li key={p[1]}>{pick(p)}</li>)}
                  </ul>
                  {e.link && <a className="cl-link" href={e.link.href}>{pick(e.link.label)} →</a>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
