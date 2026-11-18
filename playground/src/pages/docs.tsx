import type { ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { ApiRun } from '../components/ApiRun'
import { ApiTable, C, H2, H3, P, Snippet, Ul } from '../components/Prose'
import { KpiRow, SpeedBars, DiffTable } from '../components/Compare'
import type { Lang } from '../i18n'

type T = <V>(ko: V, en: V) => V
type Group = 'start' | 'battle' | 'tools' | 'integrate'

export const DOC_GROUPS: { id: Group; ko: string; en: string }[] = [
  { id: 'start', ko: '시작하기', en: 'Getting started' },
  { id: 'battle', ko: '배틀', en: 'Battles' },
  { id: 'tools', ko: '도구', en: 'Tools' },
  { id: 'integrate', ko: '연동', en: 'Integration' },
]

export interface DocPage {
  slug: string
  group: Group
  title: [string, string]
  lead: [string, string]
  body: (t: T) => ReactNode
}

export const docTitle = (d: DocPage, lang: Lang) => (lang === 'ko' ? d.title[0] : d.title[1])
export const docLead = (d: DocPage, lang: Lang) => (lang === 'ko' ? d.lead[0] : d.lead[1])
export const groupLabel = (g: Group, lang: Lang) => DOC_GROUPS.find(x => x.id === g)![lang]

export const DOCS: DocPage[] = [
  // ─── 시작하기 ─────────────────────────────────────────────
  {
    slug: 'introduction',
    group: 'start',
    title: ['소개', 'Introduction'],
    lead: [
      'Pokémon Showdown 시뮬레이터와 판정이 100% 같으면서 턴당 1.6~1.9배 빠르고, 객체 하나로 행동을 내는 배틀 엔진입니다.',
      'A battle engine whose results match the Pokémon Showdown simulator exactly, while running 1.6–1.9× faster per turn and taking actions as plain objects.',
    ],
    body: t => (
      <>
        <P>{t(
          <>배틀 판정은 전부 Showdown 시뮬레이터(<C>@pkmn/sim</C>)가 합니다. 1~9세대 기술·특성·도구의 상호작용이 Showdown과 똑같이 동작하고, 이 패키지는 그 위에서 Showdown의 느린 부분을 고쳐 더 빠르게 돌리고, 입력을 검증하고, 프로토콜 로그를 이벤트와 한국어·영어·일본어 문장으로 바꿉니다. 같은 시드의 배틀은 Showdown과 프로토콜 로그가 바이트 단위로 같습니다.</>,
          <>Every battle rule is decided by the Showdown simulator (<C>@pkmn/sim</C>), so moves, abilities and items in Gens 1–9 interact exactly as they do on Showdown. On top of it this package fixes Showdown’s slow hot path, validates input, and turns the protocol log into typed events and sentences in Korean, English and Japanese. A battle with the same seed produces a byte-identical protocol log to Showdown’s.</>,
        )}</P>
        <H2>{t('구성', 'What’s inside')}</H2>
        <ApiTable
          head={t(['모듈', '하는 일'], ['Module', 'What it does'])}
          rows={[
            [<C>BattleEngine</C>, t('1~9세대 싱글·더블·트리플·로테이션. getRequest → submitAction 두 함수로 한 턴이 돈다.', 'Gen 1–9 singles, doubles, triples and rotation. One turn is getRequest → submitAction.')],
            [<C>BattleEvent</C>, t('Showdown 로그 한 줄이 쓰이는 순간 타입 있는 이벤트로 변환. 이벤트만 재생해도 HP가 시뮬레이터와 일치.', 'Each Showdown log line becomes a typed event as it is written. Replaying events alone reproduces the simulator’s HP.')],
            [<C>createFormatter</C>, t('이벤트 → 한국어·영어·일본어 문장. 이름은 PokeAPI 데이터(9개 언어), 새 언어는 로케일 하나로 추가.', 'Event → Korean, English or Japanese sentence. Names come from PokeAPI data (9 languages); add a language with one locale.')],
            [<C>createRandomBattle</C>, t('Showdown 공식 랜덤배틀(1~9세대) 팀·레벨·규칙 그대로.', 'Showdown’s official random battles (Gen 1–9): same teams, levels and rules.')],
            [<C>createMetronomeBattle</C>, t('손가락흔들기 모드: 기술 고정, 자유 능력치, 고른/랜덤 포켓몬.', 'Metronome mode: Metronome only, free stats, chosen or random Pokémon.')],
            [<C>calculateDamage</C>, t('@smogon/calc 기반 데미지 계산. Showdown 계산기와 같은 결과.', 'Damage calculation on @smogon/calc. Same numbers as the Showdown calculator.')],
            [<C>HeuristicAI</C>, t('데미지 계산 기반 AI. RandomAI, simulateBattle과 함께 벤치·퍼징에 사용.', 'Damage-based AI. Used with RandomAI and simulateBattle for benchmarks and fuzzing.')],
            [<C>useBattle</C>, t('React 훅 (@kyasi/pokebattle-engine/react).', 'React hook (@kyasi/pokebattle-engine/react).')],
            [<C>npx pokebattle</C>, t('터미널에서 대전·관전·대량 시뮬레이션 (CLI).', 'Play, watch and simulate from the terminal (CLI).')],
          ]}
        />
        <H2>{t('이 문서의 예제', 'Examples in these docs')}</H2>
        <P>{t(
          <>각 예제의 <b>실행</b> 버튼은 이 페이지 안에서 실제 엔진을 돌리고, 결과를 콘솔처럼 텍스트로만 출력합니다. 같은 seed를 쓰기 때문에 몇 번을 눌러도 같은 로그가 나옵니다.</>,
          <>The <b>Run</b> button on each example runs the real engine in this page and prints the result as plain text, like a console. Examples use fixed seeds, so every run prints the same log. Battle lines in most examples are Korean (<C>formatEvent</C>); see Battle logs for English and Japanese.</>,
        )}</P>
        <ApiRun id="quickstart" title="quickstart.ts" />
      </>
    ),
  },
  {
    slug: 'installation',
    group: 'start',
    title: ['설치', 'Installation'],
    lead: ['GitHub에서 바로 설치합니다. ESM/CJS 둘 다, 타입 선언 포함.', 'Install straight from GitHub. ESM and CJS builds, type declarations included.'],
    body: t => (
      <>
        <Snippet lang="bash" code="npm install github:2rangs/pokebattle-engine" />
        <H2>{t('엔트리 포인트', 'Entry points')}</H2>
        <ApiTable
          head={t(['import 경로', '내용'], ['Import path', 'Contents'])}
          rows={[
            [<C>@kyasi/pokebattle-engine</C>, t('엔진, 데이터, 계산기, AI, 시뮬레이션, 포매터, 타입', 'Engine, data, calculator, AI, simulation, formatter, types')],
            [<C>@kyasi/pokebattle-engine/react</C>, t('useBattle 훅 (react ≥ 18 peer dependency, 선택)', 'useBattle hook (optional react ≥ 18 peer dependency)')],
            [<C>npx pokebattle</C>, t('CLI (bin). 엔진을 함께 번들한 Node 단일 파일', 'CLI (bin). A single Node file with the engine bundled')],
          ]}
        />
        <H2>{t('요구 사항', 'Requirements')}</H2>
        <Ul items={t([
          'Node.js 또는 최신 브라우저. 배틀·데미지 계산·이름은 바로 동작합니다.',
          '무거운 데이터는 필요할 때만 불러옵니다: await preloadData() 는 랜덤배틀 세트·기술표, preloadData({ gens: [7] }) 는 그 세대 데이터. 번들에서는 각각 별도 청크입니다.',
          '의존성: @pkmn/sim (필요한 부분만 번들), @smogon/calc.',
          'React는 /react 엔트리를 쓸 때만 필요합니다.',
        ], [
          'Node.js or a modern browser. Battles, the damage calculator and names work right away.',
          'Heavy data loads on demand: await preloadData() fetches random-battle sets and learnsets, preloadData({ gens: [7] }) a generation’s data. Each is a separate chunk in the bundle.',
          'Dependencies: @pkmn/sim (only the needed parts are bundled), @smogon/calc.',
          'React is only needed for the /react entry.',
        ])} />
        <Snippet code={`import { preloadData } from '@kyasi/pokebattle-engine'

await preloadData()                 // ${t('generateRandomTeam / createRandomBattle / generateRandomSet 전에', 'before generateRandomTeam / createRandomBattle / generateRandomSet')}
await preloadData({ gens: [8] })    // ${t('8세대 배틀 전에 (9세대는 내장)', 'before a Gen 8 battle (Gen 9 is built in)')}`} />
        <H2>{t('번들 크기', 'Bundle size')}</H2>
        <P>{t(
          <>엔진은 9세대 배틀에 필요한 Showdown 코드만 번들합니다. 쓰지 않는 스트림 코드(direct <C>eval</C> 포함)와 옛 세대 데이터가 빠져서, Vite/Rollup의 <C>eval</C> 경고가 사라지고 앱의 배틀 청크가 <b>8.7 MB → 3.4 MB</b>로 줄었습니다. 기술표(~2.8 MB), 랜덤배틀 세트(~1.1 MB), 1~8세대 데이터(60~140 kB씩)는 쓸 때만 받습니다.</>,
          <>The engine bundles only the Showdown code a Gen 9 battle needs. The unused stream code (with its direct <C>eval</C>) and older generations’ data are left out, so the Vite/Rollup <C>eval</C> warning is gone and an app’s battle chunk went from <b>8.7 MB to 3.4 MB</b>. Learnsets (~2.8 MB), random-battle sets (~1.1 MB) and Gen 1–8 data (60–140 kB each) download only when used.</>,
        )}</P>
      </>
    ),
  },
  {
    slug: 'performance',
    group: 'start',
    title: ['성능 (Showdown 비교)', 'Performance vs Showdown'],
    lead: [
      'Smogon의 Pokémon Showdown 시뮬레이터를 직접 쓸 때보다 턴당 1.6~1.9배 빠르고, 결과(프로토콜 로그)는 바이트 단위로 같습니다.',
      'Faster than running Smogon’s Pokémon Showdown simulator directly, 1.6–1.9× per turn, with byte-identical results (protocol logs).',
    ],
    body: t => (
      <>
        <KpiRow />
        <SpeedBars />
        <H2>{t('측정 결과', 'Results')}</H2>
        <P>{t(
          '같은 배틀(같은 시드·팀·선택)을 Showdown 시뮬레이터(@pkmn/sim)에 그대로 재생한 시간과 이 엔진으로 재생한 시간을 비교했습니다. 엔진 쪽 시간에는 엔진이 얹는 일(타입 있는 이벤트, 한국어 이름, 상태 정리)이 모두 들어 있습니다.',
          'The same battles (same seed, teams and choices) were replayed through the Showdown simulator (@pkmn/sim) and through this engine. The engine’s time includes everything it adds on top (typed events, Korean names, state views).',
        )}</P>
        <ApiTable
          head={t(['형식', 'Showdown 직접', '이 엔진', '속도', 'Showdown + 엔진 패치만'], ['Format', 'Showdown directly', 'This engine', 'Speedup', 'Showdown + patch only'])}
          rows={[
            [t('싱글', 'Singles'), '1.001 ms/turn', '0.622 ms/turn', <b>1.61×</b>, '1.81×'],
            [t('더블', 'Doubles'), '3.520 ms/turn', '1.893 ms/turn', <b>1.86×</b>, '1.84×'],
            [t('트리플', 'Triples'), '5.710 ms/turn', '3.133 ms/turn', <b>1.82×</b>, '1.94×'],
          ]}
        />
        <P>{t(
          <>Node 22, 형식마다 무작위 배틀 60판, 다섯 번 측정 중 가장 빠른 값. 직접 재현: <C>npm run bench:compare</C> (로그가 하나라도 다르면 실패로 끝납니다).</>,
          <>Node 22, 60 random battles per format, best of five rounds. Reproduce with <C>npm run bench:compare</C> (it fails if any log differs).</>,
        )}</P>
        <H2>{t('이 브라우저에서 직접 재기', 'Measure it in this browser')}</H2>
        <P>{t(
          <>같은 랜덤배틀을 Showdown 원본 경로(<C>fast: false</C>)와 엔진 기본값으로 돌리고, 두 로그가 같은지도 확인합니다. 브라우저·기기에 따라 수치는 다릅니다.</>,
          <>Runs the same random battles on Showdown’s original path (<C>fast: false</C>) and on the engine’s default, and checks the logs match. Numbers vary by browser and device.</>,
        )}</P>
        <ApiRun id="bench" />
        <H2>{t('어떻게 빨라졌나', 'How')}</H2>
        <P>{t(
          <>Showdown은 이벤트가 생길 때마다 필드 위 모든 상태이상·휘발성 상태·특성·도구·필드 효과에서 <C>on&lt;이벤트&gt;</C> 콜백을 문자열 키로 찾습니다. 효과 객체마다 모양이 달라 이 조회가 느리고, 대부분은 "없음"이라 헛수고입니다. 프로파일상 배틀 시간의 절반 가까이가 여기였습니다.</>,
          <>On every event Showdown looks up an <C>on&lt;Event&gt;</C> callback by string key on every status, volatile, ability, item and field effect in play. The effect objects all have different shapes, so the lookup is slow, and it mostly finds nothing. Profiling put close to half of a battle’s time there.</>,
        )}</P>
        <Ul items={t([
          '효과마다 가진 콜백 목록을 처음 한 번만 만들어 재사용합니다.',
          '이벤트 이름 문자열을 캐시하고, 핸들러 목록을 중간 배열 없이 만듭니다.',
          '핸들러 순서는 원본과 같게 유지합니다 (스피드 동률 판정이 이 순서에 달려 있습니다).',
          '패치는 엔진이 만든 배틀에만 걸립니다. new BattleEngine(config, { fast: false }) 는 Showdown 원본 코드 그대로입니다.',
        ], [
          'Each effect’s callbacks are indexed once and reused.',
          'Event-name strings are cached and handler lists are built without intermediate arrays.',
          'Handler order stays exactly as in Showdown (speed ties are decided by it).',
          'The patch applies only to battles the engine creates; new BattleEngine(config, { fast: false }) runs Showdown’s original code.',
        ])} />
        <H2>{t('결과가 같다는 근거', 'Why the results are the same')}</H2>
        <Ul items={t([
          '퍼징: 모든 배틀을 패치 없이 한 번 더 돌려 프로토콜 로그를 비교합니다 (1~9세대, 싱글·더블·트리플·로테이션).',
          'bench:compare: 측정한 모든 배틀의 로그를 원본과 비교합니다.',
          'check:dist: 배포 번들로 돌린 배틀을 원본 @pkmn/sim 에 다시 재생해 비교합니다 (CI).',
        ], [
          'Fuzzing: every battle is replayed without the patch and the protocol logs are compared (Gens 1–9; singles, doubles, triples, rotation).',
          'bench:compare: every measured battle’s log is compared with the original.',
          'check:dist: battles played by the published bundle are replayed on the original @pkmn/sim and compared (CI).',
        ])} />
        <H2>{t('차이 한눈에', 'Differences at a glance')}</H2>
        <DiffTable />
      </>
    ),
  },
  {
    slug: 'teams',
    group: 'start',
    title: ['팀 구성', 'Teams'],
    lead: [
      'PokemonSet 배열이 팀입니다. PokeAPI 슬러그, Showdown 이름, Showdown ID를 모두 받습니다.',
      'A team is an array of PokemonSet. PokeAPI slugs, Showdown names and Showdown IDs are all accepted.',
    ],
    body: t => (
      <>
        <Snippet title="PokemonSet" code={`{
  species: 'great-tusk', ability: 'protosynthesis', item: 'booster-energy', nature: 'jolly',
  level: 50, teraType: 'steel',
  evs: { attack: 252, speed: 252 },          // ${t('생략 시 0', 'default 0')}
  ivs: { hp: 31, attack: 31 /* … */ },        // ${t('생략 시 31', 'default 31')}
  moves: ['headlong-rush', 'ice-spinner', 'rapid-spin', 'knock-off'],
}`} />
        <P>{t(<>알 수 없는 이름은 배틀 시작 시 <C>BattleError</C>로 거부됩니다.</>, <>Unknown names are rejected with a <C>BattleError</C> when the battle starts.</>)}</P>
        <H2>{t('Showdown 텍스트에서', 'From Showdown text')}</H2>
        <P>{t(
          <><C>parseShowdownTeam</C>은 Showdown 팀빌더에서 내보낸 텍스트를 그대로 받습니다. 반대 방향은 <C>exportShowdownTeam</C>.</>,
          <><C>parseShowdownTeam</C> takes text exported from the Showdown teambuilder as is. <C>exportShowdownTeam</C> goes the other way.</>,
        )}</P>
        <ApiRun id="parseTeam" />
        <H2>{t('랜덤 배틀 팀', 'Random battle teams')}</H2>
        <P>{t(
          <><C>generateRandomTeam</C>은 Showdown 공식 랜덤 배틀 세트를 만듭니다(먼저 <C>await preloadData()</C>). <C>format</C>에 <C>gen9randomdoublesbattle</C>, <C>gen7randombattle</C> 등을 줄 수 있고, 배틀까지 한 번에 만들려면 <a href="#/docs/random">랜덤배틀</a>의 <C>createRandomBattle</C>.</>,
          <><C>generateRandomTeam</C> builds Showdown’s official random battle sets (call <C>await preloadData()</C> first). <C>format</C> takes <C>gen9randomdoublesbattle</C>, <C>gen7randombattle</C> and so on; to set up the whole battle use <C>createRandomBattle</C> from <a href="#/docs/random">Random battles</a>.</>,
        )}</P>
        <ApiRun id="randomTeam" />
        <ApiTable
          head={t(['함수', '설명'], ['Function', 'Description'])}
          rows={[
            [<C>parseShowdownTeam(text, level?)</C>, t('Showdown 텍스트 → PokemonSet[] (기본 레벨 50)', 'Showdown text → PokemonSet[] (default level 50)')],
            [<C>exportShowdownTeam(team)</C>, t('PokemonSet[] → Showdown 텍스트', 'PokemonSet[] → Showdown text')],
            [<C>generateRandomTeam({'{ seed, size, level, format }'})</C>, t('랜덤 배틀 세트. 같은 seed → 같은 팀', 'Random battle sets. Same seed → same team')],
            [<C>generateRandomSet(species, opts)</C>, t('종 하나의 추천 세트', 'A suggested set for one species')],
            [<C>generateChaosTeam({'{ rng, size }'})</C>, t('무작위 종·특성·기술·노력치 (퍼징용)', 'Random species, abilities, moves and EVs (for fuzzing)')],
            [<C>loadTeam(raw)</C>, t('{ pokemons: [...] } 형태 JSON → PokemonSet[]', '{ pokemons: [...] } JSON → PokemonSet[]')],
          ]}
        />
      </>
    ),
  },

  // ─── 배틀 ─────────────────────────────────────────────────
  {
    slug: 'engine',
    group: 'battle',
    title: ['BattleEngine', 'BattleEngine'],
    lead: [
      '배틀 하나 = 엔진 인스턴스 하나. 요청을 읽고, 행동을 제출하면 턴이 진행됩니다.',
      'One battle is one engine instance. Read the request, submit an action, and the turn runs.',
    ],
    body: t => (
      <>
        <Snippet code={`const engine = new BattleEngine(config: BattleConfig, options?: EngineOptions)`} />
        <ApiTable
          head={t(['BattleConfig', '설명'], ['BattleConfig', 'Description'])}
          rows={[
            [<C>format</C>, "'singles' | 'doubles' | 'triples' | 'rotation'"],
            [<C>gen?</C>, t('1~9 (기본 9). 세대별 판정·데이터. 세대별 배틀 문서 참고', '1–9 (default 9). Mechanics and data of that generation; see Generations')],
            [<C>p1, p2</C>, t('{ name: string; team: PokemonSet[] } — 최대 6마리', '{ name: string; team: PokemonSet[] } — up to 6')],
            [<C>seed?</C>, t('같은 seed + 같은 입력 → 같은 배틀', 'Same seed + same input → same battle')],
            [<C>maxTurns?</C>, t('넘기면 무승부 (기본 1000)', 'Draw after this many turns (default 1000)')],
            [<C>formatid?</C>, t('Showdown 포맷 ID (기본: 세대·형식의 커스텀 게임, 예 gen9customgame)', 'Showdown format ID (default: the custom game for the gen and format, e.g. gen9customgame)')],
            [<C>options?</C>, t('규칙 옵션 (규칙 옵션 문서)', 'Rule options (see Rule options)')],
            [<C>rules?</C>, t("추가 규칙, 예: ['Sleep Clause Mod', 'Species Clause']", "Extra rules, e.g. ['Sleep Clause Mod', 'Species Clause']")],
          ]}
        />
        <P>{t(
          <><C>EngineOptions.turnSnapshots</C>(기본 true)는 <C>turn_end</C> 이벤트에 상태 스냅샷을 붙입니다. 대량 시뮬레이션에선 false로 끄세요. <C>EngineOptions.fast</C>(기본 true)는 Showdown 핫패스 패치이고, false면 Showdown 원본 코드로 돕니다(결과는 같음, <a href="#/docs/performance">성능</a>).</>,
          <><C>EngineOptions.turnSnapshots</C> (default true) attaches a state snapshot to <C>turn_end</C>. Turn it off for bulk simulation. <C>EngineOptions.fast</C> (default true) is the Showdown hot-path patch; false runs Showdown’s original code (same results, see <a href="#/docs/performance">Performance</a>).</>,
        )}</P>

        <H2>{t('배틀 흐름', 'Battle flow')}</H2>
        <ApiTable
          head={t(['state.phase', '의미', '할 일'], ['state.phase', 'Meaning', 'What to do'])}
          rows={[
            [<C>waiting_action</C>, t('이번 턴 행동 대기', 'Waiting for this turn’s actions'), t('양쪽 모두 submitAction (move / switch)', 'Both sides submitAction (move / switch)')],
            [<C>switching</C>, t('기절·유턴·부활의 기원 후 교체', 'Replacement after a faint, U-turn or Revival Blessing'), t('state.pending_switches에 있는 쪽만 switch 제출', 'Only sides in state.pending_switches submit a switch')],
            [<C>ended</C>, t('배틀 종료', 'Battle over'), t('state.winner 확인', 'Read state.winner')],
          ]}
        />

        <H2>{t('요청 읽기 — getRequest', 'Reading the request — getRequest')}</H2>
        <P>{t(
          <>Showdown의 request를 엔진 형식으로 정리해서 돌려줍니다. 입력할 게 없으면 <C>null</C>. 그림자밟기 같은 숨은 교체 금지, 봉인 같은 숨은 사용 불가, 반동·모으기 턴의 기술 고정(<C>forced: true</C>)까지 실제 상태로 반영합니다.</>,
          <>Returns Showdown’s request in engine form, or <C>null</C> when there is nothing to choose. Hidden trapping (Shadow Tag), hidden disables (Imprison) and locked moves on recharge or charge turns (<C>forced: true</C>) come from live state.</>,
        )}</P>
        <ApiRun id="request" />

        <H2>{t('행동 제출 — submitAction', 'Submitting — submitAction')}</H2>
        <P>{t('양쪽이 모두 제출되는 순간 턴이 실행되고, 그동안 이벤트가 동기적으로 발생합니다.', 'The turn runs as soon as both sides have submitted, and events fire synchronously while it does.')}</P>
        <Snippet title="Action" code={`{ type: 'move',   player, pokemon_id, move_index: 0 | 1 | 2 | 3 | -1,                    // -1 = Struggle
  terastallize?, mega?, ultra_burst?, zmove?, dynamax?, rotate? }                              // ${t('세대별 기믹', 'per-generation gimmicks')}
{ type: 'switch', player, pokemon_id, switch_to_id }
{ type: 'raw',    player, choice: 'move 1 terastallize' }                                // Showdown choice string`} />
        <ApiRun id="submit" />

        <H2>{t('잘못된 입력', 'Invalid input')}</H2>
        <P>{t(<>제출할 수 없는 행동은 상태를 바꾸지 않고 <C>BattleError</C>를 던집니다.</>, <>An action that can’t be submitted throws a <C>BattleError</C> and leaves state untouched.</>)}</P>
        <ApiRun id="invalid" />

        <H2>{t('메서드', 'Methods')}</H2>
        <ApiTable
          head={t(['메서드', '설명'], ['Method', 'Description'])}
          rows={[
            [<C>start()</C>, t('팀 등록 + 선두 등장. getRequest / submitAction이 자동 호출', 'Registers teams and sends out leads. Called by getRequest / submitAction')],
            [<C>getRequest(player)</C>, t('BattleRequest | null (싱글)', 'BattleRequest | null (singles)')],
            [<C>getAvailableActions(player)</C>, t('지금 제출 가능한 Action[] 전부', 'Every Action you can submit now')],
            [<C>submitAction(action)</C>, t('행동 제출', 'Submit an action')],
            [<C>submitActions(p1, p2)</C>, t('양쪽 동시 제출', 'Submit both sides at once')],
            [<C>getRawRequest(player)</C>, t('Showdown 원본 request (더블)', 'Raw Showdown request (doubles)')],
            [<C>submitChoice(player, choice)</C>, t("Showdown 선택 문자열 제출, 예: 'move 1 2, switch 3'", "Submit a Showdown choice string, e.g. 'move 1 2, switch 3'")],
            [<C>previewDamage(player, moveIndex)</C>, t('현재 상태 기준 데미지 미리보기', 'Damage preview against the current state')],
            [<C>forfeit(player)</C>, t('기권', 'Forfeit')],
            [<C>getState() / snapshot()</C>, t('표시용 BattleState (snapshot은 복사본)', 'BattleState for display (snapshot is a copy)')],
            [<C>getPokemon(id) / getActive(player)</C>, t("BattlePokemon 조회 (id: 'p1_0' …)", "Look up a BattlePokemon (id: 'p1_0' …)")],
            [<C>allActive() / getSide(player)</C>, t('필드의 포켓몬 / 한쪽 진영', 'Active Pokémon / one side')],
            [<C>phase / winner</C>, t('현재 페이즈 / 승자 (getter)', 'Current phase / winner (getters)')],
            [<C>battle</C>, t('Showdown Battle 객체 그 자체', 'The Showdown Battle object itself')],
            [<C>protocolLog</C>, t('Showdown 프로토콜 로그 원문', 'Raw Showdown protocol log')],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'events',
    group: 'battle',
    title: ['이벤트 & 로그', 'Events & logs'],
    lead: [
      'Showdown 프로토콜 메시지는 모두 타입 있는 BattleEvent가 됩니다. 로그가 쓰이는 즉시 발생하므로 그 시점의 상태와 정확히 일치합니다.',
      'Every Showdown protocol message becomes a typed BattleEvent, emitted the moment the line is written, so it matches state at that point exactly.',
    ],
    body: t => (
      <>
        <H2>{t('구독', 'Subscribing')}</H2>
        <P>{t(
          <><C>engine.on(type, listener)</C>는 해제 함수를 돌려줍니다. <C>'*'</C>는 모든 이벤트.</>,
          <><C>engine.on(type, listener)</C> returns an unsubscribe function. <C>'*'</C> receives every event.</>,
        )}</P>
        <ApiRun id="events" maxHeight={420} />
        <H2>{t('이벤트 종류', 'Event types')}</H2>
        <ApiTable
          head={t(['type', '주요 필드'], ['type', 'Main fields'])}
          rows={[
            [<C>battle_start / battle_end</C>, 'p1, p2, seed / winner'],
            [<C>turn_start / turn_end</C>, 'turn / turn, state (turnSnapshots)'],
            [<C>move_use / move_miss / move_fail</C>, 'pokemon_id, move, target_id / reason'],
            [<C>damage / heal</C>, t('pokemon_id, amount, source, hp_after, effectiveness? (0.25·0.5·1·2·4), crit?', 'pokemon_id, amount, source, hp_after, effectiveness? (0.25, 0.5, 1, 2, 4), crit?')],
            [<C>switch / faint</C>, 'player, out_id, in_id, forced? / pokemon_id'],
            [<C>rotate</C>, t("player, direction ('left' | 'right'), in_id, out_id — 로테이션 배틀", "player, direction ('left' | 'right'), in_id, out_id — rotation battles")],
            [<C>status_apply / status_remove</C>, 'pokemon_id, status, source?'],
            [<C>volatile_apply / volatile_remove</C>, 'pokemon_id, volatile'],
            [<C>stat_change</C>, 'pokemon_id, stat, stages, actual?'],
            [<C>weather_change / terrain_change</C>, 'weather | terrain, source'],
            [<C>side_start / side_end</C>, 'player, condition, layers?'],
            [<C>field_start / field_end</C>, 'condition (trick_room, gravity …)'],
            [<C>ability_trigger</C>, 'pokemon_id, ability, effect'],
            [<C>item_consume / item_activate</C>, 'pokemon_id, item, effect?'],
            [<C>terastallize / forme_change</C>, 'pokemon_id, tera_type / species'],
            [<C>mega_evolve</C>, t("pokemon_id, kind ('mega' | 'primal' | 'ultra'), species, item?", "pokemon_id, kind ('mega' | 'primal' | 'ultra'), species, item?")],
            [<C>cant_move / immune / hit_count / activate / message</C>, t('기타 상황', 'Everything else')],
          ]}
        />
        <Banner
          status="info"
          title={t('이벤트만으로 HP를 복원할 수 있습니다', 'Events alone rebuild HP')}
          description={t(
            '재생력·자연회복처럼 Showdown이 로그 없이 바꾸는 HP·상태도 보정 이벤트를 냅니다. 퍼징 테스트가 매 배틀 이 불변식을 확인합니다.',
            'HP and status that Showdown changes without a log line (Regenerator, Natural Cure …) also get compensating events. The fuzz test checks this on every battle.',
          )}
          collapsible={false}
        />
        <H2>{t('한국어 로그 — formatEvent', 'Korean logs — formatEvent')}</H2>
        <P>{t(<>영어·일본어 등 다른 언어와 문장 바꾸기는 <a href="#/docs/logs">배틀 로그 (다국어)</a>.</>, <>For English, Japanese and custom wording, see <a href="#/docs/logs">Battle logs</a>.</>)}</P>
        <P>{t(
          <>화면에 보여줄 필요 없는 이벤트는 <C>null</C>을 돌려줍니다. <C>sideName</C>으로 "상대 " 같은 접두어를, 세 번째 인자 <C>NameResolver</C>로 포켓몬·기술 이름 표기를 바꿀 수 있습니다.</>,
          <>Returns <C>null</C> for events that don’t need a line. <C>sideName</C> sets a prefix such as "상대 " (opponent), and the third argument, a <C>NameResolver</C>, changes how Pokémon and move names are written.</>,
        )}</P>
        <ApiRun id="formatKo" />
        <ApiTable
          head={t(['유틸', '설명'], ['Utility', 'Description'])}
          rows={[
            [<C>fixParticles(text)</C>, t("'이(가)' 같은 표기를 받침에 맞게 치환", "Resolves '이(가)'-style particles to the correct form")],
            [<C>STATUS_NAME_KO, STAT_NAME_KO …</C>, t('상태이상·능력치·날씨·필드 등 한국어 이름표', 'Korean name tables for statuses, stats, weather, fields …')],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'logs',
    group: 'battle',
    title: ['배틀 로그 (다국어)', 'Battle logs (languages)'],
    lead: [
      '같은 이벤트를 한국어·영어·일본어 문장으로. 문장은 언어별 로케일, 이름은 PokeAPI 데이터에서 옵니다.',
      'The same events as Korean, English or Japanese sentences. Wording lives in per-language locales; names come from PokeAPI data.',
    ],
    body: t => (
      <>
        <ApiRun id="formatMulti" />
        <H2>{t('두 단계', 'Two steps')}</H2>
        <Ul items={t([
          'describeEvent(event, ctx) → 언어와 무관한 메시지 { key, params }. UI는 이걸로 이름을 굵게 하거나 아이콘을 붙일 수 있습니다.',
          '로케일이 메시지를 문장으로 바꿉니다. 내장: ko, en, ja.',
        ], [
          'describeEvent(event, ctx) → language-neutral messages { key, params }. A UI can use them to bold names or add icons.',
          'A locale turns messages into sentences. Built in: ko, en, ja.',
        ])} />
        <ApiRun id="describe" />
        <H2>{t('이름은 데이터에서', 'Names come from data')}</H2>
        <P>{t(
          <>포켓몬·기술·특성·도구·타입·성격 이름은 PokeAPI 데이터(영어는 Showdown 이름)입니다. 스텔스록·트릭룸·도발처럼 기술·특성 이름과 같은 상태 이름도 따로 번역하지 않고 그 이름을 씁니다. 이름 팩: <C>ko, en, ja, zh-hans, zh-hant, fr, de, es, it</C> (ko·en 외에는 <C>await loadNames(code)</C>로 필요할 때).</>,
          <>Pokémon, move, ability, item, type and nature names come from PokeAPI (Showdown names for English). Conditions named after a move or ability (Stealth Rock, Trick Room, Taunt …) reuse that name instead of a separate translation. Name packs: <C>ko, en, ja, zh-hans, zh-hant, fr, de, es, it</C> (anything but ko and en loads with <C>await loadNames(code)</C>).</>,
        )}</P>
        <H2>{t('옵션', 'Options')}</H2>
        <Snippet code={`const log = createFormatter({
  locale: 'en',                                  // ${t("'ko' | 'en' | 'ja' | 직접 만든 Locale", "'ko' | 'en' | 'ja' | your own Locale")}
  getPokemon: id => engine.getPokemon(id),
  perspective: 'p2',                             // ${t('p2 시점 ("상대"가 바뀜)', 'p2’s point of view ("the opposing …" flips)')}
  sideName: p => trainerNames[p],                // ${t('진영 이름', 'side names')}
  messages: { 'move.use': '{pokemon} → {move}' }, // ${t('문장 일부만 바꾸기', 'override a sentence')}
})
log.format(event)           // ${t('문장 또는 null', 'sentence or null')}
log.name.item('heavy-duty-boots')   // ${t('UI 라벨에도 같은 이름', 'the same names for UI labels')}`} />
        <H2>{t('새 언어 추가', 'Adding a language')}</H2>
        <Snippet code={`registerLocale({
  code: 'fr',
  fallback: en,                                   // ${t('없는 문장은 영어로', 'missing sentences fall back to English')}
  terms: { stat: { attack: 'Attaque' /* … */ } },
  messages: { 'move.use': '{pokemon} utilise {move} !' /* … */ },
})
await loadNames('fr')`} />
        <P>{t(
          <>문장 틀은 <C>{'{param}'}</C>, 있을 때만 쓰는 부분 <C>{'{?{pokemon}: }'}</C>, 복수형 <C>{'{ one, other }'}</C>(Intl.PluralRules)을 지원합니다. 한국어 조사(이/가, 은/는, (으)로)는 한국어 로케일이 받침에 맞춰 고릅니다. 기존 <C>formatEvent</C>는 한국어 포매터로 그대로 동작합니다.</>,
          <>Templates support <C>{'{param}'}</C>, optional parts <C>{'{?{pokemon}: }'}</C> and plural forms <C>{'{ one, other }'}</C> (Intl.PluralRules). The Korean locale picks particles (이/가, 은/는, (으)로) to match the preceding word. The existing <C>formatEvent</C> still works as the Korean formatter.</>,
        )}</P>
      </>
    ),
  },
  {
    slug: 'doubles',
    group: 'battle',
    title: ['더블 · 트리플 · 로테이션', 'Doubles, triples & rotation'],
    lead: [
      "format: 'doubles' | 'triples' 는 Showdown 선택 문자열을, 'rotation' 은 싱글과 같은 편의 API 를 씁니다.",
      "format: 'doubles' | 'triples' use Showdown choice strings; 'rotation' uses the same convenience API as singles.",
    ],
    body: t => (
      <>
        <P>{t(
          <>슬롯별 선택을 쉼표로 구분합니다. 대상 번호는 상대 1·2(·3), 아군 -1·-2(·-3). 받을 수 있는 선택은 <C>getRawRequest(player)</C>로 확인하세요. 더블은 팀당 최소 2마리, 트리플은 3마리가 필요합니다.</>,
          <>Separate each slot’s choice with a comma. Targets are 1, 2 (and 3) for foes and -1, -2 (and -3) for allies. Check what is allowed with <C>getRawRequest(player)</C>. Doubles need at least two Pokémon per team, triples three.</>,
        )}</P>
        <ApiRun id="doubles" />
        <H2>{t('트리플 배틀', 'Triple battles')}</H2>
        <P>{t(
          <>Gen 9에는 트리플 커스텀 게임이 없어서, 엔진은 래더 포맷 <C>gen9triples</C>에서 래더 규칙(팀 프리뷰, 종 클로즈, 밴리스트)을 걷어내고 씁니다. 그래서 싱글·더블과 똑같이 아무 규칙 없이 시작하고, 필요한 규칙은 <C>options</C>로 켭니다. 트리플에서는 인접한 상대만 공격할 수 있습니다(양 끝 슬롯끼리는 닿지 않음).</>,
          <>Gen 9 has no triples custom game, so the engine takes the ladder format <C>gen9triples</C> and strips its ladder rules (team preview, Species Clause, banlist). Triples therefore start with no rules, like singles and doubles, and you turn rules on with <C>options</C>. Only adjacent foes can be targeted (the two outer slots can’t reach each other).</>,
        )}</P>
        <ApiRun id="triples" />
        <H2>{t('로테이션 배틀', 'Rotation battles')}</H2>
        <P>{t(
          <><C>format: 'rotation'</C>은 싱글과 같은 편의 API(<C>getRequest</C> / <C>submitAction</C>)로 진행합니다. 양쪽 3마리가 나오지만 행동하고 공격받는 건 가운데 앞 포켓몬(슬롯 1)뿐입니다. 기술을 고를 때 <C>rotate: 'left' | 'right'</C>를 붙이면 그 쪽 뒷줄 포켓몬이 턴 맨 처음(교체·선공기보다 먼저) 앞으로 돌아 나와 그 기술을 씁니다. 교체가 아니라서 랭크·혼란 같은 상태가 유지되고 등장 특성도 다시 발동하지 않습니다.</>,
          <><C>format: 'rotation'</C> uses the same convenience API as singles (<C>getRequest</C> / <C>submitAction</C>). Three Pokémon per side are on the field, but only the front one (the middle slot, 1) acts and can be hit. Add <C>rotate: 'left' | 'right'</C> to a move and that back Pokémon rotates to the front at the very start of the turn (before switches and priority moves), then uses the move. It is not a switch: stat stages and volatiles such as confusion stay, and switch-in abilities don’t fire again.</>,
        )}</P>
        <ApiRun id="rotation" />
        <Ul items={[
          t(<><C>req.rotate</C>: 돌릴 수 있는 방향과 들어올 포켓몬·기술. 앞 포켓몬이 역린·반동·모으기에 묶여 있으면 비어 있습니다.</>, <><C>req.rotate</C>: each direction you can rotate, with the incoming Pokémon and its moves. Empty while the front Pokémon is locked into Outrage, recharge or a charging move.</>),
          t(<>앞이 쓰러지면 벤치에서 앞을 채웁니다. 벤치가 없으면 <C>must_rotate: true</C>가 되고 반드시 회전해야 합니다.</>, <>A fainted front is replaced from the bench. With no bench left, <C>must_rotate: true</C> and you have to rotate.</>),
          t(<>범위 기술·위협 등은 상대 앞 1마리에게만, 도우미 같은 아군 대상 기술은 실패합니다. 날씨·독 같은 턴 종료 데미지와 흑안개처럼 필드 전체에 걸리는 효과는 뒷줄에도 적용됩니다.</>, <>Spread moves, Intimidate and the like reach only the foe’s front Pokémon, and ally-targeting moves such as Helping Hand fail. End-of-turn damage (weather, poison) and field-wide effects such as Haze still reach the back row.</>),
          t(<>원시 선택 문자열도 됩니다: 행동하는 슬롯만 기술, 나머지는 pass. 예: <C>'pass, move 1 2, pass'</C>(앞), <C>'move 2 2, pass, pass'</C>(왼쪽 회전). 상대 앞은 항상 대상 2입니다.</>, <>Raw choices work too: only the acting slot moves, the rest pass. For example <C>'pass, move 1 2, pass'</C> (front) or <C>'move 2 2, pass, pass'</C> (rotate left). The foe’s front is always target 2.</>),
        ]} />
        <Banner
          status="info"
          title={t('Showdown에는 로테이션 구현이 없습니다', 'Showdown has no rotation implementation')}
          description={t(
            "Showdown 서버 시뮬레이터는 'rotation'을 슬롯 3개짜리 이름으로만 갖고 있었고 회전 규칙을 구현한 적이 없습니다. 엔진은 트리플 배틀 위에 로테이션 규칙을 덧씌워 돌리며, 뒷줄이 잔여 데미지를 받는 부분 등은 원작과 다를 수 있습니다.",
            "The Showdown server sim only ever had 'rotation' as a three-slot name and never implemented the rotation rules. The engine runs rotation as a triple battle with the rotation rules layered on top; details such as the back row taking residual damage may differ from the games.",
          )}
          collapsible={false}
        />
      </>
    ),
  },
  {
    slug: 'generations',
    group: 'battle',
    title: ['세대별 배틀', 'Generations'],
    lead: [
      'gen: 1~9 로 그 세대의 판정·데이터·기믹으로 배틀합니다. 메가진화·Z기술·다이맥스·테라스탈 모두 같은 행동 API.',
      'gen: 1–9 runs a battle with that generation’s mechanics, data and gimmicks. Mega Evolution, Z-Moves, Dynamax and Tera share one action API.',
    ],
    body: t => (
      <>
        <Snippet code={`await preloadData({ gens: [7] })      // ${t('1~8세대 데이터는 필요할 때 (9세대는 내장)', 'Gen 1–8 data on demand (Gen 9 built in)')}
new BattleEngine({ format: 'singles', gen: 7, p1, p2 })`} />
        <ApiTable
          head={t(['세대', '형식', '기믹 (요청 → 행동)'], ['Gen', 'Formats', 'Gimmick (request → action)'])}
          rows={[
            ['1–2', t('싱글', 'singles'), '—'],
            ['3–4', t('싱글, 더블', 'singles, doubles'), '—'],
            ['5', t('싱글, 더블, 트리플', 'singles, doubles, triples'), '—'],
            ['6', t('싱글, 더블, 트리플', 'singles, doubles, triples'), <><C>can_mega_evolve</C> → <C>mega</C></>],
            ['7', t('싱글, 더블', 'singles, doubles'), <><C>can_mega_evolve</C> → <C>mega</C>, <C>can_zmove</C> + <C>moves[i].zmove</C> → <C>zmove</C>, <C>can_ultra_burst</C> → <C>ultra_burst</C></>],
            ['8', t('싱글, 더블', 'singles, doubles'), <><C>can_dynamax</C> → <C>dynamax</C></>],
            ['9', t('싱글, 더블, 트리플, 로테이션', 'singles, doubles, triples, rotation'), <><C>can_terastallize</C> → <C>terastallize</C></>],
          ]}
        />
        <ApiRun id="mega" />
        <Ul items={t([
          '메가진화·원시회귀·울트라버스트는 mega_evolve 이벤트, 다이맥스는 dynamax 휘발성 상태, Z파워는 activate 이벤트로 나오고, 모두 로그 문장이 있습니다.',
          'getAvailableActions 는 기믹을 쓰는 행동도 포함합니다 (RandomAI 가 그대로 씁니다).',
          '데미지 미리보기(previewDamage)는 그 세대 계산기로 계산합니다.',
          '형식 제한을 어기면(예: 2세대 더블) BattleError.',
        ], [
          'Mega Evolution, Primal Reversion and Ultra Burst emit mega_evolve, Dynamax is a dynamax volatile, Z-Power an activate event; all have log sentences.',
          'getAvailableActions includes gimmick actions (RandomAI uses them as is).',
          'previewDamage uses that generation’s calculator.',
          'Unsupported combinations (e.g. Gen 2 doubles) throw a BattleError.',
        ])} />
      </>
    ),
  },
  {
    slug: 'random',
    group: 'battle',
    title: ['랜덤배틀', 'Random battles'],
    lead: [
      'Smogon/Showdown 랜덤배틀과 같은 팀 생성기·세트·밸런스 레벨·규칙. 1~9세대 싱글, 9세대 더블·모노타입.',
      'The same team generator, sets, balanced levels and rules as Smogon/Showdown Random Battle. Gen 1–9 singles, Gen 9 doubles and monotype.',
    ],
    body: t => (
      <>
        <ApiRun id="randomBattle" maxHeight={420} />
        <ApiTable
          head={t(['함수', '설명'], ['Function', 'Description'])}
          rows={[
            [<C>createRandomBattle({'{ gen, format, seed, level, teamSize }'})</C>, t("두 팀 생성 + 실제 랜덤배틀 포맷으로 배틀 준비. level: 'balanced'(기본) | 숫자", "Builds both teams and sets up the battle on the real random format. level: 'balanced' (default) | a number")],
            [<C>getRandomBattleSet(species, gen?, format?)</C>, t('한 포켓몬의 레벨·역할·기술 후보·특성·테라 타입', 'One species’ level, roles, candidate moves, abilities, Tera types')],
            [<C>getRandomBattleSets(gen?, format?)</C>, t('풀 전체', 'The whole pool')],
            [<C>randomBattleLevelStats(gen?, format?)</C>, t('종족값 구간별 평균 레벨', 'Average level by base stat total band')],
            [<C>RANDOM_BATTLE_FORMATS</C>, t('지원하는 (세대, 형식, 포맷 ID)', 'Supported (gen, format, format ID)')],
          ]}
        />
        <H2>{t('밸런스 레벨', 'Balanced levels')}</H2>
        <P>{t(
          '랜덤배틀은 약한 포켓몬일수록 레벨을 높여 균형을 맞춥니다. 9세대 기준 Lv 64~100이고, 공식이 아니라 종마다 정해 둔 값입니다. 종족값과 강하게 반비례하지만(상관계수 −0.78, 종족값 100 높을 때마다 약 6.5레벨 낮음) 특성·기술폭에 따라 조정됩니다.',
          'Random battles raise the level of weaker Pokémon to balance them. Gen 9 uses Lv. 64–100, set per species rather than by formula. It tracks base stat total closely (r = −0.78, about 6.5 levels lower per 100 BST) and is adjusted for abilities and movepools.',
        )}</P>
        <ApiRun id="randomSets" maxHeight={420} />
        <Ul items={t([
          '강하면 더 낮게: 코라이돈 64 (종족값 670), 돌핀맨 77, 포푸니크 74.',
          '약점이 있으면 더 높게: 게을킹·레지기가스 84 (게으름·슬로스타트).',
          '같은 종족값 600도 데옥시스 어택폼 72 ~ 후파 85.',
          '메가스톤·원시 구슬·녹슨검을 든 세트는 바뀐 모습의 레벨을 씁니다.',
          "level: 50 처럼 고정하면 이 보정이 없어집니다 (공식 랜덤배틀과 다름).",
        ], [
          'Stronger sits lower: Koraidon 64 (BST 670), Palafin 77, Sneasler 74.',
          'Drawbacks sit higher: Slaking and Regigigas 84 (Truant, Slow Start).',
          'Even at BST 600 it ranges from Deoxys-Attack 72 to Hoopa 85.',
          'Sets holding a Mega Stone, Primal orb or Rusted Sword use the transformed form’s level.',
          'A fixed level such as level: 50 removes this balancing (unlike the official format).',
        ])} />
        <P>{t(
          <>배틀은 실제 랜덤배틀 포맷(<C>gen9randombattle</C> 등)으로 돌기 때문에 종 클로즈·슬립 클로즈 등 규칙이 Showdown과 같습니다. 세대마다 생성된 팀 수백 마리를 조회 API와 대조해 레벨이 같은지 테스트합니다.</>,
          <>Battles run on the real random format (<C>gen9randombattle</C> …), so Species Clause, Sleep Clause and the other rules match Showdown. Tests check hundreds of generated Pokémon per generation against the lookup API’s levels.</>,
        )}</P>
      </>
    ),
  },
  {
    slug: 'metronome',
    group: 'battle',
    title: ['손가락흔들기 모드', 'Metronome mode'],
    lead: [
      '모든 포켓몬의 기술이 손가락흔들기 하나뿐인 배틀. 포켓몬은 직접 고르거나 랜덤, HP·공격·방어·특공·특방·스피드 실수치와 레벨은 자유롭게 정합니다.',
      'Every Pokémon knows only Metronome. Pick the Pokémon or roll them at random, and set HP, Attack, Defense, Sp. Atk, Sp. Def, Speed and level freely.',
    ],
    body: t => (
      <>
        <ApiRun id="metronome" maxHeight={420} />
        <ApiTable
          head={t(['옵션', '설명'], ['Option', 'Description'])}
          rows={[
            [<C>seed</C>, t('같은 시드 → 같은 랜덤 팀 + 같은 배틀 (같은 선택일 때)', 'Same seed → same random teams and same battle (given the same choices)')],
            [<C>p1 / p2.team</C>, t("'random'(기본) 또는 종 목록 (1~6마리). 항목은 'pikachu' 같은 문자열이나 { species, nickname, level, ability, item, nature, stats }", "'random' (default) or a list of 1–6 species. Each entry is a string such as 'pikachu' or { species, nickname, level, ability, item, nature, stats }")],
            [<C>teamSize</C>, t("'random' 팀 크기 1~6 (기본 3, 더블 4)", "Size of 'random' teams, 1–6 (default 3, doubles 4)")],
            [<C>stats</C>, t('실수치 { hp, attack, defense, special_attack, special_defense, speed } 중 원하는 것만, 1~9999. 전체 → p1/p2.stats → 포켓몬 stats 순으로 덮어씀', 'Any of { hp, attack, defense, special_attack, special_defense, speed }, 1–9999. Global → p1/p2.stats → per-Pokémon stats, later wins')],
            [<C>level</C>, t('1~100 (기본 100). 팀·포켓몬별로도 지정', '1–100 (default 100); can also be set per side or per Pokémon')],
            [<C>format</C>, t("'singles'(기본) | 'doubles'", "'singles' (default) | 'doubles'")],
            [<C>terastal</C>, t('9세대 테라스탈 허용 (기본 false)', 'Allow Terastallization in Gen 9 (default false)')],
            [<C>gen</C>, t('세대 (기본 9)', 'Generation (default 9)')],
          ]}
        />
        <H2>{t('자유 능력치는 어떻게 들어가나', 'How free stats work')}</H2>
        <P>{t(
          <>HP 999 같은 값은 노력치·개체값·성격으로 만들 수 없어서, 엔진이 Showdown 규칙 <C>Custom Stats Mod</C>를 등록해 배틀 시작 직후(선두가 나오기 전) 시뮬레이터 포켓몬의 <C>storedStats</C>·<C>maxhp</C>를 그 값으로 바꿉니다. 폼체인지 뒤에도 값이 유지되고, 변신은 Showdown 그대로 상대의 능력치를 복사합니다. 엔진 상태(<C>getPokemon().stats</C>·<C>max_hp</C>)와 <C>previewDamage</C>도 같은 실수치를 씁니다. 값은 포맷 ID에 실려 <C>replayInputLog</C>로 같은 배틀이 재생됩니다.</>,
          <>Values such as 999 HP can’t be reached with EVs, IVs and natures, so the engine registers a Showdown rule, <C>Custom Stats Mod</C>, that sets the simulator Pokémon’s <C>storedStats</C> and <C>maxhp</C> right after the battle starts, before the leads come out. The values survive forme changes, and Transform copies the target’s stats as Showdown does. Engine state (<C>getPokemon().stats</C>, <C>max_hp</C>) and <C>previewDamage</C> use the same numbers. The values travel in the format ID, so <C>replayInputLog</C> reproduces the battle.</>,
        )}</P>
        <P>{t(
          <>일반 배틀에서도 세트에 <C>customStats</C>를 주면 같은 방식으로 적용됩니다.</>,
          <>Ordinary battles can use the same thing by giving a set <C>customStats</C>.</>,
        )}</P>
        <Snippet title="PokemonSet.customStats" code={`new BattleEngine({ format: 'singles', p1: { name: 'A', team: [{
  species: 'pikachu', level: 50, gender: null, ability: 'static', nature: 'hardy',
  moves: ['thunderbolt'], customStats: { hp: 999, speed: 1 },   // ${t('지정한 것만, 나머지는 평소 계산', 'only these; the rest are computed as usual')}
}] }, p2: { /* … */ } })`} />
        <Ul items={t([
          "'random' 팀은 그 세대까지 나온 포켓몬 전체(과거작 포함)에서 같은 종 없이 뽑습니다. 메가·거다이맥스처럼 배틀 중에만 되는 폼과 아르세우스 타입처럼 특정 도구가 있어야 하는 폼은 빠집니다 (metronomeSpeciesPool).",
          '도구는 없고 성격은 노력없음(hardy), 특성은 랜덤이면 그 종의 특성 중 하나, 직접 고르면 첫 번째 특성 (ability 로 지정 가능).',
          '손가락흔들기 PP(16)를 다 쓰면 Showdown 그대로 발버둥을 씁니다.',
          '범위를 벗어난 능력치·레벨·팀 크기, 없는 포켓몬은 어느 값이 잘못됐는지 적힌 BattleError.',
          '옵션 객체는 JSON 으로 저장할 수 있어 룸(방) 설정으로 보관했다가 같은 seed 로 같은 배틀을 다시 만들 수 있습니다.',
          'Showdown 서버의 [Gen 9] Metronome Battle 포맷(더블, 2마리, 특성·도구 금지 목록)은 @pkmn/sim 에 들어 있지 않아, 커스텀 게임 위에 직접 꾸립니다.',
        ], [
          "'random' teams draw from every Pokémon released up to that generation (past ones included) without repeating a species. Battle-only formes such as Mega and Gigantamax, and formes that need a specific item such as Arceus types, are left out (metronomeSpeciesPool).",
          'No items, Hardy nature; the ability is a random one of the species for random teams and its first ability for chosen ones (override with ability).',
          'Once Metronome’s 16 PP run out the Pokémon uses Struggle, as on Showdown.',
          'Out-of-range stats, levels or team sizes and unknown species throw a BattleError naming the bad value.',
          'The options object is plain JSON, so a room can store it and rebuild the same battle from the same seed.',
          'Showdown’s server-side [Gen 9] Metronome Battle format (doubles, two Pokémon, ability and item bans) is not shipped in @pkmn/sim, so this mode is assembled on Custom Game.',
        ])} />
      </>
    ),
  },
  {
    slug: 'rules',
    group: 'battle',
    title: ['규칙 옵션', 'Rule options'],
    lead: [
      'config.options 로 팀 프리뷰, 출전 수, 레벨, 테라스탈, 클로즈를 켜고 끕니다. 각 옵션은 Showdown 규칙으로 바뀝니다.',
      'config.options toggles team preview, team size, levels, Terastallization and clauses. Each option becomes a Showdown rule.',
    ],
    body: t => (
      <>
        <Snippet title="BattleRuleOptions" code={`new BattleEngine({
  format: 'doubles',
  options: {
    pickedTeamSize: 4,        // ${t('6마리 중 4마리 (팀 프리뷰 자동)', 'bring 4 of 6 (turns on team preview)')}
    level: 50,                // ${t('전원 레벨 50', 'everyone at level 50')}
    terastal: false,          // ${t('테라스탈 금지', 'no Terastallization')}
    speciesClause: true,
    itemClause: true,
    sleepClause: true,
  },
  p1, p2,
})`} />
        <ApiTable
          head={t(['옵션', 'Showdown 규칙', '적용 시점'], ['Option', 'Showdown rule', 'Enforced'])}
          rows={[
            [<C>teamPreview</C>, 'Team Preview', t('배틀', 'battle')],
            [<C>pickedTeamSize</C>, 'Picked Team Size = N', t('배틀 (팀 프리뷰)', 'battle (team preview)')],
            [<C>level</C>, 'Adjust Level', t('시작 시 세트에 적용', 'applied to sets at start')],
            [<C>minLevel / maxLevel</C>, 'Min Level / Max Level', t('시작 시 검사', 'checked at start')],
            [<C>terastal: false</C>, 'Terastal Clause', t('배틀', 'battle')],
            [<C>sleepClause</C>, 'Sleep Clause Mod', t('배틀', 'battle')],
            [<C>endlessBattleClause</C>, 'Endless Battle Clause', t('배틀', 'battle')],
            [<C>speciesClause</C>, 'Species Clause', t('시작 시 검사', 'checked at start')],
            [<C>itemClause</C>, 'Item Clause = 1', t('시작 시 검사', 'checked at start')],
            [<C>ohkoClause</C>, 'OHKO Clause', t('시작 시 검사', 'checked at start')],
            [<C>evasionClause</C>, 'Evasion Clause', t('시작 시 검사', 'checked at start')],
          ]}
        />
        <P>{t(
          <>"시작 시 검사" 규칙은 Showdown <C>TeamValidator</C>로 검사하고, 어기면 <C>start()</C>(또는 첫 <C>getRequest</C>)에서 <C>BattleError</C>를 던집니다. 옵션에 없는 규칙은 <C>config.rules</C>에 Showdown 규칙 이름으로 직접 넣을 수 있습니다.</>,
          <>"Checked at start" rules run through Showdown’s <C>TeamValidator</C>; a violation throws a <C>BattleError</C> from <C>start()</C> (or the first <C>getRequest</C>). Anything not covered by options can go in <C>config.rules</C> as a raw Showdown rule name.</>,
        )}</P>
        <ApiRun id="rules" />
        <H2>{t('팀 프리뷰', 'Team preview')}</H2>
        <P>{t(
          <>팀 프리뷰가 켜지면 <C>phase</C>가 <C>'team_preview'</C>가 되고, <C>getRequest</C>는 <C>null</C>, <C>getTeamPreview(player)</C>가 파티와 출전 수를 돌려줍니다. <C>{"{ type: 'team', order }"}</C>로 출전 순서를 내면 앞에서부터 선발로 나옵니다. <C>HeuristicAI</C>, <C>RandomAI</C>, <C>simulateBattle</C>은 팀 프리뷰를 알아서 통과하고, <C>useBattle</C>은 AI가 맡은 쪽만 자동으로 고릅니다.</>,
          <>With team preview on, <C>phase</C> is <C>'team_preview'</C>, <C>getRequest</C> returns <C>null</C>, and <C>getTeamPreview(player)</C> returns the party and how many to bring. Submit <C>{"{ type: 'team', order }"}</C>; the first in the order lead. <C>HeuristicAI</C>, <C>RandomAI</C> and <C>simulateBattle</C> handle team preview on their own; <C>useBattle</C> picks only for AI-controlled sides.</>,
        )}</P>
        <ApiRun id="teamPreview" />
      </>
    ),
  },

  // ─── 도구 ─────────────────────────────────────────────────
  {
    slug: 'damage',
    group: 'tools',
    title: ['데미지 계산', 'Damage calculator'],
    lead: ['@smogon/calc 위의 얇은 래퍼. Showdown 데미지 계산기와 같은 숫자를 냅니다.', 'A thin wrapper over @smogon/calc. It gives the same numbers as the Showdown damage calculator.'],
    body: t => (
      <>
        <Snippet code={`calculateDamage(attacker: CalcPokemonInput, defender: CalcPokemonInput, move: string, field?: CalcFieldInput): DamageResult`} />
        <ApiRun id="damage" />
        <H2>{t('보정 조건', 'Modifiers')}</H2>
        <P>{t(
          '필드 옵션(벽·급소·날씨·필드)과 포켓몬 옵션(도구·특성·랭크·테라스탈)을 조합해 비교할 수 있습니다.',
          'Combine field options (screens, crits, weather, terrain) with Pokémon options (item, ability, boosts, Tera) to compare.',
        )}</P>
        <ApiRun id="damageMods" />
        <H3>CalcPokemonInput</H3>
        <ApiTable
          head={t(['필드', '설명'], ['Field', 'Description'])}
          rows={[
            [<C>species, level, nature, ability, item</C>, t('슬러그 / Showdown 이름', 'Slug or Showdown name')],
            [<C>evs, ivs, boosts</C>, t('노력치·개체값·랭크(-6~+6)', 'EVs, IVs, stat stages (-6 to +6)')],
            [<C>status</C>, "'burn' | 'paralysis' | …"],
            [<C>curHP / hpPercent</C>, t('현재 HP (실수치 우선)', 'Current HP (absolute value wins)')],
            [<C>teraType + terastallized</C>, t('테라스탈 적용', 'Apply Terastallization')],
            [<C>boostedStat, alliesFainted</C>, t('고대활성/쿼크차지, 대장의깃발', 'Protosynthesis / Quark Drive, Supreme Overlord')],
          ]}
        />
        <H3>CalcFieldInput</H3>
        <ApiTable
          head={t(['필드', '설명'], ['Field', 'Description'])}
          rows={[
            [<C>weather, terrain</C>, "'sun' | 'rain' | 'sandstorm' | 'snow' … / 'electric' | 'grassy' …"],
            [<C>reflect, lightScreen, auroraVeil</C>, t('방어 측 벽', 'Defender’s screens')],
            [<C>stealthRock, spikes</C>, t('방어 측 해저드 (KO 확률에 반영)', 'Defender’s hazards (counted in KO chance)')],
            [<C>isCrit, helpingHand, doubles, hits</C>, t('공격 측 조건', 'Attacker conditions')],
            [<C>gen</C>, t('세대 (1~9, 기본 9)', 'Generation (1–9, default 9)')],
          ]}
        />
        <H3>DamageResult</H3>
        <ApiTable
          head={t(['필드', '설명'], ['Field', 'Description'])}
          rows={[
            [<C>range</C>, t('난수 16단계 데미지', 'All 16 damage rolls')],
            [<C>min, max, minPercent, maxPercent</C>, t('실수치 / 최대 HP 대비 %', 'Absolute / % of max HP')],
            [<C>koChance, koHits, koText</C>, t("KO 확률·타수·'확정 2타' '난수 1타 (43.8%)'", "KO chance, hits, and Korean text like '확정 2타'")],
            [<C>desc</C>, t('Showdown 계산기 형식 설명 (영문)', 'Showdown calculator description (English)')],
            [<C>effectiveness, isSTAB, basePower, category</C>, t('기술 정보', 'Move details')],
          ]}
        />
        <H2>{t('배틀 중 미리보기', 'Preview during a battle')}</H2>
        <P>{t(
          <><C>engine.previewDamage(player, moveIndex)</C>는 현재 배틀 상태(랭크, 날씨, 벽, HP…)를 그대로 계산기에 넘깁니다.</>,
          <><C>engine.previewDamage(player, moveIndex)</C> passes the live battle state (boosts, weather, screens, HP …) to the calculator.</>,
        )}</P>
        <ApiRun id="preview" />
      </>
    ),
  },
  {
    slug: 'data',
    group: 'tools',
    title: ['데이터 & 이름', 'Data & names'],
    lead: [
      'Showdown 데이터와 PokeAPI 슬러그·한국어 이름을 한 곳에서. 1,351개 PokeAPI 슬러그(폼 포함)가 Showdown ID에 매핑됩니다.',
      'Showdown data plus PokeAPI slugs and Korean names in one place. All 1,351 PokeAPI slugs, forms included, map to Showdown IDs.',
    ],
    body: t => (
      <>
        <ApiRun id="data" />
        <ApiTable
          head={t(['함수', '설명'], ['Function', 'Description'])}
          rows={[
            [<C>getSpecies(name) / getMove(name)</C>, t('엔진 형식 데이터 (한국어 이름 포함). 슬러그·Showdown 이름·ID 모두 허용', 'Engine-format data with Korean names. Slugs, Showdown names and IDs all work')],
            [<C>listSpecies() / listMoves()</C>, t('전체 목록', 'Full lists')],
            [<C>getTypeChart()</C>, t('타입 상성표', 'Type chart')],
            [<C>koName.species | move | ability | item | type | nature</C>, t('PokeAPI 한국어 이름 (없으면 null)', 'Korean name from PokeAPI (null if missing)')],
            [<C>speciesSlug(id) / moveSlug / abilitySlug / itemSlug</C>, t('Showdown → PokeAPI 슬러그', 'Showdown → PokeAPI slug')],
            [<C>speciesToShowdown(slug) / moveToShowdown …</C>, t('PokeAPI 슬러그 → Showdown', 'PokeAPI slug → Showdown')],
            [<C>getPokeApiSpecies(slug)</C>, t('전국도감 번호·슬러그·한국어 이름', 'National Dex number, slug, Korean name')],
            [<C>calcHP / calcAllStats / getNatureMultiplier</C>, t('실수치 계산', 'Stat calculation')],
          ]}
        />
      </>
    ),
  },
  {
    slug: 'ai',
    group: 'tools',
    title: ['AI & 시뮬레이션', 'AI & simulation'],
    lead: ['BattleAI 인터페이스 하나로 봇을 끼우고, simulateBattle로 끝까지 돌립니다.', 'Plug in a bot through the BattleAI interface and run battles to the end with simulateBattle.'],
    body: t => (
      <>
        <Snippet code={`interface BattleAI {
  chooseAction(engine: BattleEngine, player: PlayerID): Action | null
}`} />
        <ApiTable
          head={t(['구현', '설명'], ['Implementation', 'Description'])}
          rows={[
            [<C>new RandomAI(seed?)</C>, t('가능한 행동 중 무작위', 'Random legal action')],
            [<C>new HeuristicAI({'{ seed, randomness, useTera }'})</C>, t('데미지 계산 기반 점수. randomness 0~1', 'Scores actions with damage calcs. randomness 0–1')],
            [<C>createAI('random' | 'heuristic' | 'strong', seed?)</C>, t("'strong' = randomness 0.03", "'strong' = randomness 0.03")],
          ]}
        />
        <H2>simulateBattle</H2>
        <P>{t(
          <>두 AI로 배틀을 끝까지 진행하고 <C>{'{ winner, turns, engine, log }'}</C>를 돌려줍니다. <C>onEvent</C>를 주면 이벤트를 받습니다.</>,
          <>Plays a battle to the end with two AIs and returns <C>{'{ winner, turns, engine, log }'}</C>. Pass <C>onEvent</C> to receive events.</>,
        )}</P>
        <ApiRun id="simulate" />
        <P>{t(<>터미널에서 더 크게 돌리려면 <C>npx pokebattle sim --battles 500</C> 또는 <C>npm run bench -- 500</C>.</>, <>For a larger run in the terminal: <C>npx pokebattle sim --battles 500</C> or <C>npm run bench -- 500</C>.</>)}</P>
      </>
    ),
  },

  {
    slug: 'cli',
    group: 'tools',
    title: ['CLI', 'CLI'],
    lead: [
      'npx pokebattle 로 터미널에서 AI와 대전하거나, 관전하거나, 대량 시뮬레이션을 돌립니다.',
      'npx pokebattle plays against the AI, watches AI battles or runs bulk simulations from the terminal.',
    ],
    body: t => (
      <>
        <Snippet lang="bash" code={`npx pokebattle play  --lang en                  # ${t('나 vs AI (랜덤배틀 팀)', 'you vs the AI (random-battle teams)')}
npx pokebattle play  --team my.txt --foe cpu.json --level 50
npx pokebattle watch --lang ja --seed 42        # ${t('AI vs AI 로그', 'AI vs AI log')}
npx pokebattle watch --gen 7 --level 100        # ${t('7세대 (메가진화·Z기술)', 'Gen 7 (Mega Evolution, Z-Moves)')}
npx pokebattle watch --json                     # ${t('JSON Lines: 이벤트 + 문장', 'JSON Lines: events + text')}
npx pokebattle watch --metronome --hp 999       # ${t('손가락흔들기 모드 (랜덤 팀)', 'Metronome mode (random teams)')}
npx pokebattle play  --metronome --p1 pikachu,snorlax --p2 random --spe 1
npx pokebattle sim   --battles 500 --vs heuristic --json`} />
        <ApiTable
          head={t(['옵션', '설명'], ['Option', 'Description'])}
          rows={[
            [<C>--lang ko|en|ja</C>, t('로그 언어 (또는 POKEBATTLE_LANG)', 'Log language (or POKEBATTLE_LANG)')],
            [<C>--gen 1-9</C>, t('세대: 판정·랜덤배틀 세트·레벨', 'Generation: mechanics, random-battle sets and levels')],
            [<C>--level N</C>, t("모든 포켓몬 레벨 고정 (기본: 랜덤배틀 밸런스 레벨)", 'Set every Pokémon to level N (default: balanced random-battle levels)')],
            [<C>--seed N</C>, t('같은 시드 + 같은 선택 = 같은 배틀', 'Same seed + same choices = same battle')],
            [<C>--team / --foe FILE</C>, t('Showdown 텍스트 또는 JSON 팀 파일', 'Showdown text or JSON team file')],
            [<C>--json</C>, t('다른 프로그램이 받아 쓰기 좋은 JSON Lines', 'JSON Lines for other programs')],
            [<C>--metronome</C>, t('손가락흔들기 모드 (play / watch)', 'Metronome mode (play / watch)')],
            [<C>--p1 / --p2 LIST|random</C>, t('손가락흔들기 모드 팀: 쉼표로 나눈 종 목록, 기본 random', 'Metronome teams: comma-separated species, default random')],
            [<C>--team-size N</C>, t('랜덤 팀 크기 (1~6, 기본 3)', 'Random team size (1–6, default 3)')],
            [<C>--hp --atk --def --spa --spd --spe N</C>, t('손가락흔들기 모드: 모든 포켓몬 실수치 고정 (1~9999)', 'Metronome mode: fixed stats for every Pokémon (1–9999)')],
          ]}
        />
        <P>{t(
          <><C>play</C>는 양쪽 HP 바와 내 기술(타입·위력·PP·예상 데미지)을 보여줍니다. 숫자로 기술, <C>t1</C> 테라스탈, <C>m1</C> 메가진화, <C>z1</C> Z기술, <C>d1</C> 다이맥스, <C>s</C> 교체, <C>q</C> 종료. 한글·가나 폭에 맞춰 줄을 맞춥니다.</>,
          <><C>play</C> shows both HP bars and your moves with type, power, PP and the damage range. A number uses a move; <C>t1</C> Terastallizes, <C>m1</C> Mega Evolves, <C>z1</C> uses a Z-Move, <C>d1</C> Dynamaxes; <C>s</C> switches, <C>q</C> quits. Columns line up for Korean and Japanese text.</>,
        )}</P>
      </>
    ),
  },

  // ─── 연동 ─────────────────────────────────────────────────
  {
    slug: 'react',
    group: 'integrate',
    title: ['React 훅', 'React hook'],
    lead: [
      'useBattle은 엔진을 React 상태로 감싸고, AI가 맡은 쪽은 요청이 생기면 자동으로 제출합니다.',
      'useBattle wraps the engine in React state and submits automatically for any side an AI controls.',
    ],
    body: t => (
      <>
        <Snippet lang="tsx" title="Battle.tsx" code={`import { useBattle } from '@kyasi/pokebattle-engine/react'
import { HeuristicAI, formatEvent } from '@kyasi/pokebattle-engine'

export function Battle({ config }) {
  const { engine, state, log, requests, submit, error, reset } =
    useBattle(config, { ai: { p2: new HeuristicAI() } })

  const req = requests.p1
  if (!state || !engine) return null
  return (
    <>
      <ol>{log.map((ev, i) => <li key={i}>{formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })}</li>)}</ol>
      {req?.type === 'move' && req.moves.map(m => (
        <button key={m.index} disabled={m.disabled}
          onClick={() => submit({ type: 'move', player: 'p1', pokemon_id: req.active.id, move_index: m.index })}>
          {m.move.name}
        </button>
      ))}
      {error && <p>{error.message}</p>}
    </>
  )
}`} />
        <ApiTable
          head={t(['반환값', '설명'], ['Returns', 'Description'])}
          rows={[
            [<C>engine</C>, 'BattleEngine | null'],
            [<C>state</C>, t('매 이벤트마다 갱신되는 BattleState 스냅샷', 'BattleState snapshot, refreshed on every event')],
            [<C>log</C>, 'BattleEvent[]'],
            [<C>requests</C>, t('{ p1?, p2? } 현재 요청', '{ p1?, p2? } current requests')],
            [<C>submit(action)</C>, t('제출. 실패하면 error에 담김 (throw 하지 않음)', 'Submit. Failures land in error instead of throwing')],
            [<C>reset(config?)</C>, t('새 배틀로 리셋', 'Start a new battle')],
          ]}
        />
        <P>{t(
          <><C>config</C>가 <C>null</C>이면 대기합니다. config 객체가 바뀌면 새 배틀을 만들기 때문에 <C>useMemo</C>로 고정하세요.</>,
          <>A <C>null</C> config waits. A new config object starts a new battle, so keep it stable with <C>useMemo</C>.</>,
        )}</P>
      </>
    ),
  },
  {
    slug: 'testing',
    group: 'integrate',
    title: ['테스트 & 퍼징', 'Testing & fuzzing'],
    lead: ['모든 배틀은 seed로 재현됩니다. 퍼저는 매 배틀 여덟 가지 불변식을 검사합니다.', 'Every battle is reproducible from its seed. The fuzzer checks eight invariants on each one.'],
    body: t => (
      <>
        <Snippet lang="bash" code={`npm test                                  # ${t('유닛 테스트', 'unit tests')}
npm run fuzz -- --battles 100000 --workers 4
npm run bench:compare                     # ${t('Showdown 대비 속도 + 로그 동일성', 'speed vs Showdown + identical logs')}
npm run check:dist                        # ${t('배포 번들 == 원본 @pkmn/sim', 'published bundle == original @pkmn/sim')}
npx pokebattle watch --gen 8              # ${t('터미널에서 AI vs AI 관전', 'watch AI vs AI in the terminal')}`} />
        <H2>{t('퍼징 입력', 'Fuzz inputs')}</H2>
        <Ul items={t([
          '형식: 싱글 65% / 더블 15% / 트리플 10% / 로테이션 10%, 20%는 팀 프리뷰',
          '세대: 30%는 그 형식이 있는 1~8세대 (그 세대 랜덤배틀 세트, 메가·Z·다이맥스 포함)',
          '팀: Showdown 랜덤 배틀 세트 50%, 카오스 팀(무작위 종·특성·도구·기술·노력치/개체값·레벨 1–100·테라 타입) 50%',
          '선택: 무작위 또는 휴리스틱 AI',
        ], [
          'Format: singles 65% / doubles 15% / triples 10% / rotation 10%, 20% with team preview',
          'Generation: 30% in Gens 1–8 where the format exists (that gen’s random-battle sets, incl. Mega/Z/Dynamax)',
          'Teams: Showdown random battle sets 50%, chaos teams (random species, abilities, items, moves, EVs/IVs, levels 1–100, Tera types) 50%',
          'Choices: random or heuristic AI',
        ])} />
        <H2>{t('불변식', 'Invariants')}</H2>
        <ol className="prose-list">
          {t([
            '예외가 없다.',
            '엔진이 제시한 모든 행동(싱글)을 Showdown이 받아들인다.',
            '처리되지 않은 프로토콜 메시지가 0개다.',
            '모든 이벤트가 실제 포켓몬을 가리킨다.',
            '이벤트만으로 복원한 HP가 시뮬레이터의 실제 HP와 같다 (모든 포켓몬).',
            '기절 수와 승자가 일관된다.',
            '같은 seed를 다시 돌리면 같은 로그가 나온다 (1% 샘플).',
            '빠른 경로(기본)와 Showdown 원본 경로의 프로토콜 로그가 같다 (전수).',
          ], [
            'No exceptions.',
            'Showdown accepts every action the engine offers (singles).',
            'Zero unhandled protocol messages.',
            'Every event refers to a real Pokémon.',
            'HP rebuilt from events alone equals the simulator’s HP (every Pokémon).',
            'Faint counts and the winner are consistent.',
            'Re-running a seed gives the same log (1% sample).',
            'The fast path (default) and Showdown’s original path produce the same protocol log (every battle).',
          ]).map(x => <li key={x}>{x}</li>)}
        </ol>
        <P>{t(
          'GitHub Actions의 "Fuzz (sharded)" 워크플로가 1,000만 배틀을 병렬 샤드로 돌리고, CI는 푸시마다 1만 배틀을 돌립니다.',
          'The "Fuzz (sharded)" GitHub Actions workflow runs 10 million battles in parallel shards, and CI runs 10,000 on every push.',
        )}</P>
      </>
    ),
  },
]
