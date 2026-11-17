// ─── AI 대전 벤치마크 / 안정성 점검 ──────────────────────────
// npm run bench -- 500
import { preloadData, simulateBattle, generateRandomTeam, PRNG, HeuristicAI, RandomAI } from '../src/index'

async function main(): Promise<void> {
    await preloadData()
    const n = Number(process.argv[2] ?? 200)
    const result = { heuristic: 0, random: 0, draw: 0 }
    let turns = 0
    const start = Date.now()
    for (let i = 0; i < n; i++) {
        const rng = new PRNG(i)
        const heuristicFirst = i % 2 === 0
        const r = simulateBattle({
            format: 'singles', seed: i,
            p1: { name: 'p1', team: generateRandomTeam({ seed: rng.int(0x7fffffff) }) },
            p2: { name: 'p2', team: generateRandomTeam({ seed: rng.int(0x7fffffff) }) },
        }, {
            p1: heuristicFirst ? new HeuristicAI({ seed: i }) : new RandomAI(i),
            p2: heuristicFirst ? new RandomAI(i) : new HeuristicAI({ seed: i }),
        })
        turns += r.turns
        if (r.winner === 'draw') result.draw++
        else if ((r.winner === 'p1') === heuristicFirst) result.heuristic++
        else result.random++
    }
    const ms = Date.now() - start
    console.log(`${n} battles in ${ms}ms (${(ms / n).toFixed(1)}ms/battle), avg ${(turns / n).toFixed(1)} turns`)
    console.log(`HeuristicAI ${result.heuristic} : RandomAI ${result.random} (draw ${result.draw})`)
}

main()
