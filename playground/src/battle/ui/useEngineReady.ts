// 배틀 엔진 데이터(랜덤배틀 세트·기술표, 6~8세대는 그 세대 데이터) 준비. 세대마다 처음 한 번만 받는다.
import { useEffect, useState } from 'react'
import { DEFAULT_GEN, genReady, loadGen, type Gen } from '../lib/gimmick'

const loading = new Map<Gen, Promise<void>>()

export function useEngineReady(gen: Gen = DEFAULT_GEN) {
  const [, setLoaded] = useState(0)
  const [error, setError] = useState<{ gen: Gen; e: Error } | null>(null)
  const ready = genReady(gen)
  useEffect(() => {
    if (ready) return
    let alive = true
    let p = loading.get(gen)
    if (!p) loading.set(gen, (p = loadGen(gen)))
    p.then(
      () => { if (alive) setLoaded(n => n + 1) },
      (e: unknown) => {
        loading.delete(gen)
        if (alive) setError({ gen, e: e instanceof Error ? e : new Error(String(e)) })
      },
    )
    return () => { alive = false }
  }, [gen, ready])
  return { ready, error: error?.gen === gen ? error.e : null }
}
