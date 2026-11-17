import { BattleEngine, generateRandomTeam, generateChaosTeam, PRNG } from '../dist/index.js'
const t0 = Date.now(); let tGen = 0, tBattle = 0
for (let i = 0; i < 300; i++) {
  const rng = new PRNG(i * 7919 + 13)
  const a = Date.now()
  const team = () => (rng.chance(50) ? generateRandomTeam({ seed: rng.int(0x7fffffff), size: rng.int(1, 6) }) : generateChaosTeam({ rng, size: rng.int(1, 6) }))
  const t1 = team(), t2 = team()
  const b = Date.now(); tGen += b - a
  const e = new BattleEngine({ format: 'singles', seed: i, maxTurns: 300, p1: { name: 'A', team: t1 }, p2: { name: 'B', team: t2 } }, { turnSnapshots: false })
  e.start()
  while (!e.battle.ended) for (const p of ['p1', 'p2']) { if (e.battle.ended) break; const r = e.getRequest(p); if (!r) continue; e.submitAction(rng.pick(e.getAvailableActions(p))) }
  e.getState()
  tBattle += Date.now() - b
}
console.log('total', Date.now() - t0, 'teamgen', tGen, 'battle', tBattle)
