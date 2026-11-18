import { lazy, Suspense } from 'react'
import { AppShell } from '@astryxdesign/core/AppShell'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { Emblem } from './components/Emblem'
import { useRoute } from './router'
import { Landing } from './pages/Landing'
import { DOCS, DOC_GROUPS, docLead, docTitle, groupLabel } from './pages/docs'
import { LANGS, useLang, type Lang } from './i18n'

const REPO = 'https://github.com/2rangs/pokebattle-engine'

// 배틀 데모는 엔진 데이터·배틀 화면이 커서 따로 받는다
const Demo = lazy(() => import('./demo'))

export default function App() {
  const route = useRoute()
  const { lang, setLang, t } = useLang()
  const slug = route.startsWith('/docs/') ? route.slice(6) : null
  const doc = slug ? DOCS.find(d => d.slug === slug) ?? DOCS[0]! : null
  const idx = doc ? DOCS.indexOf(doc) : -1
  const demo = route === '/demo' || route.startsWith('/demo/') || route.startsWith('/demo?')

  const nav = [
    { label: t('문서', 'Docs'), href: '#/docs/introduction', on: doc?.group === 'start' },
    { label: 'API', href: '#/docs/engine', on: doc?.group === 'battle' },
    { label: t('도구', 'Tools'), href: '#/docs/damage', on: doc?.group === 'tools' },
    { label: t('연동', 'Integration'), href: '#/docs/react', on: doc?.group === 'integrate' },
    { label: t('데모', 'Demo'), href: '#/demo', on: demo },
  ]

  const header = (
    <header className="site-header">
      <div className="hdr-row wrap">
        <div className="hdr-start">
          <SegmentedControl label={t('언어', 'Language')} size="sm" value={lang} onChange={v => setLang(v as Lang)}>
            {LANGS.map(l => <SegmentedControlItem key={l.id} value={l.id} label={l.id.toUpperCase()} />)}
          </SegmentedControl>
        </div>
        <a className="brand" href="#/" aria-label="pokebattle-engine home">
          <Emblem size={28} />
          <span>pokebattle-engine</span>
        </a>
        <div className="hdr-end">
          <a className="hdr-link" href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <Button label={t('설치', 'Install')} size="sm" variant="primary" href="#/docs/installation" />
        </div>
      </div>
      <nav className="hdr-nav" aria-label={t('주 메뉴', 'Main')}>
        {nav.map(n => (
          <a key={n.href} href={n.href} aria-current={n.on ? 'page' : undefined}>{n.label}</a>
        ))}
      </nav>
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

  return (
    <AppShell height="auto" variant="section" topNav={header} sideNav={sideNav} mobileNav={false}>
      {doc ? (
        <article className="doc" key={`${doc.slug}-${lang}`}>
          <Text type="supporting">{groupLabel(doc.group, lang)}</Text>
          <Heading level={1} className="doc-title">{docTitle(doc, lang)}</Heading>
          <Text as="p" display="block" type="large" color="secondary">{docLead(doc, lang)}</Text>
          <div className="doc-body">{doc.body(t)}</div>
          <nav className="doc-pager" aria-label={t('이전/다음 문서', 'Previous / next')}>
            {idx > 0 && <a href={`#/docs/${DOCS[idx - 1]!.slug}`}><span>{t('이전', 'Previous')}</span>{docTitle(DOCS[idx - 1]!, lang)}</a>}
            {idx < DOCS.length - 1 && <a className="next" href={`#/docs/${DOCS[idx + 1]!.slug}`}><span>{t('다음', 'Next')}</span>{docTitle(DOCS[idx + 1]!, lang)}</a>}
          </nav>
        </article>
      ) : demo ? (
        <Suspense fallback={<div className="wrap demo-fallback" role="status">{t('데모를 불러오는 중…', 'Loading the demo…')}</div>}>
          <Demo route={route} />
        </Suspense>
      ) : (
        <Landing />
      )}
      <Footer lang={lang} />
    </AppShell>
  )
}

function Footer({ lang }: { lang: Lang }) {
  const t = <V,>(ko: V, en: V) => (lang === 'ko' ? ko : en)
  const cols: [string, [string, string][]][] = [
    [t('문서', 'Docs'), DOCS.filter(d => d.group === 'start' || d.group === 'battle').map(d => [docTitle(d, lang), `#/docs/${d.slug}`])],
    [t('도구', 'Tools'), DOCS.filter(d => d.group === 'tools' || d.group === 'integrate').map(d => [docTitle(d, lang), `#/docs/${d.slug}`])],
    [t('기반', 'Built on'), [
      ['Pokémon Showdown', 'https://github.com/smogon/pokemon-showdown'],
      ['@pkmn/sim', 'https://github.com/pkmn/ps'],
      ['@smogon/calc', 'https://github.com/smogon/damage-calc'],
      ['PokeAPI', 'https://pokeapi.co'],
    ]],
  ]
  return (
    <footer className="footer">
      <div className="footer-top wrap">
        <div className="footer-brand">
          <span className="brand"><Emblem size={24} /><span>pokebattle-engine</span></span>
          <Text as="p" display="block" type="supporting">
            {t('Pokémon Showdown 시뮬레이터 기반 TypeScript 배틀 엔진.', 'A TypeScript battle engine built on the Pokémon Showdown simulator.')}
          </Text>
        </div>
        {cols.map(([h, links]) => (
          <div key={h} className="footer-col">
            <Text type="label">{h}</Text>
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
        <span className="footer-note">{t('Pokémon은 Nintendo / Game Freak의 상표입니다.', 'Pokémon is a trademark of Nintendo / Game Freak.')}</span>
        <span className="footer-social">
          <a href={REPO} target="_blank" rel="noreferrer">Source</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Issues</a>
          <a href={`${REPO}/actions`} target="_blank" rel="noreferrer">CI</a>
        </span>
      </div>
    </footer>
  )
}
