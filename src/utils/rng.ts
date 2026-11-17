// ─── 시드 기반 의사 난수 생성기 (mulberry32) ─────────────────
// 같은 seed → 같은 배틀 결과 (리플레이/테스트 재현용)

export type RandomFn = () => number

export class PRNG {
    private state: number
    readonly initialSeed: number

    constructor(seed: number = Math.floor(Math.random() * 0x7fffffff)) {
        this.initialSeed = seed >>> 0
        this.state = this.initialSeed
    }

    /** [0, 1) 실수 */
    next(): number {
        this.state = (this.state + 0x6d2b79f5) >>> 0
        let t = this.state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    /** [min, max] 정수 (max 미지정 시 [0, min)) */
    int(min: number, max?: number): number {
        if (max === undefined) return Math.floor(this.next() * min)
        return min + Math.floor(this.next() * (max - min + 1))
    }

    /** numerator/denominator 확률 */
    chance(numerator: number, denominator = 100): boolean {
        return this.next() * denominator < numerator
    }

    pick<T>(items: readonly T[]): T {
        if (items.length === 0) throw new Error('PRNG.pick: empty array')
        return items[this.int(items.length)]!
    }

    shuffle<T>(items: T[]): T[] {
        for (let i = items.length - 1; i > 0; i--) {
            const j = this.int(i + 1)
            ;[items[i], items[j]] = [items[j]!, items[i]!]
        }
        return items
    }

    /** 현재 내부 상태 (저장/복원용) */
    getState(): number {
        return this.state
    }

    setState(state: number): void {
        this.state = state >>> 0
    }

    /** () => number 형태로 사용 */
    get fn(): RandomFn {
        return () => this.next()
    }
}
