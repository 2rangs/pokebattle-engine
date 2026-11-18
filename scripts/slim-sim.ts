// ─── 빌드용: @pkmn/sim 을 필요한 부분만 번들 ──────────────────
// @pkmn/sim 의 진입점(sim/index)은 쓰지 않는 BattleStreams(direct eval 포함)까지 끌어오고,
// Dex 는 1~8세대 데이터와 모든 세대 기술표를 정적으로 import 해서 앱 번들이 수 MB 가 된다.
// 엔진은 9세대 배틀만 하므로 빌드 때:
//  1. '@pkmn/sim' → 필요한 모듈만 다시 내보내는 shim (battle-stream 제외 → eval 경고 없음)
//  2. 1~8세대·BDSP·Legends 모드 데이터와 기술표 → 빈 모듈
//  3. 9세대 기술표·합법성 → 빈 객체(holder)로 시작, preloadData() 때 별도 청크에서 채운다
//  4. 1~8세대 데이터 → 세대별 지연 청크, preloadData({ gens }) 때 채운다
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

// 지연 로더 (src/data/lazy.ts 의 자리표시 함수를 대신한다)
//  - 9세대 기술표·합법성
//  - 1~8세대 데이터: Showdown Dex 는 import 될 때 모든 세대를 한 번 계산(includeModData)하므로, 빈 holder 로
//    시작한 세대는 실제 데이터를 채운 뒤 그 세대와 상위 세대(상속 사슬)를 다시 계산한다
const MOD_GENS = [1, 2, 3, 4, 5, 6, 7, 8]
const MOD_LEARN_GENS = [2, 6, 8]
const LAZY = `
import { Dex } from '@pkmn/sim'
import { Learnsets } from 'pkbe:learnsets-holder'
${MOD_GENS.map(g => `import * as H${g} from 'pkbe:mod-holder/gen${g}'`).join('\n')}
${MOD_LEARN_GENS.map(g => `import { Learnsets as L${g} } from 'pkbe:mod-learn-holder/gen${g}'`).join('\n')}

const ORDER = 'MTLREVDSC'
// @pkmn/sim dex.mjs 의 merge(learnsets, legality) 와 같은 처리 (target 에 채운다)
function mergeInto(target, real, Legality) {
    for (const id in real) target[id] = { ...real[id], learnset: real[id].learnset && { ...real[id].learnset } }
    for (const id in Legality) {
        for (const key in Legality[id]) {
            if (key === 'learnset') {
                for (const moveid in Legality[id][key]) {
                    const special = Legality[id][key][moveid]
                    const existing = target[id][key]
                    if (existing[moveid]) {
                        existing[moveid] = [...existing[moveid], ...special].sort((a, b) => +b.charAt(0) - +a.charAt(0) ||
                            ORDER.indexOf(a.charAt(1)) - ORDER.indexOf(b.charAt(1)))
                    } else existing[moveid] = special
                }
            } else target[id][key] = Legality[id][key]
        }
    }
}

let loaded = false
export async function loadLearnsets() {
    if (loaded) return
    const [{ Learnsets: real }, { Legality }] = await Promise.all([import('pkbe:real-learnsets'), import('pkbe:real-legality')])
    mergeInto(Learnsets, real, Legality)
    loaded = true
}
export function learnsetsLoaded() { return loaded }

const HOLDERS = { ${MOD_GENS.map(g => `${g}: H${g}`).join(', ')} }
const LEARN = { ${MOD_LEARN_GENS.map(g => `${g}: L${g}`).join(', ')} }
const REAL = { ${MOD_GENS.map(g => `${g}: () => import('pkbe:real-mod/gen${g}')`).join(', ')} }
const REAL_LEARN = { ${MOD_LEARN_GENS.map(g => `${g}: () => Promise.all([import('pkbe:real-mod-learnsets/gen${g}'), import('pkbe:real-mod-legality/gen${g}')])`).join(', ')} }
const loadedGens = new Set()
let pending = Promise.resolve()

function reset(dex) {
    dex.dataCache = null
    for (const k of ['abilities', 'items', 'moves', 'species', 'learnsets', 'conditions', 'natures', 'types']) dex[k] = new dex[k].constructor(dex)
    dex.loadData()
}

export function loadGen(gen) {
    if (gen === 9 || loadedGens.has(gen)) return Promise.resolve()
    if (!HOLDERS[gen]) return Promise.reject(new Error('세대는 1~9 입니다: ' + gen))
    pending = pending.then(async () => {
        // 상속 사슬: gen1 <- gen2 <- ... <- gen8 <- gen9. 부모부터 채우고 다시 계산
        const chain = []
        for (let g = 8; g >= gen; g--) if (!loadedGens.has(g)) chain.push(g)
        const mods = await Promise.all(chain.map(g => REAL[g]()))
        const learns = await Promise.all(chain.map(g => (REAL_LEARN[g] ? REAL_LEARN[g]() : null)))
        chain.forEach((g, i) => {
            const holder = HOLDERS[g], real = mods[i]
            for (const k of Object.keys(holder)) {
                const h = holder[k]
                for (const x of Object.keys(h)) delete h[x]
                Object.assign(h, real[k])
            }
            if (learns[i]) {
                const target = LEARN[g]
                for (const x of Object.keys(target)) delete target[x]
                mergeInto(target, learns[i][0].Learnsets, learns[i][1].Legality)
            }
        })
        for (const g of chain) { reset(Dex.mod('gen' + g)); loadedGens.add(g) }
    })
    return pending
}
export function genLoaded(gen) { return gen === 9 || loadedGens.has(gen) }
`

export function slimSim(): Plugin {
    return {
        name: 'pokebattle-engine:slim-sim',
        setup(b) {
            b.onResolve({ filter: /^@pkmn\/sim$/ }, () => ({ path: 'sim', namespace: 'pkbe-shim' }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-shim' }, () => ({ contents: SHIM, loader: 'js', resolveDir: SIM }))

            b.onResolve({ filter: /^pkbe:learnsets-holder$/ }, () => ({ path: 'holder', namespace: 'pkbe-holder' }))
            b.onLoad({ filter: /^holder$/, namespace: 'pkbe-holder' }, () => ({ contents: 'export const Learnsets = {}', loader: 'js' }))
            // 1~8세대 모드: 실제 index 의 export 이름 그대로 빈 객체를 내보내는 holder
            b.onResolve({ filter: /^pkbe:mod-holder\/gen\d$/ }, a => ({ path: a.path.split('/')[1]!, namespace: 'pkbe-mod-holder' }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-mod-holder' }, async a => {
                const { readFile } = await import('node:fs/promises')
                const src = await readFile(`${SIM}/data/mods/${a.path}/index.mjs`, 'utf8')
                const names = [...src.matchAll(/export \{ (\w+) \}/g)].map(m => m[1]!)
                return { contents: names.map(n => `export const ${n} = {}`).join('\n'), loader: 'js' }
            })
            b.onResolve({ filter: /^pkbe:mod-learn-holder\/gen\d$/ }, a => ({ path: a.path.split('/')[1]!, namespace: 'pkbe-mod-learn-holder' }))
            b.onLoad({ filter: /.*/, namespace: 'pkbe-mod-learn-holder' }, () => ({ contents: 'export const Learnsets = {}', loader: 'js' }))
            // 같은 파일이 아래에서 빈 모듈로 바뀌므로, 실제 내용은 다른 namespace 로 따로 읽는다
            b.onResolve({ filter: /^pkbe:real-(learnsets|legality)$/ }, a => ({
                path: `${SIM}/data/${a.path.endsWith('learnsets') ? 'learnsets' : 'legality'}.mjs`, namespace: 'pkbe-real',
            }))
            b.onResolve({ filter: /^pkbe:real-mod\/gen\d$/ }, a => ({ path: `${SIM}/data/mods/${a.path.split('/')[1]}/index.mjs`, namespace: 'pkbe-real' }))
            b.onResolve({ filter: /^pkbe:real-mod-(learnsets|legality)\/gen\d$/ }, a => {
                const [kind, gen] = [a.path.includes('learnsets') ? 'learnsets' : 'legality', a.path.split('/')[1]]
                return { path: `${SIM}/data/mods/${gen}/${kind}.mjs`, namespace: 'pkbe-real' }
            })
            b.onLoad({ filter: /.*/, namespace: 'pkbe-real' }, async a => {
                const { readFile } = await import('node:fs/promises')
                return { contents: await readFile(a.path, 'utf8'), loader: 'js', resolveDir: dirname(a.path) }
            })

            b.onLoad({ filter: /[\\/]src[\\/]data[\\/]lazy\.ts$/ }, async a => {
                const { readFile } = await import('node:fs/promises')
                const src = await readFile(a.path, 'utf8')
                // 자리표시 함수들을 지우고 실제 로더를 붙인다
                const kept = src
                    .replace(/export async function loadLearnsets\(\)[^}]*\}\n?/, '')
                    .replace(/export function learnsetsLoaded\(\)[^}]*\}\n?/, '')
                    .replace(/export async function loadGen\([^)]*\)[^}]*\}\n?/, '')
                    .replace(/export function genLoaded\([^)]*\)[^}]*\}\n?/, '')
                return { contents: kept + LAZY, loader: 'ts', resolveDir: dirname(a.path) }
            })

            b.onLoad({ filter: /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/]data[\\/].*\.mjs$/ }, a => {
                const f = a.path.replace(/\\/g, '/')
                // 1~8세대: holder (loadGen 이 채운다). BDSP·Legends 는 지원하지 않아 빈 모듈
                const mod = f.match(/\/data\/mods\/(gen[1-8])\/index\.mjs$/)
                if (mod) return { contents: `export * from 'pkbe:mod-holder/${mod[1]}'`, loader: 'js', resolveDir: SIM }
                const modLearn = f.match(/\/data\/mods\/(gen[268])\/learnsets\.mjs$/)
                if (modLearn) return { contents: `export { Learnsets } from 'pkbe:mod-learn-holder/${modLearn[1]}'`, loader: 'js', resolveDir: SIM }
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
