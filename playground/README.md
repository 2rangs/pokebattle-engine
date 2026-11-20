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

엔진 번들을 브라우저에서 그대로 돌리는 싱글 배틀 데모입니다 (Pokestra 배틀 시뮬레이터에서 옮겨 와 게임 화면처럼 다듬음).

- 규칙: **일반 배틀** (팀 빌더 · 랜덤 팀 · Showdown 가져오기/내보내기, CPU 난이도 3단계) / **손가락흔들기** (`createMetronomeBattle`: 랜덤 또는 직접 고른 종, 레벨, 능력치 덮어쓰기 1~9999)
- 모드: CPU와 대전 / CPU 관전, 마릿수 1·3·6 (자리도 정확히 그 수만큼)
- 화면: 5세대 BW·9세대 SV 배치를 본뜬 장면(상대 데이터박스 왼쪽 위·HP 숫자 없음, 우리 데이터박스 오른쪽 아래), 파티 볼, 상태이상 배지, 메시지 상자(한 번에 한 문장), 커맨드(싸운다/포켓몬/도망친다=기권), 타입 색 기술 버튼(PP, 상성, 예상 데미지, 확정 n타), 테라스탈 버튼. 옆 패널에 필드 효과(남은 턴)·현황·턴별 로그.
- 리플레이: 결과 화면의 링크(`#/battle/replay?d=…`)에 시드 + 팀(또는 손가락흔들기 옵션) + 모든 행동 + 기권이 들어 있어, 새 브라우저에서도 같은 배틀이 재현됩니다.
- 콘솔: 배틀·리플레이 화면에서 `window.pokebattleDemo.summary()` / `.text()` 로 지금 현황을 읽을 수 있습니다.
- 코드: `src/battle/lib/` (순수 로직 + vitest 테스트, `npm test` — 루트 저장소의 vitest 를 씀), `src/battle/ui/` (화면), `src/battle/battle.css`.
- 스크린샷: `docs/screenshots/battle/`

에셋 (모두 GitHub 의 오픈소스 저장소 파일을 직접 불러옴, 저장소에는 넣지 않음):
[PokeAPI/sprites](https://github.com/PokeAPI/sprites) (Showdown 애니메이션 배틀 스프라이트, BW 아이콘, 타입·도구·몬스터볼 아이콘),
[PokeAPI/cries](https://github.com/PokeAPI/cries) (울음소리, 기본 꺼짐),
[smogon/pokemon-showdown-client](https://github.com/smogon/pokemon-showdown-client) (`fx/bg-*.png` 배경 — 시드로 고름, `fx/*.png` 기술 연출).
비공식 팬 데모이며 Pokémon 과 관련 그림은 © Nintendo / Creatures Inc. / GAME FREAK inc. 의 것입니다.
