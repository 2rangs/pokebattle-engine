// 배틀 엔진 데이터(9세대 랜덤배틀 세트·기술표) 준비. 처음 한 번만 받는다.
import { useEffect, useState } from 'react'
import { preloadData } from '../lib/engine'

let ready: Promise<void> | null = null
let done = false

export function useEngineReady() {
  const [state, setState] = useState<{ ready: boolean; error: Error | null }>({ ready: done, error: null })
  useEffect(() => {
    if (done) return
    let alive = true
    ready ??= preloadData().then(() => { done = true })
    ready.then(
      () => { if (alive) setState({ ready: true, error: null }) },
      (e: unknown) => { if (alive) setState({ ready: false, error: e instanceof Error ? e : new Error(String(e)) }) },
    )
    return () => { alive = false }
  }, [])
  return state
}
