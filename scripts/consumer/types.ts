// 설치된 패키지의 타입 확인 (nodenext / bundler / node10 세 가지로 tsc)
import { createRandomBattle, type BattleEvent, type PokemonSet, type MetronomeBattleOptions } from '@kyasi/pokebattle-engine'
import { useBattle, type UseBattleResult } from '@kyasi/pokebattle-engine/react'
const set: PokemonSet = { species: 'pikachu', level: 50, gender: null, ability: 'static', nature: 'timid', moves: ['thunderbolt'], customStats: { hp: 999 } }
const opts: MetronomeBattleOptions = { seed: 1, stats: { speed: 1 } }
const e = createRandomBattle({ seed: 1 })
e.on('damage', (ev: BattleEvent) => { if (ev.type === 'damage') ev.amount.toFixed() })
export const x: [PokemonSet, MetronomeBattleOptions, typeof useBattle, UseBattleResult | null] = [set, opts, useBattle, null]
