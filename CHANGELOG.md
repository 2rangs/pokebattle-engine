# Changelog

## 1.0.0

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
- Showdown (`@pkmn/sim`, `@pkmn/randoms`) and `@smogon/calc` are installed as dependencies; the package contains only the engine's own code.
