// 배틀 데모의 순수 로직 테스트 (src/battle/lib). vitest 는 루트 저장소의 것을 쓴다 (npm --prefix .. ci).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
