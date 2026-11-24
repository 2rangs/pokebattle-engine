// 설치된 패키지(ESM)로 배틀·데이터·계산기·로그·React 훅 확인 (scripts/consumer-smoke.mjs 가 돌린다)
import { preloadData, createRandomBattle, createMetronomeBattle, HeuristicAI, createFormatter, calculateDamage, BattleEngine } from '@kyasi/pokebattle-engine'
import { useBattle } from '@kyasi/pokebattle-engine/react'
await preloadData()
const play = e => { const ai = { p1: new HeuristicAI({ seed: 1 }), p2: new HeuristicAI({ seed: 2 }) }; e.start(); for (let g = 0; !e.battle.ended && g < 3000; g++) for (const p of ['p1', 'p2']) if (!e.battle.ended && e.getRequest(p)) e.submitAction(ai[p].chooseAction(e, p)); return e }
const r = play(createRandomBattle({ seed: 7, level: 50 }))
const m = play(createMetronomeBattle({ seed: 3, stats: { hp: 300 } }))
const f = createFormatter({ locale: 'ko' })
const dmg = calculateDamage({ species: 'garchomp', level: 50, evs: { attack: 252 } }, { species: 'gholdengo', level: 50 }, 'earthquake')
await preloadData({ gens: [7] })
const g7 = play(createRandomBattle({ gen: 7, seed: 2 }))
if (!r.battle.ended || !m.battle.ended || !g7.battle.ended || !(dmg.max > 0) || typeof useBattle !== 'function') { console.error('esm FAILED'); process.exit(1) }
console.log(`esm ok: random winner=${r.getState().winner} turns=${r.getState().turn}, metronome ended=${m.battle.ended}, gen7 ended=${g7.battle.ended}, dmg ${dmg.min}-${dmg.max}, react hook ${typeof useBattle}, ko="${f.format({ type: 'turn_start', turn: 3 })}", engine ${typeof BattleEngine}`)
