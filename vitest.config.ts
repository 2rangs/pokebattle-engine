import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        // 문서 사이트(playground)의 테스트는 그쪽 설정으로 따로 돈다 (cd playground && npm test)
        exclude: [...configDefaults.exclude, 'playground/**'],
        setupFiles: ['src/tests/setup.ts'],
        // 배틀 수십 판을 도는 속성 테스트가 있어 느린 CI 러너에서 기본 5초를 넘는다
        testTimeout: 30_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
})