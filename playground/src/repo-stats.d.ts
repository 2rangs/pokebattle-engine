/** 빌드할 때 저장소에서 읽은 수치 (vite.config.ts 의 repoStats) */
declare const __REPO_STATS__: {
  tests: number
  source: 'vitest list' | 'static count'
  testFiles: number
  snapshots: number
  fuzzInvariants: number
  fuzzInvariantLines: [number, number] | null
  commit: string
}
