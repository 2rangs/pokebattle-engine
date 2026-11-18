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
- `src/demo/` — 배틀 데모 (`#/demo`, 리플레이 `#/demo/replay?d=…`). 문서 사이트가 지연 로드합니다. Pokestra 배틀 시뮬레이터(브랜치 `claude/battle-sim-upgrade`)의 배틀 화면·로그·리플레이를 옮기고, 도감 데이터 대신 엔진 이름표(`createFormatter().name`, `loadNames('ja')`)를 씁니다. 팀 빌더는 빼고 시드 랜덤 팀 또는 Showdown 텍스트를 씁니다.
  - `names.ts` 이름·로그, `frames.ts` 엔진 이벤트 → 화면 프레임(실시간·리플레이 공용), `replay.ts` 리플레이 직렬화(시드·팀·행동 → deflate-raw → base64url), `hud/` 배틀 화면 조각
  - 스타일은 Tailwind 유틸리티(`demo.css`, preflight 없음)와 Astryx 토큰 브리지(`@astryxdesign/core/tailwind-theme.css`). 이 청크에만 들어갑니다.
  - 스프라이트·울음소리는 PokeAPI 저장소(Showdown 애니메이션 도트 미러)에서 받고, 타입 아이콘(`public/assets/types`)은 Pokestra에서 가져왔습니다.
  - `npm test` — 리플레이 왕복, 프레임 캡처·재현, HUD 라벨 테스트 (vitest)
- `src/theme.ts` — Astryx `defineTheme` (다크 단일 배경, 액센트 `#b4d3ff`, Host Grotesk / Instrument Sans + Pretendard)
- 컴포넌트 문서: `npx @astryxdesign/cli component <Name>`
