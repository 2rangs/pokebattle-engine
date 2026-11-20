// ─── 배틀·리플레이 화면 공용 훅: 울음소리, 콘솔 디버그 훅, 리플레이 링크 ─────
import { useEffect, useRef, useState } from 'react'
import type { PlayerID } from '../lib/engine'
import { findPokemon, type Frame } from '../lib/frame'
import type { Lang } from '../lib/messages'
import { encodeReplay, type ReplayData } from '../lib/replay'
import { cryUrl } from '../lib/sprites'
import { formatBattleSummary, summarizeBattle } from '../lib/summary'

export const REPLAY_PATH = '/battle/replay'
export const replayHref = (encoded: string) => `#${REPLAY_PATH}?d=${encoded}`
export const replayUrl = (encoded: string) => `${window.location.origin}${window.location.pathname}${replayHref(encoded)}`

/** 리플레이 데이터 → 인코딩한 문자열 (준비 전·실패면 null) */
export function useEncodedReplay(data: ReplayData | null): string | null {
  const [encoded, setEncoded] = useState<{ of: ReplayData; s: string } | null>(null)
  useEffect(() => {
    if (!data) return
    let alive = true
    encodeReplay(data).then(s => { if (alive) setEncoded({ of: data, s }) }, () => {})
    return () => { alive = false }
  }, [data])
  return encoded && encoded.of === data ? encoded.s : null
}

/** 교체로 나올 때와 기절할 때 울음소리 (한 프레임씩 나아갈 때만, 느린 재생에서만) */
export function useBattleCries(frame: Frame | null, enabled: boolean, speed: number) {
  const last = useRef(-1)
  useEffect(() => {
    if (!frame) return
    const prev = last.current
    last.current = frame.index
    if (!enabled || speed < 250 || frame.index !== prev + 1) return
    const e = frame.event
    const id = e.type === 'switch' ? e.in_id : e.type === 'faint' ? e.pokemon_id : null
    const p = findPokemon(frame, id ?? undefined)
    const url = p && cryUrl(p.species)
    if (!url || typeof Audio === 'undefined') return
    try {
      const audio = new Audio(url)
      audio.volume = 0.4
      audio.play()?.catch(() => {})
    } catch { /* 오디오를 못 쓰는 환경 */ }
  }, [frame, enabled, speed])
}

/** 배틀·리플레이 화면이 떠 있는 동안 window.pokebattleDemo 로 현황을 노출한다 */
export function useDebugHook(frame: Frame | null, me: PlayerID, hideFoe: boolean, lang: Lang, sideName?: (p: PlayerID) => string) {
  const ref = useRef({ frame, me, hideFoe, lang, sideName })
  useEffect(() => { ref.current = { frame, me, hideFoe, lang, sideName } })
  useEffect(() => {
    window.pokebattleDemo = {
      summary: () => {
        const c = ref.current
        if (!c.frame) throw new Error('no battle on screen')
        return summarizeBattle(c.frame, { perspective: c.me, hideFoeExact: c.hideFoe })
      },
      text: (l?: Lang) => {
        const c = ref.current
        if (!c.frame) return ''
        return formatBattleSummary(summarizeBattle(c.frame, { perspective: c.me, hideFoeExact: c.hideFoe }), l ?? c.lang, { sideName: c.sideName })
      },
    }
    return () => { delete window.pokebattleDemo }
  }, [])
}

