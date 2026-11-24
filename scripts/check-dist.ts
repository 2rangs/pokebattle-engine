// ─── 번들(dist)이 원본 @pkmn/sim 과 같은 배틀을 하는지 확인 ─────
// npm run build && npx tsx scripts/check-dist.ts [--battles 300]
// dist 는 @pkmn/sim 을 필요한 부분만 번들한다 (scripts/slim-sim.ts). 그 엔진으로 배틀을 돌리고,
// 같은 입력을 node_modules 의 원본 @pkmn/sim 에 재생해서 프로토콜 로그가 바이트 단위로 같은지 본다.
// 기술표를 쓰는 기능(generateRandomSet / generateChaosTeam)도 원본과 같은 결과인지 본다.
import { Battle, Dex } from '@pkmn/sim'
import { randomDoublesChoice } from '../src/utils/random-choice.ts'

const dist = await import('../dist/index.js')

// 브라우저에는 Node 전역 global 이 없다 (globalThis 로 바뀌어 있어야 한다)
{
    const { readdirSync, readFileSync } = await import('node:fs')
    const offenders = readdirSync('dist').filter(f => /\.(c?js)$/.test(f) && f !== 'cli.js')
        .filter(f => /(^|[^.\w$])global\.\w/.test(readFileSync(`dist/${f}`, 'utf8')))
    if (offenders.length) { console.error(`Node-only 'global.' in browser bundle: ${offenders.join(', ')}`); process.exit(1) }
}
const i = process.argv.indexOf('--battles')
const N = i >= 0 ? Number(process.argv[i + 1]) : 300

if (dist.isDataLoaded()) throw new Error('isDataLoaded() should be false before preloadData()')
let threw = false
try { dist.generateRandomTeam({ seed: 1 }) } catch { threw = true }
if (!threw) throw new Error('generateRandomTeam should ask for preloadData() first')
threw = false
try { dist.getLearnset('garchomp') } catch (e) { threw = /preloadData/.test((e as Error).message) }
if (!threw) throw new Error('getLearnset should ask for preloadData() first')
await dist.preloadData()
if (!dist.isDataLoaded()) throw new Error('isDataLoaded() should be true after preloadData()')

// 기술표: 번들의 지연 로드 결과로 만든 세트 == 소스(원본 @pkmn/sim 기술표)로 만든 세트
const src = await import('../src/index.ts')
await src.preloadData()
let learnMismatch = 0
const species = Dex.species.all().filter(s => s.num > 0 && !s.isNonstandard && !s.battleOnly).map(s => s.id)
for (const id of species) {
    const a = JSON.stringify(dist.generateRandomSet(id, { rng: new dist.PRNG(1) }))
    const b = JSON.stringify(src.generateRandomSet(id, { rng: new src.PRNG(1) }))
    if (a !== b && ++learnMismatch <= 3) console.error(`LEARNSET MISMATCH ${id}\n  dist ${a}\n  src  ${b}`)
}
console.log(`generateRandomSet: ${species.length} species, ${learnMismatch} mismatches`)
// getLearnset (팀 편집기 기술 목록): 번들 == 소스
for (const id of species) {
    const a = JSON.stringify(dist.getLearnset(id)), b = JSON.stringify(src.getLearnset(id))
    if (a !== b && ++learnMismatch <= 6) console.error(`getLearnset MISMATCH ${id}`)
}
console.log(`getLearnset: ${species.length} species compared`)

const comparable = (log: readonly string[]) => log.filter(l => !l.startsWith('|t:|')).join('\n')
let mismatches = 0, turns = 0
for (let n = 0; n < N; n++) {
    const rng = new dist.PRNG(n * 7919 + 13)
    const format = (['singles', 'doubles', 'triples'] as const)[n % 3]
    const multi = format !== 'singles'
    const team = () => (n % 2 ? dist.generateChaosTeam({ rng, size: 6 }) : dist.generateRandomTeam({ seed: rng.int(0x7fffffff), format: multi ? 'gen9randomdoublesbattle' : 'gen9randombattle' }))
    const engine = new dist.BattleEngine({ format, seed: n, maxTurns: 200, p1: { name: 'A', team: team() }, p2: { name: 'B', team: team() } }, { turnSnapshots: false })
    const inputs: string[] = []
    const b = engine.battle
    const choose = b.choose.bind(b), tie = b.tie.bind(b)
    b.choose = (s: Parameters<typeof choose>[0], c: string) => { const ok = choose(s, c); if (ok) inputs.push(`>${s} ${c}`); return ok }
    b.tie = () => { inputs.push('>forcetie'); return tie() }
    engine.start()
    const header = engine.battle.inputLog.filter((l: string) => !/^>p[12] /.test(l))
    let g = 0
    while (!engine.battle.ended && g++ < 5000) {
        for (const p of ['p1', 'p2'] as const) {
            if (engine.battle.ended) break
            if (multi) {
                const req = engine.getRawRequest(p) as { wait?: boolean } | null
                if (!req || req.wait || engine.battle[p].isChoiceDone()) continue
                try { engine.submitChoice(p, randomDoublesChoice(req, rng)) } catch { engine.submitChoice(p, 'default') }
            } else if (engine.getRequest(p)) engine.submitAction(rng.pick(engine.getAvailableActions(p)))
        }
    }
    turns += engine.battle.turn
    // 원본 @pkmn/sim 으로 재생
    let orig: Battle | null = null
    for (const line of [...header, ...inputs]) {
        const [cmd, ...rest] = line.slice(1).split(' ')
        const arg = rest.join(' ')
        if (cmd === 'start') orig = new Battle(JSON.parse(arg))
        else if (cmd === 'player') { const sp = arg.indexOf(' '); orig!.setPlayer(arg.slice(0, sp) as never, JSON.parse(arg.slice(sp + 1))) }
        else if (cmd === 'p1' || cmd === 'p2') orig!.choose(cmd, arg)
        else if (cmd === 'forcetie') orig!.tie()
    }
    if (comparable(orig!.log) !== comparable(engine.battle.log)) {
        mismatches++
        if (mismatches <= 3) console.error(`MISMATCH battle ${n} (${format})`)
    }
}
console.log(`${N} battles (${turns} turns): ${mismatches} protocol log mismatches vs original @pkmn/sim; learnset sets ${learnMismatch ? 'FAILED' : 'identical'}`)

// ─── 1~8세대: 세대 데이터 지연 로드 → 랜덤배틀 (메가·Z·다이맥스 포함) == 원본 ───
let genFail = 0
let guarded = false
try { new dist.BattleEngine({ format: 'singles', gen: 7, p1: { name: 'a', team: [] }, p2: { name: 'b', team: [] } }) } catch (e) { guarded = /preloadData/.test((e as Error).message) }
if (!guarded) { genFail++; console.error('gen 7 battle before preloadData({ gens: [7] }) should ask for it') }
await dist.preloadData({ gens: [1, 2, 3, 4, 5, 6, 7, 8] })
await src.preloadData({ gens: [7] })
for (const id of ['garchomp', 'charizard', 'rotomwash', 'ninetalesalola', 'pikachu']) {
    if (JSON.stringify(dist.getLearnset(id, { gen: 7 })) !== JSON.stringify(src.getLearnset(id, { gen: 7 }))) { genFail++; console.error(`gen7 getLearnset MISMATCH ${id}`) }
}
if (JSON.stringify(dist.listItems({ gen: 7 })) !== JSON.stringify(src.listItems({ gen: 7 }))) { genFail++; console.error('gen7 listItems MISMATCH') }
const PER_GEN = Math.max(10, Math.round(N / 6))
for (let gen = 1; gen <= 8; gen++) {
    let bad = 0, gTurns = 0, gimmicks = 0
    for (let n = 0; n < PER_GEN; n++) {
        const engine = dist.createRandomBattle({ gen: gen as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, seed: n * 31 + gen, engine: { turnSnapshots: false } })
        const rng = new dist.PRNG(n)
        const inputs: string[] = []
        const b = engine.battle
        const choose = b.choose.bind(b), tie = b.tie.bind(b)
        b.choose = (sd: Parameters<typeof choose>[0], c: string) => { const ok = choose(sd, c); if (ok) inputs.push(`>${sd} ${c}`); return ok }
        b.tie = () => { inputs.push('>forcetie'); return tie() }
        engine.start()
        const header = engine.battle.inputLog.filter((l: string) => !/^>p[12] /.test(l))
        for (let g = 0; !engine.battle.ended && g < 3000; g++) {
            for (const p of ['p1', 'p2'] as const) {
                if (engine.battle.ended || !engine.getRequest(p)) continue
                const a = rng.pick(engine.getAvailableActions(p))
                const g = a as { mega?: boolean; zmove?: boolean; dynamax?: boolean; ultra_burst?: boolean }
                if (g.mega || g.zmove || g.dynamax || g.ultra_burst) gimmicks++
                engine.submitAction(a)
            }
        }
        gTurns += engine.battle.turn
        if ([...engine.unhandledProtocol.keys()].length) { bad++; console.error(`gen${gen} battle ${n}: unhandled ${[...engine.unhandledProtocol.keys()]}`) }
        let orig: Battle | null = null
        for (const line of [...header, ...inputs]) {
            const [cmd, ...rest] = line.slice(1).split(' ')
            const arg = rest.join(' ')
            if (cmd === 'start') orig = new Battle(JSON.parse(arg))
            else if (cmd === 'player') { const sp = arg.indexOf(' '); orig!.setPlayer(arg.slice(0, sp) as never, JSON.parse(arg.slice(sp + 1))) }
            else if (cmd === 'p1' || cmd === 'p2') orig!.choose(cmd, arg)
            else if (cmd === 'forcetie') orig!.tie()
        }
        if (comparable(orig!.log) !== comparable(engine.battle.log)) { bad++; if (bad <= 2) console.error(`MISMATCH gen${gen} battle ${n}`) }
    }
    genFail += bad
    console.log(`gen${gen}: ${PER_GEN} random battles (${gTurns} turns, ${gimmicks} mega/Z/dynamax choices): ${bad} problems`)
}
if (mismatches || learnMismatch || genFail) process.exit(1)
