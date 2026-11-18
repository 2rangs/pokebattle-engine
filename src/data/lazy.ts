// ─── 무거운 데이터는 필요할 때만 ──────────────────────────────
// 랜덤배틀 세트(@pkmn/randoms, ~1 MB)와 Showdown 기술표(~3 MB)는 배틀 자체에는 필요 없다.
// preloadData() 가 불러오고, 번들(dist)에서는 별도 청크로 나뉜다.
//  - 랜덤배틀 세트: 동적 import → 번들러가 청크로 분리
//  - 기술표: 소스에서는 @pkmn/sim 이 이미 들고 있다(아무것도 안 함).
//    빌드 때 scripts/slim-sim.ts 가 이 파일의 loadLearnsets/learnsetsLoaded 를 실제 지연 로더로 바꾼다.
import type { TeamGenerators as TG } from '@pkmn/randoms'

let randoms: typeof TG | null = null

export async function loadRandoms(): Promise<void> {
    randoms ??= (await import('@pkmn/randoms')).TeamGenerators
}

export function getRandoms(): typeof TG | null {
    return randoms
}

export async function loadLearnsets(): Promise<void> {}

export function learnsetsLoaded(): boolean {
    return true
}

/** 1~8세대 배틀 데이터 (소스에서는 이미 있음, 빌드에서는 세대별 지연 청크) */
export async function loadGen(_gen: number): Promise<void> {}

export function genLoaded(_gen: number): boolean {
    return true
}
