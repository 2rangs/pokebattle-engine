import { BattleEngine, generateRandomTeam, generateChaosTeam, PRNG, HeuristicAI, exportShowdownTeam } from '../dist/index.js'
const battleNo = Number(process.argv[2])
const seed = battleNo
const rng = new PRNG(seed * 7919 + 13)
const doubles = rng.chance(15)
const minSize = doubles ? 2 : 1
const team = () => (rng.chance(50)
  ? generateRandomTeam({ seed: rng.int(0x7fffffff), format: doubles ? 'gen9randomdoublesbattle' : 'gen9randombattle', size: rng.int(minSize, 6) })
  : generateChaosTeam({ rng, size: rng.int(minSize, 6) }))
const t1 = team(), t2 = team()
const engine = new BattleEngine({ format: doubles ? 'doubles' : 'singles', seed, maxTurns: 300, p1: { name: 'P1', team: t1 }, p2: { name: 'P2', team: t2 } })
const heuristic = !doubles && rng.chance(5)
const ais = heuristic ? { p1: new HeuristicAI({ seed }), p2: new HeuristicAI({ seed: seed + 1 }) } : null
engine.start()
console.log('doubles', doubles, 'heuristic', heuristic)
let guard = 0
outer: while (!engine.battle.ended && guard++ < 5000) {
  for (const player of ['p1', 'p2'] as const) {
    if (engine.battle.ended) break
    if (doubles) break outer
    const req = engine.getRequest(player)
    if (!req) continue
    const acts = engine.getAvailableActions(player)
    if (!acts.length) {
      console.log('EMPTY ACTIONS', player, req.type, JSON.stringify(req.raw).slice(0, 1500))
      console.log(engine.battle.log.slice(-25).join('\n'))
      break outer
    }
    const action = ais ? ais[player].chooseAction(engine, player) : rng.pick(acts)
    try { engine.submitAction(action!) } catch (e) { console.log('SUBMIT ERR', (e as Error).message); console.log(JSON.stringify(req.raw).slice(0, 1200)); console.log(engine.battle.log.slice(-20).join('\n')); break outer }
  }
}
console.log('ended', engine.battle.ended, 'turn', engine.battle.turn)
