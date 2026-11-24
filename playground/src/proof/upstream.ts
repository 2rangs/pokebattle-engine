// ─── 선택: npm 의 @pkmn/sim 원본 패키지로 Showdown 쪽을 돌린다 ─────────────
// 기본("엔진에 들어 있는 Showdown")은 scripts/check-dist.ts 가 CI 에서 npm 원본과 같다고 확인하는 번들이다.
// 그것도 믿기 어렵다면 이 모드: 엔진 코드가 전혀 섞이지 않은 @pkmn/sim 을 따로 받아 같은 입력을 넣는다.
// 재생 루프는 Showdown 입력 로그 형식 그대로 (>start / >player / >p1 / >p2 / >forcetie).
import { Battle } from '@pkmn/sim'
import type { ShowdownRunner } from './compare'

export const upstreamShowdown: ShowdownRunner = inputLog => {
  let battle: Battle | null = null
  for (const line of inputLog) {
    const sp = line.indexOf(' ')
    const cmd = sp < 0 ? line.slice(1) : line.slice(1, sp)
    const rest = sp < 0 ? '' : line.slice(sp + 1)
    if (cmd === 'start') battle = new Battle(JSON.parse(rest))
    else if (!battle) throw new Error(`'${line}' before >start`)
    else if (cmd === 'player') {
      const sp2 = rest.indexOf(' ')
      battle.setPlayer(rest.slice(0, sp2) as 'p1', JSON.parse(rest.slice(sp2 + 1)))
    } else if (cmd === 'p1' || cmd === 'p2') {
      if (!battle.choose(cmd, rest)) throw new Error(`rejected '${line}'`)
    } else if (cmd === 'forcetie') battle.tie()
  }
  if (!battle) throw new Error('empty input log')
  return battle.log.filter(l => !l.startsWith('|t:|')).join('\n')
}
