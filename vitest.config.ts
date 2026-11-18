import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.test.ts'],
        setupFiles: ['src/tests/setup.ts'],
        // 배틀 수십 판을 도는 속성 테스트가 있어 느린 CI 러너에서 기본 5초를 넘는다
        testTimeout: 30_000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
})