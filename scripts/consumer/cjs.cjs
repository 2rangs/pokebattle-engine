// 설치된 패키지(CommonJS)로 배틀·React 훅 확인 (scripts/consumer-smoke.mjs 가 돌린다)
const { preloadData, createRandomBattle, HeuristicAI } = require('@kyasi/pokebattle-engine')
const { useBattle } = require('@kyasi/pokebattle-engine/react')
preloadData().then(() => {
  const e = createRandomBattle({ seed: 11, level: 50 }); const ai = new HeuristicAI({ seed: 1 }); e.start()
  for (let g = 0; !e.battle.ended && g < 3000; g++) for (const p of ['p1', 'p2']) if (!e.battle.ended && e.getRequest(p)) e.submitAction(ai.chooseAction(e, p))
  if (!e.battle.ended || typeof useBattle !== 'function') { console.error('cjs FAILED'); process.exit(1) }
  console.log(`cjs ok: winner=${e.getState().winner} turns=${e.getState().turn}, react hook ${typeof useBattle}`)
}).catch(err => { console.error(err); process.exit(1) })
