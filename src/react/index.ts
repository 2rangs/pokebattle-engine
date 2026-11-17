// ─── React 바인딩 ────────────────────────────────────────────
// import { useBattle } from '@kyasi/pokebattle-engine/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// 메인 엔트리를 패키지 이름으로 참조 → 번들 시 엔진이 중복 포함되지 않는다
import { BattleEngine } from '@kyasi/pokebattle-engine'
import type { Action, BattleAI, BattleConfig, BattleEvent, BattleRequest, BattleState, PlayerID } from '@kyasi/pokebattle-engine'

export interface UseBattleOptions {
    /** 지정한 쪽은 AI 가 자동으로 행동 */
    ai?: Partial<Record<PlayerID, BattleAI>>
}

export interface UseBattleResult {
    engine:   BattleEngine | null
    state:    BattleState | null
    log:      BattleEvent[]
    requests: Partial<Record<PlayerID, BattleRequest | null>>
    submit:   (action: Action) => void
    error:    Error | null
    /** 새 배틀로 리셋 */
    reset:    (config?: BattleConfig) => void
}

/**
 * 배틀 엔진을 React 상태로 감싸는 훅.
 * config 가 null 이면 대기. AI 가 지정된 쪽은 요청이 생기면 자동 제출한다.
 */
export function useBattle(config: BattleConfig | null, options: UseBattleOptions = {}): UseBattleResult {
    const [engine, setEngine] = useState<BattleEngine | null>(null)
    const [version, setVersion] = useState(0)
    const [error, setError] = useState<Error | null>(null)
    const aiRef = useRef(options.ai)
    aiRef.current = options.ai

    const create = useCallback((cfg: BattleConfig | null) => {
        if (!cfg) { setEngine(null); return }
        try {
            const e = new BattleEngine(cfg)
            e.on('*', () => setVersion(v => v + 1))
            e.start()
            setEngine(e)
            setError(null)
        } catch (err) {
            setError(err as Error)
        }
    }, [])

    useEffect(() => { create(config) }, [config, create])

    const runAI = useCallback((e: BattleEngine) => {
        const ai = aiRef.current
        if (!ai) return
        for (let guard = 0; guard < 20 && e.getState().phase !== 'ended'; guard++) {
            let acted = false
            for (const p of ['p1', 'p2'] as PlayerID[]) {
                const bot = ai[p]
                if (!bot || !e.getRequest(p)) continue
                const action = bot.chooseAction(e, p)
                if (action) { e.submitAction(action); acted = true }
            }
            if (!acted) break
        }
    }, [])

    useEffect(() => {
        if (engine) runAI(engine)
    }, [engine, version, runAI])

    const submit = useCallback((action: Action) => {
        if (!engine) return
        try {
            engine.submitAction(action)
            setError(null)
        } catch (err) {
            setError(err as Error)
        }
    }, [engine])

    const state = useMemo(() => (engine ? engine.snapshot() : null), [engine, version])
    const log = useMemo(() => (engine ? [...engine.getState().log] : []), [engine, version])
    const requests = useMemo(() => engine ? {
        p1: engine.getRequest('p1'),
        p2: engine.getRequest('p2'),
    } : {}, [engine, version])

    return { engine, state, log, requests, submit, error, reset: (cfg?: BattleConfig) => create(cfg ?? config) }
}
