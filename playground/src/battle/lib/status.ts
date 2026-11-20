// ─── 상태이상·휘발성 상태 설명 (툴팁·현황용, 9세대 규칙) ─────────────
// 이름은 엔진 용어(names.ts)를 쓰고 여기서는 "무슨 효과인지"만 적는다 (Pokestra 에서 옮김, ko/en).
import { msg, type Lang } from './messages'
import { statusLongName } from './names'

type Text2 = Record<Lang, string>

const STATUS_DESC: Record<string, Text2> = {
  burn: { ko: '물리 공격 데미지 절반, 매 턴 최대 HP의 1/16 데미지', en: 'Physical damage halved; loses 1/16 of max HP each turn' },
  paralysis: { ko: '스피드 절반, 25% 확률로 움직이지 못함', en: 'Speed halved; 25% chance to be unable to move' },
  poison: { ko: '매 턴 최대 HP의 1/8 데미지', en: 'Loses 1/8 of max HP each turn' },
  toxic: { ko: '매 턴 데미지가 1/16씩 커짐 (1/16 → 2/16 → …), 교체하면 1/16부터 다시', en: 'Damage grows by 1/16 each turn (1/16 → 2/16 → …); resets when switched out' },
  sleep: { ko: '1~3턴 동안 움직이지 못함', en: 'Cannot move for 1–3 turns' },
  freeze: { ko: '움직이지 못함. 매 턴 20% 확률로 풀리고, 불꽃 기술에 맞으면 바로 풀림', en: 'Cannot move; 20% chance to thaw each turn, thaws when hit by a Fire move' },
}

const PROTECT: Text2 = { ko: '이번 턴 대부분의 기술을 막음', en: 'Blocks most moves this turn' }
const PROTECT_CONTACT: Text2 = { ko: '이번 턴 대부분의 기술을 막고, 접촉한 상대에게 추가 효과', en: 'Blocks most moves this turn; punishes attackers that make contact' }
const DELAYED: Text2 = { ko: '2턴 뒤 이 자리에 공격이 떨어짐', en: 'An attack lands on this spot 2 turns later' }

const VOLATILE_DESC: Record<string, Text2> = {
  confusion: { ko: '2~5턴 동안 33% 확률로 자기 자신을 공격', en: '33% chance to hit itself for 2–5 turns' },
  flinch: { ko: '이번 턴 움직이지 못함', en: 'Cannot move this turn' },
  seeded: { ko: '매 턴 최대 HP의 1/8을 상대에게 빼앗김', en: 'Loses 1/8 of max HP to the opponent each turn' },
  bound: { ko: '교체 불가, 매 턴 최대 HP의 1/8 데미지 (4~5턴)', en: 'Cannot switch; loses 1/8 of max HP each turn (4–5 turns)' },
  infatuation: { ko: '50% 확률로 움직이지 못함', en: '50% chance to be unable to move' },
  curse: { ko: '매 턴 최대 HP의 1/4 데미지', en: 'Loses 1/4 of max HP each turn' },
  aqua_ring: { ko: '매 턴 최대 HP의 1/16 회복', en: 'Restores 1/16 of max HP each turn' },
  ingrain: { ko: '매 턴 최대 HP의 1/16 회복, 교체 불가', en: 'Restores 1/16 of max HP each turn; cannot switch' },
  magnet_rise: { ko: '땅 타입 기술에 맞지 않음 (5턴)', en: 'Immune to Ground moves (5 turns)' },
  taunt: { ko: '변화 기술을 쓸 수 없음 (3턴)', en: 'Cannot use status moves (3 turns)' },
  encore: { ko: '마지막에 쓴 기술만 쓸 수 있음 (3턴)', en: 'Can only use its last move (3 turns)' },
  yawn: { ko: '다음 턴이 끝나면 잠듦 (교체하면 풀림)', en: 'Falls asleep at the end of next turn (cured by switching)' },
  protect: PROTECT,
  obstruct: PROTECT_CONTACT,
  kings_shield: PROTECT_CONTACT,
  spiky_shield: PROTECT_CONTACT,
  baneful_bunker: PROTECT_CONTACT,
  silk_trap: PROTECT_CONTACT,
  burning_bulwark: PROTECT_CONTACT,
  endure: { ko: '이번 턴 HP 1을 남기고 버팀', en: 'Survives any hit with 1 HP this turn' },
  focus_energy: { ko: '급소에 맞을 확률 +2단계', en: 'Critical-hit ratio +2 stages' },
  substitute: { ko: '최대 HP의 1/4짜리 분신이 대신 공격을 받음', en: 'A decoy with 1/4 of max HP takes hits instead' },
  salt_cure: { ko: '매 턴 최대 HP의 1/8 데미지 (물·강철 타입은 1/4)', en: 'Loses 1/8 of max HP each turn (1/4 for Water/Steel)' },
  flash_fire: { ko: '불꽃 기술 위력 1.5배', en: 'Fire moves deal 1.5× damage' },
  heal_block: { ko: 'HP를 회복할 수 없음', en: 'Cannot restore HP' },
  embargo: { ko: '도구를 쓸 수 없음', en: 'Cannot use its held item' },
  destiny_bond: { ko: '다음 행동 전에 쓰러지면 쓰러뜨린 상대도 함께 쓰러짐', en: 'If it faints before its next move, the attacker faints too' },
  'future-sight': DELAYED,
  'doom-desire': DELAYED,
}

export const statusDesc = (status: string, lang: Lang): string | null => STATUS_DESC[status]?.[lang] ?? null
export const volatileDesc = (volatile: string, lang: Lang): string | null => VOLATILE_DESC[volatile]?.[lang] ?? null

/** 맹독 다음 데미지의 분자 (n/16). 9세대는 15/16 이 최대 */
export const toxicNext = (statusTurns: number | null | undefined) => Math.min(15, Math.max(0, statusTurns ?? 0) + 1)

export const STATUSES = ['paralysis', 'burn', 'poison', 'toxic', 'sleep', 'freeze'] as const

/** 상태이상 설명 한 줄 (툴팁) */
export function statusTip(status: string, turns: number | null | undefined, lang: Lang): string {
  const desc = statusDesc(status, lang)
  const parts = [desc ? msg(lang, 'statusTip', { name: statusLongName(status, lang), desc }) : statusLongName(status, lang)]
  if (status === 'toxic' && turns !== undefined && turns !== null) parts.push(msg(lang, 'toxicNextLong', { n: toxicNext(turns) }))
  if (status === 'sleep' && turns) parts.push(msg(lang, 'sleptLong', { n: turns }))
  return parts.join(' · ')
}
