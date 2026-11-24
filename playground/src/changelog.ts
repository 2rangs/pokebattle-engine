/*
 * 업데이트 내역 (#/changelog) 데이터.
 *
 * 새 항목 추가하는 법:
 *   1. CHANGELOG 배열 맨 위에 객체 하나를 넣는다 (최신이 위).
 *   2. date 는 'YYYY-MM-DD'. 같은 날짜 항목은 페이지에서 한 묶음으로 보인다.
 *   3. kind: 'new'(새 기능) | 'improved'(개선) | 'fixed'(수정),
 *      area: 'demo'(배틀 데모) | 'engine'(엔진) | 'site'(문서·사이트).
 *   4. title 과 points 는 [한국어, 영어] 쌍. points 는 1~3개, 커밋 말투 말고 쓰는 사람 입장에서 쓴다.
 *   5. link 는 선택. 관련 페이지(#/battle, #/docs/… 등)로 가는 링크.
 *
 * How to add an entry: put one object at the top of CHANGELOG (newest first), with a
 * 'YYYY-MM-DD' date, a kind, an area, a [ko, en] title and 1–3 [ko, en] points written
 * for players and users rather than as commit messages. `link` is optional.
 */

export type ChangeKind = 'new' | 'improved' | 'fixed'
export type ChangeArea = 'demo' | 'engine' | 'site'
/** [한국어, 영어] */
export type Bi = readonly [string, string]

export interface ChangeEntry {
  date: string
  kind: ChangeKind
  area: ChangeArea
  title: Bi
  points: readonly Bi[]
  link?: { href: string; label: Bi }
}

export const CHANGELOG: readonly ChangeEntry[] = [
  // ─── 2026-11-24 ─────────────────────────────────────────
  {
    date: '2026-11-24',
    kind: 'new',
    area: 'demo',
    title: ['5세대풍 도트 기술 연출', 'Gen 5-style pixel move effects'],
    points: [
      ['배틀 화면 도구 모음의 “연출: Showdown | 5세대풍”에서 기술 연출 방식을 고를 수 있습니다. 고른 값은 기억됩니다.', 'Pick how moves look from the battle toolbar (Effects: Showdown | Gen 5 style). Your choice is remembered.'],
      ['모든 기술에 타입·분류·위력에 맞는 도트 연출이 붙습니다 (펀치, 빔, 번개, 불꽃, 지진 등).', 'Every move gets a pixel effect that fits its type, category and power — punches, beams, bolts, flames, quakes and more.'],
    ],
    link: { href: '#/battle', label: ['배틀 데모 열기', 'Open the battle demo'] },
  },
  {
    date: '2026-11-24',
    kind: 'new',
    area: 'demo',
    title: ['1~9세대 규칙, 배틀 옵션, 샌드박스', 'Gen 1–9 rules, battle options and a sandbox'],
    points: [
      ['배틀 준비가 규칙 → 팀 → 시작 세 단계로 정리됐고, 세대마다 규칙 요약과 프리셋(자유 / 6→3 대회 / Smogon 클로즈)을 고를 수 있습니다.', 'Setup is now three steps — rules, teams, start — with a rules summary and presets (Free / Tournament 6→3 / Smogon clauses) for each generation.'],
      ['팀 프리뷰 화면에서 출전 포켓몬과 순서를 고르고, CPU도 메가진화·Z기술·다이맥스를 씁니다.', 'Pick and order your Pokémon on the team preview screen; the CPU now uses Mega Evolution, Z-Moves and Dynamax too.'],
      ['샌드박스에서는 기믹을 겹쳐 쓰고, 세트와 능력치를 자유롭게 정할 수 있습니다.', 'In the sandbox you can stack gimmicks and set any moves and stats you like.'],
    ],
    link: { href: '#/docs/generations', label: ['세대별 규칙 문서', 'Generations guide'] },
  },
  {
    date: '2026-11-24',
    kind: 'new',
    area: 'demo',
    title: ['리플레이를 HTML 파일로 저장', 'Save replays as an HTML file'],
    points: [
      ['결과 화면과 리플레이 페이지의 “HTML로 저장”으로 배틀을 파일 하나로 내려받습니다.', 'Use “Save as HTML” on the result screen or the replay page to download a battle as a single file.'],
      ['인터넷 없이도 팀과 턴별 로그가 보이고, 온라인이면 파일에서 바로 리플레이를 재생할 수 있습니다.', 'The teams and turn-by-turn log show offline; when online, the file can play the replay.'],
    ],
  },
  {
    date: '2026-11-24',
    kind: 'improved',
    area: 'site',
    title: ['홈페이지에서 직접 확인하는 성능·일치 검증', 'Check the claims yourself on the home page'],
    points: [
      ['“지금 직접 확인”을 누르면 이 기기에서 Showdown과 이 엔진으로 같은 배틀을 돌려 로그가 같은지, 얼마나 빠른지 보여 줍니다.', '“Verify it now” runs the same battles through Showdown and this engine on your device and shows whether the logs match and how much faster it is.'],
      ['리플레이 링크가 같은 배틀을 다시 만들어 내는 과정도 직접 돌려 볼 수 있습니다.', 'You can also watch a replay link re-create the same battle.'],
    ],
    link: { href: '#/', label: ['홈으로', 'Go home'] },
  },
  {
    date: '2026-11-24',
    kind: 'improved',
    area: 'site',
    title: ['더 깔끔해진 사이트', 'A calmer site layout'],
    points: [
      ['헤더가 한 줄로 줄었고, 휴대폰에서는 문서 목록을 접이식 메뉴로 엽니다.', 'The header is a single row, and phones get a collapsible docs menu.'],
      ['문서마다 페이지 목차와 이전/다음 카드가 생겼습니다.', 'Each docs page has an on-page table of contents and previous/next cards.'],
    ],
  },
  // ─── 2026-11-23 ─────────────────────────────────────────
  {
    date: '2026-11-23',
    kind: 'fixed',
    area: 'demo',
    title: ['휴대폰에서 배틀 로그가 넘치던 문제', 'Battle log overflowing on phones'],
    points: [
      ['좁은 화면에서 배틀 로그가 패널 밖으로 흘러넘쳐 아래 내용을 덮던 문제를 고쳤습니다.', 'On narrow screens the battle log no longer spills out of its panel over the content below.'],
    ],
  },
  // ─── 2026-11-20 ─────────────────────────────────────────
  {
    date: '2026-11-20',
    kind: 'new',
    area: 'demo',
    title: ['게임 같은 배틀 데모', 'A game-style battle demo'],
    points: [
      ['배경, 움직이는 스프라이트, 상태 박스, 싸운다/포켓몬/도망간다 메뉴까지 게임처럼 플레이할 수 있는 배틀 화면이 생겼습니다.', 'A battle screen you can play like the games: backgrounds, animated sprites, databoxes and a Fight / Pokémon / Run menu.'],
      ['기술 버튼에서 예상 데미지를 보고, 손가락흔들기 모드와 CPU끼리의 관전도 할 수 있습니다.', 'Move buttons preview the damage, and you can play Metronome mode or watch CPU vs CPU.'],
      ['배틀은 링크 하나로 공유되는 리플레이로 남습니다.', 'Every battle becomes a replay you can share as a single link.'],
    ],
    link: { href: '#/battle', label: ['배틀 데모 열기', 'Open the battle demo'] },
  },
  {
    date: '2026-11-20',
    kind: 'new',
    area: 'demo',
    title: ['포켓몬별 세트 편집기', 'A set editor for each Pokémon'],
    points: [
      ['기술 4개, 특성, 도구, 성격, 테라스탈 타입, 노력치를 슬롯마다 직접 고를 수 있습니다.', 'Choose four moves, ability, item, nature, Tera Type and EVs for each slot.'],
      ['배울 수 없는 기술이나 노력치 초과는 바로 알려 줍니다. 폼 이름도 한국어로 나옵니다.', 'Unlearnable moves and EV limits are flagged right away, and form names are localized.'],
    ],
  },
  {
    date: '2026-11-20',
    kind: 'new',
    area: 'demo',
    title: ['메가진화·Z기술·다이맥스 (6~9세대)', 'Mega Evolution, Z-Moves and Dynamax (Gen 6–9)'],
    points: [
      ['세대를 고르면 그 세대의 기믹을 기술 옆 버튼으로 쓸 수 있고, Z기술·다이맥스 기술의 이름과 위력이 버튼에 바로 보입니다.', 'Pick a generation and its gimmicks appear next to the moves, with Z-Move and Max Move names and power on the buttons.'],
      ['메가진화·원시회귀·울트라버스트는 모습이 바뀌고, 다이맥스는 몸집이 커지며 거다이맥스는 전용 모습으로 나옵니다.', 'Mega, Primal and Ultra forms change the sprite; Dynamax grows the Pokémon and Gigantamax shows its G-Max form.'],
    ],
  },
  {
    date: '2026-11-20',
    kind: 'new',
    area: 'demo',
    title: ['2D/3D 스프라이트와 기술 애니메이션', '2D/3D sprites and move animations'],
    points: [
      ['2D(5세대 도트)와 3D(6세대 이후 3D 모델) 스프라이트를 배틀 중에도 바꿀 수 있습니다.', 'Switch between 2D (Gen 5 pixel) and 3D (Gen 6+ model) sprites, even mid-battle.'],
      ['Showdown의 기술 애니메이션과 날씨·필드·장판·벽 같은 지속 효과가 화면에 그려집니다.', 'Showdown’s move animations play, and weather, terrain, hazards and screens stay visible on the field.'],
      ['능력치 상승은 빨강, 하락은 파랑으로 게임처럼 보이고, 타입 배지와 분류 아이콘도 게임 스타일로 바뀌었습니다.', 'Stat rises glow red and drops blue like the games, with game-style type badges and move category icons.'],
    ],
  },
  // ─── 2026-11-18 ─────────────────────────────────────────
  {
    date: '2026-11-18',
    kind: 'new',
    area: 'engine',
    title: ['손가락흔들기 모드', 'Metronome mode'],
    points: [
      ['모든 포켓몬이 손가락흔들기만 쓰는 배틀. 포켓몬은 직접 고르거나 무작위로 뽑습니다.', 'Battles where every Pokémon only knows Metronome, with chosen or random Pokémon.'],
      ['레벨과 HP·공격·방어·특공·특방·스피드를 자유롭게 정할 수 있고, 리플레이에도 그대로 남습니다.', 'Set level and every stat freely; the values are kept in replays.'],
    ],
    link: { href: '#/docs/metronome', label: ['손가락흔들기 문서', 'Metronome guide'] },
  },
  {
    date: '2026-11-18',
    kind: 'improved',
    area: 'engine',
    title: ['교체 이유가 보이는 로그와 더 똑똑한 AI', 'Logs that explain switches, and a smarter AI'],
    points: [
      ['유턴, 바톤터치, 탈출버튼, 레드카드, 울부짖기 등으로 교체될 때 이유가 문장으로 나옵니다. 묶기·장판 문장도 늘었습니다.', 'Switches caused by U-turn, Baton Pass, Eject Button, Red Card, Roar and more now say why; trapping and hazard sentences were added too.'],
      ['AI가 장판 피해와 능력치 변화를 따져 교체·바톤터치·날려보내기를 고릅니다.', 'The AI weighs hazard damage and stat stages when it switches, passes or phazes.'],
    ],
  },
  {
    date: '2026-11-18',
    kind: 'fixed',
    area: 'engine',
    title: ['모든 기술·특성·도구 전수 점검', 'Every move, ability and item checked'],
    points: [
      ['모든 기술·특성·도구를 각각 배틀에서 돌려 보는 점검을 CI에 넣고, 여기서 나온 빠진 문장과 잘못된 문장 약 200개를 고쳤습니다.', 'A sweep that plays every move, ability and item in its own battle now runs in CI; about 200 missing or wrong log sentences it found were fixed.'],
      ['예: 탁쳐서떨구기가 더 이상 “먹다 남은 음식을 다 썼다”로 나오지 않습니다.', 'For example, Knock Off no longer reads as “used up its Leftovers”.'],
    ],
  },
  {
    date: '2026-11-18',
    kind: 'new',
    area: 'engine',
    title: ['1~9세대 배틀과 랜덤배틀', 'Gen 1–9 battles and random battles'],
    points: [
      ['1세대부터 9세대까지 각 세대 규칙으로 배틀할 수 있고, Showdown 공식 랜덤배틀 팀을 그대로 씁니다.', 'Battle under the rules of any generation from 1 to 9, with Showdown’s official random battle teams.'],
      ['데미지 로그에 남은 HP가 함께 나오고, 터미널에서 대전·관전하는 CLI가 생겼습니다.', 'Damage lines show the remaining HP, and a CLI lets you play and watch from the terminal.'],
    ],
    link: { href: '#/docs/random', label: ['랜덤배틀 문서', 'Random battles guide'] },
  },
  {
    date: '2026-11-18',
    kind: 'improved',
    area: 'site',
    title: ['문서 예제가 고른 언어로', 'Docs examples follow your language'],
    points: [
      ['예제 코드의 주석과 실행 로그가 문서 언어(한국어/영어)에 맞춰 나옵니다.', 'Example comments and battle logs now appear in the docs language (Korean or English).'],
      ['Showdown과의 속도·용량 차이를 숫자와 그래프로 보여 줍니다.', 'The speed and size comparison with Showdown is shown in numbers and charts.'],
    ],
  },
  {
    date: '2026-11-18',
    kind: 'fixed',
    area: 'engine',
    title: ['“상대 상대” 중복 문장', 'Doubled “상대” in Korean logs'],
    points: [
      ['상대가 포켓몬을 내보낼 때 한국어 로그에 “상대”가 두 번 붙던 문제를 고쳤습니다.', 'Fixed Korean logs saying “상대” (“the opposing”) twice when the opponent sends out a Pokémon.'],
    ],
  },
  // ─── 2026-11-17 ─────────────────────────────────────────
  {
    date: '2026-11-17',
    kind: 'new',
    area: 'engine',
    title: ['트리플·로테이션 배틀', 'Triple and rotation battles'],
    points: [
      ['3마리씩 싸우는 트리플 배틀과, Showdown에는 없는 로테이션 배틀을 지원합니다.', 'Triple battles, plus rotation battles, which Showdown never implemented.'],
      ['팀 프리뷰, 출전 수, 레벨, 테라스탈 사용, 수면·일격기 클로즈 같은 규칙을 옵션으로 켜고 끕니다.', 'Turn rules on and off: team preview, team size, level, Tera, sleep and OHKO clauses and more.'],
    ],
    link: { href: '#/docs/doubles', label: ['더블·트리플 문서', 'Doubles & triples guide'] },
  },
  {
    date: '2026-11-17',
    kind: 'new',
    area: 'site',
    title: ['문서 사이트 공개', 'Docs site launched'],
    points: [
      ['설치부터 이벤트, 데미지 계산, AI, React 연동까지 한국어·영어 문서가 생겼습니다.', 'Korean and English docs, from installation to events, damage calculation, AI and React.'],
      ['예제마다 “실행” 버튼으로 실제 엔진을 브라우저에서 돌려 볼 수 있습니다.', 'Every example has a Run button that runs the real engine in your browser.'],
    ],
    link: { href: '#/docs/introduction', label: ['문서 보기', 'Read the docs'] },
  },
]
