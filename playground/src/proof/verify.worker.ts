// 웹 워커: 비교를 메인 스레드 밖에서 돌린다 (화면이 멈추지 않게). 취소는 메인에서 terminate().
import { preloadData } from '../../../dist-web/index.js'
import { compareBattles, type CompareResult, type Progress, type ShowdownRunner } from './compare'

export type Reference = 'bundled' | 'npm'
export type ToWorker = { type: 'run'; n: number; seedBase: number; rounds: number; reference: Reference }
export type FromWorker =
  | { type: 'progress'; progress: Progress | { phase: 'load'; done: 0; total: 0 } }
  | { type: 'result'; result: CompareResult }
  | { type: 'error'; message: string }

const post = (m: FromWorker) => postMessage(m)

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.type !== 'run') return
  try {
    post({ type: 'progress', progress: { phase: 'load', done: 0, total: 0 } })
    const [, showdown] = await Promise.all([
      preloadData(),
      m.reference === 'npm' ? import('./upstream').then(x => x.upstreamShowdown as ShowdownRunner) : Promise.resolve(undefined),
    ])
    let last = 0
    const result = await compareBattles({
      n: m.n, seedBase: m.seedBase, rounds: m.rounds, showdown,
      onProgress: p => {
        // 메시지를 너무 자주 보내지 않는다 (약 1% 단위)
        if (p.done === p.total || p.done - last >= Math.max(1, Math.floor(p.total / 100))) { last = p.done; post({ type: 'progress', progress: p }) }
      },
    })
    post({ type: 'result', result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
