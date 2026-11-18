// ─── 빌드용: @pkmn/sim 을 필요한 부분만 번들 ──────────────────
// @pkmn/sim 의 진입점(sim/index)은 쓰지 않는 BattleStreams(direct eval 포함)까지 끌어오고,
// Dex 는 1~8세대 데이터와 모든 세대 기술표를 정적으로 import 해서 앱 번들이 수 MB 가 된다.
// 엔진은 9세대 배틀만 하므로 빌드 때:
//  1. '@pkmn/sim' → 필요한 모듈만 다시 내보내는 shim (battle-stream 제외 → eval 경고 없음)
//  2. 1~8세대·BDSP·Legends 모드 데이터와 기술표 → 빈 모듈
//  3. 9세대 기술표·합법성 → 빈 객체(holder)로 시작, preloadData() 때 별도 청크에서 채운다
// 소스(테스트·tsx)는 그대로 원본 @pkmn/sim 을 쓴다. 결과가 같은지는 scripts/check-dist.ts 가 확인한다.
import type { Plugin } from 'esbuild'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
// exports 에 package.json 이 없어 CJS 진입점(build/cjs/sim/index.js)에서 패키지 루트를 찾는다
const SIM = resolve(dirname(require.resolve('@pkmn/sim', { paths: [process.cwd()] })), '../../esm').replace(/\\/g, '/')

const SHIM = `
export { Battle, extractChannelMessages } from '${SIM}/sim/battle.mjs'
export { Dex, toID, RuleTable } from '${SIM}/sim/dex.mjs'
export { Pokemon } from '${SIM}/sim/pokemon.mjs'
export { Side } from '${SIM}/sim/side.mjs'
export { PRNG } from '${SIM}/sim/prng.mjs'
export { Teams } from '${SIM}/sim/teams.mjs'
export { TeamValidator } from '${SIM}/sim/team-validator.mjs'
export { Tags } from '${SIM}/data/tags.mjs'
export * from '${SIM}/sim/state.mjs'
`

// 9세대 기술표를 채우는 로더 (src/data/lazy.ts 의 자리표시 함수를 대신한다)
const LAZY = `
import { Learnsets } from 'pkbe:learnsets-holder'
let loaded = false
export async function loadLearnsets() {
    if (loaded) return
    const [{ Learnsets: real }, { Legality }] = await Promise.all([import('pkbe:real-learnsets'), import('pkbe:real-legality')])
    // @pkmn/sim dex.mjs 의 merge(learnsets, legality) 와 같은 처리
    const ORDER = 'MTLREVDSC'
    for (const id in real) Learnsets[id] = { ...real[id], learnset: real[id].learnset && { ...real[id].learnset } }
    for (const id in Legality) {
        for (const key in Legality[id]) {
            if (key === 'learnset') {
                for (const moveid in Legality[id][key]) {
                    const special = Legality[id][key][moveid]
                    const existing = Learnsets[id][key]
                    if (existing[moveid]) {
                        existing[moveid] = [...existing[moveid], ...special].sort((a, b) => +b.charAt(0) - +a.charAt(0) ||
                            ORDER.indexOf(a.charAt(1)) - ORDER.indexOf(b.charAt(1)))
                    } else existing[moveid] = special
                }
            } else Learnsets[id][key] = Legality[id][key]
        }
    }
    loaded = true
}
export function learnsetsLoaded() { return loaded }
`

export function slimSim(): Plugin {
    return {
        name: 'pokebattle-engine:slim-sim',
        setup(b) {
            b.onResolve({ filter: /^@pkmn\/sim$/ }, () => ({ path: 'sim', namespace: 'pkbe-shim' }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-shim' }, () => ({ contents: SHIM, loader: 'js', resolveDir: SIM }))

            b.onResolve({ filter: /^pkbe:learnsets-holder$/ }, () => ({ path: 'holder', namespace: 'pkbe-holder' }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-holder' }, () => ({ contents: 'export const Learnsets = {}', loader: 'js' }))
            // 같은 파일이 위에서 빈 모듈로 바뀌므로, 실제 내용은 다른 namespace 로 따로 읽는다
            b.onResolve({ filter: /^pkbe:real-(learnsets|legality)$/ }, a => ({
                path: `${SIM}/data/${a.path.endsWith('learnsets') ? 'learnsets' : 'legality'}.mjs`, namespace: 'pkbe-real',
            }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-real' }, async a => {
                const { readFile } = await import('node:fs/promises')
                return { contents: await readFile(a.path, 'utf8'), loader: 'js', resolveDir: dirname(a.path) }
            })

            b.onLoad({ filter: /[\\/]src[\\/]data[\\/]lazy\.ts$/ }, async a => {
                const { readFile } = await import('node:fs/promises')
                const src = await readFile(a.path, 'utf8')
                // 자리표시 두 함수를 지우고 실제 로더를 붙인다
                const kept = src
                    .replace(/export async function loadLearnsets\(\)[^}]*\}\n?/, '')
                    .replace(/export function learnsetsLoaded\(\)[^}]*\}\n?/, '')
                return { contents: kept + LAZY, loader: 'ts', resolveDir: dirname(a.path) }
            })

            b.onLoad({ filter: /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/].*\.mjs$/ }, a => {
                const f = a.path.replace(/\\/g, '/')
                if (/\/data\/mods\/gen[1-8][a-z]*\/index\.mjs$/.test(f)) return { contents: 'export const Scripts = {}', loader: 'js' }
                if (/\/data\/mods\/gen[1-8][a-z]*\/learnsets\.mjs$/.test(f)) return { contents: 'export const Learnsets = {}', loader: 'js' }
                if (/\/data\/mods\/gen[1-8][a-z]*\/legality\.mjs$/.test(f)) return { contents: 'export const Legality = {}', loader: 'js' }
                if (f.endsWith('/data/learnsets.mjs')) return { contents: "export { Learnsets } from 'pkbe:learnsets-holder'", loader: 'js', resolveDir: SIM }
                if (f.endsWith('/data/legality.mjs')) return { contents: 'export const Legality = {}', loader: 'js' }
                return undefined
            })
        },
    }
}
