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
| Showdown learnsets | ~2.8 MB | `getLearnset`, `generateRandomSet` (without a `learnset`), `generateChaosTeam` |
| Random-battle sets | ~1.1 MB | `generateRandomTeam` |

```ts
await preloadData()   // loads both (separate chunks); battles, the damage calculator and names work without it
```

In an app build this took the battle page chunk from 8.7 MB to 3.4 MB. `npm run check:dist` builds and checks that the bundle plays byte-identical battles to the original `@pkmn/sim` and builds the same sets.

## Install

```bash
npm install @kyasi/pokebattle-engine
```

- **Node 18 or newer** (tested on 18, 20, 22 and 24), or any modern browser through a bundler (Vite, webpack, Next.js …).
- **One runtime dependency:** `@smogon/calc`. The parts of Showdown's simulator a battle needs are bundled inside the package, so `@pkmn/sim` is not installed. It is an optional peer dependency: install it only if you want its full types for the raw Showdown objects (`engine.battle`, `getShowdownPokemon`), e.g. `engine.battle as unknown as import('@pkmn/sim').Battle`.
- ESM and CommonJS both work: `import { BattleEngine } from '@kyasi/pokebattle-engine'` or `require('@kyasi/pokebattle-engine')`. The React hook is `@kyasi/pokebattle-engine/react` (React 18+, optional peer dependency).
- TypeScript types are included. If your project type-checks library files (`skipLibCheck: false`) without Node types, add `@types/node`: `@pkmn/sim`'s own declarations mention Node's `Buffer`. Vite, Next.js and most templates set `skipLibCheck: true`, which avoids it.
- The CLI comes with it: `npx pokebattle watch`.

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
  - A mid-turn switch (`reason: 'self_switch'`) says what caused it in `source`: a move (`{ kind: 'move', id: 'u-turn' | 'baton-pass' | 'shed-tail' | … }`), an item (`'eject-button'`, `'eject-pack'`) or an ability (`'emergency-exit'`, `'wimp-out'`). `switch` events carry the same `source`, and forced switches (`forced: true`) name the move or Red Card that dragged the Pokémon out.
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
| `dynamax: false` | Dynamax Clause | in battle |
| `megaEvolution: false` | Mega Evolution Clause (engine rule; also blocks Ultra Burst, Primal Reversion stays) | in battle |
| `zMoves: false` | Z-Move Clause (engine rule) | in battle |
| `stackGimmicks` | Stack Gimmicks Mod (engine rule) | in battle |
| `sleepClause` | Sleep Clause Mod | in battle |
| `endlessBattleClause` | Endless Battle Clause | in battle |
| `speciesClause` / `itemClause` | Species Clause / Item Clause = 1 | checked at start |
| `ohkoClause` / `evasionClause` | OHKO Clause / Evasion Clause | checked at start |

- "Checked at start" rules run through Showdown's `TeamValidator`; a violation throws `BattleError` from `start()`.
- Any other Showdown rule can still go in `config.rules` by name.
- Showdown has no rule that turns off all Mega Evolution or Z-Moves (only `Mega Rayquaza Clause`), so the engine registers `Mega Evolution Clause` and `Z-Move Clause` at runtime (`src/engine/gimmickrules.ts`); `replayInputLog` registers them too.
- **Stacking gimmicks** (`stackGimmicks: true`, meant for Gen 9): one Pokémon may Mega Evolve / Ultra Burst, Dynamax and Terastallize, in one turn or across turns (`{ type: 'move', …, mega: true, dynamax: true, terastallize: true }`). Each gimmick is still once per side per battle and the held item still decides Mega / Primal / Z (one item). They resolve in Showdown's queue order: Mega Evolution → Dynamax → Terastallization → move. A Z-Move can go with Terastallization but not with Dynamax (Max Moves replace it). Mega / Primal / Ultra forms Dynamax but don't Gigantamax; Mega Rayquaza (Dragon Ascent) works in Gen 9. The rule patches `Side.choose` / `chooseMove`, `canDynamaxNow`, `getDynamaxRequest` and `formeChange` at runtime, only in battles that have it (`src/engine/gimmickrules.ts`). `getAvailableActions` also lists the combined actions, and `new HeuristicAI({ useGimmicks: true })` (or `createAI(kind, seed, { useGimmicks: true })`) uses Mega / Z / Dynamax, combined when the rule is on.
- Gen 1–2 sets are cleaned up like Showdown's validator does before the battle: no ability or nature, a single Special (SpD DV / stat exp = SpA), the HP DV follows the other DVs, and no held item in Gen 1 (`adaptSetToGen`).
- With team preview on, `getRequest` returns `null` and `getTeamPreview(player)` returns `{ team, pick }`. `HeuristicAI`, `RandomAI` and `simulateBattle` get through team preview by themselves; `useBattle` does it for AI-controlled sides.

### Events

Every Showdown protocol message becomes a typed `BattleEvent` (`move_use`, `damage`, `heal`, `switch`, `faint`, `status_apply`, `stat_change`, `weather_change`, `terrain_change`, `side_start`, `ability_trigger`, `item_consume`, `terastallize`, `forme_change` …).

- `damage` / `heal` carry exact amounts plus `hp_after`, `effectiveness` and `crit`.
- HP and status changes that Showdown applies without a log line (Regenerator, Natural Cure …) also get compensating events.
- So replaying the event stream alone matches the simulator's HP exactly; the fuzz test checks this.

### Generations

```ts
await preloadData({ gens: [7] })          // Gen 1–8 data loads on demand (Gen 9 is built in)
new BattleEngine({ format: 'singles', gen: 7, p1, p2 })
```

| Gen | Formats | Gimmicks (`getRequest` → action flag) |
|---|---|---|
| 1–2 | singles | — |
| 3–4, 7–8 | singles, doubles | Gen 6–7: `can_mega_evolve` → `mega`, Gen 7: `can_zmove` (+ `moves[i].zmove`) → `zmove`, `can_ultra_burst` → `ultra_burst`, Gen 8: `can_dynamax` → `dynamax` |
| 5–6 | singles, doubles, triples | |
| 9 | singles, doubles, triples, rotation | `can_terastallize` → `terastallize` |

Mechanics, the damage calculator and random-battle sets follow the chosen generation. The log follows Showdown's wording for each gimmick:

- **Mega Evolution / Primal Reversion / Ultra Burst** emit `forme_change` then `mega_evolve` (`kind: 'mega' | 'primal' | 'ultra'`). Mega and Ultra Burst read as two sentences, the reaction and the change: "Charizard's Charizardite X is reacting to the Key Stone! Charizard has Mega Evolved into Mega Charizard!", Rayquaza (no stone, needs Dragon Ascent) "…'s fervent wish has reached Rayquaza!", Necrozma "Bright light is about to burst out of Necrozma! … regained its true power through Ultra Burst!". Primal Reversion happens on its own when Kyogre / Groudon with their orb come in.
- **Z-Moves:** `activate` `z-power` ("surrounded itself with its Z-Power!"), then a damaging Z-Move's `move_use` has `zeffect: true` ("unleashes its full-force Z-Move!"). Status Z-Move effects carry `zeffect: true` (`stat_change`, `volatile_apply`) or `source: 'z-power'` (`heal`) and have their own sentences ("boosted its Defense using its Z-Power!").
- **Dynamax:** `volatile_apply` `dynamax` (`gmax: true` for Gigantamax), `turns_remaining` counts the 3 turns, `volatile_remove` when it ends ("returned to its normal size!"). The max-HP change at the start and end comes as `heal` / `damage` with `source: 'dynamax'` and no sentence. `PokemonSet.gigantamax` (Showdown `Gigantamax: Yes`, kept by random Gen 8 sets) turns Dynamax into Gigantamax and Max Moves into G-Max Moves.
- **Damage preview:** `previewDamage(player, i, { mega, ultra_burst, zmove, dynamax, terastallize })` computes the move as it would be used with that gimmick (Mega form and ability, Z-Move incl. signature Z-Moves, Max / G-Max Move); `moveName` and `basePower` name the move that is actually used. A Dynamaxed attacker or defender is computed as Dynamaxed.

### Random battles

The same team generator, sets and rules as Pokémon Showdown's Random Battle (`@pkmn/randoms`):

```ts
await preloadData({ gens: [8] })
const battle = createRandomBattle({ gen: 8, seed: 42 })           // gen 1–9 singles, gen 9 'doubles' | 'monotype'
const lv50 = createRandomBattle({ seed: 42, level: 50 })           // every Pokémon at Lv. 50 instead of balanced levels

getRandomBattleSet('garchomp')
// → { species: 'garchomp', level: 74, roles: [{ role: 'Fast Support', moves: ['dragon-tail', 'earthquake', …], abilities: ['rough-skin'], tera_types: ['ground', 'steel'] }, …] }
getRandomBattleSets(9, 'doubles')                                   // the whole pool
randomBattleLevelStats(9)                                           // average level by base-stat-total band
```

- **Balanced levels:** each species has its own level so weaker Pokémon get a bump (Gen 9: Lv. 64–100). It tracks base stat total closely (r ≈ −0.78; ~6.5 levels per 100 BST) but is tuned per species: strong abilities or movepools sit lower (Koraidon 64, Palafin 77, Sneasler 74), drawbacks sit higher (Slaking and Regigigas 84). Sets holding a Mega Stone, Primal orb or Rusted Sword use the transformed form's level.
- The battle runs on the real random format (`gen9randombattle` …), so Species Clause, Sleep Clause and the other rules match Showdown.

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
- **Form names:** forms get their own name from PokeAPI's `pokemon_form_names` (`npx tsx scripts/fetch-pokeapi.ts --forms` rebuilds only these): `rotom-wash` → 워시로토무 / ウォッシュロトム, `charizard-mega-x` → 메가리자몽X / メガリザードンX, `ninetales-alola` → 나인테일 (알로라의 모습) / キュウコン (アローラのすがた). English keeps Showdown names (`Rotom-Wash`). Default forms use the plain species name, and a form with no data falls back to its species in the same language. Mega Evolution reads "리자몽은 메가리자몽X로 메가진화했다!".
- **A locale is plain data:** `{ code, messages, terms, fallback?, postProcess? }`. Templates use `{param}`, optional parts `{?{pokemon}: }`, and plural forms `{ one, other }` (`Intl.PluralRules`). Variants are looked up as `key.variant` then `key` (e.g. `status.apply.burn` → `status.apply`).
- **Add a language:** `registerLocale({ code: 'fr', fallback: en, terms: { … }, messages: { 'move.use': '{pokemon} utilise {move} !', … } })` + `await loadNames('fr')`. Anything missing falls back to the fallback locale.
- `formatEvent(event, ctx, names?)` still works and is the Korean formatter.

### Damage calculator

```ts
import { calculateDamage, formatKO } from '@kyasi/pokebattle-engine'

const r = calculateDamage(
  { species: 'garchomp', level: 50, nature: 'jolly', evs: { attack: 252, speed: 252 } },
  { species: 'gholdengo', level: 50, evs: { hp: 4 } },
  'earthquake',
  { weather: 'sandstorm', reflect: false, isCrit: false },
)
// → { range: [180, …, 212], min: 180, max: 212, minPercent: 110.4, maxPercent: 130.1, koText: '확정 1타', desc: '252 Atk Garchomp Earthquake vs. …' }
formatKO(r, 'en')   // 'guaranteed OHKO' (koText is Korean; formatKO takes 'ko' | 'en' | 'ja')
```

### Data

- `getSpecies(slug)`, `getMove(slug)`: Showdown data in engine format, including Korean names.
- `getLearnset(species, { gen? })`: PokeAPI move slugs the species can learn in that gen (default 9), using Showdown's validator rules (`Dex.species.getMovePool`): its own learnset plus prevos, base forme for formes without their own learnset (megas, Rotom/Necrozma formes add the base forme), Gen 9 = moves with a Gen 9 source, Gen 1–8 = sources up to that gen; moves missing from that gen are dropped. Event-only move combinations are not checked. Needs `await preloadData()` (plus `{ gens: [n] }` for Gen 1–8) and throws otherwise; throws for an unknown species.
- `listItems({ gen? })`, `getItem(slug)`: holdable items for that gen (no Poké Balls, no items missing from that gen): `{ name, showdown, num, effect, nameKo, berry, megaStone?, zCrystal?, zMoveType?, itemUser?, flingPower? }` (`itemUser`: the species a Mega Stone, signature Z-Crystal or Primal orb is for). Item icons: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/{name}.png`.
- `getSpecies(slug).abilities`: `{ name, hidden, slot }[]` including the hidden ability. `NATURE_TABLE`: boosted / hindered stat per nature.
- `koName.species | move | ability | item | type | nature`: Korean names from PokeAPI.
- `speciesSlug(showdownId)`, `speciesToShowdown(slug)` …: convert names in both directions.

## Testing

```bash
npm test                                 # unit tests (mapping coverage, abilities, switching, calc parity …) + regression snapshots
npm run regression -- --random 300       # every move, ability and item + random battles Gen 1–9 + doubles
npm run fuzz -- --battles 100000 --workers 4
```

### Regression sweep (`scripts/regression.ts`)

The battle rules come from Showdown, so the sweep checks what the engine adds on top of them. It plays every Gen 9 move (and every older move in the latest gen that has it), every ability and every held item in its own battle, then Showdown random battles for Gens 1–9 and Gen 9 doubles. It reports:

| Check | Meaning |
|---|---|
| `protocol` | a Showdown log line the engine doesn't handle |
| `generic` | a log line that fell back to a catch-all sentence ("{pokemon}: {effect}") instead of a real one |
| `untranslated` | English or raw slugs inside a Korean log line |
| `silent` | an event with no sentence that Showdown does show |
| `event-id` | an event missing its Pokémon id |
| `replay` | HP, status or stat stages rebuilt from events alone differ from the real state (an event is missing data) |
| `request` | an action the engine offers that Showdown rejects, or one Showdown accepts that the engine doesn't offer |
| `preview` | real damage outside the damage preview range |
| `crash` | an exception |

`--strict` exits non-zero on any finding not listed as intended (CI runs it). `--case random:gen2#12` replays one battle and writes its log. Reports go to `.scratch/regression/findings.{md,json}`.

`src/tests/engine/regression.test.ts` pins the full Korean and English log of a fixed-seed random battle for every generation plus doubles. A change in rules, events or wording shows up as a snapshot diff; update it on purpose with `npx vitest run -u`.

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
npx pokebattle watch --level 50             # every Pokémon at level 50 (random teams default to balanced levels 64–100)
npx pokebattle watch --gen 7 --lang en      # Gen 7 random battle (Mega Evolution, Z-Moves)
npx pokebattle watch --json                 # JSON Lines: every engine event + its "text"
npx pokebattle sim   --battles 500 --vs heuristic --json
```

- `play` shows both active Pokémon with HP bars and your moves with type, power, PP and the damage range (`previewDamage`). Type a number to use a move, `t1` to Terastallize and use move 1 (`m1` Mega Evolve, `z1` Z-Move, `d1` Dynamax in older gens), `s` to switch, `q` to quit.
- Team files: Showdown export text, or JSON (`PokemonSet[]` or `{ "pokemons": [...] }`).
- `--lang ko|en|ja` (or `POKEBATTLE_LANG`), `--seed N` (same seed and choices = same battle), `NO_COLOR` turns off colors.
- In this repo: `npm run cli -- watch --lang en`, `npm run simulate` (= `play`).

## Scripts

Developing this repository needs Node 20 or newer (the test runner); the published package runs on Node 18+.

```bash
npm run bench -- 500                     # HeuristicAI vs RandomAI
npm run bench:compare                    # Showdown vs this engine, same battles (and checks the logs are identical)
npm run fetch-pokeapi                    # refresh PokeAPI data (src/data/pokeapi.json)
npm run lint:package                     # publint + are-the-types-wrong on the packed package
npm run smoke:pack                       # pack, install into a fresh project, use it like a consumer (ESM, CJS, /react, CLI, types)
```

## Releasing

1. Update `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Commit, then push a tag with the same version: `git tag v0.1.0 && git push origin v0.1.0`.
3. `.github/workflows/release.yml` publishes to npm with provenance. It needs an `NPM_TOKEN` secret (npm automation or granular token) in the repository settings. `prepublishOnly` re-runs the type check, tests, build, package lint and the install test first.

CI runs the tests on Node 20, 22 and 24, and installs the packed package into a fresh project on Node 18, 20, 22 and 24.

## License

MIT. Pokémon Showdown, @pkmn/sim and @smogon/calc are MIT. PokeAPI data is publicly available (see PokeAPI's terms of use). Pokémon is a trademark of Nintendo / Game Freak.
