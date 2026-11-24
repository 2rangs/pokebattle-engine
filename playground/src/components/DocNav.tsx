import { Children, isValidElement, type MouseEvent, type ReactNode } from 'react'
import { H2 } from './Prose'
import { sectionId } from './section-id'
import { DOCS, DOC_GROUPS, docTitle } from '../pages/docs'
import { useLang } from '../i18n'

/** 좁은 화면(사이드 내비가 숨는 폭)에서 문서 목차를 접었다 펴는 메뉴 */
export function DocsMenu({ current }: { current: string }) {
  const { t, lang } = useLang()
  const doc = DOCS.find(d => d.slug === current)!
  return (
    <details className="docs-menu">
      <summary>
        <span className="docs-menu-label">{t('문서 목차', 'Docs menu')}</span>
        <span className="docs-menu-current">{docTitle(doc, lang)}</span>
      </summary>
      <nav aria-label={t('문서 목차', 'Docs contents')}>
        {DOC_GROUPS.map(g => (
          <div key={g.id} className="docs-menu-group">
            <p>{g[lang]}</p>
            <ul>
              {DOCS.filter(d => d.group === g.id).map(d => (
                <li key={d.slug}>
                  <a href={`#/docs/${d.slug}`} aria-current={d.slug === current ? 'page' : undefined}>{docTitle(d, lang)}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </details>
  )
}

/** 문서 본문의 H2 를 모은 "이 페이지에서" 목록. 섹션이 셋 이상일 때만 */
export function DocToc({ body }: { body: ReactNode }) {
  const { t } = useLang()
  const root = isValidElement<{ children?: ReactNode }>(body) ? body.props.children : body
  const heads = Children.toArray(root)
    .filter(c => isValidElement<{ children: string }>(c) && c.type === H2)
    .map(c => (c as { props: { children: string } }).props.children)
  if (heads.length < 3) return null
  // 해시는 라우터가 쓰므로 앵커 대신 스크롤로 이동
  const go = (e: MouseEvent, id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }
  return (
    <nav className="doc-toc" aria-label={t('이 페이지에서', 'On this page')}>
      <p>{t('이 페이지에서', 'On this page')}</p>
      <ol>
        {heads.map(h => (
          <li key={h}><a href={window.location.hash} onClick={e => go(e, sectionId(h))}>{h}</a></li>
        ))}
      </ol>
    </nav>
  )
}
