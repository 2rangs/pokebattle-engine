// 문서의 "실행" 예제. 각 예제는 브라우저에서 실제 엔진을 돌리고, 결과를 텍스트 로그로만 출력한다.
// code 는 화면에 보여줄 소스이고, run 은 같은 내용을 실제로 실행하는 함수다.
import {
  BattleEngine,
  HeuristicAI,
  RandomAI,
  calculateDamage,
  formatEvent,
  generateRandomTeam,
  getMove,
  getSpecies,
  koName,
  parseShowdownTeam,
  simulateBattle,
} from '../../src/index'
import type { BattleEvent, PokemonSet } from '../../src/index'

export type Logger = (line: string, kind?: LogKind) => void
export type LogKind = 'out' | 'info' | 'json' | 'error' | 'dim'

export interface Example {
  code: string
  run: (log: Logger) => void
}

const SHOWDOWN_TEAM = `Garchomp @ Choice Scarf
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Outrage
- Stone Edge
- U-turn

Gholdengo @ Leftovers
Ability: Good as Gold
Level: 50
EVs: 252 HP / 4 SpA / 252 Spe
Timid Nature
- Make It Rain
- Shadow Ball
- Nasty Plot
- Recover`

const json = (v: unknown) => JSON.stringify(v, null, 2)

function teamA(): PokemonSet[] {
  return parseShowdownTeam(SHOWDOWN_TEAM)
}

export const examples = {
  quickstart: {
    code: `import { BattleEngine, HeuristicAI, formatEvent, generateRandomTeam } from '@kyasi/pokebattle-engine'

const engine = new BattleEngine({
  format: 'singles',
  seed: 42,
  p1: { name: 'Me',  team: generateRandomTeam({ seed: 1, size: 3, level: 50 }) },
  p2: { name: 'CPU', team: generateRandomTeam({ seed: 2, size: 3, level: 50 }) },
})

engine.on('*', ev => {
  const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
  if (line) console.log(line)
})

const ai = { p1: new HeuristicAI({ seed: 1 }), p2: new HeuristicAI({ seed: 2 }) }
while (engine.phase !== 'ended') {
  for (const p of ['p1', 'p2'] as const) {
    if (engine.getRequest(p)) engine.submitAction(ai[p].chooseAction(engine, p)!)
  }
}
console.log('winner:', engine.winner)`,
    run(log) {
      const engine = new BattleEngine({
        format: 'singles',
        seed: 42,
        p1: { name: 'Me', team: generateRandomTeam({ seed: 1, size: 3, level: 50 }) },
        p2: { name: 'CPU', team: generateRandomTeam({ seed: 2, size: 3, level: 50 }) },
      })
      engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
        if (line) log(line, ev.type === 'turn_start' ? 'info' : 'out')
      })
      const ai = { p1: new HeuristicAI({ seed: 1 }), p2: new HeuristicAI({ seed: 2 }) }
      for (let guard = 0; engine.phase !== 'ended' && guard < 500; guard++) {
        for (const p of ['p1', 'p2'] as const) {
          if (engine.getRequest(p)) engine.submitAction(ai[p].chooseAction(engine, p)!)
        }
      }
      log(`winner: ${engine.winner}`, 'info')
    },
  },

  parseTeam: {
    code: `import { parseShowdownTeam } from '@kyasi/pokebattle-engine'

const team = parseShowdownTeam(\`Garchomp @ Choice Scarf
Ability: Rough Skin
Level: 50
Tera Type: Steel
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Outrage
- Stone Edge
- U-turn
...\`)

console.log(team[0])`,
    run(log) {
      const team = teamA()
      log(json(team[0]), 'json')
      log(`→ ${team.length}마리 파싱됨: ${team.map(s => s.species).join(', ')}`, 'info')
    },
  },

  randomTeam: {
    code: `import { generateRandomTeam } from '@kyasi/pokebattle-engine'

// Showdown gen9randombattle 세트. 같은 seed → 같은 팀
const team = generateRandomTeam({ seed: 7, size: 3 })
for (const s of team) {
  console.log(\`Lv.\${s.level} \${s.species} @ \${s.item} [\${s.ability}] — \${s.moves.join(', ')}\`)
}`,
    run(log) {
      const team = generateRandomTeam({ seed: 7, size: 3 })
      for (const s of team) log(`Lv.${s.level} ${s.species} @ ${s.item} [${s.ability}] — ${s.moves.join(', ')}`)
    },
  },

  request: {
    code: `const engine = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team }, p2: { name: 'B', team } })

const req = engine.getRequest('p1')!
console.log(req.type, req.active.species, \`\${req.active.hp}/\${req.active.max_hp}\`)
for (const m of req.moves) console.log(m.index, m.move.name, \`PP \${m.pp}/\${m.max_pp}\`, m.disabled ? '(사용 불가)' : '')
console.log('교체 가능:', req.switches.map(p => p.species))
console.log('테라스탈 가능:', req.can_terastallize)`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team }, p2: { name: 'B', team } })
      const req = engine.getRequest('p1')!
      if (req.type !== 'move') return log(`unexpected request: ${req.type}`, 'error')
      log(`${req.type} ${req.active.species} ${req.active.hp}/${req.active.max_hp}`)
      for (const m of req.moves) log(`${m.index} ${m.move.name}  PP ${m.pp}/${m.max_pp}${m.disabled ? '  (사용 불가)' : ''}`)
      log(`교체 가능: ${json(req.switches.map(p => p.species))}`)
      log(`테라스탈 가능: ${req.can_terastallize}`)
    },
  },

  submit: {
    code: `const req = engine.getRequest('p1')!
engine.submitAction({ type: 'move', player: 'p1', pokemon_id: req.active.id, move_index: 0, terastallize: true })
engine.submitAction({ type: 'switch', player: 'p2', pokemon_id: 'p2_0', switch_to_id: 'p2_1' })

const s = engine.getState()
console.log('turn', s.turn, 'phase', s.phase)
for (const p of engine.allActive()) console.log(p.id, p.species, \`\${p.hp}/\${p.max_hp}\`, p.terastallized ? 'tera:' + p.tera_type : '')`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team }, p2: { name: 'B', team } })
      engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
        if (line) log(line, 'dim')
      })
      const req = engine.getRequest('p1')!
      engine.submitAction({ type: 'move', player: 'p1', pokemon_id: req.active.id, move_index: 0, terastallize: true })
      engine.submitAction({ type: 'switch', player: 'p2', pokemon_id: 'p2_0', switch_to_id: 'p2_1' })
      const s = engine.getState()
      log(`turn ${s.turn} phase ${s.phase}`, 'info')
      for (const p of engine.allActive()) {
        log(`${p.id} ${p.species} ${p.hp}/${p.max_hp}${p.terastallized ? ' tera:' + p.tera_type : ''}`, 'info')
      }
    },
  },

  invalid: {
    code: `try {
  engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 3 })
  engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 }) // 같은 턴에 두 번
} catch (err) {
  console.log(err.name, err.message)
}`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team }, p2: { name: 'B', team } })
      try {
        engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 3 })
        engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
        log('no error', 'dim')
      } catch (err) {
        log(`${(err as Error).name}: ${(err as Error).message}`, 'error')
      }
    },
  },

  events: {
    code: `engine.on('*', ev => console.log(JSON.stringify(ev)))
// 특정 타입만:
const off = engine.on('damage', ev => { /* ev.amount, ev.hp_after, ev.effectiveness, ev.crit */ })
off() // 구독 해제

engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
engine.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 1 })`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 3, p1: { name: 'A', team }, p2: { name: 'B', team } }, { turnSnapshots: false })
      engine.start()
      engine.on('*', ev => log(compactEvent(ev), 'json'))
      engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
      engine.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 1 })
    },
  },

  formatKo: {
    code: `import { formatEvent } from '@kyasi/pokebattle-engine'

engine.on('*', ev => {
  const line = formatEvent(ev, {
    getPokemon: id => engine.getPokemon(id),
    sideName: p => (p === 'p1' ? '' : '상대 '),
  })
  if (line) console.log(line)
})`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 3, p1: { name: 'A', team }, p2: { name: 'B', team } })
      engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id), sideName: p => (p === 'p1' ? '' : '상대 ') })
        if (line) log(line)
      })
      engine.submitAction({ type: 'move', player: 'p1', pokemon_id: 'p1_0', move_index: 0 })
      engine.submitAction({ type: 'move', player: 'p2', pokemon_id: 'p2_0', move_index: 1 })
    },
  },

  damage: {
    code: `import { calculateDamage } from '@kyasi/pokebattle-engine'

const r = calculateDamage(
  { species: 'garchomp', level: 50, nature: 'jolly', evs: { attack: 252, speed: 252 } },
  { species: 'gholdengo', level: 50, evs: { hp: 4 } },
  'earthquake',
  { weather: 'sandstorm' },
)
console.log(r.desc)
console.log(r.range.join(' '))
console.log(\`\${r.minPercent}% – \${r.maxPercent}%  \${r.koText}\`)`,
    run(log) {
      const r = calculateDamage(
        { species: 'garchomp', level: 50, nature: 'jolly', evs: { attack: 252, speed: 252 } },
        { species: 'gholdengo', level: 50, evs: { hp: 4 } },
        'earthquake',
        { weather: 'sandstorm' },
      )
      log(r.desc)
      log(r.range.join(' '))
      log(`${r.minPercent}% – ${r.maxPercent}%  ${r.koText}`, 'info')
    },
  },

  damageMods: {
    code: `const atk = { species: 'dragonite', level: 50, nature: 'adamant', item: 'choice-band',
              ability: 'multiscale', evs: { attack: 252 } }
const def = { species: 'kingambit', level: 50, evs: { hp: 252, defense: 4 } }

for (const field of [{}, { reflect: true }, { isCrit: true }]) {
  const r = calculateDamage(atk, def, 'extreme-speed', field)
  console.log(JSON.stringify(field).padEnd(18), \`\${r.min}-\${r.max} (\${r.minPercent}-\${r.maxPercent}%)\`, r.koText)
}
const tera = calculateDamage({ ...atk, teraType: 'normal', terastallized: true }, def, 'extreme-speed')
console.log('tera normal'.padEnd(18), \`\${tera.min}-\${tera.max}\`, tera.koText)`,
    run(log) {
      const atk = { species: 'dragonite', level: 50, nature: 'adamant', item: 'choice-band', ability: 'multiscale', evs: { attack: 252 } }
      const def = { species: 'kingambit', level: 50, evs: { hp: 252, defense: 4 } }
      for (const field of [{}, { reflect: true }, { isCrit: true }]) {
        const r = calculateDamage(atk, def, 'extreme-speed', field)
        log(`${JSON.stringify(field).padEnd(18)} ${r.min}-${r.max} (${r.minPercent}-${r.maxPercent}%) ${r.koText}`)
      }
      const tera = calculateDamage({ ...atk, teraType: 'normal', terastallized: true }, def, 'extreme-speed')
      log(`${'tera normal'.padEnd(18)} ${tera.min}-${tera.max} ${tera.koText}`)
    },
  },

  preview: {
    code: `const req = engine.getRequest('p1')!
for (const m of req.moves) {
  const r = engine.previewDamage('p1', m.index)
  console.log(m.move.name.padEnd(14), r ? \`\${r.minPercent}-\${r.maxPercent}% \${r.koText}\` : '(변화기)')
}`,
    run(log) {
      const team = teamA()
      const engine = new BattleEngine({ format: 'singles', seed: 1, p1: { name: 'A', team }, p2: { name: 'B', team: [team[1]!, team[0]!] } })
      const req = engine.getRequest('p1')!
      if (req.type !== 'move') return
      for (const m of req.moves) {
        const r = engine.previewDamage('p1', m.index)
        log(`${m.move.name.padEnd(14)} ${r ? `${r.minPercent}-${r.maxPercent}% ${r.koText}` : '(변화기)'}`)
      }
    },
  },

  data: {
    code: `import { getSpecies, getMove, koName } from '@kyasi/pokebattle-engine'

const s = getSpecies('urshifu-rapid-strike')!
console.log(s.id, s.name, s.showdown, s.nameKo, s.types, s.base_stats)

const m = getMove('Make It Rain')!       // Showdown 이름도 OK
console.log(m.name, m.type, m.power, m.accuracy)

console.log(koName.move('headlong-rush'), koName.ability('protosynthesis'),
            koName.item('booster-energy'), koName.nature('jolly'), koName.type('steel'))`,
    run(log) {
      const s = getSpecies('urshifu-rapid-strike')!
      log(`${s.id} ${s.name} ${s.showdown} ${s.nameKo} ${json(s.types)}`)
      log(json(s.base_stats), 'json')
      const m = getMove('Make It Rain')! as unknown as Record<string, unknown>
      log(`${m.name} ${m.type} ${m.power} ${m.accuracy}`)
      log([koName.move('headlong-rush'), koName.ability('protosynthesis'), koName.item('booster-energy'), koName.nature('jolly'), koName.type('steel')].join(' · '))
    },
  },

  simulate: {
    code: `import { simulateBattle, HeuristicAI, RandomAI, generateRandomTeam } from '@kyasi/pokebattle-engine'

const wins = { p1: 0, p2: 0, draw: 0 }
for (let i = 0; i < 20; i++) {
  const r = simulateBattle(
    { format: 'singles', seed: i,
      p1: { name: 'Heuristic', team: generateRandomTeam({ seed: i * 2 }) },
      p2: { name: 'Random',    team: generateRandomTeam({ seed: i * 2 + 1 }) } },
    { p1: new HeuristicAI({ seed: i }), p2: new RandomAI(i) },
  )
  wins[r.winner ?? 'draw']++
}
console.log(wins)`,
    run(log) {
      const wins = { p1: 0, p2: 0, draw: 0 }
      const t0 = performance.now()
      for (let i = 0; i < 20; i++) {
        const r = simulateBattle(
          {
            format: 'singles', seed: i,
            p1: { name: 'Heuristic', team: generateRandomTeam({ seed: i * 2 }) },
            p2: { name: 'Random', team: generateRandomTeam({ seed: i * 2 + 1 }) },
          },
          { p1: new HeuristicAI({ seed: i }), p2: new RandomAI(i) },
        )
        wins[r.winner ?? 'draw']++
        log(`#${String(i).padStart(2)}  ${String(r.turns).padStart(3)}턴  winner=${r.winner}`, 'dim')
      }
      log(json(wins), 'json')
      log(`${(performance.now() - t0).toFixed(0)} ms`, 'info')
    },
  },

  doubles: {
    code: `const engine = new BattleEngine({ format: 'doubles', seed: 5,
  p1: { name: 'A', team: generateRandomTeam({ seed: 1, format: 'gen9randomdoublesbattle', size: 4 }) },
  p2: { name: 'B', team: generateRandomTeam({ seed: 2, format: 'gen9randomdoublesbattle', size: 4 }) } })

// Showdown choice string: one per slot, comma separated. Targets 1/2 = foes, -1/-2 = allies.
// Only single-target moves take a target, so read them from the raw request.
const choose = (player: 'p1' | 'p2', foe: number) =>
  engine.getRawRequest(player).active.map(slot => {
    const i = slot.moves.findIndex(m => !m.disabled && m.target === 'normal')
    return i >= 0 ? \`move \${i + 1} \${foe}\` : 'move 1'
  }).join(', ')

engine.submitChoice('p1', choose('p1', 1))   // e.g. 'move 2 1, move 1 1'
engine.submitChoice('p2', choose('p2', 2))`,
    run(log) {
      const engine = new BattleEngine({
        format: 'doubles', seed: 5,
        p1: { name: 'A', team: generateRandomTeam({ seed: 1, format: 'gen9randomdoublesbattle', size: 4 }) },
        p2: { name: 'B', team: generateRandomTeam({ seed: 2, format: 'gen9randomdoublesbattle', size: 4 }) },
      })
      engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
        if (line) log(line, ev.type === 'turn_start' ? 'info' : 'out')
      })
      engine.start()
      type Raw = { active: { moves: { disabled?: boolean; target?: string }[] }[] }
      const choose = (player: 'p1' | 'p2', foe: number) =>
        (engine.getRawRequest(player) as Raw).active.map(slot => {
          const i = slot.moves.findIndex(m => !m.disabled && m.target === 'normal')
          return i >= 0 ? `move ${i + 1} ${foe}` : 'move 1'
        }).join(', ')
      const c1 = choose('p1', 1), c2 = choose('p2', 2)
      log(`p1: '${c1}'   p2: '${c2}'`, 'json')
      try {
        engine.submitChoice('p1', c1)
        engine.submitChoice('p2', c2)
      } catch (err) {
        log(`${(err as Error).name}: ${(err as Error).message}`, 'error')
      }
    },
  },

  triples: {
    code: `const engine = new BattleEngine({ format: 'triples', seed: 9,
  p1: { name: 'A', team: generateRandomTeam({ seed: 3, format: 'gen9randomdoublesbattle', size: 4, level: 50 }) },
  p2: { name: 'B', team: generateRandomTeam({ seed: 4, format: 'gen9randomdoublesbattle', size: 4, level: 50 }) } })

console.log(engine.getActivePokemon('p1').map(p => p.species))  // 3 slots per side
engine.submitChoice('p1', 'default')   // or e.g. 'move 1 2, move 1 1, move 2 3'
engine.submitChoice('p2', 'default')`,
    run(log) {
      const engine = new BattleEngine({
        format: 'triples', seed: 9,
        p1: { name: 'A', team: generateRandomTeam({ seed: 3, format: 'gen9randomdoublesbattle', size: 4, level: 50 }) },
        p2: { name: 'B', team: generateRandomTeam({ seed: 4, format: 'gen9randomdoublesbattle', size: 4, level: 50 }) },
      })
      engine.on('*', ev => {
        const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
        if (line) log(line, ev.type === 'turn_start' ? 'info' : 'out')
      })
      engine.start()
      log(`p1 active: ${json(engine.getActivePokemon('p1').map(p => p.species))}`, 'json')
      engine.submitChoice('p1', 'default')
      engine.submitChoice('p2', 'default')
    },
  },

  teamPreview: {
    code: `const engine = new BattleEngine({ format: 'singles', seed: 2,
  options: { pickedTeamSize: 3, level: 50 },        // 6 → 3, team preview turns on
  p1: { name: 'A', team: generateRandomTeam({ seed: 5 }) },
  p2: { name: 'B', team: generateRandomTeam({ seed: 6 }) } })

engine.start()
console.log(engine.phase)                             // 'team_preview'
const pv = engine.getTeamPreview('p1')!
console.log(pv.pick, pv.team.map(p => p.id + ' ' + p.species))

engine.submitAction({ type: 'team', player: 'p1', order: ['p1_5', 'p1_0', 'p1_2'] })
engine.submitAction(new HeuristicAI().chooseAction(engine, 'p2')!)
console.log(engine.phase, engine.getActive('p1').species, engine.getSide('p1').team.length)`,
    run(log) {
      const engine = new BattleEngine({
        format: 'singles', seed: 2,
        options: { pickedTeamSize: 3, level: 50 },
        p1: { name: 'A', team: generateRandomTeam({ seed: 5 }) },
        p2: { name: 'B', team: generateRandomTeam({ seed: 6 }) },
      })
      engine.start()
      log(engine.phase, 'info')
      const pv = engine.getTeamPreview('p1')!
      log(`pick ${pv.pick}`)
      for (const p of pv.team) log(`  ${p.id} ${p.species} Lv.${p.level}`)
      engine.submitAction({ type: 'team', player: 'p1', order: ['p1_5', 'p1_0', 'p1_2'] })
      engine.submitAction(new HeuristicAI().chooseAction(engine, 'p2')!)
      log(`${engine.phase} · lead ${engine.getActive('p1').species} · ${engine.getSide('p1').team.length} brought`, 'info')
    },
  },

  rules: {
    code: `const team = [
  { species: 'garchomp', ability: 'rough-skin', nature: 'jolly', level: 50, item: 'leftovers', moves: ['earthquake'] },
  { species: 'garchomp', ability: 'rough-skin', nature: 'jolly', level: 50, item: 'leftovers', moves: ['fissure'] },
]
try {
  new BattleEngine({ format: 'singles', options: { speciesClause: true, itemClause: true, ohkoClause: true },
    p1: { name: 'A', team }, p2: { name: 'B', team } }).start()
} catch (err) {
  console.log(err.message)
}

const e = new BattleEngine({ format: 'singles', options: { terastal: false },
  p1: { name: 'A', team }, p2: { name: 'B', team } })
console.log('can tera:', e.getRequest('p1').can_terastallize)`,
    run(log) {
      const team = [
        { species: 'garchomp', ability: 'rough-skin', nature: 'jolly', level: 50, gender: null, item: 'leftovers', moves: ['earthquake'] },
        { species: 'garchomp', ability: 'rough-skin', nature: 'jolly', level: 50, gender: null, item: 'leftovers', moves: ['fissure'] },
      ] as unknown as PokemonSet[]
      try {
        new BattleEngine({ format: 'singles', options: { speciesClause: true, itemClause: true, ohkoClause: true }, p1: { name: 'A', team }, p2: { name: 'B', team } }).start()
        log('no error', 'dim')
      } catch (err) {
        for (const part of (err as Error).message.split(/(?<=\.) /)) log(part, 'error')
      }
      const e = new BattleEngine({ format: 'singles', options: { terastal: false }, p1: { name: 'A', team }, p2: { name: 'B', team } })
      const req = e.getRequest('p1')
      log(`can tera: ${req?.type === 'move' && req.can_terastallize}`, 'info')
    },
  },
} satisfies Record<string, Example>

export type ExampleId = keyof typeof examples

/** 이벤트를 한 줄 JSON 으로 (중첩 객체는 이름만) */
function compactEvent(ev: BattleEvent): string {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(ev)) {
    if (k === 'state') out[k] = '…'
    else if (v && typeof v === 'object' && 'name' in v) out[k] = (v as { name: string }).name
    else out[k] = v
  }
  return JSON.stringify(out)
}
