# pokebattle-engine 문서 사이트

라이브러리 소개 페이지와 API 문서. [Astryx](https://github.com/meta/astryx) 디자인 시스템(`@astryxdesign/core`)으로 만들었습니다.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 정적 파일 (해시 라우팅이라 어떤 정적 호스팅에서도 동작)
```

- `src/pages/Landing.tsx` — 소개 페이지 (`#/`)
- `src/pages/docs.tsx` — 문서 페이지 목록과 본문 (`#/docs/<slug>`)
- `src/examples.ts` — 문서의 "실행" 예제. 브라우저에서 배포 번들(`../dist`, `src/engine.ts`)을 그대로 돌리고 결과를 텍스트 로그로만 출력합니다. `code`(보여줄 소스)와 `run`(실제 실행)을 같이 고쳐야 합니다.
- `src/engine.ts` — 엔진 진입점(`../dist`). 사용자가 받는 것과 같은 크기·동작이고, 예제가 쓰는 데이터는 `dataReady` 로 뒤에서 받습니다. `dist` 가 없으면 `npm run dev`/`build` 전에 루트에서 자동으로 빌드합니다.
- `src/theme.ts` — Astryx `defineTheme` (다크 단일 배경, 액센트 `#b4d3ff`, Host Grotesk / Instrument Sans + Pretendard)
- 컴포넌트 문서: `npx @astryxdesign/cli component <Name>`

## 배틀 데모 (`#/battle`)

엔진 번들을 브라우저에서 그대로 돌리는 싱글 배틀 데모입니다 (Pokestra 배틀 시뮬레이터에서 옮겨 와 게임 화면처럼 다듬음). 화면은 문서 사이트와 같은 미니멀 다크 스타일(토큰 색·1px 선·8px 모서리·Astryx 버튼)이고, 타입 색은 문양·왼쪽 선·점으로만 씁니다.

- 규칙: **일반 배틀** (팀 빌더 · 랜덤 팀 · Showdown 가져오기/내보내기, CPU 난이도 3단계) / **손가락흔들기** (`createMetronomeBattle`: 랜덤 또는 직접 고른 종, 레벨, 능력치 덮어쓰기 1~9999)
- 모드: CPU와 대전 / CPU 관전, 마릿수 1·3·6 (자리도 정확히 그 수만큼)
- 상대(CPU) 팀 미리보기: 설정 화면에서 시드로 뽑아 내 팀 아래에 같은 자리 수로 보여 줍니다 (종·타입·레벨·특성·도구·기술 4개). "상대 팀 다시 뽑기"(팀 전체)와 자리마다 "세트 다시 뽑기"·"편집"(같은 세트 편집기). 관전이면 두 CPU 팀이 모두 보입니다. 손가락흔들기의 랜덤 팀도 배틀이 쓸 시드로 미리 만들어(`lib/preview.ts`, 실제 배틀 팀과 같음을 테스트) 양쪽 모두 보여 주고 "다시 뽑기"로 바꿉니다.
- 세트 편집: 자리 카드의 "편집"을 누르면 기술 4개(엔진 `getLearnset` 으로 배울 수 있는 기술만 검색, 타입·분류·위력 표시, 중복 불가), 특성(숨겨진 특성 포함), 도구(`listItems`, 검색·아이콘), 성격(↑/↓ 표시), 테라스탈 타입, 노력치(배분 프리셋 또는 6칸 직접 입력, 칸당 252·합계 510, 실제 능력치 표시)를 바꿀 수 있습니다. 문제는 칸 아래에 바로 표시하고(기술 없음·중복·노력치 초과는 시작 불가, 배울 수 없는 기술·다른 종의 특성은 경고만), "세트 다시 뽑기"와 Showdown 가져오기/내보내기도 그대로입니다. 손가락흔들기는 종만 고르는 간단한 편집기를 씁니다.
- 이름: 폼은 엔진 이름 팩의 폼 이름(워시로토무, 나인테일 (알로라의 모습))을 검색·팀 빌더·데이터박스·로그 모두에서 씁니다. "로토무"로 검색하면 로토무 폼이 모두 나옵니다.
- 화면: 5세대 BW·9세대 SV 배치를 본뜬 장면(상대 데이터박스 왼쪽 위·HP 숫자 없음, 우리 데이터박스 오른쪽 아래), 토큰 색 무대와 발판(어둡게 한 Showdown 배경 그림과 비교해 사이트와 더 잘 맞는 쪽을 골랐습니다), 파티 점, 상태이상 배지, 메시지 상자(한 번에 한 문장, 높이 고정), 커맨드(싸운다/포켓몬/도망친다=기권), 기술 버튼(타입 문양·왼쪽 선, PP, 상성, 예상 데미지, 확정 n타), 테라스탈 버튼.
- 스프라이트 2D / 3D: 설정 화면과 배틀·리플레이 툴바에서 바꿉니다 (브라우저에 저장, 배틀 중에도 바로 적용). 2D = Showdown 애니메이션 도트(우리 쪽은 뒷모습), 3D = Pokémon HOME 렌더(`other/home/{id}.png`, 우리 쪽은 좌우 반전, 움직임 줄이기 설정이 아니면 살짝 숨 쉬는 움직임). 지금 두 팀의 3D 그림은 미리 받아 두고, 그림이 없으면 2D 로 내려갑니다.
- 필드 효과: 지금 프레임 상태로 장면에 계속 그립니다 (실시간·리플레이 같음, 생기고 없어질 때 짧게 페이드, 움직임 줄이기 설정이면 멈춘 그림). 날씨(쾌청·아주 강한 햇살·비·강한 비·모래바람·눈·난기류), 필드(일렉트릭·그래스·미스트·사이코 — 땅 색과 무늬), 진영별 장판(스텔스록, 압정뿌리기 1~3겹, 독압정 1~2겹, 끈적끈적네트), 벽·베일(리플렉터·빛의장막·오로라베일 = 그 진영 앞의 반투명 막, 신비의부적 = 발판 고리, 흰안개 = 발밑 안개), 순풍(지나가는 바람 줄), 필드 전체(트릭룸 격자 바닥, 중력, 매직룸, 원더룸). 남은 턴은 옆 패널에 그대로 나옵니다. 데이터박스는 덮지 않습니다.
- 기술 연출: Pokémon Showdown 클라이언트의 기술 애니메이션 표를 그대로 옮겨(`src/battle/showdown-anims/`, 원본 파일 헤더대로 `battle-animations.ts` MIT · `battle-animations-moves.ts` CC0-1.0, 같은 폴더 `LICENSE`), 우리 장면 좌표로 바꿔 Web Animations API 로 재생합니다(`scene.ts`, 이 저장소 코드). 처음 기술을 쓸 때 따로 받는 청크(약 51 kB gzip)이고, 기술을 쓰는 프레임은 재생 간격의 1.6배 동안 머물러 데미지가 애니메이션 뒤에 나옵니다. "매우 빠르게"·움직임 줄이기·되감기/건너뛰기에서는 돌리지 않습니다.
- 옆 패널: 필드 줄(남은 턴) · 팀(상대 팀 HP %·상태이상·기절, 관전·리플레이는 두 팀) · 현황 · 턴별 로그. 데스크톱은 배틀 열 높이에 맞추고 로그가 남은 칸을 채워 안에서 스크롤(맨 아래를 보고 있을 때만 따라감), 휴대폰은 접어서 시작하고 펼치면 40vh 고정 높이 → 줄이 늘어도 장면·메뉴·페이지 스크롤이 움직이지 않습니다.
- 리플레이: 결과 화면의 링크(`#/battle/replay?d=…`)에 시드 + 팀(또는 손가락흔들기 옵션) + 모든 행동 + 기권이 들어 있어, 새 브라우저에서도 같은 배틀이 재현됩니다 (인코딩은 그대로라 예전 링크도 열립니다). 옆 패널에서 두 팀을 볼 수 있습니다.
- 콘솔: 배틀·리플레이 화면에서 `window.pokebattleDemo.summary()` / `.text()` 로 지금 현황을 읽을 수 있습니다.
- 코드: `src/battle/lib/` (순수 로직 + vitest 테스트, `npm test` — 루트 저장소의 vitest 를 씀), `src/battle/ui/` (화면, 필드 효과는 `SceneEffects.tsx` + `effects.css`), `src/battle/showdown-anims/` (기술 애니메이션), `src/battle/battle.css`.
- 스크린샷: `docs/screenshots/battle/` — 설정·CPU 팀 미리보기 `setup-cpu-desktop.png` / `setup-cpu-mobile.png`, 세트 편집기 `editor-*.png`, 기술 메뉴 `battle-moves-*.png`, 3D 스프라이트 `sprites-3d-*.png`, 필드 효과 `effects-weather.png` / `effects-terrain.png` / `effects-hazards.png` / `effects-screens.png` / `effects-field.png`, 기술 연출 `move-anims.png`, 관전 `spectate-desktop.png`, 손가락흔들기 `metronome-*.png`, 리플레이 `replay-*.png`.

에셋 (모두 GitHub 의 오픈소스 저장소 파일을 직접 불러옴, 저장소에는 넣지 않음):
[PokeAPI/sprites](https://github.com/PokeAPI/sprites) (Showdown 애니메이션 배틀 스프라이트, Pokémon HOME 3D 렌더, BW 아이콘, 타입·도구·몬스터볼 아이콘),
[PokeAPI/cries](https://github.com/PokeAPI/cries) (울음소리, 기본 꺼짐),
[smogon/pokemon-showdown-client](https://github.com/smogon/pokemon-showdown-client) (`fx/*.png` 기술 연출 그림 + 기술 애니메이션 표, 위 라이선스).
비공식 팬 데모이며 Pokémon 과 관련 그림은 © Nintendo / Creatures Inc. / GAME FREAK inc. 의 것입니다.
