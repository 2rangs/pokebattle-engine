// ─── 샌드박스 랜덤 팀: 기믹을 겹쳐 볼 수 있게 7세대(메가스톤·Z크리스탈)와 8세대(거다이맥스) 랜덤배틀 세트를 섞고 테라 타입을 붙인다 ─────
// 배틀은 9세대 메커닉 + 'Stack Gimmicks Mod'. 7·8세대 데이터가 필요하다 (preloadData({ gens: [7, 8] })).
import { generateRandomTeam, getSpecies, PRNG, type PokemonSet } from './engine'
import { stripAutoNickname } from './names'

export function sandboxRandomTeam(seed: number, size: number, level = 50): PokemonSet[] {
  const rng = new PRNG(seed)
  const g7 = generateRandomTeam({ seed: rng.int(0x7fffffff), format: 'gen7randombattle', level })
  const g8 = generateRandomTeam({ seed: rng.int(0x7fffffff), format: 'gen8randombattle', level })
  const out: PokemonSet[] = []
  const seen = new Set<string>()
  for (let i = 0; out.length < size && i < 12; i++) {
    const set = (i % 2 === 0 ? g7 : g8)[Math.floor(i / 2)]
    if (!set || seen.has(set.species)) continue
    seen.add(set.species)
    const types = getSpecies(set.species)?.types ?? ['normal']
    out.push({ ...stripAutoNickname(set), teraType: types[rng.int(types.length)] ?? types[0] })
  }
  return out
}
