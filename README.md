# @kyasi/pokebattle-engine

A Pokémon **singles** battle engine (Gen 9 rules) in TypeScript. It includes:

- **Damage calculator**: Gen 9 order with 4096-based modifier rounding, variable-power and type-changing moves, Tera STAB, screens, weather, terrain, abilities and items.
- **Turn engine**: action ordering, mid-turn switches (U-turn and similar), faint replacements, hazards, field and side conditions, and end-of-turn effects.
- **Seeded RNG**: the same seed reproduces the same battle.
- **AI**: `RandomAI` and `HeuristicAI`, plus a random team generator and an automatic battle simulator.
- **Korean battle log formatter**, a Showdown team parser and exporter, and a React hook.

## Install

```bash
npm install github:2rangs/pokebattle-engine
```

`dist/` is not committed. The `prepare` script builds it with tsup during install.

## Quick start

```ts
import { preloadData, BattleEngine, HeuristicAI, formatEvent, parseShowdownTeam } from '@kyasi/pokebattle-engine'

await preloadData() // load species, move and type data (lazy chunks)

const engine = new BattleEngine({
  format: 'singles',
  seed: 42,
  p1: { name: 'Me', team: parseShowdownTeam(myTeamText) },
  p2: { name: 'CPU', team: parseShowdownTeam(cpuTeamText) },
})

engine.on('*', ev => {
  const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
  if (line) console.log(line)
})

const cpu = new HeuristicAI({ seed: 1 })

// Check what each player has to decide, then submit actions
const req = engine.getRequest('p1')            // { type: 'move' | 'switch', moves, switches, can_terastallize … }
engine.submitAction({ type: 'move', player: 'p1', pokemon_id: req!.active.id, move_index: 0, terastallize: true })
engine.submitAction(cpu.chooseAction(engine, 'p2')!)
```

### Battle flow

| `state.phase` | Meaning | What to do |
|---|---|---|
| `waiting_action` | Waiting for both players' actions | Each player calls `submitAction(move | switch)` |
| `switching` | A replacement is needed after a faint, or a mid-turn switch after U-turn and similar | Only the players listed in `state.pending_switches` submit a `switch` |
| `ended` | The battle is over | Read `state.winner` |

- `getRequest(player)` returns the decision that player must make now, or `null` if none.
- `getAvailableActions(player)` returns every legal `Action`.
- Invalid actions throw `BattleError`.

### Automatic simulation / random teams

```ts
import { simulateBattle, generateRandomTeam, PRNG, HeuristicAI, RandomAI } from '@kyasi/pokebattle-engine'

const rng = new PRNG(7)
const result = simulateBattle(
  { format: 'singles', seed: 7, p1: { name: 'A', team: generateRandomTeam({ rng }) }, p2: { name: 'B', team: generateRandomTeam({ rng }) } },
  { p1: new HeuristicAI(), p2: new RandomAI() },
)
console.log(result.winner, result.turns)
```

`generateRandomTeam({ learnsets })` picks only legal moves when you pass learnsets. Without them, moves are chosen by type and category.

### Damage calculator

```ts
import { createBattlePokemon, calcDamageSummary, getTypeChart } from '@kyasi/pokebattle-engine'

const atk = createBattlePokemon({ species: 'garchomp', level: 50, nature: 'jolly', ability: 'rough-skin', gender: null,
  evs: { attack: 252, speed: 252 }, moves: ['earthquake'] }, 'a')
const def = createBattlePokemon({ species: 'gholdengo', level: 50, nature: 'timid', ability: 'good-as-gold', gender: null,
  evs: { hp: 4 }, moves: ['shadow-ball'] }, 'b')

calcDamageSummary({ attacker: atk, defender: def, move: atk.moves[0]!.move, weather: null, terrain: null, typeChart: getTypeChart() })
// → { min, max, range: [16 rolls], koText: '확정 1타' … }
```

### React

```tsx
import { useBattle } from '@kyasi/pokebattle-engine/react'

const { state, requests, submit, log } = useBattle(config, { ai: { p2: new HeuristicAI() } })
```

## Implemented mechanics (summary)

- **Status conditions:**
  - Sleep lasts 1–3 turns.
  - Freeze has a 20% thaw chance each turn, and thawing moves cure it.
  - Paralysis has a 25% chance to prevent action.
  - Burn halves physical damage (Guts and Facade are exempt) and deals 1/16 HP each turn.
  - Poison and Toxic deal residual damage (Toxic increases each turn).
  - Confusion and flinching are implemented.
- **Field and side conditions:**
  - Weather: sun, rain, sand, snow and the primal weathers, with weather rocks extending duration to 8 turns.
  - Terrains.
  - Reflect, Light Screen and Aurora Veil (Light Clay extends them).
  - Tailwind, Trick Room, Gravity, Safeguard, Mist and Wish.
  - Hazards: Stealth Rock, Spikes, Toxic Spikes and Sticky Web; Heavy-Duty Boots blocks them. Rapid Spin, Defog, Mortal Spin and similar moves remove them.
- **Moves:**
  - Protect variants with consecutive-use decay, plus their contact penalties.
  - Charge moves, with Power Herb and the weather exceptions.
  - Recharge moves and rampage moves such as Outrage.
  - Self-switching (U-turn, Volt Switch, Parting Shot, Shed Tail …) and forced switching (Dragon Tail, Roar).
  - Multi-hit moves (Skill Link, Loaded Dice), fixed-damage moves and OHKO moves.
  - Drain, recoil, Struggle, Sucker Punch, Fake Out, Knock Off, Salt Cure, Stone Axe and others.
- **Items:**
  - Choice items lock you into one move.
  - Life Orb, Leftovers, Black Sludge, Focus Sash, Sitrus Berry, Lum Berry and other berries.
  - Rocky Helmet, Air Balloon, Weakness Policy, Booster Energy, Assault Vest, Covert Cloak and others.
- **Abilities:** about 120, including:
  - Intimidate, weather and terrain setters, Protosynthesis and Quark Drive.
  - Absorbing abilities and Levitate.
  - Multiscale, Sturdy, Regenerator, Magic Bounce, Prankster, Contrary, Unaware, Mold Breaker, Supreme Overlord and others.
- **Terastallization:** type change, Tera STAB (2× when the Tera type matches an original type), a 60 base-power floor, Tera Blast, and once per battle.

### Not supported yet

- Doubles. `format: 'doubles'` throws `BattleError`.
- Mega Evolution and Dynamax.
- Doubles-only moves (Helping Hand, Ally Switch …), Transform, Metronome and similar.

Unimplemented moves fail with `move_fail(reason: '미구현 기술')`.

## Scripts

```bash
npm test                  # vitest
npm run type-check
npm run build             # tsup → dist (ESM + CJS + d.ts)
npm run simulate          # play against the AI in the terminal (--auto: AI vs AI, --random: random teams, --seed N)
npm run bench -- 500      # HeuristicAI vs RandomAI over many battles + stability check
npm run fetch-data        # re-fetch the source data from PokeAPI
npx tsx scripts/compact-data.ts  # source data → src/data/compact (trimmed to engine fields)
```
