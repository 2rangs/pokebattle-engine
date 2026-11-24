import { lazy, Suspense, useEffect } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Emblem } from './components/Emblem'
import { DocsMenu, DocToc } from './components/DocNav'
import { useRoute } from './router'
import { Landing } from './pages/Landing'
import { Changelog } from './pages/Changelog'
import { DOCS, DOC_GROUPS, docLead, docTitle, groupLabel } from './pages/docs'
import { LANGS, useLang, type Lang } from './i18n'

const REPO = 'https://github.com/2rangs/pokebattle-engine'

// 배틀 데모는 따로 받는다 (#/battle, #/battle/replay?d=…)
const BattlePage = lazy(() => import('./battle/BattlePage'))
const ReplayPage = lazy(() => import('./battle/ui/ReplayView'))

export default function App() {
  const route = useRoute()
  const { lang, setLang, t } = useLang()
  const [path, query = ''] = route.split('?')
  const battle = path === '/battle' || path === '/battle/replay' ? path : null
  const changelog = path === '/changelog'
  const slug = route.startsWith('/docs/') ? route.slice(6) : null
  const doc = slug ? DOCS.find(d => d.slug === slug) ?? DOCS[0]! : null
  const idx = doc ? DOCS.indexOf(doc) : -1

  // 문서/배틀 데모 두 갈래만. 문서 안의 갈래는 사이드 내비가 맡는다
  const nav = [
    { label: t('문서', 'Docs'), href: '#/docs/introduction', on: !!doc },
    { label: t('배틀 데모', 'Battle demo'), href: '#/battle', on: !!battle },
    { label: t('업데이트', 'Changelog'), href: '#/changelog', on: changelog },
  ]

  // 페이지마다 문서 제목. 배틀 화면은 BattlePage 가 직접 정한다
  useEffect(() => {
    if (battle) return
    document.title = doc
      ? `${docTitle(doc, lang)} - pokebattle-engine`
      : changelog
      ? `${t('업데이트 내역', 'Changelog')} - pokebattle-engine`
      : t('pokebattle-engine — Showdown과 같은 결과, 더 빠른 배틀 엔진', 'pokebattle-engine — Showdown-identical battles, faster')
  }, [battle, doc, changelog, lang, t])

  const header = (
    <header className="site-header">
      <div className="hdr-row wrap">
        <a className="brand" href="#/" aria-label={t('pokebattle-engine 홈', 'pokebattle-engine home')}>
          <Emblem size={26} />
          <span>pokebattle-engine</span>
        </a>
        <nav className="hdr-nav" aria-label={t('주 메뉴', 'Main')}>
          {nav.map(n => (
            <a key={n.href} href={n.href} aria-current={n.on ? 'page' : undefined}>{n.label}</a>
          ))}
        </nav>
        <div className="hdr-end">
          <SegmentedControl label={t('언어', 'Language')} size="sm" value={lang} onChange={v => setLang(v as Lang)}>
            {LANGS.map(l => <SegmentedControlItem key={l.id} value={l.id} label={l.id.toUpperCase()} />)}
          </SegmentedControl>
          <a className="hdr-link" href={REPO} target="_blank" rel="noreferrer">GitHub<span className="sr-only"> {t('(새 창)', '(opens in a new tab)')}</span></a>
        </div>
      </div>
    </header>
  )

  const sideNav = doc ? (
    <SideNav aria-label={t('문서 목차', 'Docs contents')}>
      {DOC_GROUPS.map(g => (
        <SideNavSection key={g.id} title={g[lang]}>
          {DOCS.filter(d => d.group === g.id).map(d => (
            <SideNavItem key={d.slug} label={docTitle(d, lang)} href={`#/docs/${d.slug}`} isSelected={d.slug === doc.slug} />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  ) : undefined

  const body = doc ? doc.body(t) : null
  const prev = idx > 0 ? DOCS[idx - 1] : undefined
  const next = idx >= 0 && idx < DOCS.length - 1 ? DOCS[idx + 1] : undefined

  return (
    <AppShell height="auto" variant="section" topNav={header} sideNav={sideNav} mobileNav={false}>
      {battle ? (
        <main className="bd-page wrap">
          <Suspense fallback={<div className="bd-loading" role="status">{t('불러오는 중…', 'Loading…')}</div>}>
            {battle === '/battle' ? <BattlePage /> : <ReplayPage query={query} />}
          </Suspense>
        </main>
      ) : doc ? (
        <article className="doc" key={`${doc.slug}-${lang}`}>
          <DocsMenu current={doc.slug} />
          <p className="doc-eyebrow">{groupLabel(doc.group, lang)}</p>
          <Heading level={1} className="doc-title">{docTitle(doc, lang)}</Heading>
          <Text as="p" display="block" type="large" color="secondary" className="doc-lead">{docLead(doc, lang)}</Text>
          <DocToc body={body!} />
          <div className="doc-body">{body}</div>
          <nav className="doc-pager" aria-label={t('이전/다음 문서', 'Previous / next')}>
            {prev && <a className="prev" href={`#/docs/${prev.slug}`}><span>← {t('이전', 'Previous')}</span>{docTitle(prev, lang)}</a>}
            {next && <a className="next" href={`#/docs/${next.slug}`}><span>{t('다음', 'Next')} →</span>{docTitle(next, lang)}</a>}
          </nav>
        </article>
      ) : changelog ? (
        <Changelog />
      ) : (
        <Landing />
      )}
      <Footer lang={lang} />
    </AppShell>
  )
}

function Footer({ lang }: { lang: Lang }) {
  const t = <V,>(ko: V, en: V) => (lang === 'ko' ? ko : en)
  const pick = (...slugs: string[]): [string, string][] =>
    slugs.map(sl => DOCS.find(d => d.slug === sl)!).map(d => [docTitle(d, lang), `#/docs/${d.slug}`])
  const cols: [string, [string, string][]][] = [
    [t('시작하기', 'Get started'), [...pick('introduction', 'installation', 'engine', 'performance'), [t('배틀 데모', 'Battle demo'), '#/battle']]],
    [t('가이드', 'Guides'), pick('events', 'logs', 'random', 'damage', 'cli')],
    [t('프로젝트', 'Project'), [
      [t('업데이트 내역', 'Changelog'), '#/changelog'],
      ['GitHub', REPO],
      [t('이슈', 'Issues'), `${REPO}/issues`],
      ['CI', `${REPO}/actions`],
      ['Pokémon Showdown', 'https://github.com/smogon/pokemon-showdown'],
      ['PokeAPI', 'https://pokeapi.co'],
    ]],
  ]
  return (
    <footer className="footer">
      <div className="footer-top wrap">
        <div className="footer-brand">
          <span className="brand"><Emblem size={22} /><span>pokebattle-engine</span></span>
          <Text as="p" display="block" type="supporting">
            {t('Pokémon Showdown 시뮬레이터 기반 TypeScript 배틀 엔진.', 'A TypeScript battle engine built on the Pokémon Showdown simulator.')}
          </Text>
        </div>
        {cols.map(([h, links]) => (
          <div key={h} className="footer-col">
            <h2 className="footer-h">{h}</h2>
            <ul>
              {links.map(([l, href]) => (
                <li key={l}><a href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{l}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="footer-bottom wrap">
        <span>© 2026 kyasi · MIT</span>
        <span>{t('Pokémon은 Nintendo / Game Freak의 상표입니다.', 'Pokémon is a trademark of Nintendo / Game Freak.')}</span>
      </div>
    </footer>
  )
}
