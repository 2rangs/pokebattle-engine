import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execFileSync } from 'child_process'
import { readFileSync, readdirSync } from 'fs'

const repo = path.resolve(__dirname, '..')

/**
 * 랜딩의 "테스트 n개" 같은 수치를 손으로 적지 않고 빌드할 때 저장소에서 읽는다.
 * 테스트 수는 vitest 가 직접 모은 목록(vitest list), 안 되면 소스에서 it()/test() 를 센 값.
 */
function repoStats(useVitest: boolean) {
  let tests = 0, files: Record<string, number> = {}, source: 'vitest list' | 'static count' = 'vitest list'
  try {
    if (!useVitest) throw new Error('dev')
    const out = execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--json'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 })
    const list = JSON.parse(out.slice(out.indexOf('['))) as { file: string }[]
    tests = list.length
    for (const t of list) { const f = path.relative(repo, t.file); files[f] = (files[f] ?? 0) + 1 }
  } catch {
    source = 'static count'
    files = {}
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.test.ts') ? [path.join(dir, d.name)] : [])
    for (const f of walk(path.join(repo, 'src/tests'))) {
      const n = (readFileSync(f, 'utf8').match(/^\s*(it|test)\(/gm) ?? []).length
      files[path.relative(repo, f)] = n
      tests += n
    }
  }
  const snap = readFileSync(path.join(repo, 'src/tests/engine/__snapshots__/regression.test.ts.snap'), 'utf8')
  const fuzz = readFileSync(path.join(repo, 'scripts/fuzz.ts'), 'utf8')
  // 퍼징 머리말의 "//  1. …" 줄 = 검사하는 불변식
  const invariantLines = fuzz.split('\n').map((l, i) => ({ l, i: i + 1 })).filter(x => /^\/\/\s+\d+\.\s/.test(x.l))
  let commit = ''
  try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim() } catch { /* git 없음 */ }
  return {
    tests, source, testFiles: Object.keys(files).length,
    snapshots: (snap.match(/^exports\[/gm) ?? []).length,
    fuzzInvariants: invariantLines.length,
    fuzzInvariantLines: invariantLines.length ? [invariantLines[0]!.i, invariantLines.at(-1)!.i] as [number, number] : null,
    commit,
  }
}

/**
 * 저장한 리플레이 HTML 에 넣을 오프라인 재생기: src/battle/replay-html/player/main.ts 를
 * 의존성까지 한 덩어리 IIFE 로 묶어 문자열로 내보낸다 (import code from 'virtual:offline-player').
 */
function offlinePlayer(): Plugin {
  const id = 'virtual:offline-player'
  const resolved = '\0' + id
  const entry = path.resolve(__dirname, 'src/battle/replay-html/player/main.ts')
  return {
    name: 'offline-player',
    resolveId: s => (s === id ? resolved : undefined),
    async load(s) {
      if (s !== resolved) return
      const { rolldown } = await import('rolldown')
      const bundle = await rolldown({ input: entry, platform: 'browser', logLevel: 'silent' })
      try {
        const { output } = await bundle.generate({ format: 'iife', minify: true })
        // HTML 안 <script> 가 끊기지 않게
        const code = output[0].code.replace(/<\/(script)/gi, '<\\/$1')
        return `export default ${JSON.stringify(code)}`
      } finally {
        await bundle.close()
      }
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), offlinePlayer()],
  define: {
    // 개발 서버에서는 빠르게 (소스에서 센 값), 빌드에서는 vitest 목록
    __REPO_STATS__: JSON.stringify(repoStats(command === 'build')),
  },
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@pokebattle': path.resolve(__dirname, '../src'),
    },
  },
}))
