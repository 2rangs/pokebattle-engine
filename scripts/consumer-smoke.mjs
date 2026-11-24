#!/usr/bin/env node
// ─── 설치 테스트: npm pack 한 패키지를 새 프로젝트에 설치해서 사용자처럼 써 본다 ─────
//   node scripts/consumer-smoke.mjs                 # 빌드된 dist 로 pack → 설치 → 확인
//   node scripts/consumer-smoke.mjs --tarball x.tgz # 이미 만든 tarball 로 (CI: Node 버전별)
//   --no-types                                      # 타입 검사 생략
// 확인: ESM import · CommonJS require · /react · 2~9세대 데이터 · CLI(npx pokebattle) · 타입(nodenext/bundler/node10)
// 의존성 없이 Node 만으로 돈다 (Node 18 이상).
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const args = process.argv.slice(2)
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const run = (cmd, a, cwd) => execFileSync(cmd, a, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim()

const dir = mkdtempSync(join(tmpdir(), 'pokebattle-consumer-'))
let failed = false
const step = (name, fn) => {
  try { const out = fn(); console.log(`✓ ${name}${out ? `: ${out.split('\n').at(-1)}` : ''}`) } catch (err) {
    failed = true
    console.error(`✗ ${name}\n${String(err.stdout ?? '')}${String(err.stderr ?? err.message ?? err)}`)
  }
}

try {
  console.log(`Node ${process.version} · ${dir}`)
  let tarball = opt('--tarball') && resolve(opt('--tarball'))
  if (!tarball) {
    run(npm, ['pack', '--pack-destination', dir], root)
    tarball = join(dir, readdirSync(dir).find(f => f.endsWith('.tgz')))
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  for (const f of ['esm.mjs', 'cjs.cjs', 'types.ts']) cpSync(join(here, 'consumer', f), join(dir, f))
  const types = !args.includes('--no-types')
  step('npm install', () => run(npm, ['install', '--no-audit', '--no-fund', tarball, 'react@19', ...(types ? ['typescript@5', '@types/react@19', '@types/node@22'] : [])], dir))
  step('ESM import', () => run(process.execPath, ['esm.mjs'], dir))
  step('CommonJS require', () => run(process.execPath, ['cjs.cjs'], dir))
  step('CLI (pokebattle sim)', () => {
    const out = run(process.execPath, [join(dir, 'node_modules/@kyasi/pokebattle-engine/dist/cli.js'), 'sim', '--battles', '3', '--seed', '1', '--json'], dir)
    if (JSON.parse(out).battles !== 3) throw new Error(out)
    return out
  })
  if (types) {
    for (const [module, moduleResolution] of [['nodenext', 'nodenext'], ['esnext', 'bundler'], ['commonjs', 'node10']]) {
      step(`types (${moduleResolution})`, () => {
        writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: false, module, moduleResolution, target: 'es2022', lib: ['es2022', 'dom'], types: ['node'] }, files: ['types.ts'] }))
        return run(process.execPath, [join(dir, 'node_modules/typescript/bin/tsc'), '-p', '.'], dir) || 'no errors'
      })
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
