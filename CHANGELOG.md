# Changelog

## Unreleased

- Stacked gimmicks (`options.stackGimmicks`): a Rayquaza that knows Dragon Ascent can Mega Evolve while holding a Z-Crystal, so Mega Evolution and a Z-Move can be combined (same turn or across turns). The games block this outside stacking, and so does the engine. That Mega Evolution is logged as `-mega` / `kind: 'mega'`, not Ultra Burst.
- `getAvailableActions` lists every legal gimmick combination in stacked battles (e.g. Mega + Z-Move, Mega + Tera, Mega + Z-Move + Tera), not only a few; Z-Move + Dynamax and Mega + Ultra Burst stay excluded.

## 0.1.0

First npm release.

- `BattleEngine`: Pokémon Showdown-accurate battles for Gen 1–9 (singles, doubles, triples, rotation) with typed events, `getRequest` / `submitAction`, team preview and rule options, about 1.6–1.9× faster per turn than the stock simulator with byte-identical logs.
- Battle logs in Korean, English and Japanese (`createFormatter`), name packs for more languages.
- Damage calculator on `@smogon/calc`, `previewDamage`.
- `HeuristicAI`, `RandomAI`, `simulateBattle`.
- Random battles (`createRandomBattle`, Gen 1–9), Metronome battles with free custom stats (`createMetronomeBattle`, `PokemonSet.customStats`), stacked gimmicks (`options.stackGimmicks`).
- Legends Z-A Mega Stones in `listItems({ include: ['Future'] })`.
- React hook `useBattle` (`@kyasi/pokebattle-engine/react`).
- CLI `npx pokebattle` (`play`, `watch`, `sim`).
- ESM + CommonJS, TypeScript types; Node 18+.
- One runtime dependency (`@smogon/calc`): the needed parts of Showdown's simulator are bundled, `@pkmn/sim` is an optional peer dependency (raw Showdown objects are typed as `ShowdownBattle` / `ShowdownPokemon` / `ShowdownSet` / `ShowdownSpecies`).
