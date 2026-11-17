import type { ReactNode } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { ApiRun } from '../components/ApiRun'
import { ApiTable, C, H2, H3, P, Snippet, Ul } from '../components/Prose'
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
      'Pokémon Showdown 시뮬레이터 위에 슬러그 기반 API, 타입 있는 이벤트, 한국어 로그를 얹은 배틀 엔진입니다.',
      'A battle engine that adds a slug-based API, typed events and Korean battle logs on top of the Pokémon Showdown simulator.',
    ],
    body: t => (
      <>
        <P>{t(
          <>배틀 판정은 전부 Showdown 시뮬레이터(<C>@pkmn/sim</C>)가 합니다. 9세대 기술·특성·도구의 상호작용이 Showdown과 똑같이 동작하고, 이 패키지는 그 위에서 입력을 검증하고, 프로토콜 로그를 이벤트로 바꾸고, 한국어로 읽을 수 있게 만듭니다.</>,
          <>Every battle rule is decided by the Showdown simulator (<C>@pkmn/sim</C>), so Gen 9 moves, abilities and items interact exactly as they do on Showdown. This package validates input on top of it, turns the protocol log into events, and makes it readable in Korean.</>,
        )}</P>
        <H2>{t('구성', 'What’s inside')}</H2>
        <ApiTable
          head={t(['모듈', '하는 일'], ['Module', 'What it does'])}
          rows={[
            [<C>BattleEngine</C>, t('싱글/더블 배틀 진행. getRequest → submitAction 두 함수로 한 턴이 돈다.', 'Runs singles and doubles. One turn is getRequest → submitAction.')],
            [<C>BattleEvent</C>, t('Showdown 로그 한 줄이 쓰이는 순간 타입 있는 이벤트로 변환. 이벤트만 재생해도 HP가 시뮬레이터와 일치.', 'Each Showdown log line becomes a typed event as it is written. Replaying events alone reproduces the simulator’s HP.')],
            [<C>formatEvent</C>, t('이벤트 → 한국어 문장. 받침에 맞춰 이/가, 은/는을 고른다.', 'Event → Korean sentence, with the correct particles.')],
            [<C>calculateDamage</C>, t('@smogon/calc 기반 데미지 계산. Showdown 계산기와 같은 결과.', 'Damage calculation on @smogon/calc. Same numbers as the Showdown calculator.')],
            [<C>HeuristicAI</C>, t('데미지 계산 기반 AI. RandomAI, simulateBattle과 함께 벤치·퍼징에 사용.', 'Damage-based AI. Used with RandomAI and simulateBattle for benchmarks and fuzzing.')],
            [<C>useBattle</C>, t('React 훅 (@kyasi/pokebattle-engine/react).', 'React hook (@kyasi/pokebattle-engine/react).')],
          ]}
        />
        <H2>{t('이 문서의 예제', 'Examples in these docs')}</H2>
        <P>{t(
          <>각 예제의 <b>실행</b> 버튼은 이 페이지 안에서 실제 엔진을 돌리고, 결과를 콘솔처럼 텍스트로만 출력합니다. 같은 seed를 쓰기 때문에 몇 번을 눌러도 같은 로그가 나옵니다.</>,
          <>The <b>Run</b> button on each example runs the real engine in this page and prints the result as plain text, like a console. Examples use fixed seeds, so every run prints the same log. Battle lines are in Korean because that is what <C>formatEvent</C> produces.</>,
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
          ]}
        />
        <H2>{t('요구 사항', 'Requirements')}</H2>
        <Ul items={t([
          'Node.js 또는 최신 브라우저. 데이터는 번들에 포함되어 동기로 로드됩니다 (preloadData 불필요).',
          '의존성: @pkmn/sim, @pkmn/randoms, @smogon/calc.',
          'React는 /react 엔트리를 쓸 때만 필요합니다.',
        ], [
          'Node.js or a modern browser. Data ships in the bundle and loads synchronously (no preloadData needed).',
          'Dependencies: @pkmn/sim, @pkmn/randoms, @smogon/calc.',
          'React is only needed for the /react entry.',
        ])} />
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
          <><C>generateRandomTeam</C>은 Showdown 공식 랜덤 배틀 세트를 만듭니다. <C>format</C>에 <C>gen9randomdoublesbattle</C>을 주면 더블용.</>,
          <><C>generateRandomTeam</C> builds Showdown’s official random battle sets. Pass <C>gen9randomdoublesbattle</C> as <C>format</C> for doubles.</>,
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
            [<C>format</C>, "'singles' | 'doubles'"],
            [<C>p1, p2</C>, t('{ name: string; team: PokemonSet[] } — 최대 6마리', '{ name: string; team: PokemonSet[] } — up to 6')],
            [<C>seed?</C>, t('같은 seed + 같은 입력 → 같은 배틀', 'Same seed + same input → same battle')],
            [<C>maxTurns?</C>, t('넘기면 무승부 (기본 1000)', 'Draw after this many turns (default 1000)')],
            [<C>formatid?</C>, t('Showdown 포맷 ID (기본 gen9customgame / gen9doublescustomgame)', 'Showdown format ID (default gen9customgame / gen9doublescustomgame)')],
            [<C>rules?</C>, t("추가 규칙, 예: ['Sleep Clause Mod', 'Species Clause']", "Extra rules, e.g. ['Sleep Clause Mod', 'Species Clause']")],
          ]}
        />
        <P>{t(
          <><C>EngineOptions.turnSnapshots</C>(기본 true)는 <C>turn_end</C> 이벤트에 상태 스냅샷을 붙입니다. 대량 시뮬레이션에선 false로 끄세요.</>,
          <><C>EngineOptions.turnSnapshots</C> (default true) attaches a state snapshot to <C>turn_end</C>. Turn it off for bulk simulation.</>,
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
        <Snippet title="Action" code={`{ type: 'move',   player, pokemon_id, move_index: 0 | 1 | 2 | 3 | -1, terastallize? }  // -1 = Struggle
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
            [<C>damage / heal</C>, 'pokemon_id, amount, source, hp_after, effectiveness?, crit?'],
            [<C>switch / faint</C>, 'player, out_id, in_id, forced? / pokemon_id'],
            [<C>status_apply / status_remove</C>, 'pokemon_id, status, source?'],
            [<C>volatile_apply / volatile_remove</C>, 'pokemon_id, volatile'],
            [<C>stat_change</C>, 'pokemon_id, stat, stages, actual?'],
            [<C>weather_change / terrain_change</C>, 'weather | terrain, source'],
            [<C>side_start / side_end</C>, 'player, condition, layers?'],
            [<C>field_start / field_end</C>, 'condition (trick_room, gravity …)'],
            [<C>ability_trigger</C>, 'pokemon_id, ability, effect'],
            [<C>item_consume / item_activate</C>, 'pokemon_id, item, effect?'],
            [<C>terastallize / forme_change</C>, 'pokemon_id, tera_type / species'],
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
    slug: 'doubles',
    group: 'battle',
    title: ['더블 · 트리플', 'Doubles & triples'],
    lead: [
      "format: 'doubles' | 'triples'. 편의 API 대신 Showdown 선택 문자열을 그대로 씁니다.",
      "format: 'doubles' | 'triples'. Use Showdown choice strings instead of the convenience API.",
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
        <Banner
          status="warning"
          title={t('로테이션 배틀은 아직 지원하지 않습니다', 'Rotation battles are not supported yet')}
          description={t(
            'Showdown 시뮬레이터에서 로테이션은 슬롯만 남아 있고 회전 행동과 규칙은 제거되어 있습니다. 지원하려면 회전 메커니즘을 직접 구현해야 합니다.',
            'In the Showdown simulator, rotation keeps only its slot layout; the rotate action and its rules were removed. Supporting it means implementing the rotation mechanics ourselves.',
          )}
          collapsible={false}
        />
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
        <P>{t(<>터미널에서 더 크게 돌리려면 <C>npm run bench -- 500</C>.</>, <>For a larger run in the terminal: <C>npm run bench -- 500</C>.</>)}</P>
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
    lead: ['모든 배틀은 seed로 재현됩니다. 퍼저는 매 배틀 일곱 가지 불변식을 검사합니다.', 'Every battle is reproducible from its seed. The fuzzer checks seven invariants on each one.'],
    body: t => (
      <>
        <Snippet lang="bash" code={`npm test                                  # ${t('유닛 테스트', 'unit tests')}
npm run fuzz -- --battles 100000 --workers 4
npm run simulate -- --auto --random       # ${t('터미널에서 AI vs AI 관전', 'watch AI vs AI in the terminal')}`} />
        <H2>{t('퍼징 입력', 'Fuzz inputs')}</H2>
        <Ul items={t([
          '형식: 싱글 85% / 더블 15%',
          '팀: Showdown 랜덤 배틀 세트 50%, 카오스 팀(무작위 종·특성·도구·기술·노력치/개체값·레벨 1–100·테라 타입) 50%',
          '선택: 무작위 또는 휴리스틱 AI',
        ], [
          'Format: singles 85% / doubles 15%',
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
          ], [
            'No exceptions.',
            'Showdown accepts every action the engine offers (singles).',
            'Zero unhandled protocol messages.',
            'Every event refers to a real Pokémon.',
            'HP rebuilt from events alone equals the simulator’s HP (every Pokémon).',
            'Faint counts and the winner are consistent.',
            'Re-running a seed gives the same log (1% sample).',
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
