# pokebattle-engine 문서 사이트

라이브러리 소개 페이지와 API 문서. [Astryx](https://github.com/meta/astryx) 디자인 시스템(`@astryxdesign/core`)으로 만들었습니다.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ 정적 파일 (해시 라우팅이라 어떤 정적 호스팅에서도 동작)
```

- `src/pages/Landing.tsx` — 소개 페이지 (`#/`)
- `src/pages/docs.tsx` — 문서 페이지 목록과 본문 (`#/docs/<slug>`)
- `src/examples.ts` — 문서의 "실행" 예제. 브라우저에서 실제 엔진(`../src`)을 돌리고 결과를 텍스트 로그로만 출력합니다. `code`(보여줄 소스)와 `run`(실제 실행)을 같이 고쳐야 합니다.
- `src/theme.ts` — Astryx `defineTheme` (다크 단일 배경, 액센트 `#b4d3ff`, Host Grotesk / Instrument Sans + Pretendard)
- 컴포넌트 문서: `npx @astryxdesign/cli component <Name>`
