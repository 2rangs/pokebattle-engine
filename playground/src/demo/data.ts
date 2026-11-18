// ─── 엔진 데이터 준비 ─────────────────────────────────────────
// 9세대 랜덤배틀 세트·기술표 + 일본어 이름 팩 (ko·en 은 엔진에 내장). 처음 한 번만 받는다.
import { useEffect, useState } from 'react'
import { loadNames, preloadData } from '../engine'

let ready: Promise<void> | null = null
let done = false

export function loadDemoData(): Promise<void> {
  ready ??= Promise.all([preloadData(), loadNames('ja')]).then(() => { done = true })
  // 실패하면 다음 호출에서 다시 시도
  ready.catch(() => { ready = null })
  return ready
}

export function useEngineReady(): { ready: boolean; error: Error | null } {
  const [state, setState] = useState<{ ready: boolean; error: Error | null }>({ ready: done, error: null })
  useEffect(() => {
    if (done) return
    let alive = true
    loadDemoData().then(
      () => { if (alive) setState({ ready: true, error: null }) },
      (e: unknown) => { if (alive) setState({ ready: false, error: e instanceof Error ? e : new Error(String(e)) }) },
    )
    return () => { alive = false }
  }, [])
  return state
}
