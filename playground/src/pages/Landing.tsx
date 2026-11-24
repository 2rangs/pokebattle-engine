import { useState, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { LogWindow } from '../components/ApiRun'
import { Emblem } from '../components/Emblem'
import { VerifyNow } from '../components/VerifyNow'
import { ReplayProof } from '../components/ReplayProof'
import { examples, localizeCode, type LogLang } from '../examples'
import { useLang } from '../i18n'
import { blob, tree, workflow } from '../repo'

const INSTALL = 'npm install github:2rangs/pokebattle-engine'
// 빌드할 때 저장소에서 읽은 값 (vite.config.ts) — 손으로 적은 숫자가 아니다
const STATS = __REPO_STATS__

/** 근거 링크 하나: 무엇을 가리키는지 + 어디로 */
function Ev({ href, children }: { href: string; children: ReactNode }) {
  return <li><a className="ev" href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a></li>
}

export function Landing() {
  const { t, lang } = useLang()
  const [logLang, setLogLang] = useState<LogLang | null>(null)
  const shownLog: LogLang = logLang ?? lang
  const scrollToVerify = () => {
    const el = document.getElementById('verify')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el?.focus({ preventScroll: true })
  }
  // 보여주는 코드도 고른 로그 언어에 맞춘다 (일본어는 이름 팩을 먼저 받는 한 줄이 붙는다)
  let code = localizeCode(examples.quickstart.code, lang).replace(/locale: '(ko|en)'/, `locale: '${shownLog}'`)
  if (shownLog === 'ja') {
    code = code
      .replace('createFormatter, generateRandomTeam }', 'createFormatter, generateRandomTeam, loadNames }')
      .replace('const log = createFormatter(', `await loadNames('ja') // ${t('일본어 이름 팩 (지연 로드)', 'Japanese name pack (lazy-loaded)')}\nconst log = createFormatter(`)
  }

  return (
    <div className="landing">
      {/* ─── Hero: 주장 하나 + "직접 확인" ─────────── */}
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">{t('TypeScript 포켓몬 배틀 엔진', 'TypeScript Pokémon battle engine')}</p>
          <Heading level={1} className="hero-title">
            {t(<>Showdown과 바이트 단위로 같은 배틀을, 더 빠르게</>, <>Byte-for-byte Showdown battles, faster</>)}
          </Heading>
          <Text as="p" display="block" type="large" color="secondary" className="hero-sub">
            {t(
              'Pokémon Showdown 시뮬레이터 위에서 돌면서 결과는 그대로, 턴은 더 빠르게. 숫자를 믿지 말고 아래에서 직접 돌려 보세요.',
              'Runs on the Pokémon Showdown simulator: same results, faster turns. Don’t take our numbers for it — run the check below.',
            )}
          </Text>
          <div className="actions">
            <Button label={t('지금 직접 확인', 'Verify it now')} variant="primary" onClick={scrollToVerify} />
            <Button label={t('배틀 데모', 'Battle demo')} variant="secondary" href="#/battle" />
            <Button label={t('문서', 'Docs')} variant="ghost" href="#/docs/introduction" />
          </div>
        </div>
        <div className="hero-art"><Emblem size={240} label={t('킬가르도 실드폼과 블레이드폼', 'Aegislash, Shield and Blade Forme')} /></div>
      </section>

      {/* ─── 1. 핵심 주장을 이 브라우저에서 ─────────── */}
      <section className="section wrap is-tight" aria-labelledby="verify">
        <div className="sec-head">
          <p className="claim-no">{t('직접 확인', 'Check it yourself')}</p>
          <Heading level={2} className="sec-title" id="verify" tabIndex={-1}>
            {t('같은 배틀을 Showdown과 이 엔진에 넣고 비교', 'Feed the same battles to Showdown and to this engine')}
          </Heading>
          <Text as="p" display="block" color="secondary">
            {t(
              '시드·팀·선택이 같은 배틀을 두 번 돌립니다. 한 번은 Showdown 시뮬레이터에 직접, 한 번은 pokebattle-engine으로. 둘 다 이 브라우저의 웹 워커에서 돕니다.',
              'Each battle (seed, teams, choices) runs twice — once on the Showdown simulator directly, once on pokebattle-engine — both in a web worker in this browser.',
            )}
          </Text>
        </div>
        <VerifyNow />
        <ul className="evs">
          <Ev href={blob('playground/src/proof/compare.ts')}>{t('이 비교의 코드', 'The code of this check')}</Ev>
          <Ev href={blob('scripts/bench-compare.ts')}>{t('Node 벤치 (README 수치)', 'Node benchmark (README numbers)')}</Ev>
          <Ev href={blob('scripts/check-dist.ts')}>{t('번들 = npm @pkmn/sim 확인', 'Bundle = npm @pkmn/sim check')}</Ev>
        </ul>
      </section>

      {/* ─── 2~4. 나머지 주장: 근거 또는 실행 ─────────── */}
      <section className="section wrap" aria-labelledby="claims">
        <div className="sec-head">
          <Heading level={2} className="sec-title" id="claims">{t('다른 주장도 확인할 수 있게', 'The other claims, checkable too')}</Heading>
        </div>

        <div className="claims">
          {/* CI */}
          <article className="claim">
            <div className="claim-text">
              <Heading level={3} className="claim-title">{t('푸시마다 도는 테스트', 'Tests on every push')}</Heading>
              <Text as="p" display="block" color="secondary">
                {t(
                  `테스트 ${STATS.tests}개(${STATS.testFiles}개 파일), 세대별 전체 로그 스냅샷 ${STATS.snapshots}개, 모든 기술·특성·도구를 넣어 보는 회귀 스윕, 불변식 ${STATS.fuzzInvariants}개를 검사하는 퍼징 10,000판. 결과는 아래 CI 기록에 그대로 남습니다.`,
                  `${STATS.tests} tests in ${STATS.testFiles} files, ${STATS.snapshots} full-log snapshots across generations, a regression sweep over every move, ability and item, and 10,000 fuzzed battles checking ${STATS.fuzzInvariants} invariants. The record is in the CI runs below.`,
                )}
              </Text>
              <p className="claim-src">
                {t(`숫자는 빌드할 때 저장소에서 셉니다 (${STATS.source === 'vitest list' ? 'vitest list' : '소스의 it()/test()'}${STATS.commit ? `, ${STATS.commit.slice(0, 7)}` : ''}).`,
                  `Counted from the repository at build time (${STATS.source}${STATS.commit ? `, ${STATS.commit.slice(0, 7)}` : ''}).`)}
              </p>
            </div>
            <div className="claim-proof">
              <a className="badge-link" href={workflow('ci.yml')} target="_blank" rel="noreferrer">
                <img src={`${workflow('ci.yml')}/badge.svg?branch=main`} alt={t('CI 상태 (main)', 'CI status (main)')} height={20} />
                <span>{t('CI 실행 기록', 'CI runs')} ↗</span>
              </a>
              <ul className="evs is-col">
                <Ev href={tree('src/tests')}>{t(`테스트 파일 ${STATS.testFiles}개`, `${STATS.testFiles} test files`)}</Ev>
                <Ev href={blob('src/tests/engine/__snapshots__/regression.test.ts.snap')}>{t('회귀 스냅샷 (전체 로그)', 'Regression snapshot (full logs)')}</Ev>
                <Ev href={blob('scripts/regression.ts')}>{t('회귀 스윕 스크립트', 'Regression sweep script')}</Ev>
                <Ev href={blob('scripts/fuzz.ts', STATS.fuzzInvariantLines)}>{t(`퍼징 불변식 ${STATS.fuzzInvariants}개`, `The ${STATS.fuzzInvariants} fuzz invariants`)}</Ev>
                <Ev href={blob('.github/workflows/ci.yml')}>{t('CI 단계 (리포트는 실행마다 아티팩트로)', 'CI steps (reports uploaded as artifacts)')}</Ev>
                <Ev href={workflow('fuzz.yml')}>{t('대량 퍼징 워크플로 (수동 실행)', 'Sharded fuzz workflow (manual)')}</Ev>
              </ul>
            </div>
          </article>

          {/* 결정적 리플레이 */}
          <article className="claim">
            <div className="claim-text">
              <Heading level={3} className="claim-title">{t('같은 시드 + 같은 행동 = 같은 배틀', 'Same seed + same actions = same battle')}</Heading>
              <Text as="p" display="block" color="secondary">
                {t(
                  '배틀 데모의 리플레이는 서버 없이 링크 하나에 담깁니다. 한 판을 링크로 만들고, 그 링크만으로 다시 돌려 두 로그의 해시를 비교해 보세요.',
                  'Battle demo replays fit in one link, no server. Turn a battle into a link, re-simulate from the link alone, and compare the two log hashes.',
                )}
              </Text>
            </div>
            <div className="claim-proof"><ReplayProof /></div>
          </article>

          {/* 다국어 로그 */}
          <article className="claim is-wide">
            <div className="claim-text">
              <Heading level={3} className="claim-title">{t('같은 배틀, 세 언어의 로그', 'One battle, logs in three languages')}</Heading>
              <Text as="p" display="block" color="secondary">
                {t(
                  '오른쪽은 왼쪽 코드를 지금 이 브라우저에서 돌린 결과입니다. 언어를 바꾸면 같은 배틀(시드 42)을 그 언어로 다시 돌립니다. 이름은 PokeAPI 데이터, 한국어 조사도 처리합니다.',
                  'The right pane is the code on the left, run in this browser just now. Switch the language to re-run the same battle (seed 42) in it. Names come from PokeAPI data; Korean particles are handled.',
                )}
              </Text>
            </div>
            <div className="code-demo">
              <CodeBlock code={code} language="ts" title="quickstart.ts" width="100%" maxHeight={420} />
              <LogWindow
                id="quickstart" title="output" command="tsx quickstart.ts" maxHeight={420} logLang={shownLog}
                toolbar={
                  <SegmentedControl label={t('로그 언어', 'Log language')} size="sm" value={shownLog} onChange={v => setLogLang(v as LogLang)}>
                    <SegmentedControlItem value="ko" label="한국어" />
                    <SegmentedControlItem value="en" label="EN" />
                    <SegmentedControlItem value="ja" label="日本語" />
                  </SegmentedControl>
                }
              />
            </div>
          </article>
        </div>

        <p className="sec-foot muted">
          {t('그 밖의 기능(1~9세대 기믹, 더블·트리플·로테이션)은 ', 'Other features (Gen 1–9 gimmicks, doubles, triples, rotation) are covered by ')}
          <a className="more" href={blob('src/tests/engine/gimmicks.test.ts')} target="_blank" rel="noreferrer">gimmicks.test.ts</a>{' · '}
          <a className="more" href={blob('src/tests/engine/formats.test.ts')} target="_blank" rel="noreferrer">formats.test.ts</a>
          {t('에서 확인하고, ', '; try them in the ')}
          <a className="more" href="#/battle">{t('배틀 데모', 'battle demo')}</a>{t('에서 직접 써 보세요.', '.')}
        </p>
      </section>

      {/* ─── 마무리 ─────────────────────────────────────── */}
      <section className="section wrap">
        <div className="closing">
          <Heading level={2} className="sec-title">{t('설치', 'Install')}</Heading>
          <Text as="p" display="block" color="secondary">
            {t('한 줄로 설치합니다. 타입 선언 포함.', 'One line. Types included.')}
          </Text>
          <div className="install-line">
            <CodeBlock code={INSTALL} language="bash" hasLanguageLabel={false} width="100%" />
          </div>
          <div className="actions is-center">
            <Button label={t('설치 가이드', 'Installation guide')} variant="secondary" href="#/docs/installation" />
            <Button label={t('배틀 데모', 'Battle demo')} variant="secondary" href="#/battle" />
          </div>
        </div>
      </section>
    </div>
  )
}
