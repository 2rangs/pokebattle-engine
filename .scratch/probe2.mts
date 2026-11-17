import * as Sim from '@pkmn/sim'
import { calculate, Generations, Pokemon, Move, Field } from '@smogon/calc'
import { TeamGenerators } from '@pkmn/randoms'
console.log('sim exports', Object.keys(Sim).join(','))
const { Battle, Dex, Teams } = Sim
const f = Dex.formats.get('gen9customgame@@@!Team Preview')
console.log('format', f.name, f.exists, f.ruleTable ? 'rt' : '')
const gen = Generations.get(9)
const r = calculate(gen, new Pokemon(gen, 'Garchomp', { nature: 'Jolly', evs: { atk: 252, spe: 252 }, level: 50 }), new Pokemon(gen, 'Gholdengo', { level: 50, evs: { hp: 4 } }), new Move(gen, 'Earthquake'))
console.log(r.range(), r.desc(), JSON.stringify(r.kochance()))
Dex.includeData?.()
const ls = await (Dex as any).learnsets?.get?.('garchomp')
console.log('learnset api', typeof (Dex.species as any).getLearnsetData, Object.keys((Dex.species as any).getLearnsetData?.('garchomp') ?? {}).slice(0,3), ls ? Object.keys(ls).slice(0,3) : 'nolearnsets')
const gen9 = TeamGenerators.getTeamGenerator('gen9randombattle')
const t = gen9.getTeam()
console.log(Teams.export(t).slice(0, 300))
const b = new Battle({ formatid: 'gen9customgame@@@!Team Preview' as any, seed: [1,2,3,4] as any })
b.setPlayer('p1', { name: 'A', team: t }); b.setPlayer('p2', { name: 'B', team: gen9.getTeam() })
console.log(b.log.slice(-6).join('\n'), b.p1.requestState)
const t0 = Date.now(); let n = 0
const prng = new Sim.PRNG([5,6,7,8] as any)
for (let i = 0; i < 200; i++) {
  const bb = new Battle({ formatid: 'gen9customgame@@@!Team Preview' as any, seed: [i,2,3,4] as any })
  bb.setPlayer('p1', { name: 'A', team: gen9.getTeam() }); bb.setPlayer('p2', { name: 'B', team: gen9.getTeam() })
  while (!bb.ended && bb.turn < 500) {
    for (const side of bb.sides) {
      const req: any = side.activeRequest
      if (!req || req.wait) continue
      let choice = 'default'
      if (req.forceSwitch) { const opts = req.side.pokemon.map((p: any, j: number) => [p, j+1]).filter(([p]: any) => !p.active && !p.condition.endsWith(' fnt')); choice = opts.length ? 'switch ' + prng.sample(opts)[1] : 'pass' }
      else if (req.active) { const ms = req.active[0].moves.map((m: any, j: number) => [m, j+1]).filter(([m]: any) => !m.disabled); choice = ms.length ? 'move ' + prng.sample(ms)[1] : 'default' }
      side.choose(choice) || side.choose('default')
    }
    n++
    if (n > 100000) break
  }
}
console.log('200 random battles ms', Date.now() - t0)
