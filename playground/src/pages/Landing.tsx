import type { ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { LogWindow } from '../components/ApiRun'
import { Emblem } from '../components/Emblem'
import { useLang } from '../i18n'
import type { ExampleId } from '../examples'
import { KpiRow, SpeedBars, DiffTable } from '../components/Compare'

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
    { n: '1.6–1.9×', l: t('Showdown 대비 턴당 속도', 'faster per turn than Showdown') },
    { n: '0', l: t('Showdown과 다른 로그 (바이트 단위)', 'log differences from Showdown (byte level)') },
    { n: 'Gen 1–9', l: t('세대별 배틀 · 랜덤배틀', 'battles and random battles') },
    { n: 'ko · en · ja', l: t('배틀 로그 언어', 'battle log languages') },
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
      title: t('로그 한 줄이 이벤트 하나, 문장은 세 언어로', 'One log line, one event, three languages'),
      body: t(
        'Showdown이 로그를 쓰는 순간 타입 있는 이벤트가 나갑니다. 이벤트만 재생해도 HP가 시뮬레이터와 일치하고, createFormatter가 한국어·영어·일본어 문장으로 바꿉니다. 이름은 PokeAPI 데이터에서 옵니다.',
        'A typed event fires the moment Showdown writes a log line. Replaying events alone matches the simulator’s HP, and createFormatter turns them into Korean, English or Japanese. Names come from PokeAPI data.',
      ),
      id: 'formatMulti', cmd: "createFormatter({ locale: 'en', getPokemon }).format(ev)", href: '#/docs/logs',
    },
    {
      title: t('Smogon 랜덤배틀 그대로', 'Smogon random battles, as is'),
      body: t(
        'Showdown 공식 생성기의 팀·밸런스 레벨·규칙으로 1~9세대 랜덤배틀을 한 줄에 만듭니다. 포켓몬별 레벨·역할·기술 후보도 조회할 수 있습니다.',
        'One line builds a Gen 1–9 random battle with the official Showdown generator’s teams, balanced levels and rules. Each species’ level, roles and candidate moves are queryable too.',
      ),
      id: 'randomSets', cmd: "getRandomBattleSet('garchomp')", href: '#/docs/random',
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
    { k: 'CLI', d: t('npx pokebattle play / watch / sim', 'npx pokebattle play / watch / sim'), code: 'npx pokebattle watch --lang en', href: '#/docs/cli' },
  ]

  const guides: { title: string; meta: string; href: string; id?: ExampleId; cmd?: string }[] = [
    { title: t('첫 배틀 돌려보기', 'Run your first battle'), meta: t('시작하기', 'Getting started'), href: '#/docs/introduction', id: 'quickstart', cmd: 'tsx quickstart.ts' },
    { title: t('이벤트로 HP 복원하기', 'Rebuild HP from events'), meta: t('배틀', 'Battles'), href: '#/docs/events' },
    { title: t('Showdown과 속도 비교하기', 'Compare speed with Showdown'), meta: t('시작하기', 'Getting started'), href: '#/docs/performance' },
    { title: t('7세대 메가진화 배틀', 'A Gen 7 Mega Evolution battle'), meta: t('배틀', 'Battles'), href: '#/docs/generations' },
    { title: t('터미널에서 직접 플레이', 'Play in the terminal'), meta: t('도구', 'Tools'), href: '#/docs/cli' },
  ]
  const [featured, ...rest] = guides

  return (
    <div className="landing">
      {/* ─── Hero ─────────────────────────────────────────── */}
      <section className="hero wrap">
        <div className="hero-copy">
          <Heading level={1} className="hero-title">
            {t('Showdown 판정 그대로, 더 빠르고 쉽게', 'Showdown-accurate battles, faster and simpler')}
          </Heading>
          <Text as="p" display="block" type="large" color="secondary">
            {t(
              'Pokémon Showdown 시뮬레이터와 결과가 같으면서 턴당 1.6~1.9배 빠른 TypeScript 배틀 엔진. 객체로 내는 행동, 타입 있는 이벤트, 3개 언어 로그, 1~9세대 랜덤배틀, CLI.',
              'A TypeScript battle engine with the same results as the Pokémon Showdown simulator, 1.6–1.9× faster per turn. Object actions, typed events, logs in three languages, Gen 1–9 random battles and a CLI.',
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

      {/* ─── Performance ──────────────────────────────────── */}
      <section className="band wrap">
        <SectionHead
          title={<>{t('Showdown보다', 'Faster than')}<br />{t('빠르게, 결과는 같게', 'Showdown, same results')}</>}
          sub={t(
            '같은 배틀(같은 시드·팀·선택)을 Smogon의 Pokémon Showdown 시뮬레이터에 직접 재생한 시간과 이 엔진의 시간. 모든 배틀의 프로토콜 로그가 바이트 단위로 같습니다.',
            'The same battles (same seed, teams and choices) replayed directly on Smogon’s Pokémon Showdown simulator and on this engine. Every battle’s protocol log is byte-identical.',
          )}
          action={<Button label={t('측정 방법', 'Methodology')} size="sm" variant="secondary" href="#/docs/performance" />}
        />
        <KpiRow />
        <SpeedBars />
        <Text as="p" display="block" type="supporting">
          {t('Node 22, 형식마다 60판, 최고 기록. npm run bench:compare 로 직접 재현할 수 있고, 성능 문서에서 이 브라우저로도 재 볼 수 있습니다.', 'Node 22, 60 battles per format, best run. Reproduce with npm run bench:compare, or measure in this browser on the performance page.')}
        </Text>
      </section>

      {/* ─── Comparison ───────────────────────────────────── */}
      <section className="band wrap">
        <SectionHead
          title={<>{t('시뮬레이터를 직접 쓸 때와', 'The engine against')}<br />{t('수치로 비교', 'the raw simulator, in numbers')}</>}
          action={<Button label={t('가이드 읽기', 'Read the guide')} size="sm" variant="secondary" href="#/docs/engine" />}
        />
        <DiffTable />
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
          <Text as="p" display="block" color="secondary">{t('타입 선언 포함. 무거운 데이터(랜덤배틀 세트·기술표·옛 세대)는 preloadData 로 필요할 때만 받습니다.', 'Types included. Heavy data (random-battle sets, learnsets, older generations) loads only when you call preloadData.')}</Text>
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
