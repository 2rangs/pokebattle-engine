import { defineConfig } from 'tsup'

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
