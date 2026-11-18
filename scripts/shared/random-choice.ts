// ─── 무작위 다중 슬롯 선택 (doubles / triples) ───────────────
// Showdown 요청(req)만 보고 고른다. fuzz.ts · bench-compare.ts 공용.

interface Rng {
    int(min: number, max?: number): number
    pick<T>(arr: readonly T[]): T
    chance(percent: number): boolean
    shuffle<T>(arr: T[]): T[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function randomDoublesChoice(req: any, rng: Rng): string {
    if (req.forceSwitch) {
        const bench: number[] = req.side.pokemon.map((p: { active: boolean; condition: string }, i: number) => (!p.active && !p.condition.endsWith(' fnt') ? i + 1 : 0)).filter(Boolean)
        rng.shuffle(bench)
        return req.forceSwitch.map((f: boolean) => (f && bench.length ? `switch ${bench.pop()}` : 'pass')).join(', ')
    }
    const usedSwitch = new Set<number>()
    let tera = false
    return req.active.map((a: { moves: { disabled?: boolean; target?: string }[]; canTerastallize?: string; trapped?: boolean }, slot: number) => {
        if (req.side.pokemon[slot]?.condition?.endsWith(' fnt') || req.side.pokemon[slot]?.commanding) return 'pass'
        const bench: number[] = req.side.pokemon.map((p: { active: boolean; condition: string }, i: number) => (!p.active && !p.condition.endsWith(' fnt') && !usedSwitch.has(i + 1) ? i + 1 : 0)).filter(Boolean)
        if (!a.trapped && bench.length && rng.chance(10)) {
            const k = rng.pick(bench)
            usedSwitch.add(k)
            return `switch ${k}`
        }
        const moves = a.moves.map((m, i) => ({ m, i })).filter(x => !x.m.disabled)
        if (!moves.length) return 'move 1'
        const { m, i } = rng.pick(moves)
        let target = ''
        const n = req.active.length
        const foes = Array.from({ length: n }, (_, i) => i + 1)
        const allies = Array.from({ length: n }, (_, i) => -(i + 1)).filter(t => t !== -(slot + 1))
        if (['normal', 'any', 'adjacentFoe'].includes(m.target ?? '')) target = ` ${rng.pick(foes)}`
        else if (['adjacentAlly'].includes(m.target ?? '') && allies.length) target = ` ${rng.pick(allies)}`
        else if (['adjacentAllyOrSelf'].includes(m.target ?? '')) target = ` ${rng.pick([...allies, -(slot + 1)])}`
        let t = ''
        if (a.canTerastallize && !tera && rng.chance(15)) { t = ' terastallize'; tera = true }
        return `move ${i + 1}${target}${t}`
    }).join(', ')
}
