import type { ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Badge } from '@astryxdesign/core/Badge'
import { LogWindow } from '../components/ApiRun'
import { Emblem } from '../components/Emblem'
import { useLang } from '../i18n'
import type { ExampleId } from '../examples'

const REPO = 'https://github.com/2rangs/pokebattle-engine'
const INSTALL = 'npm install github:2rangs/pokebattle-engine'

/** 섹션 머리: 두 줄 제목은 왼쪽, 작은 컨트롤 하나는 같은 줄 오른쪽 (제목 마지막 줄 기준) */
function SectionHead({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action: ReactNode }) {
  return (
    <div className="sec-head">
      <div className="sec-head-text">
        <Heading level={2} className="sec-title">{title}</Heading>
        {sub && <Text as="p" display="block" color="secondary">{sub}</Text>}
      </div>
      <div className="sec-action">{action}</div>
    </div>
  )
}

export function Landing() {
  const { t } = useLang()

  const numbers = [
    { n: '1,351', l: t('PokeAPI 슬러그 매핑', 'PokeAPI slugs mapped') },
    { n: '10M', l: t('배틀 규모 샤드 퍼징', 'battles per sharded fuzz run') },
    { n: '7', l: t('배틀마다 검사하는 불변식', 'invariants per battle') },
    { n: '0', l: t('미처리 프로토콜 메시지', 'unhandled protocol lines') },
  ]

  const compare: { label: string; ours: boolean; raw: boolean }[] = [
    { label: t('Showdown과 같은 판정', 'Showdown-accurate mechanics'), ours: true, raw: true },
    { label: t('객체 입력 + 제출 전 검증', 'Object actions, validated before submit'), ours: true, raw: false },
    { label: t('PokeAPI 슬러그·한국어 이름', 'PokeAPI slugs and Korean names'), ours: true, raw: false },
    { label: t('타입 있는 이벤트 스트림', 'Typed event stream'), ours: true, raw: false },
    { label: t('한국어 배틀 로그', 'Korean battle log'), ours: true, raw: false },
    { label: t('배틀 상태 기반 데미지 미리보기', 'Damage preview from live state'), ours: true, raw: false },
  ]

  const builtOn = ['Pokémon Showdown', '@pkmn/sim', '@smogon/calc', 'PokeAPI', 'TypeScript', 'React']

  const features: { title: string; body: string; id: ExampleId; cmd: string; href: string }[] = [
    {
      title: t('요청을 읽고 객체로 제출', 'Read the request, submit an object'),
      body: t(
        'getRequest가 지금 고를 수 있는 기술·교체·테라스탈을 돌려주고, submitAction이 양쪽이 모두 내면 턴을 실행합니다. 낼 수 없는 행동은 BattleError로 거절됩니다.',
        'getRequest returns the moves, switches and Tera you can pick now. submitAction runs the turn once both sides are in. Illegal actions are rejected with a BattleError.',
      ),
      id: 'request', cmd: "engine.getRequest('p1')", href: '#/docs/engine',
    },
    {
      title: t('로그 한 줄이 이벤트 하나', 'One log line, one event'),
      body: t(
        'Showdown이 로그를 쓰는 순간 타입 있는 이벤트가 나갑니다. 이벤트만 재생해도 HP가 시뮬레이터와 일치하고, formatEvent가 한국어 문장으로 바꿉니다.',
        'A typed event fires the moment Showdown writes a log line. Replaying events alone matches the simulator’s HP, and formatEvent turns them into Korean sentences.',
      ),
      id: 'formatKo', cmd: "engine.on('*', ev => formatEvent(ev, ctx))", href: '#/docs/events',
    },
    {
      title: t('Showdown 계산기와 같은 숫자', 'Same numbers as the Showdown calc'),
      body: t(
        '@smogon/calc 그대로라 난수 16단계, KO 확률, 설명 문자열까지 같습니다. 슬러그 입력과 한국어 KO 문구만 더했습니다.',
        'It is @smogon/calc underneath, so the 16 rolls, KO chance and description match. Slug input and Korean KO text are the only additions.',
      ),
      id: 'damage', cmd: "calculateDamage(garchomp, gholdengo, 'earthquake')", href: '#/docs/damage',
    },
  ]

  const entries = [
    { k: 'ESM', d: t('import 로 불러오기', 'Load with import'), code: "import { BattleEngine } from '@kyasi/pokebattle-engine'", href: '#/docs/installation' },
    { k: 'CommonJS', d: t('require 로 불러오기', 'Load with require'), code: "require('@kyasi/pokebattle-engine')", href: '#/docs/installation' },
    { k: 'React', d: t('useBattle 훅', 'The useBattle hook'), code: "import { useBattle } from '@kyasi/pokebattle-engine/react'", href: '#/docs/react' },
  ]

  const guides: { title: string; meta: string; href: string; id?: ExampleId; cmd?: string }[] = [
    { title: t('첫 배틀 돌려보기', 'Run your first battle'), meta: t('시작하기', 'Getting started'), href: '#/docs/introduction', id: 'quickstart', cmd: 'tsx quickstart.ts' },
    { title: t('이벤트로 HP 복원하기', 'Rebuild HP from events'), meta: t('배틀', 'Battles'), href: '#/docs/events' },
    { title: t('AI 벤치마크 돌리기', 'Benchmark the AIs'), meta: t('도구', 'Tools'), href: '#/docs/ai' },
  ]
  const [featured, ...rest] = guides

  return (
    <div className="landing">
      {/* ─── Hero ─────────────────────────────────────────── */}
      <section className="hero wrap">
        <div className="hero-copy">
          <Heading level={1} className="hero-title">
            {t('Showdown 판정 그대로, 타입 있는 배틀 API', 'Showdown-accurate battles, typed API')}
          </Heading>
          <Text as="p" display="block" type="large" color="secondary">
            {t(
              'Pokémon Showdown 시뮬레이터 위에 슬러그 기반 팀·행동 API, 이벤트 스트림, 데미지 계산, AI를 얹은 TypeScript 라이브러리.',
              'A TypeScript library that adds a slug-based team and action API, an event stream, damage calculation and AI on top of the Pokémon Showdown simulator.',
            )}
          </Text>
          <div className="actions">
            <Button label={t('문서 읽기', 'Read the docs')} variant="primary" href="#/docs/introduction" />
            <Button label={t('소스 보기', 'View the source')} variant="secondary" href={REPO} target="_blank" />
          </div>
          <div className="install-line">
            <CodeBlock code={INSTALL} language="bash" hasLanguageLabel={false} width="100%" />
          </div>
        </div>
        <div className="hero-art"><Emblem size={300} label={t('킬가르도 실드폼과 블레이드폼', 'Aegislash, Shield and Blade Forme')} /></div>

        <dl className="numbers">
          {numbers.map(x => (
            <div key={x.l}><dt>{x.n}</dt><dd>{x.l}</dd></div>
          ))}
        </dl>
      </section>

      {/* ─── Comparison ───────────────────────────────────── */}
      <section className="band wrap">
        <SectionHead
          title={<>{t('시뮬레이터를', 'The engine against')}<br />{t('직접 쓸 때와 비교', 'the raw simulator')}</>}
          action={<Button label={t('가이드 읽기', 'Read the guide')} size="sm" variant="secondary" href="#/docs/engine" />}
        />
        <div className="compare">
          <div className="compare-card is-ours">
            <div className="compare-h">pokebattle-engine <Badge label={t('이 엔진', 'Ours')} variant="blue" /></div>
            <ul>{compare.map(r => <li key={r.label}><Mark on={r.ours} />{r.label}</li>)}</ul>
          </div>
          <div className="compare-card">
            <div className="compare-h">{t('@pkmn/sim 직접 사용', '@pkmn/sim directly')}</div>
            <ul>{compare.map(r => <li key={r.label} className={r.raw ? '' : 'is-off'}><Mark on={r.raw} />{r.label}</li>)}</ul>
          </div>
        </div>
        <Text as="p" display="block" type="supporting">
          {t('엔진 아래의 Showdown Battle 객체는 engine.battle 로 그대로 열려 있습니다.', 'The Showdown Battle underneath stays reachable as engine.battle.')}
        </Text>
      </section>

      {/* ─── Built on ─────────────────────────────────────── */}
      <section className="band wrap built">
        <div className="built-caption">
          <Text weight="medium">{t('이 위에서 동작합니다', 'Built on')}</Text>
          <Text as="p" display="block" type="supporting">{t('판정·계산·데이터는 검증된 오픈소스를 그대로 씁니다.', 'Mechanics, maths and data come from proven open source.')}</Text>
        </div>
        <ul className="marks">
          {builtOn.map(m => <li key={m}><span className="mark-dot" aria-hidden="true" />{m}</li>)}
        </ul>
      </section>

      {/* ─── Features ─────────────────────────────────────── */}
      <section className="band wrap">
        <SectionHead
          title={<>{t('화면 없이 텍스트만으로', 'The whole battle,')}<br />{t('배틀 전체를 다룹니다', 'as text')}</>}
          action={<Button label={t('문서 읽기', 'Read the docs')} size="sm" variant="secondary" href="#/docs/engine" />}
        />
        <div className="features">
          {features.map((f, i) => (
            <article key={f.id} className={`feature${i % 2 ? ' is-flipped' : ''}`}>
              <LogWindow id={f.id} title="output" command={f.cmd} maxHeight={280} />
              <div className="feature-copy">
                <Heading level={3}>{f.title}</Heading>
                <Text as="p" display="block" color="secondary">{f.body}</Text>
                <a className="more" href={f.href}>{t('자세히', 'Learn more')} →</a>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ─── Install ──────────────────────────────────────── */}
      <section className="band wrap install">
        <div className="install-main">
          <Heading level={2} className="sec-title">{t('한 줄로 설치', 'Install in one line')}</Heading>
          <Text as="p" display="block" color="secondary">{t('타입 선언 포함. 데이터는 번들에 들어 있어 따로 받지 않습니다.', 'Types included. Data ships in the bundle, nothing else to fetch.')}</Text>
          <CodeBlock code={INSTALL} language="bash" hasLanguageLabel={false} width="100%" />
        </div>
        <ul className="entries">
          {entries.map(e => (
            <li key={e.k}>
              <div><Text weight="medium">{e.k}</Text><Text as="p" display="block" type="supporting">{e.d}</Text></div>
              <Button label={t('가이드', 'Guide')} size="sm" variant="secondary" href={e.href} />
            </li>
          ))}
        </ul>
      </section>

      {/* ─── Guides ───────────────────────────────────────── */}
      <section className="band wrap">
        <SectionHead
          title={<>{t('가이드와', 'Guides and')}<br />{t('예제', 'examples')}</>}
          action={<Button label={t('모든 문서', 'All docs')} size="sm" variant="secondary" href="#/docs/introduction" />}
        />
        <div className="guides">
          <a className="guide-featured" href={featured!.href}>
            <LogWindow id={featured!.id!} title="quickstart.ts" command={featured!.cmd!} maxHeight={260} />
            <Text type="supporting">{featured!.meta}</Text>
            <Heading level={3} className="guide-title">{featured!.title}</Heading>
          </a>
          <ul className="guide-list">
            {rest.map(g => (
              <li key={g.href}>
                <a href={g.href}>
                  <Text type="supporting">{g.meta}</Text>
                  <Text weight="medium">{g.title}</Text>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Closing ──────────────────────────────────────── */}
      <section className="band wrap">
        <div className="closing">
          <Heading level={2} className="sec-title">{t('첫 배틀은 스무 줄이면 됩니다.', 'Your first battle is twenty lines.')}</Heading>
          <Text as="p" display="block" color="secondary">
            {t('같은 seed는 언제나 같은 로그를 냅니다. 문서의 예제를 그대로 실행해 보세요.', 'The same seed always prints the same log. Run the examples straight from the docs.')}
          </Text>
          <div className="actions is-center">
            <Button label={t('문서 읽기', 'Read the docs')} variant="primary" href="#/docs/introduction" />
            <Button label={t('소스 보기', 'View the source')} variant="secondary" href={REPO} target="_blank" />
          </div>
        </div>
      </section>
    </div>
  )
}

function Mark({ on }: { on: boolean }) {
  return on
    ? <svg className="mk on" width="16" height="16" viewBox="0 0 16 16" aria-label="yes"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : <svg className="mk" width="16" height="16" viewBox="0 0 16 16" aria-label="no"><path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}
