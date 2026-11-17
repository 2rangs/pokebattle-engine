import { BattleEngine, generateRandomTeam, generateChaosTeam, PRNG, exportShowdownTeam, toShowdownSet } from '../dist/index.js'
const battleNo = Number(process.argv[2] ?? 505)
const seed = battleNo
const rng = new PRNG(seed * 7919 + 13)
const doubles = rng.chance(15)
const team = () => (rng.chance(50)
  ? generateRandomTeam({ seed: rng.int(0x7fffffff), format: doubles ? 'gen9randomdoublesbattle' : 'gen9randombattle', size: rng.int(1, 6) })
  : generateChaosTeam({ rng, size: rng.int(1, 6) }))
const t1 = team(), t2 = team()
console.log('doubles', doubles)
console.log(exportShowdownTeam(t1)); console.log('-----'); console.log(exportShowdownTeam(t2))
const e = new BattleEngine({ format: doubles ? 'doubles' : 'singles', seed, maxTurns: 300, p1: { name: 'P1', team: t1 }, p2: { name: 'P2', team: t2 } })
try { e.start() } catch (err) { console.log('ERR', (err as Error).message); console.log(e.battle.log.slice(-15).join('\n')) }
// play the same way as fuzz (singles random)
const { HeuristicAI } = await import('../dist/index.js')
