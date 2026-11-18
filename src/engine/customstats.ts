// ─── 자유 능력치 (Custom Stats Mod) ─────────────────────────────
// PokemonSet.customStats 로 HP·공격·방어·특공·특방·스피드 실수치를 직접 정한다.
// 노력치/개체값/성격으로는 닿지 않는 값(예: HP 999)이 필요해서, Showdown 규칙 하나를 런타임에 등록한다:
//  - onBegin (배틀 시작, 선두 등장 전): set.customStats 를 storedStats / baseStoredStats / maxhp / baseMaxhp / hp 에 적용
//  - 폼체인지(setSpecies)·updateMaxHp 가 종족값으로 다시 계산해도 커스텀 값을 유지
//  - 변신은 Showdown 그대로 상대의 (커스텀) 능력치를 복사한다 (HP 제외)
// 세트 필드는 Showdown 세트 객체에 그대로 실려 inputLog(>player …JSON) 에도 남으므로 replayInputLog 로 재생된다.
import { Dex } from '@pkmn/sim'
import type { Pokemon as PSPokemon } from '@pkmn/sim'

export const CUSTOM_STATS_RULE = 'Custom Stats Mod'
const RULE_ID = 'customstatsmod'

/** Showdown 스탯 키 (hp, atk, def, spa, spd, spe) → 값 */
export type PSCustomStats = Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>

/** 자유 능력치 허용 범위 */
export const CUSTOM_STAT_MIN = 1
export const CUSTOM_STAT_MAX = 9999

const BATTLE_STATS = ['atk', 'def', 'spa', 'spd', 'spe'] as const

type Patched = PSPokemon & { __customStats?: boolean }

function applyBattleStats(p: PSPokemon, cs: PSCustomStats): void {
    for (const k of BATTLE_STATS) {
        const v = cs[k]
        if (v === undefined) continue
        if (p.baseStoredStats) p.baseStoredStats[k] = v
        p.storedStats[k] = v
        const mod = (p as unknown as { modifiedStats?: Record<string, number> }).modifiedStats
        if (mod) mod[k] = v      // 1세대
    }
    p.speed = p.storedStats.spe
}

function applyCustomStats(p: Patched, cs: PSCustomStats): void {
    if (p.__customStats) return
    p.__customStats = true
    applyBattleStats(p, cs)
    if (cs.hp !== undefined) {
        if (p.baseStoredStats) p.baseStoredStats.hp = cs.hp
        p.baseMaxhp = cs.hp
        p.maxhp = cs.hp
        p.hp = cs.hp
    }
    // 폼체인지·변신 해제 시 종족값으로 다시 계산되는 것을 막는다 (변신 중에는 Showdown 이 상대 능력치를 복사)
    const setSpecies = p.setSpecies
    p.setSpecies = function (this: PSPokemon, ...args: Parameters<PSPokemon['setSpecies']>) {
        const r = setSpecies.apply(this, args)
        if (r && !args[2]) applyBattleStats(this, cs)
        return r
    }
    if (cs.hp !== undefined) p.updateMaxHp = () => { /* 커스텀 HP 유지 */ }
}

const STAT_RE = /^(hp|atk|def|spa|spd|spe)(\d+)$/

/** 진영별 팀 순번 → 커스텀 능력치  ⇄  규칙 값 */
export function encodeCustomStats(entries: { side: string; index: number; stats: PSCustomStats }[]): string {
    return entries
        .filter(e => Object.keys(e.stats).length)
        .map(e => [e.side, e.index, ...Object.entries(e.stats).map(([k, v]) => `${k}${v}`)].join('.'))
        .join(';')
}

export function decodeCustomStats(value: string): Map<string, PSCustomStats> {
    const out = new Map<string, PSCustomStats>()
    for (const entry of value.split(';')) {
        const [side, index, ...stats] = entry.trim().split('.')
        if (!side || !/^p[1-4]$/.test(side) || !index || !/^\d+$/.test(index)) throw new Error(`${CUSTOM_STATS_RULE}: 잘못된 항목 '${entry}'`)
        const cs: PSCustomStats = {}
        for (const st of stats) {
            const m = st.match(STAT_RE)
            const v = m ? Number(m[2]) : NaN
            if (!m || v < CUSTOM_STAT_MIN || v > CUSTOM_STAT_MAX) throw new Error(`${CUSTOM_STATS_RULE}: 잘못된 능력치 '${st}'`)
            cs[m[1] as keyof PSCustomStats] = v
        }
        out.set(`${side}.${Number(index)}`, cs)
    }
    return out
}

const RULE = {
    effectType: 'Rule',
    name: CUSTOM_STATS_RULE,
    desc: '포켓몬별 실수치를 직접 정한다 (@kyasi/pokebattle-engine). 값: p1.0.hp999.atk5;p2.1.spe1',
    hasValue: true,
    onValidateRule(value: string) {
        decodeCustomStats(value)
        return value
    },
    onBegin(this: { sides: { id: string; pokemon: PSPokemon[] }[]; ruleTable: { valueRules: Map<string, string> } }) {
        const value = this.ruleTable.valueRules.get(RULE_ID)
        if (!value) return
        const table = decodeCustomStats(value)
        for (const side of this.sides) {
            side.pokemon.forEach((p, i) => {
                const cs = table.get(`${side.id}.${i}`)
                if (cs) applyCustomStats(p, cs)
            })
        }
    },
}

/** 규칙을 기본 Dex 와 해당 세대 Dex 에 등록 (여러 번 불러도 된다) */
export function ensureCustomStatsRule(gen = 9): void {
    for (const dex of [Dex, Dex.forGen(gen)]) {
        const rulesets = dex.data.Rulesets as Record<string, unknown>
        if (!rulesets[RULE_ID]) rulesets[RULE_ID] = RULE
    }
}

/** 포맷 ID 에 이 규칙이 있으면 등록 (replay 용) */
export function ensureCustomStatsRuleFor(formatid: string): void {
    if (!formatid.toLowerCase().replace(/[^a-z0-9@,]/g, '').includes(RULE_ID)) return
    const m = formatid.match(/^gen(\d)/)
    ensureCustomStatsRule(m ? Number(m[1]) : 9)
}
