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

엔진 번들을 브라우저에서 그대로 돌리는 싱글 배틀 데모입니다 (Pokestra 배틀 시뮬레이터에서 옮겨 와 게임 화면처럼 다듬음). 화면은 문서 사이트와 같은 미니멀 다크 스타일(토큰 색·1px 선·8px 모서리·Astryx 버튼)이고, 타입은 게임 타입 라벨처럼 공식 타입 색 배지로 보여 줍니다(아래 '타입 배지').

- 규칙: **일반 배틀** (팀 빌더 · 랜덤 팀 · Showdown 가져오기/내보내기, CPU 난이도 3단계) / **손가락흔들기** (`createMetronomeBattle`: 랜덤 또는 직접 고른 종, 레벨, 능력치 덮어쓰기 1~9999)
- 모드: CPU와 대전 / CPU 관전, 마릿수 1·3·6 (자리도 정확히 그 수만큼)
- 상대(CPU) 팀 미리보기: 설정 화면에서 시드로 뽑아 내 팀 아래에 같은 자리 수로 보여 줍니다 (종·타입·레벨·특성·도구·기술 4개). "상대 팀 다시 뽑기"(팀 전체)와 자리마다 "세트 다시 뽑기"·"편집"(같은 세트 편집기). 관전이면 두 CPU 팀이 모두 보입니다. 손가락흔들기의 랜덤 팀도 배틀이 쓸 시드로 미리 만들어(`lib/preview.ts`, 실제 배틀 팀과 같음을 테스트) 양쪽 모두 보여 주고 "다시 뽑기"로 바꿉니다.
- 세트 편집: 자리 카드의 "편집"을 누르면 기술 4개(엔진 `getLearnset` 으로 배울 수 있는 기술만 검색, 타입·분류·위력 표시, 중복 불가), 특성(숨겨진 특성 포함), 도구(`listItems`, 검색·아이콘), 성격(↑/↓ 표시), 테라스탈 타입, 노력치(배분 프리셋 또는 6칸 직접 입력, 칸당 252·합계 510, 실제 능력치 표시)를 바꿀 수 있습니다. 문제는 칸 아래에 바로 표시하고(기술 없음·중복·노력치 초과는 시작 불가, 배울 수 없는 기술·다른 종의 특성은 경고만), "세트 다시 뽑기"와 Showdown 가져오기/내보내기도 그대로입니다. 손가락흔들기는 종만 고르는 간단한 편집기를 씁니다.
- 이름: 폼은 엔진 이름 팩의 폼 이름(워시로토무, 나인테일 (알로라의 모습))을 검색·팀 빌더·데이터박스·로그 모두에서 씁니다. "로토무"로 검색하면 로토무 폼이 모두 나옵니다.
- 화면: 5세대 BW·9세대 SV 배치를 본뜬 장면(상대 데이터박스 왼쪽 위·HP 숫자 없음, 우리 데이터박스 오른쪽 아래), 토큰 색 무대와 발판(어둡게 한 Showdown 배경 그림과 비교해 사이트와 더 잘 맞는 쪽을 골랐습니다), 파티 점, 상태이상 배지, 메시지 상자(한 번에 한 문장, 높이 고정), 커맨드(싸운다/포켓몬/도망친다=기권), 기술 버튼(이름·PP / 타입 배지·분류 아이콘·위력 / 상성·예상 데미지·확정 n타, 타입 색 왼쪽 선), 테라스탈 버튼. 데이터박스에 지금 타입(테라스탈하면 테라 타입 하나 + 테라 표시, 상대 테라 타입은 쓰기 전까지 숨김)을 보여 주고, 휴대폰처럼 상자가 좁으면 문양만 둡니다(이름은 title·스크린리더).
- 타입 배지: 공식 타입 색 알약 + 흰 문양 + 굵은 타입 이름(한국어/영어). 문양은 PokeAPI 의 SV 타입 라벨 `sprites/types/generation-ix/scarlet-violet/{id}.png`(200×40, 영어 글자가 박혀 있어 그대로는 못 씀) 왼쪽 원을 캔버스로 읽어 문양만 떼어 낸 뒤(`ui/typeGlyphs.ts`) CSS mask 로 글자색과 같게 칠합니다. 글자색은 WCAG 대비로 고릅니다(`lib/typeStyle.ts`, 테스트): 흰 글자 4.5:1 이상이면 흰색, 3:1 이상이면 흰색 + 어두운 외곽선, 그보다 밝은 타입(전기·얼음·비행·노말 등)은 어두운 글자. 기술 분류 아이콘은 PokéRogue `images/categories.png`(물리·특수·변화 28×11 도트). 팀 카드·CPU 미리보기의 기술 칩도 같은 배지(기술 이름)입니다.
- 글꼴: Instrument Sans 의 가운뎃점 `·` 은 폭이 거의 0 이라 숫자 사이에서 사라져("4·5세대" → "45세대") 이 한 글자만 Pretendard 의 것으로 바꿉니다(`src/index.css` 의 unicode-range `@font-face`).
- 스프라이트 2D / 3D: 설정 화면과 배틀·리플레이 툴바에서 바꿉니다 (브라우저에 저장, 배틀 중에도 바로 적용). 2D = 4·5세대 도트 스타일(PokéRogue 애니메이션 아틀라스 `pokerogue-assets/images/pokemon/{key}.json·png` — 9세대까지 전부 움직임, `<canvas>` 에 초당 10프레임·도트 그대로. 키는 전국도감 번호 + 폼 키(`479-wash`, `6-mega-x`, `3-gigantamax`, 리전폼 `2038`·`4555-zen`·`8128-aqua`)로 `src/battle/lib/pokerogue.ts` 가 만들고, 있는 키 목록 `pokerogue-keys.json`(에셋 저장소 파일 목록에서 생성)으로 확인해 404 를 내지 않음. 암컷 그림이 있으면 `female/`, 우리 쪽은 `back/`. 두 팀 것을 미리 받아 둠. 실패하면 5세대 블랙·화이트 애니메이션 → 정지 도트 `{id}.png` → 일러스트), 3D = 6세대 이후 3D 모델 스타일(Pokémon Showdown 3D 애니메이션 `other/showdown/{id}.gif`, 앞·뒷모습. 없으면 Pokémon HOME 렌더 `other/home/{id}.png`, 우리 쪽은 좌우 반전·살짝 숨 쉬는 움직임). 지금 두 팀의 3D 애니메이션은 미리 받아 두고, 그림이 없으면 2D 로 내려갑니다.
- 필드 효과: 지금 프레임 상태로 장면에 계속 그립니다 (실시간·리플레이 같음). CSS 로 그리지 않고 Pokémon Showdown 클라이언트의 실제 에셋을 쓰며, 배치·진하기는 원본 `BattleScene` 을 따릅니다. 날씨 = 장면 전체 배경 층(포켓몬 아래, 진하기 0.5 · 원시 날씨·난기류 0.9): 쾌청·비·모래바람·눈(=싸라기눈 그림)은 6세대 게임 날씨 영상 `fx/weather-gen6-*.webm|mp4` 를 반복 재생(한 번에 하나, 날씨가 끝나거나 탭이 숨으면 멈춤·제거, 포스터는 정지 그림), 난기류는 `weather-strongwind.png`. 필드·트릭룸·중력·매직룸·원더룸 = `fx/weather-*terrain.png` / `weather-trickroom.png` 등 (원본처럼 진하게, 아래에서 올라오며 등장). 장판 = 그 진영 발판의 원본 스프라이트 (스텔스록 `rock1/rock2` 4개, 압정뿌리기 `caltrop` 1~3개, 독압정 `poisoncaltrop` 1~2개, 끈적끈적네트 `web`, 원본 `addSideCondition` 의 위치·크기). 리플렉터·빛의장막·오로라베일·신비의부적·흰안개와 방어는 원본도 그림 없이 색 상자(`.sidecondition-*` / `.turnstatus-protect`)라 그 색·진하기(쉴 때 0.3, 방어 0.4)·등장 연출을 그대로 옮겼습니다. 순풍은 원본에 그림이 없어 바람 줄. 움직임 줄이기면 영상 대신 정지 그림, 등장 연출 없음. 남은 턴은 옆 패널에 그대로 나옵니다.
- 능력치 변화: Showdown 은 글자 팝업뿐이라(`battle.ts` `-boost` → `resultAnim`), 게임처럼 [PokéRogue](https://github.com/pagefaultgames/pokerogue-assets) 의 `images/effects/battle_stats.png`(능력치별 32×32 무늬, CC BY-NC-SA 4.0)를 포켓몬 실루엣(mask)에 깔아 상승은 위로·하락은 아래로(무늬 뒤집음) 흘립니다 (한 번 0.8초, ±2 두 번, ±3 세 번, 여러 능력치가 함께 바뀌면 `mix`). 스프라이트 색조는 상승 빨강 / 하락 파랑.
- 기술 연출: Pokémon Showdown 클라이언트의 기술 애니메이션 표를 그대로 옮겨(`src/battle/showdown-anims/`, 원본 파일 헤더대로 `battle-animations.ts` MIT · `battle-animations-moves.ts` CC0-1.0, 같은 폴더 `LICENSE`), 우리 장면 좌표로 바꿔 Web Animations API 로 재생합니다(`scene.ts`, 이 저장소 코드). 원본이 그림 대신 CSS 상자를 쓰는 효과(방어·리플렉터 등 `rawHTML`)는 원본 색 상자로, `scene.$bg.animate`(땅울림·불도저·대지의힘의 배경 흔들기)는 발판·배경 층 흔들기로 옮겼고, 클라이언트 저장소에 없는 `sprites/gen6bgs/bg-*.jpg`(얼음 동굴·흙 동굴 배경)는 같은 그림인 `fx/bg-*.png` 로 바꿔 부릅니다. 처음 기술을 쓸 때 따로 받는 청크(약 51 kB gzip)이고, 기술을 쓰는 프레임은 재생 간격의 1.6배 동안 머물러 데미지가 애니메이션 뒤에 나옵니다. "매우 빠르게"·움직임 줄이기·되감기/건너뛰기에서는 돌리지 않습니다.
- 옆 패널: 필드 줄(남은 턴) · 팀(상대 팀 HP %·상태이상·기절, 관전·리플레이는 두 팀) · 현황 · 턴별 로그. 데스크톱은 배틀 열 높이에 맞추고 로그가 남은 칸을 채워 안에서 스크롤(맨 아래를 보고 있을 때만 따라감), 휴대폰은 접어서 시작하고 펼치면 40vh 고정 높이 → 줄이 늘어도 장면·메뉴·페이지 스크롤이 움직이지 않습니다.
- 리플레이: 결과 화면의 링크(`#/battle/replay?d=…`)에 시드 + 팀(또는 손가락흔들기 옵션) + 모든 행동 + 기권이 들어 있어, 새 브라우저에서도 같은 배틀이 재현됩니다 (인코딩은 그대로라 예전 링크도 열립니다). 옆 패널에서 두 팀을 볼 수 있습니다.
- 콘솔: 배틀·리플레이 화면에서 `window.pokebattleDemo.summary()` / `.text()` 로 지금 현황을 읽을 수 있습니다.
- 코드: `src/battle/lib/` (순수 로직 + vitest 테스트, `npm test` — 루트 저장소의 vitest 를 씀), `src/battle/ui/` (화면, 필드 효과는 `SceneEffects.tsx` + `effects.css`), `src/battle/showdown-anims/` (기술 애니메이션), `src/battle/battle.css`.
- 스크린샷: `docs/screenshots/battle/` — 설정·CPU 팀 미리보기 `setup-cpu-desktop.png` / `setup-cpu-mobile.png`, 세트 편집기 `editor-*.png`, 기술 메뉴 `battle-moves-*.png`, 타입 배지 `types-*.png`(설정·팀 카드, 기술 메뉴, 데이터박스·테라스탈, 세트 편집기 — 1280/390px), 2D 스프라이트(PokéRogue) `sprites-2d-pokerogue.png`, 3D 스프라이트 `sprites-3d-*.png`, 필드 효과 `effects-weather.png` / `effects-terrain.png` / `effects-field.png` / `effects-hazards.png`(겹 수) / `effects-screens.png`(벽·방어) / `effects-stats.png`(능력치 상승·하락) / `effects-mobile.png`(390px), 기술 연출 `move-anims.png`, 관전 `spectate-desktop.png`, 손가락흔들기 `metronome-*.png`, 리플레이 `replay-*.png`.

에셋 (모두 GitHub 의 오픈소스 저장소 파일을 직접 불러옴, 저장소에는 넣지 않음):
[PokeAPI/sprites](https://github.com/PokeAPI/sprites) (5세대 도트 애니메이션, Showdown 3D 애니메이션 배틀 스프라이트, Pokémon HOME 3D 렌더, BW 아이콘, 타입·도구·몬스터볼 아이콘),
[PokeAPI/cries](https://github.com/PokeAPI/cries) (울음소리, 기본 꺼짐),
[smogon/pokemon-showdown-client](https://github.com/smogon/pokemon-showdown-client) (`fx/*.png` 기술 연출 그림, 날씨·필드·장판 그림과 날씨 영상 + 기술 애니메이션 표, 위 라이선스),
[pagefaultgames/pokerogue-assets](https://github.com/pagefaultgames/pokerogue-assets) (2D 애니메이션 배틀 스프라이트 `images/pokemon/`, 능력치 변화 연출 `battle_stats.png`, 기술 분류(물리·특수·변화) 아이콘 `categories.png` — CC BY-NC-SA 4.0: 출처 표시·비영리·동일 조건, 이 데모는 비영리 팬 데모로 원본 그대로 URL 로 불러옴).
비공식 팬 데모이며 Pokémon 과 관련 그림은 © Nintendo / Creatures Inc. / GAME FREAK inc. 의 것입니다.
