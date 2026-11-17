import { simulateBattle, generateRandomTeam, HeuristicAI, formatEvent, BattleEngine } from '../src/index'
const r = simulateBattle({ format: 'singles', seed: 7, p1: { name: 'A', team: generateRandomTeam({ seed: 1 }) }, p2: { name: 'B', team: generateRandomTeam({ seed: 2 }) } },
  { p1: new HeuristicAI({ seed: 1 }), p2: new HeuristicAI({ seed: 2 }) })
const e = r.engine
const lines = r.log.map(ev => formatEvent(ev, { getPokemon: id => e.getPokemon(id) })).filter(Boolean)
console.log(lines.slice(0, 45).join('\n'))
console.log('...', lines.length, 'lines; winner', r.winner, 'turns', r.turns, 'unhandled', [...e.unhandledProtocol])
// HP consistency check
for (const p of ['p1','p2'] as const) for (const pk of e.getSide(p).team) { const ps = e.getShowdownPokemon(pk.id)!; if (ps.hp !== pk.hp) console.log('HP MISMATCH', pk.id) }
