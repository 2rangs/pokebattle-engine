import { Battle, Dex, Teams } from '@pkmn/sim'
const team = (s: string) => Teams.import(s)!
const b = new Battle({ formatid: 'gen9customgame' as any, seed: [1, 2, 3, 4] as any })
b.setPlayer('p1', { name: 'A', team: Teams.pack(team(`Great Tusk @ Booster Energy\nAbility: Protosynthesis\nTera Type: Steel\nEVs: 252 Atk / 252 Spe\nJolly Nature\n- Headlong Rush\n- U-turn\n- Rapid Spin\n- Knock Off\n\nPikachu\nAbility: Static\n- Thunderbolt`)) })
b.setPlayer('p2', { name: 'B', team: Teams.pack(team(`Gholdengo @ Choice Specs\nAbility: Good as Gold\nTera Type: Fairy\nEVs: 252 SpA / 252 Spe\nTimid Nature\n- Make It Rain\n- Shadow Ball\n- Trick\n- Recover`)) })
console.log(JSON.stringify(b.p1.activeRequest).slice(0, 700))
b.choose('p1', 'move 2 terastallize'); b.choose('p2', 'move 1')
console.log(b.log.slice(-25).join('\n'))
console.log('req', JSON.stringify(b.p1.activeRequest).slice(0, 200), b.p1.requestState, b.p2.requestState)
console.log(Dex.species.get('greattusk').name, Dex.species.get('mrmimegalar').exists, Dex.species.get('urshifusinglestrike').exists, Object.keys(b.p1.pokemon[0]).filter(k=>!k.startsWith('_')).slice(0,80).join(','))
