import { defineConfig } from 'tsup'
import { slimSim } from './scripts/slim-sim'

export default defineConfig([
    {
        // 엔진 본체. ESM 은 코드 분할 → 데이터 JSON 이 별도 청크로 지연 로드된다
        entry: { index: 'src/index.ts' },
        format: ['esm', 'cjs'],
        tsconfig: './tsconfig.build.json',
        dts: true,
        sourcemap: true,
        clean: true,
        splitting: true,
        // @pkmn/sim·@pkmn/randoms 는 필요한 부분만 번들 (scripts/slim-sim.ts). @smogon/calc 는 그대로 의존성
        noExternal: ['@pkmn/sim', '@pkmn/randoms'],
        esbuildPlugins: [slimSim()],
    },
    {
        // React 훅. 엔진은 패키지 이름으로 참조 (중복 번들 방지)
        entry: { 'react/index': 'src/react/index.ts' },
        format: ['esm', 'cjs'],
        tsconfig: './tsconfig.build.json',
        external: ['react', '@kyasi/pokebattle-engine'],
        dts: true,
        sourcemap: true,
        splitting: false,
    },
])
