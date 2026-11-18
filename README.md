# @kyasi/pokebattle-engine

A Pokémon battle engine built on the **[Pokémon Showdown](https://github.com/smogon/pokemon-showdown) simulator**.

- **Battle mechanics:** Showdown's simulator ([`@pkmn/sim`](https://github.com/pkmn/ps), a browser-friendly package of `smogon/pokemon-showdown/sim`). Every Gen 9 move, ability and item interaction behaves exactly as it does on Showdown.
- **Damage calculator:** [`@smogon/calc`](https://github.com/smogon/damage-calc), the engine behind the Showdown damage calculator (calc.pokemonshowdown.com).
- **Pokémon data / names:** [PokeAPI](https://pokeapi.co).
  - All 1,351 PokeAPI Pokémon slugs (`urshifu-single-strike`, `kings-shield` …), forms included, are mapped to Showdown IDs.
  - Korean names for Pokémon, moves, abilities, items, types and natures.
- **This package adds on top:**
  - A slug-based team and action API plus validation (`getRequest` / `submitAction`).
  - Typed events converted from Showdown protocol logs, emitted as each log line is written.
  - Battle logs in Korean, English and Japanese from one message catalog (Korean particles handled), plus Pokémon/move/ability/item names in 9 languages.
  - AI, Showdown random-battle teams, a React hook, and fuzz testing.

## Performance

Same battles (same seed, teams and choices) replayed through `@pkmn/sim` directly and through this engine.
Every replay produces a **byte-identical protocol log**; only the speed differs.

| Format | Showdown (`@pkmn/sim`) | This engine | Speedup |
|---|---|---|---|
| Singles | 1.001 ms/turn | 0.622 ms/turn | **1.61×** |
| Doubles | 3.520 ms/turn | 1.893 ms/turn | **1.86×** |
| Triples | 5.710 ms/turn | 3.133 ms/turn | **1.82×** |

The engine time includes everything it adds on top (typed events, Korean names, state views).
Measured with `npm run bench:compare -- --battles 60 --rounds 3` on Node 22; run it yourself to reproduce.

**How:** Showdown spends most of a battle looking up `on<Event>` handlers on every status, volatile, ability, item and field effect, with string keys on differently shaped objects, mostly finding nothing. The engine patches that hot path at runtime (`src/engine/fastpath.ts`): each effect's handlers are indexed once, event-name strings are cached and handler lists are built without intermediate arrays, keeping Showdown's exact handler order. The patch applies only to battles the engine creates; `new BattleEngine(config, { fast: false })` runs Showdown's original code for comparison.

## Bundle size

The engine bundles only the parts of `@pkmn/sim` a Gen 9 battle needs (`scripts/slim-sim.ts`): no server stream code (so no `eval` warning in Vite/Rollup), no Gen 1–8 data. The two big data sets that battles don't use load on demand:

| Data | Size (minified) | Needed for |
|---|---|---|
| Showdown learnsets | ~2.8 MB | `generateRandomSet` (without a `learnset`), `generateChaosTeam` |
| Random-battle sets | ~1.1 MB | `generateRandomTeam` |

```ts
await preloadData()   // loads both (separate chunks); battles, the damage calculator and names work without it
```

In an app build this took the battle page chunk from 8.7 MB to 3.4 MB. `npm run check:dist` builds and checks that the bundle plays byte-identical battles to the original `@pkmn/sim` and builds the same sets.

## Install

```bash
npm install github:2rangs/pokebattle-engine
```

## Usage

```ts
import { BattleEngine, HeuristicAI, formatEvent, parseShowdownTeam, generateRandomTeam, preloadData } from '@kyasi/pokebattle-engine'

await preloadData()                      // random-battle sets (only needed for generateRandomTeam)

const engine = new BattleEngine({
  format: 'singles',                     // also 'rotation' (same API), 'doubles' | 'triples' (submitChoice)
  seed: 42,                              // same seed → same battle
  p1: { name: 'Me',  team: parseShowdownTeam(showdownText) },
  p2: { name: 'CPU', team: generateRandomTeam({ seed: 7 }) },   // Showdown random-battle sets
})

engine.on('*', ev => {
  const line = formatEvent(ev, { getPokemon: id => engine.getPokemon(id) })
  if (line) console.log(line)            // "한카리아스의 지진!" "효과가 굉장했다! 상대 타부자고에게 196 데미지 (-100%)"
})

const req = engine.getRequest('p1')      // { type: 'move' | 'switch', moves, switches, can_terastallize, forced … }
engine.submitAction({ type: 'move', player: 'p1', pokemon_id: req!.active.id, move_index: 0, terastallize: true })
engine.submitAction(new HeuristicAI().chooseAction(engine, 'p2')!)

engine.previewDamage('p1', 0)            // damage preview of my move against the current state (@smogon/calc)
```

### Team format (`PokemonSet`)

```ts
{ species: 'great-tusk', ability: 'protosynthesis', item: 'booster-energy', nature: 'jolly',
  level: 50, teraType: 'steel', evs: { attack: 252, speed: 252 }, moves: ['headlong-rush', 'ice-spinner', 'rapid-spin', 'knock-off'] }
```

- **Names:** PokeAPI slugs, Showdown names and Showdown IDs are all accepted.
- **Defaults:** IVs default to 31 and EVs to 0.
- **Validation:** unknown names throw `BattleError`.

### Battle flow

| `state.phase` | Meaning | What to do |
|---|---|---|
| `team_preview` | Team preview is on (`options.teamPreview` / `pickedTeamSize`) | Each side submits `{ type: 'team', order }` (see `getTeamPreview`) |
| `waiting_action` | Waiting for this turn's actions | Both sides `submitAction` (move/switch) |
| `switching` | Replacement after a faint / U-turn etc. / Revival Blessing | Only the sides in `state.pending_switches` submit a `switch` |
| `ended` | The battle is over | `state.winner` |

- `getRequest(player)` returns a decision based on Showdown's request, plus details hidden from the request:
  - Hidden trapping (Shadow Tag etc.) and hidden disables (Imprison) are reflected from live state.
  - Revival Blessing offers only fainted Pokémon (`reason: 'revival_blessing'`).
  - Recharge, charging and rampage turns force the move (`forced: true`).
- **Doubles / triples:** use `getRawRequest(player)` + `submitChoice(player, 'move 1 2, switch 3')`. Triples run on Showdown's `gen9triples` with its ladder rules (team preview, Species Clause, banlist) stripped, so they start rule-free like singles and doubles.
- **Rotation:** `format: 'rotation'` uses the same `getRequest` / `submitAction` API as singles. Three Pokémon per side are out, but only the front one (the middle slot, `engine.frontSlot === 1`) acts and can be targeted. Add `rotate: 'left' | 'right'` to a `move` action and that back Pokémon rotates to the front at the very start of the turn (before switches and priority moves) and uses the move (`move_index` / `pokemon_id` refer to the incoming Pokémon; options are in `req.rotate`). A rotation is not a switch, so stat stages and volatiles stay and switch-in abilities don't re-fire. You can't rotate while the front Pokémon is locked into a move. A fainted front is refilled from the bench; with no bench left the request has `must_rotate: true`. Spread moves and Intimidate reach only the foe's front Pokémon and ally-targeting moves fail, but end-of-turn damage and field-wide effects still reach the back row. Rotations emit a `rotate` event. Raw choices work too (`'pass, move 1 2, pass'`, `'move 2 2, pass, pass'` = rotate left; the foe's front is always target 2).
  - Showdown never implemented rotation (its server sim only ever had `'rotation'` as a three-slot `gameType` name, and today it computes one active slot for it), so the engine runs rotation as a `gen9triples` battle and patches the sim's targeting and choice handling at runtime, only for battles it marks as rotation (`src/engine/rotation.ts`).
- **State:** `getState()` / `snapshot()` return state for display, and `engine.battle` is the Showdown `Battle` object itself.

### Rule options (`config.options`)

```ts
new BattleEngine({
  format: 'doubles',
  options: {
    pickedTeamSize: 4,       // bring 4 of 6; turns on team preview
    level: 50,               // every Pokémon at level 50
    terastal: false,         // Terastal Clause
    speciesClause: true, itemClause: true, sleepClause: true,
  },
  p1, p2,
})
```

| Option | Showdown rule | Enforced |
|---|---|---|
| `teamPreview` | Team Preview | in battle |
| `pickedTeamSize` | Picked Team Size = N | in battle (team preview) |
| `level` | Adjust Level | applied to sets at start |
| `minLevel` / `maxLevel` | Min Level / Max Level | checked at start |
| `terastal: false` | Terastal Clause | in battle |
| `sleepClause` | Sleep Clause Mod | in battle |
| `endlessBattleClause` | Endless Battle Clause | in battle |
| `speciesClause` / `itemClause` | Species Clause / Item Clause = 1 | checked at start |
| `ohkoClause` / `evasionClause` | OHKO Clause / Evasion Clause | checked at start |

- "Checked at start" rules run through Showdown's `TeamValidator`; a violation throws `BattleError` from `start()`.
- Any other Showdown rule can still go in `config.rules` by name.
- With team preview on, `getRequest` returns `null` and `getTeamPreview(player)` returns `{ team, pick }`. `HeuristicAI`, `RandomAI` and `simulateBattle` get through team preview by themselves; `useBattle` does it for AI-controlled sides.

### Events

Every Showdown protocol message becomes a typed `BattleEvent` (`move_use`, `damage`, `heal`, `switch`, `faint`, `status_apply`, `stat_change`, `weather_change`, `terrain_change`, `side_start`, `ability_trigger`, `item_consume`, `terastallize`, `forme_change` …).

- `damage` / `heal` carry exact amounts plus `hp_after`, `effectiveness` and `crit`.
- HP and status changes that Showdown applies without a log line (Regenerator, Natural Cure …) also get compensating events.
- So replaying the event stream alone matches the simulator's HP exactly; the fuzz test checks this.

### Battle logs in any language

Events become sentences in two steps, so the wording lives in one place per language:

1. `describeEvent(event, ctx)` → language-neutral messages, e.g. `{ key: 'move.use', params: { pokemon: { pokemon: 'p1_0' }, move: { move: 'earthquake' } } }`.
2. A locale turns messages into text. Built in: `ko`, `en`, `ja`.

```ts
import { createFormatter, loadNames } from '@kyasi/pokebattle-engine'

await loadNames('ja')                                   // ko and en names are built in; other packs load on demand
const log = createFormatter({ locale: 'ja', getPokemon: id => engine.getPokemon(id) })
engine.on('*', ev => { const line = log.format(ev); if (line) console.log(line) })
// "ガブリアスの じしん！" "急所に 当たった！ 効果は バツグンだ！ 相手の ヒードランに 197の ダメージ（-100%）"

log.name.item('heavy-duty-boots')                       // 'あつぞこブーツ' — the same names for your UI
createFormatter({ locale: 'en', getPokemon, perspective: 'p2' })   // p2's point of view ("the opposing …" flips)
createFormatter({ locale: 'en', getPokemon, messages: { 'move.use': '{pokemon} → {move}' } })  // override a sentence
```

- **Names come from data, not translations:** Pokémon, moves, abilities, items, types and natures use PokeAPI names (Showdown names for English). Conditions named after a move or ability (Stealth Rock, Trick Room, Taunt, Flash Fire …) reuse that name. Name packs: `ko`, `en`, `ja`, `zh-hans`, `zh-hant`, `fr`, `de`, `es`, `it` (`npm run fetch-pokeapi` regenerates them).
- **A locale is plain data:** `{ code, messages, terms, fallback?, postProcess? }`. Templates use `{param}`, optional parts `{?{pokemon}: }`, and plural forms `{ one, other }` (`Intl.PluralRules`). Variants are looked up as `key.variant` then `key` (e.g. `status.apply.burn` → `status.apply`).
- **Add a language:** `registerLocale({ code: 'fr', fallback: en, terms: { … }, messages: { 'move.use': '{pokemon} utilise {move} !', … } })` + `await loadNames('fr')`. Anything missing falls back to the fallback locale.
- `formatEvent(event, ctx, names?)` still works and is the Korean formatter.

### Damage calculator

```ts
import { calculateDamage } from '@kyasi/pokebattle-engine'

calculateDamage(
  { species: 'garchomp', level: 50, nature: 'jolly', evs: { attack: 252, speed: 252 } },
  { species: 'gholdengo', level: 50, evs: { hp: 4 } },
  'earthquake',
  { weather: 'sandstorm', reflect: false, isCrit: false },
)
// → { range: [180, …, 212], min: 180, max: 212, minPercent: 110.4, maxPercent: 130.1, koText: '확정 1타', desc: '252 Atk Garchomp Earthquake vs. …' }
```

### Data

- `getSpecies(slug)`, `getMove(slug)`: Showdown data in engine format, including Korean names.
- `koName.species | move | ability | item | type | nature`: Korean names from PokeAPI.
- `speciesSlug(showdownId)`, `speciesToShowdown(slug)` …: convert names in both directions.

## Testing

```bash
npm test                                 # unit tests (mapping coverage, abilities, switching, calc parity …)
npm run fuzz -- --battles 100000 --workers 4
```

### Fuzz tests (`scripts/fuzz.ts`)

Each battle is reproducible from its seed and varies three things:

- **Format:** singles 65% / doubles 15% / triples 10% / rotation 10% (rotation goes through `getAvailableActions` including rotations, plus some `'default'` choices). 20% of battles use team preview with a random team size.
- **Teams:** Showdown random-battle sets 50%, or "chaos teams" (random species, abilities, items, moves, EVs/IVs, levels 1–100, tera types).
- **Choices:** random or heuristic AI.

Invariants checked:

1. No exceptions.
2. Every action the engine offers (singles and rotation) is accepted by Showdown.
3. Zero unhandled protocol messages.
4. Every event refers to a real Pokémon.
5. **HP rebuilt from events alone equals the simulator's actual HP** (every Pokémon).
6. Faint count and winner are consistent.
7. Determinism: re-running the same seed gives the same log (1% sample).
8. **Fast path = Showdown original:** every battle is replayed with the hot-path patches off (`fast: false`), and the protocol logs must match byte for byte (`--no-fast-check` skips this).

The full 10 million battles run in parallel shards on GitHub Actions ("Fuzz (sharded)" workflow → Run workflow; default 10 shards × 1,000,000). The CI workflow runs 10,000 battles on every push.

## CLI

```bash
npx pokebattle play  --lang en              # you vs the AI (random-battle teams)
npx pokebattle play  --team my.txt --foe cpu.json --level 50
npx pokebattle watch --lang ja --seed 42    # AI vs AI battle log
npx pokebattle watch --json                 # JSON Lines: every engine event + its "text"
npx pokebattle sim   --battles 500 --vs heuristic --json
```

- `play` shows both active Pokémon with HP bars and your moves with type, power, PP and the damage range (`previewDamage`). Type a number to use a move, `t1` to Terastallize and use move 1, `s` to switch, `q` to quit.
- Team files: Showdown export text, or JSON (`PokemonSet[]` or `{ "pokemons": [...] }`).
- `--lang ko|en|ja` (or `POKEBATTLE_LANG`), `--seed N` (same seed and choices = same battle), `NO_COLOR` turns off colors.
- In this repo: `npm run cli -- watch --lang en`, `npm run simulate` (= `play`).

## Scripts

```bash
npm run bench -- 500                     # HeuristicAI vs RandomAI
npm run bench:compare                    # Showdown vs this engine, same battles (and checks the logs are identical)
npm run fetch-pokeapi                    # refresh PokeAPI data (src/data/pokeapi.json)
```

## License

MIT. Pokémon Showdown, @pkmn/sim and @smogon/calc are MIT. PokeAPI data is publicly available (see PokeAPI's terms of use). Pokémon is a trademark of Nintendo / Game Freak.
