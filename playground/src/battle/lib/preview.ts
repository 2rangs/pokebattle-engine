// ─── 손가락흔들기 랜덤 팀 미리보기 ─────────────────────────────
// 'random' 팀은 배틀 시드로 정해진다 → 같은 시드·옵션으로 엔진을 만들어 시작해 보고 팀을 읽는다.
// 설정 화면에서 보여 준 팀이 그 시드로 시작한 배틀의 팀과 같다 (테스트로 확인).
import { createMetronomeBattle, type PlayerID } from './engine'
import type { MetronomeSetup } from './replay'
import { metronomeOptions } from './frames'

export interface PreviewMon {
  species: string
  level: number
  ability: string
  types: string[]
}

/**
 * 시드 + 손가락흔들기 설정 → 양 팀 (고른 팀이 다 차지 않았으면 그쪽은 'random' 으로 대신 만든다.
 * 엔진은 진영마다 시드에서 따로 rng 를 뽑으므로 다른 쪽의 랜덤 팀은 그대로다).
 */
export function metronomePreview(seed: number, m: Omit<MetronomeSetup, 'p1Team' | 'p2Team'> & { p1Team: MetronomeSetup['p1Team'] | null; p2Team: MetronomeSetup['p2Team'] | null }): Record<PlayerID, PreviewMon[]> {
  const setup: MetronomeSetup = { ...m, p1Team: m.p1Team ?? 'random', p2Team: m.p2Team ?? 'random' }
  const e = createMetronomeBattle(metronomeOptions(seed, setup, { p1: 'human', p2: 'normal' }))
  e.start()
  const st = e.getState()
  const read = (p: PlayerID) => st.sides[p].team.map(x => ({ species: x.species, level: x.level, ability: x.ability, types: x.types.filter(Boolean) as string[] }))
  return { p1: read('p1'), p2: read('p2') }
}
