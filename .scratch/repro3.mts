import { BattleEngine, generateRandomTeam, generateChaosTeam, PRNG, HeuristicAI } from '../dist/index.js'
const battleNo = Number(process.argv[2]); const who = process.argv[3]
const seed = battleNo, rng = new PRNG(seed * 7919 + 13)
const doubles = rng.chance(15), minSize = doubles ? 2 : 1
const team = () => (rng.chance(50) ? generateRandomTeam({ seed: rng.int(0x7fffffff), format: doubles ? 'gen9randomdoublesbattle' : 'gen9randombattle', size: rng.int(minSize, 6) }) : generateChaosTeam({ rng, size: rng.int(minSize, 6) }))
const engine = new BattleEngine({ format: doubles ? 'doubles' : 'singles', seed, maxTurns: 300, p1: { name: 'P1', team: team() }, p2: { name: 'P2', team: team() } })
const heuristic = !doubles && rng.chance(5)
const ais = heuristic ? { p1: new HeuristicAI({ seed }), p2: new HeuristicAI({ seed: seed + 1 }) } : null
engine.on('*', ev => { if ((ev as any).pokemon_id === who || (ev as any).in_id === who) { const p = engine.getShowdownPokemon(who)!; console.log(ev.type, JSON.stringify({ ...ev, move: undefined, state: undefined }).slice(0, 160), '| real', p.hp, '/', p.maxhp, p.species.name) } })
engine.start()
console.log('start maxhp', engine.getShowdownPokemon(who)!.maxhp)
let lastLog = 0
engine.battle.log.length
let guard = 0
while (!engine.battle.ended && guard++ < 5000) for (const player of ['p1', 'p2'] as const) {
  if (engine.battle.ended) break
  if (doubles) { const req: any = engine.getRawRequest(player); if (!req || req.wait || engine.battle[player].isChoiceDone()) continue; engine.submitChoice(player, 'default'); continue }
  const req = engine.getRequest(player); if (!req) continue
  engine.submitAction(ais ? ais[player].chooseAction(engine, player)! : rng.pick(engine.getAvailableActions(player)))
}
console.log(engine.battle.log.filter(l => l.includes('Terapagos')).slice(0, 30).join('\n'))
