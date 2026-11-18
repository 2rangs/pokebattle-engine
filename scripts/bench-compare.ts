// ─── Showdown 직접 vs 엔진 비교 벤치마크 + 결과 동일성 검사 ───
// npm run bench:compare -- [--battles 200] [--rounds 5] [--formats singles,doubles,triples]
//
// 1. 엔진(빠른 경로 끔)으로 무작위 배틀을 만들고 Showdown inputLog·프로토콜 로그를 기록한다.
// 2. 같은 입력을 네 가지 방식으로 재생하며 시간을 잰다. 모두 같은 배틀(같은 시드·팀·선택)이다.
//      showdown         @pkmn/sim Battle 에 inputLog 를 그대로 재생 (Showdown 원본)
//      showdown + fast  같은 재생, 빠른 경로 패치 켬
//      engine (fast)    BattleEngine 으로 재생 (이벤트 변환·한국어 이름 포함, 기본 설정)
//      engine (no fast) BattleEngine, 빠른 경로 끔 (래퍼 비용 확인용)
// 3. 모든 재생의 프로토콜 로그가 기록과 바이트 단위로 같은지 확인한다. 하나라도 다르면 종료 코드 1.
import { BattleEngine, generateRandomTeam, PRNG, preloadData, replayInputLog, comparableLog } from '../src/index'
import type { BattleConfig, BattleFormat } from '../src/index'
import { randomDoublesChoice } from './shared/random-choice'

const arg = (name: string, def: string) => {
    const i = process.argv.indexOf(`--${name}`)
    return i >= 0 ? process.argv[i + 1]! : def
}
const N = Number(arg('battles', '200'))
const ROUNDS = Number(arg('rounds', '5'))
const FORMATS = arg('formats', 'singles,doubles,triples').split(',') as BattleFormat[]

interface Recorded { config: BattleConfig; inputLog: string[]; log: string; turns: number }

function record(format: BattleFormat, i: number): Recorded {
    const rng = new PRNG(i * 7919 + 13)
    const multi = format === 'doubles' || format === 'triples'
    const teamFormat = multi ? 'gen9randomdoublesbattle' : 'gen9randombattle'
    const config: BattleConfig = {
        format, seed: i, maxTurns: 300,
        p1: { name: 'P1', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: teamFormat }) },
        p2: { name: 'P2', team: generateRandomTeam({ seed: rng.int(0x7fffffff), format: teamFormat }) },
    }
    const engine = new BattleEngine(config, { fast: false, turnSnapshots: false })
    // Showdown inputLog 는 정규화된 선택을 남기는데, triples 의 'default' 는 대상 없이 기록돼 재생이 안 된다.
    // 그래서 실제로 choose() 에 들어간 입력을 그대로 기록한다 (>start/>player 는 inputLog 에서).
    const inputs: string[] = []
    const b = engine.battle as unknown as { choose: (s: string, c: string) => boolean; tie: () => void }
    const choose = b.choose.bind(b), tie = b.tie.bind(b)
    b.choose = (side, choice) => { const ok = choose(side, choice); if (ok) inputs.push(`>${side} ${choice}`); return ok }
    b.tie = () => { inputs.push('>forcetie'); tie() }
    engine.start()
    const header = engine.battle.inputLog.filter(l => !/^>p[12] /.test(l))
    let guard = 0
    while (!engine.battle.ended && guard++ < 5000) {
        for (const player of ['p1', 'p2'] as const) {
            if (engine.battle.ended) break
            if (multi) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const req = engine.getRawRequest(player) as any
                if (!req || req.wait || engine.battle[player].isChoiceDone()) continue
                try { engine.submitChoice(player, randomDoublesChoice(req, rng)) } catch { engine.submitChoice(player, 'default') }
            } else {
                if (!engine.getRequest(player)) continue
                engine.submitAction(rng.pick(engine.getAvailableActions(player)))
            }
        }
    }
    return { config, inputLog: [...header, ...inputs], log: comparableLog(engine.battle), turns: engine.battle.turn }
}

type Variant = { name: string; run: (r: Recorded) => string }

function engineReplay(fast: boolean) {
    return (r: Recorded): string => {
        const engine = new BattleEngine(r.config, { fast, turnSnapshots: false })
        engine.start()
        for (const line of r.inputLog) {
            if (line.startsWith('>p1 ') || line.startsWith('>p2 ')) engine.submitChoice(line.slice(1, 3) as 'p1' | 'p2', line.slice(4))
        }
        return comparableLog(engine.battle)
    }
}

const VARIANTS: Variant[] = [
    { name: 'showdown', run: r => comparableLog(replayInputLog(r.inputLog)) },
    { name: 'showdown + fast', run: r => comparableLog(replayInputLog(r.inputLog, { fast: true })) },
    { name: 'engine (fast)', run: engineReplay(true) },
    { name: 'engine (no fast)', run: engineReplay(false) },
]

async function main(): Promise<void> {
    await preloadData()
    let mismatches = 0
    console.log(`Node ${process.version} · ${N} battles per format · best of ${ROUNDS} rounds\n`)
    for (const format of FORMATS) {
        const battles = Array.from({ length: N }, (_, i) => record(format, i))
        const turns = battles.reduce((s, b) => s + b.turns, 0)
        const best = new Map<string, number>()
        for (let round = 0; round <= ROUNDS; round++) {               // round 0 = 워밍업
            // 순서 편향을 줄이려고 라운드마다 순서를 돌린다
            const order = VARIANTS.map((_, k) => VARIANTS[(k + round) % VARIANTS.length]!)
            for (const v of order) {
                const t = performance.now()
                for (const b of battles) {
                    const log = v.run(b)
                    if (round === 0 && log !== b.log) {
                        mismatches++
                        if (mismatches <= 5) console.error(`MISMATCH ${format} seed=${b.config.seed} variant=${v.name}`)
                    }
                }
                const ms = performance.now() - t
                if (round > 0) best.set(v.name, Math.min(best.get(v.name) ?? Infinity, ms))
            }
        }
        const base = best.get('showdown')!
        console.log(`${format}: ${N} battles, ${turns} turns`)
        console.log('  variant            ms/turn   vs showdown')
        for (const v of VARIANTS) {
            const ms = best.get(v.name)!
            console.log(`  ${v.name.padEnd(17)}  ${(ms / turns).toFixed(3).padStart(7)}   ${(base / ms).toFixed(2)}x`)
        }
        console.log()
    }
    if (mismatches) {
        console.error(`${mismatches} protocol log mismatches`)
        process.exit(1)
    }
    console.log('all replays produced identical protocol logs')
}

main()
