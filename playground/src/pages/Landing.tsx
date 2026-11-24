import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { LogWindow } from '../components/ApiRun'
import { Emblem } from '../components/Emblem'
import { SpeedBars } from '../components/Compare'
import { examples, localizeCode } from '../examples'
import { useLang } from '../i18n'

const INSTALL = 'npm install github:2rangs/pokebattle-engine'

// 모든 수치는 README(Performance, Fuzz tests, Regression sweep)와 .github/workflows/ci.yml 기준
export function Landing() {
  const { t, lang } = useLang()

  const proofs: { title: string; body: string; proof: string; href: string; link: string }[] = [
    {
      title: t('Showdown과 같은 결과, 1.6–1.9배 빠르게', 'Showdown’s results, 1.6–1.9× faster'),
      body: t(
        '판정은 Showdown 시뮬레이터 그대로. 느린 이벤트 조회 경로만 고쳐서, 같은 시드·팀·선택이면 프로토콜 로그가 바이트 단위로 같습니다.',
        'Mechanics are the Showdown simulator itself. Only its slow handler lookup is patched, so the same seed, teams and choices give a byte-identical protocol log.',
      ),
      proof: t('싱글 1.001 → 0.622 ms/턴 · bench:compare', 'Singles 1.001 → 0.622 ms/turn · bench:compare'),
      href: '#/docs/performance', link: t('이 브라우저에서 직접 재 보기', 'Measure it in this browser'),
    },
    {
      title: t('CI가 매번 증명하는 정확성', 'Correctness, proven on every push'),
      body: t(
        '모든 기술·특성·도구를 한 배틀씩 돌리는 회귀 스윕, 불변식 8개를 검사하는 퍼징, 배포 번들 = 원본 @pkmn/sim 확인이 푸시마다 돕니다.',
        'A regression sweep plays every move, ability and item; fuzzing checks 8 invariants; and the published bundle is checked against the original @pkmn/sim — on every push.',
      ),
      proof: t('푸시마다 퍼징 10,000판 · 샤드 실행 1,000만 판', '10,000 fuzzed battles per push · 10M in sharded runs'),
      href: '#/docs/testing', link: t('테스트 방식', 'How it’s tested'),
    },
    {
      title: t('1~9세대, 모든 기믹', 'Gen 1–9, every gimmick'),
      body: t(
        '메가진화·원시회귀·Z기술·울트라버스트·다이맥스/거다이맥스·테라스탈. 싱글·더블·트리플에, Showdown에 없는 로테이션 배틀까지 같은 API로.',
        'Mega Evolution, Primal Reversion, Z-Moves, Ultra Burst, Dynamax/Gigantamax and Tera. Singles, doubles, triples — and rotation battles, which Showdown never implemented, on the same API.',
      ),
      proof: "format: 'singles' | 'doubles' | 'triples' | 'rotation'",
      href: '#/docs/generations', link: t('세대별 배틀', 'Generations'),
    },
    {
      title: t('한국어·영어·일본어 배틀 로그', 'Battle logs in Korean, English and Japanese'),
      body: t(
        '로그 한 줄이 타입 있는 이벤트 하나. 언어 중립 메시지 카탈로그에서 문장을 만들고(한국어 조사 처리), 이름은 PokeAPI의 9개 언어 데이터에서 옵니다.',
        'One log line is one typed event. Sentences come from one language-neutral message catalog (Korean particles handled); names come from PokeAPI data in 9 languages.',
      ),
      proof: "createFormatter({ locale: 'ja' })",
      href: '#/docs/logs', link: t('배틀 로그', 'Battle logs'),
    },
    {
      title: t('결정적 리플레이', 'Deterministic replays'),
      body: t(
        '같은 시드 + 같은 선택 = 같은 배틀. 데모의 리플레이는 서버 없이 링크 하나에 담기고, 열면 엔진이 다시 재생합니다.',
        'Same seed + same choices = the same battle. Demo replays fit in a link with no server; opening one replays it through the engine.',
      ),
      proof: '#/battle/replay?d=…',
      href: '#/docs/engine', link: 'BattleEngine',
    },
    {
      title: t('이 엔진으로 만든 배틀 데모', 'A full battle demo built on it'),
      body: t(
        '팀을 짜서 CPU와 싸우거나, CPU끼리의 배틀을 관전하거나, 손가락흔들기 배틀을. 6~9세대 규칙을 전부 브라우저 안에서 돌립니다.',
        'Build a team and fight a CPU, watch two CPUs, or play a Metronome battle — Gen 6–9 rules, all running in your browser.',
      ),
      proof: t('설치 없이 바로', 'No install needed'),
      href: '#/battle', link: t('배틀 데모 열기', 'Open the battle demo'),
    },
  ]

  return (
    <div className="landing">
      {/* ─── Hero: 한 줄 주장 + 한 줄 근거 + 행동 하나 ─────────── */}
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">{t('TypeScript 포켓몬 배틀 엔진', 'TypeScript Pokémon battle engine')}</p>
          <Heading level={1} className="hero-title">
            {t(<>Showdown과 바이트 단위로 같은 배틀을, <span className="nowrap">1.6–1.9배</span> 빠르게</>, <>Byte-for-byte Showdown battles, <span className="nowrap">1.6–1.9×</span> faster</>)}
          </Heading>
          <Text as="p" display="block" type="large" color="secondary" className="hero-sub">
            {t(
              'Pokémon Showdown 시뮬레이터 위에서 돌면서 결과는 그대로, 턴은 더 빠르게. 객체로 내는 행동, 타입 있는 이벤트, 3개 언어 로그까지.',
              'Runs on the Pokémon Showdown simulator with the same results and faster turns. Object actions, typed events and logs in three languages.',
            )}
          </Text>
          <div className="actions">
            <Button label={t('배틀 데모 해 보기', 'Try the battle demo')} variant="primary" href="#/battle" />
            <Button label={t('문서 읽기', 'Read the docs')} variant="secondary" href="#/docs/introduction" />
          </div>
          <div className="install-line">
            <CodeBlock code={INSTALL} language="bash" hasLanguageLabel={false} width="100%" />
          </div>
        </div>
        <div className="hero-art"><Emblem size={260} label={t('킬가르도 실드폼과 블레이드폼', 'Aegislash, Shield and Blade Forme')} /></div>
      </section>

      {/* ─── 차별점 6개, 각각 확인할 수 있는 근거와 함께 ─────────── */}
      <section className="section wrap" aria-labelledby="why">
        <div className="sec-head">
          <Heading level={2} className="sec-title" id="why">{t('무엇이 다른가', 'What makes it different')}</Heading>
          <Text as="p" display="block" color="secondary">{t('주장마다 직접 확인할 수 있는 근거를 붙였습니다.', 'Every claim links to something you can check yourself.')}</Text>
        </div>
        <ul className="proofs">
          {proofs.map(p => (
            <li key={p.title} className="proof">
              <Heading level={3} className="proof-title">{p.title}</Heading>
              <Text as="p" display="block" color="secondary">{p.body}</Text>
              <code className="proof-tag">{p.proof}</code>
              <a className="more" href={p.href}>{p.link} →</a>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── 속도 근거 ─────────────────────────────────── */}
      <section className="section wrap" aria-labelledby="speed">
        <div className="sec-head">
          <Heading level={2} className="sec-title" id="speed">{t('같은 배틀, 더 짧은 턴', 'Same battles, shorter turns')}</Heading>
          <Text as="p" display="block" color="secondary">
            {t(
              '같은 배틀(시드·팀·선택)을 Showdown 시뮬레이터에 직접 재생한 시간과 이 엔진의 시간. Node 22, 형식마다 60판. 모든 배틀의 로그가 바이트 단위로 같아야 측정이 끝납니다.',
              'The same battles (seed, teams, choices) replayed on the Showdown simulator directly and on this engine. Node 22, 60 battles per format. The run fails unless every log is byte-identical.',
            )}
          </Text>
        </div>
        <SpeedBars />
        <p className="sec-foot"><a className="more" href="#/docs/performance">{t('측정 방법과 브라우저 벤치', 'Methodology and in-browser benchmark')} →</a></p>
      </section>

      {/* ─── 코드가 얼마나 짧은지 ───────────────────────────── */}
      <section className="section wrap" aria-labelledby="code">
        <div className="sec-head">
          <Heading level={2} className="sec-title" id="code">{t('배틀 한 판은 스무 줄', 'A full battle in twenty lines')}</Heading>
          <Text as="p" display="block" color="secondary">
            {t('랜덤 팀 두 개, AI 둘, 한국어 로그. 출력 창은 이 코드를 지금 이 브라우저에서 돌린 결과입니다.', 'Two random teams, two AIs, a readable log. The output pane is this exact code, run in your browser just now.')}
          </Text>
        </div>
        <div className="code-demo">
          <CodeBlock code={localizeCode(examples.quickstart.code, lang)} language="ts" title="quickstart.ts" width="100%" maxHeight={460} />
          <LogWindow id="quickstart" title="output" command="tsx quickstart.ts" maxHeight={460} />
        </div>
      </section>

      {/* ─── 마무리 ─────────────────────────────────────── */}
      <section className="section wrap">
        <div className="closing">
          <Heading level={2} className="sec-title">{t('직접 돌려 보세요', 'Try it yourself')}</Heading>
          <Text as="p" display="block" color="secondary">
            {t('설치 없이 데모로 먼저 싸워 보거나, 한 줄로 설치하세요. 타입 선언 포함.', 'Fight a battle in the demo first, or install in one line. Types included.')}
          </Text>
          <div className="actions is-center">
            <Button label={t('배틀 데모 해 보기', 'Try the battle demo')} variant="primary" href="#/battle" />
            <Button label={t('설치 가이드', 'Installation guide')} variant="secondary" href="#/docs/installation" />
          </div>
          <div className="install-line">
            <CodeBlock code={INSTALL} language="bash" hasLanguageLabel={false} width="100%" />
          </div>
        </div>
      </section>
    </div>
  )
}
