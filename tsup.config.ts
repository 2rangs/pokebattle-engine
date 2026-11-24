import { defineConfig } from 'tsup'
import { slimSim } from './scripts/slim-sim'

export default defineConfig([
    {
        // 엔진 본체. ESM 은 코드 분할 → 데이터 JSON 이 별도 청크로 지연 로드된다
        entry: { index: 'src/index.ts' },
        format: ['esm', 'cjs'],
        tsconfig: './tsconfig.build.json',
        dts: true,
        // 소스맵은 패키지에 넣지 않는다 (24MB). dist 정리는 build 스크립트가 한 번만 (세 빌드가 병렬이라 clean 이 다른 빌드 결과를 지울 수 있다)
        sourcemap: false,
        splitting: true,
        // @pkmn/sim·@pkmn/randoms 는 필요한 부분만 번들 (scripts/slim-sim.ts). @smogon/calc 는 그대로 의존성
        noExternal: ['@pkmn/sim', '@pkmn/randoms'],
        esbuildPlugins: [slimSim()],
        // Showdown 코드의 Node 전역(global.Config — 랜덤배틀의 PotD 규칙)이 브라우저에서도 동작하게
        esbuildOptions(o) { o.define = { ...o.define, global: 'globalThis' } },
    },
    {
        // CLI (npx pokebattle) — Node 전용. 엔진은 패키지 이름으로 참조해 dist/index.js 를 같이 쓴다 (엔진을 두 번 싣지 않는다)
        entry: { cli: 'src/cli/index.ts' },
        format: ['esm'],
        platform: 'node',
        tsconfig: './tsconfig.build.json',
        banner: { js: '#!/usr/bin/env node' },
        sourcemap: false,
        minify: true,
        splitting: false,
        external: ['@kyasi/pokebattle-engine'],
    },
    {
        // React 훅. 엔진은 패키지 이름으로 참조 (중복 번들 방지)
        entry: { 'react/index': 'src/react/index.ts' },
        format: ['esm', 'cjs'],
        tsconfig: './tsconfig.build.json',
        external: ['react', '@kyasi/pokebattle-engine'],
        dts: true,
        sourcemap: false,
        splitting: false,
    },
])
