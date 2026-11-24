// ─── 배틀 세션 훅 (Pokestra 에서 옮김 + 규칙·기권) ─────────────────
// 엔진 이벤트마다 화면용 프레임을 기록하고, 일정 간격으로 하나씩 드러낸다 (메시지 상자가 한 줄씩 보인다).
// 받아들여진 모든 행동(사람·AI)을 순서대로 기록해 리플레이 데이터로 내보낸다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Action, BattleAI, BattleEngine, BattleRequest, PlayerID } from '../lib/engine'
import type { Frame } from '../lib/frame'
import type { ReplayController, ReplayData } from '../lib/replay'
import { frameDelay } from '../lib/hud'
import { attachFrameCapture, buildReplayData, controllerAI, createEngine, type BattleSetup, type Controllers } from '../lib/frames'

export interface SessionOptions extends Controllers {
  /** 프레임 간 간격 (ms) */
  speed: number
}

export function useBattleSession() {
  const [engine, setEngine] = useState<BattleEngine | null>(null)
  const [ais, setAis] = useState<Partial<Record<PlayerID, BattleAI>>>({})
  const framesRef = useRef<Frame[]>([])
  const actionsRef = useRef<Action[]>([])
  const forfeitRef = useRef<PlayerID | undefined>(undefined)
  const setupRef = useRef<{ setup: BattleSetup; ctrl: Controllers } | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [revealed, setRevealed] = useState(0)
  const [speed, setSpeed] = useState(650)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [setup, setSetup] = useState<BattleSetup | null>(null)

  const allRevealed = revealed >= frames.length

  /** 시작: 엔진이 거절하면(팀 검사 BattleError 등) 그 문장을 돌려준다 */
  const start = useCallback((s: BattleSetup, opts: SessionOptions): string | null => {
    const ctrl = { p1: opts.p1, p2: opts.p2 }
    let e: BattleEngine
    const captured: Frame[] = []
    try {
      e = createEngine(s, ctrl)
      attachFrameCapture(e, f => captured.push(f))
      e.start()
    } catch (err) {
      return (err as Error).message
    }
    framesRef.current = captured
    actionsRef.current = []
    forfeitRef.current = undefined
    setupRef.current = { setup: s, ctrl }
    const nextAis: Partial<Record<PlayerID, BattleAI>> = {}
    for (const p of ['p1', 'p2'] as PlayerID[]) {
      const c = opts[p]
      if (c !== 'human') nextAis[p] = controllerAI(s.rule, c, s.seed, p)
    }
    setAis(nextAis)
    setEngine(e)
    setSetup(s)
    setSpeed(opts.speed)
    setPaused(false)
    setError(null)
    setFrames([...framesRef.current])
    setRevealed(0)
    setVersion(v => v + 1)
    return null
  }, [])

  const flush = useCallback(() => {
    setFrames([...framesRef.current])
    setVersion(v => v + 1)
  }, [])

  const submit = useCallback((action: Action) => {
    const e = engine
    if (!e) return
    try {
      e.submitAction(action)
      actionsRef.current.push(action)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
    flush()
  }, [engine, flush])

  /** 도망친다 = 기권 (리플레이에는 모든 행동 뒤의 기권으로 남는다) */
  const forfeit = useCallback((player: PlayerID) => {
    const e = engine
    if (!e || e.getState().phase === 'ended') return
    forfeitRef.current = player
    e.forfeit(player)
    flush()
  }, [engine, flush])

  // ── AI 자동 행동 (화면 재생이 끝난 뒤) ─────────────────────
  useEffect(() => {
    const e = engine
    if (!e || !allRevealed || paused) return
    if (e.getState().phase === 'ended') return
    const waiting = (p: PlayerID) => !!(e.getRequest(p) || e.getTeamPreview(p))
    const pending = (['p1', 'p2'] as PlayerID[]).filter(p => ais[p] && waiting(p))
    if (pending.length === 0) return
    const humanWaiting = (['p1', 'p2'] as PlayerID[]).some(p => !ais[p] && waiting(p))
    const delay = humanWaiting ? 0 : Math.min(400, speed)
    const t = setTimeout(() => {
      for (const p of pending) {
        if (!waiting(p)) continue
        const action = ais[p]!.chooseAction(e, p) ?? e.getAvailableActions(p)[0]
        if (!action) continue
        e.submitAction(action)
        actionsRef.current.push(action)
      }
      flush()
    }, delay)
    return () => clearTimeout(t)
  }, [engine, ais, allRevealed, paused, version, speed, flush])

  // ── 프레임 재생 ──────────────────────────────────────────
  useEffect(() => {
    if (revealed >= frames.length || paused) return
    const next = frames[revealed]!
    const t = setTimeout(() => setRevealed(r => r + 1), frameDelay(next, speed))
    return () => clearTimeout(t)
  }, [revealed, frames, paused, speed])

  const replayData = useCallback((): ReplayData | null => {
    const s = setupRef.current
    return s ? buildReplayData(s.setup, s.ctrl, actionsRef.current, forfeitRef.current) : null
  }, [])

  const skip = useCallback(() => setRevealed(framesRef.current.length), [])

  const current: Frame | null = frames[Math.max(0, Math.min(revealed, frames.length) - 1)] ?? null
  const request = useCallback((player: PlayerID): BattleRequest | null =>
    engine && allRevealed && !ais[player] ? engine.getRequest(player) : null, [engine, allRevealed, ais])
  const state = engine?.getState()
  // 팀 프리뷰: 사람 쪽이 고를 차례면 그 요청 (상대 팀도 함께 보여 준다)
  const human = (['p1', 'p2'] as PlayerID[]).find(p => !ais[p])
  const preview = engine && human ? engine.getTeamPreview(human) : null
  const inPreview = !!engine && state?.phase === 'team_preview'

  return {
    engine,
    setup,
    frames,
    revealed,
    current,
    allRevealed,
    request,
    submit,
    forfeit,
    start,
    skip,
    replayData,
    speed, setSpeed,
    paused, setPaused,
    error,
    isAI: (p: PlayerID) => !!ais[p],
    controller: (p: PlayerID): ReplayController => setupRef.current?.ctrl[p] ?? 'human',
    phase: state?.phase ?? null,
    preview,
    inPreview,
    winner: state?.winner ?? null,
    version,
  }
}

export type BattleSession = ReturnType<typeof useBattleSession>
