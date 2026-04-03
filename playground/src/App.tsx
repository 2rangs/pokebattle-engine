import { useState, useEffect, useRef, useCallback } from 'react'
import { BattleEngine } from '../../src/engine/BattleEngine'
import { preloadData } from '../../src/data/loader'
import { loadTeam } from '../../src/utils/parseShowdown'
import type { BattleState, BattleEvent } from '../../src/types/battle'
import type { BattlePokemon } from '../../src/types/pokemon'
import p1Json from '../../src/data/p1_sample.json'
import p2Json from '../../src/data/p2_sample.json'

// ─── 도감번호 ─────────────────────────────────────────────────
const SPECIES_ID: Record<string, number> = {
  darkrai: 491, 'great-tusk': 984, gholdengo: 1000,
  kingambit: 983, glimmora: 970, dragonite: 149,
  dondozo: 977, blissey: 242, corviknight: 823,
  'weezing-galar': 110, gliscor: 472, toxapex: 748,
}
function getSpriteBack(species: string) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${SPECIES_ID[species] ?? 0}.png`
}
function getSpriteFront(species: string) {
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${SPECIES_ID[species] ?? 0}.png`
}

function hpColor(r: number) {
  if (r > 0.5) return '#58c858'
  if (r > 0.2) return '#f8d030'
  return '#f85040'
}

const STATUS_LABEL: Record<string, string> = {
  burn: 'BRN', freeze: 'FRZ', paralysis: 'PAR',
  poison: 'PSN', toxic: 'TOX', sleep: 'SLP',
}

const TYPE_COLOR: Record<string, string> = {
  normal: '#A8A878', fire: '#F08030', water: '#6890F0',
  grass: '#78C850', electric: '#F8D030', ice: '#98D8D8',
  fighting: '#C03028', poison: '#A040A0', ground: '#E0C068',
  flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
  rock: '#B8A038', ghost: '#705898', dragon: '#7038F8',
  dark: '#705848', steel: '#B8B8D0', fairy: '#EE99AC',
}

// ─── HP 바 컴포넌트 ───────────────────────────────────────────
function HpBar({ pokemon, showNum = false }: { pokemon: BattlePokemon; showNum?: boolean }) {
  const r = pokemon.hp / pokemon.max_hp
  return (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#333', letterSpacing: 1 }}>
          {pokemon.nickname.toUpperCase()}
        </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {pokemon.status && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 2,
                  background: '#e0e0e0', color: '#555', border: '1px solid #aaa',
                  fontFamily: 'monospace',
                }}>
              {STATUS_LABEL[pokemon.status]}
            </span>
            )}
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#555' }}>
            Lv{pokemon.level}
          </span>
          </div>
        </div>
        <div style={{
          background: '#604830',
          borderRadius: 4, height: 10, overflow: 'hidden',
          border: '2px solid #483820', boxSizing: 'border-box',
        }}>
          <div style={{
            width: `${Math.max(0, r * 100)}%`, height: '100%',
            background: hpColor(r), transition: 'width 0.5s ease, background 0.5s',
            borderRadius: 2,
          }} />
        </div>
        {showNum && (
            <div style={{
              fontFamily: 'monospace', fontSize: 12, textAlign: 'right',
              marginTop: 2, color: '#333', fontWeight: 600,
            }}>
              {pokemon.hp}<span style={{ color: '#888' }}>/{pokemon.max_hp}</span>
            </div>
        )}
      </div>
  )
}

// ─── 이벤트 → 로그 ───────────────────────────────────────────
function eventToLog(e: BattleEvent, eng: BattleEngine): { text: string; delay: number } | null {
  const n = (id: string) => eng.getPokemon(id)?.nickname?.toUpperCase() ?? id
  switch (e.type) {
    case 'turn_start':    return { text: `— 턴 ${e.turn} —`, delay: 0 }
    case 'move_use':      return { text: `${n(e.pokemon_id)}의\n${e.move.name}!`, delay: 200 }
    case 'move_miss':     return { text: `공격이 빗나갔다!`, delay: 400 }
    case 'move_fail':     return { text: `실패! (${e.reason})`, delay: 400 }
    case 'damage':        return { text: `${n(e.pokemon_id)}에게\n${e.amount} 데미지!`, delay: 400 }
    case 'heal':          return { text: `${n(e.pokemon_id)}의\nHP가 회복됐다!`, delay: 400 }
    case 'faint':         return { text: `${n(e.pokemon_id)}은(는)\n쓰러졌다!`, delay: 500 }
    case 'status_apply':  return { text: `${n(e.pokemon_id)}은(는)\n${e.status} 상태!`, delay: 400 }
    case 'status_remove': return { text: `${n(e.pokemon_id)}의\n${e.status} 해제!`, delay: 400 }
    case 'stat_change': {
      const s = e.stages > 0 ? '올랐다!' : '내려갔다!'
      return { text: `${n(e.pokemon_id)}의\n${e.stat} ${s}`, delay: 400 }
    }
    case 'weather_change':
      return { text: e.weather ? `${e.weather}\n날씨가 됐다!` : `날씨가\n돌아왔다!`, delay: 400 }
    case 'switch':
      return { text: `가라,\n${n(e.in_id)}!`, delay: 400 }
    case 'battle_end':
      return { text: e.winner === 'p1' ? `승리!\n배틀 종료!` : `패배...\n배틀 종료`, delay: 600 }
    default: return null
  }
}

// ─── 파티 도트 ───────────────────────────────────────────────
function PartyDots({ team }: { team: BattlePokemon[] }) {
  return (
      <div style={{ display: 'flex', gap: 5 }}>
        {team.map(p => (
            <div key={p.id} style={{
              width: 12, height: 12, borderRadius: '50%',
              background: p.fainted ? '#888' : p.hp / p.max_hp > 0.5 ? '#58c858' : p.hp / p.max_hp > 0.2 ? '#f8d030' : '#f85040',
              border: '1.5px solid #483820',
              boxShadow: p.fainted ? 'none' : '0 0 4px rgba(0,0,0,0.3)',
            }} />
        ))}
      </div>
  )
}

export default function App() {
  const engineRef  = useRef<BattleEngine | null>(null)
  const eventQueue = useRef<{ event: BattleEvent; snap: BattleState }[]>([])
  const processing = useRef(false)

  const [battleState, setBattleState] = useState<BattleState | null>(null)
  const [logText, setLogText]         = useState('무엇을 할까?')
  const [logs, setLogs]               = useState<string[]>([])
  const [phase, setPhase]             = useState<'waiting' | 'switching' | 'ended' | 'animating'>('waiting')
  const [view, setView]               = useState<'main' | 'fight' | 'party'>('main')
  const logEndRef = useRef<HTMLDivElement>(null)

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  // ─── 큐 처리 ─────────────────────────────────────────────
  const processQueue = useCallback(async () => {
    if (processing.current) return
    processing.current = true
    setPhase('animating')

    while (eventQueue.current.length > 0) {
      const item = eventQueue.current.shift()!
      const eng  = engineRef.current!
      const entry = eventToLog(item.event, eng)
      if (entry) {
        await sleep(entry.delay)
        setLogText(entry.text)
        setLogs(prev => [...prev.slice(-30), entry.text.replace('\n', ' ')])
        setBattleState({ ...item.snap })
      }
    }

    processing.current = false
    const eng = engineRef.current!
    const final = eng.getState()
    setBattleState({ ...final })

    if (final.phase === 'ended') {
      setPhase('ended')
    } else if (final.phase === 'switching') {
      const p2 = final.sides.p2
      const p1 = final.sides.p1

      if (p2.active.every(p => p.fainted) && p2.team.some(p => !p.fainted)) {
        await sleep(500)
        const alive = p2.team.filter(p => !p.fainted)
        const next  = alive[Math.floor(Math.random() * alive.length)]!
        eng.submitAction({ type: 'switch', player: 'p2', pokemon_id: p2.active[0]!.id, switch_to_id: next.id })
        await processQueue()
        return
      }
      if (p1.active.every(p => p.fainted) && p1.team.some(p => !p.fainted)) {
        setLogText('다음 포켓몬을\n선택하세요!')
        setPhase('switching')
        setView('party')
      } else {
        setLogText('무엇을 할까?')
        setPhase('waiting')
        setView('main')
      }
    } else {
      setLogText('무엇을 할까?')
      setPhase('waiting')
      setView('main')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    async function init() {
      await preloadData()
      const eng = new BattleEngine({
        format: 'singles',
        p1: { name: 'Player', team: loadTeam(p1Json as any) },
        p2: { name: 'CPU',    team: loadTeam(p2Json as any) },
      })
      eng.on('*', (event) => {
        eventQueue.current.push({ event, snap: { ...eng.getState() } })
      })
      engineRef.current = eng
      setBattleState({ ...eng.getState() })
    }
    init()
  }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const cpuAct = useCallback(() => {
    const eng = engineRef.current!
    const active = eng.getState().sides.p2.active[0]!
    const avail  = active.moves.map((s, i) => ({ s, i })).filter(({ s }) => s && !s.disabled && s.pp > 0)
    const picked = avail.length > 0 ? avail[Math.floor(Math.random() * avail.length)]! : { i: 0 }
    eng.submitAction({ type: 'move', player: 'p2', pokemon_id: active.id, move_index: picked.i as 0|1|2|3 })
  }, [])

  const handleMove = useCallback((idx: number) => {
    if (phase !== 'waiting') return
    const eng = engineRef.current!
    const active = eng.getState().sides.p1.active[0]!
    cpuAct()
    eng.submitAction({ type: 'move', player: 'p1', pokemon_id: active.id, move_index: idx as 0|1|2|3 })
    setView('main')
    processQueue()
  }, [phase, cpuAct, processQueue])

  const handleSwitch = useCallback((targetId: string) => {
    const eng = engineRef.current!
    const p1  = eng.getState().sides.p1
    if (phase === 'switching') {
      eng.submitAction({ type: 'switch', player: 'p1', pokemon_id: p1.active[0]!.id, switch_to_id: targetId })
    } else {
      eng.submitAction({ type: 'switch', player: 'p1', pokemon_id: p1.active[0]!.id, switch_to_id: targetId })
      cpuAct()
    }
    setView('main')
    processQueue()
  }, [phase, cpuAct, processQueue])

  if (!battleState) return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh',
        background: '#c0e8f8',
        fontFamily: '"Press Start 2P", monospace',
        fontSize: 14, color: '#333',
      }}>
        Loading...
      </div>
  )

  const p1 = battleState.sides.p1
  const p2 = battleState.sides.p2
  const p1Active = p1.active[0]!
  const p2Active = p2.active[0]!
  const canAct = phase === 'waiting'

  // GBA 화면 비율 240×160 → 2배 = 480×320, 우리는 더 크게
  return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh',
        background: '#1a1a2e',
        fontFamily: '"Segoe UI", sans-serif',
      }}>
        {/* GBA 외형 */}
        <div style={{
          width: 800, height: 560,
          background: '#e8e0d0',
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.3)',
          overflow: 'hidden',
          position: 'relative',
          border: '3px solid #b8b0a0',
        }}>

          {/* 배틀 필드 (상단 2/3) */}
          <div style={{
            height: 340,
            background: 'linear-gradient(180deg, #a8d8f0 0%, #d0eef8 40%, #98c848 40%, #78a830 55%, #c8b870 55%, #e8d890 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* 날씨/필드 표시 */}
            {(battleState.field.weather || battleState.field.terrain) && (
                <div style={{
                  position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.5)', color: '#fff',
                  fontSize: 11, padding: '3px 10px', borderRadius: 10,
                  fontWeight: 600, letterSpacing: 1,
                }}>
                  {battleState.field.weather ?? battleState.field.terrain}
                </div>
            )}

            {/* ─── 상대 포켓몬 영역 (우측 상단) ─── */}
            <div style={{
              position: 'absolute', top: 16, right: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
            }}>
              {/* 상대 스프라이트 */}
              <img
                  src={getSpriteFront(p2Active.species)}
                  alt={p2Active.nickname}
                  style={{
                    width: 140, height: 140,
                    imageRendering: 'pixelated',
                    filter: p2Active.fainted
                        ? 'grayscale(100%) brightness(0.4)'
                        : 'drop-shadow(2px 4px 6px rgba(0,0,0,0.4))',
                    transition: 'filter 0.5s',
                    marginBottom: -10,
                  }}
              />
              {/* 상대 HP 박스 */}
              <div style={{
                background: '#f0e8c8',
                border: '3px solid #483820',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 200,
                boxShadow: '3px 3px 0 #483820',
              }}>
                <HpBar pokemon={p2Active} />
                <div style={{ marginTop: 4 }}>
                  <PartyDots team={p2.team} />
                </div>
              </div>
            </div>

            {/* ─── 내 포켓몬 영역 (좌측 하단) ─── */}
            <div style={{
              position: 'absolute', bottom: 10, left: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
            }}>
              {/* 내 HP 박스 */}
              <div style={{
                background: '#f0e8c8',
                border: '3px solid #483820',
                borderRadius: 8,
                padding: '8px 14px',
                minWidth: 220,
                boxShadow: '3px 3px 0 #483820',
              }}>
                <HpBar pokemon={p1Active} showNum />
                <div style={{ marginTop: 4 }}>
                  <PartyDots team={p1.team} />
                </div>
              </div>
              {/* 내 스프라이트 */}
              <img
                  src={getSpriteBack(p1Active.species)}
                  alt={p1Active.nickname}
                  style={{
                    width: 160, height: 160,
                    imageRendering: 'pixelated',
                    filter: p1Active.fainted
                        ? 'grayscale(100%) brightness(0.4)'
                        : 'drop-shadow(2px 4px 6px rgba(0,0,0,0.5))',
                    transition: 'filter 0.5s',
                    marginTop: -10,
                  }}
              />
            </div>
          </div>

          {/* ─── 하단 UI ─── */}
          <div style={{
            height: 220,
            background: '#f0e8c8',
            borderTop: '4px solid #483820',
            display: 'flex',
          }}>

            {/* 왼쪽: 다이얼로그 박스 */}
            <div style={{
              width: 340,
              borderRight: '3px solid #483820',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}>
              {/* 메시지 */}
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#2a1a0a',
                lineHeight: 1.7,
                minHeight: 80,
                whiteSpace: 'pre-line',
              }}>
                {logText}
              </div>

              {/* 배틀 로그 스크롤 */}
              <div style={{
                fontSize: 10,
                color: '#888',
                maxHeight: 60,
                overflowY: 'auto',
                borderTop: '1px solid #d0c8a8',
                paddingTop: 6,
                lineHeight: 1.6,
              }}>
                {logs.slice(-8).map((l, i) => (
                    <div key={i} style={{ opacity: 0.6 + i * 0.05 }}>{l}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </div>

            {/* 오른쪽: 액션 패널 */}
            <div style={{ flex: 1, padding: 12 }}>

              {/* ── 메인 메뉴 ── */}
              {view === 'main' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, height: '100%' }}>
                    {[
                      { label: '▶ FIGHT',   action: () => setView('fight'),   enabled: canAct },
                      { label: '  BAG',     action: () => {},                  enabled: false  },
                      { label: '  POKéMON', action: () => setView('party'),   enabled: canAct },
                      { label: '  RUN',     action: () => {},                  enabled: false  },
                    ].map(({ label, action, enabled }) => (
                        <button key={label}
                                onClick={enabled ? action : undefined}
                                style={{
                                  background: enabled ? '#f8f0d8' : '#e8e0c8',
                                  border: '3px solid #483820',
                                  borderRadius: 6,
                                  color: enabled ? '#2a1a0a' : '#a09080',
                                  fontFamily: '"Segoe UI", sans-serif',
                                  fontWeight: 700,
                                  fontSize: 14,
                                  cursor: enabled ? 'pointer' : 'default',
                                  boxShadow: enabled ? '3px 3px 0 #483820' : '1px 1px 0 #c0b090',
                                  transition: 'all 0.1s',
                                  letterSpacing: 0.5,
                                }}
                                onMouseDown={e => { if (enabled) (e.target as HTMLElement).style.transform = 'translate(2px,2px)' }}
                                onMouseUp={e => { (e.target as HTMLElement).style.transform = '' }}
                                onMouseLeave={e => { (e.target as HTMLElement).style.transform = '' }}
                        >
                          {label}
                        </button>
                    ))}
                  </div>
              )}

              {/* ── 기술 선택 ── */}
              {view === 'fight' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                      {p1Active.moves.map((slot, i) => {
                        if (!slot) return null
                        const usable = !slot.disabled && slot.pp > 0
                        const tc     = TYPE_COLOR[slot.move.type] ?? '#888'
                        return (
                            <button key={i}
                                    disabled={!usable}
                                    onClick={() => handleMove(i)}
                                    style={{
                                      background: usable ? '#f8f0d8' : '#e0d8c0',
                                      border: `3px solid ${usable ? '#483820' : '#b0a888'}`,
                                      borderRadius: 6,
                                      padding: '8px 10px',
                                      textAlign: 'left',
                                      cursor: usable ? 'pointer' : 'default',
                                      boxShadow: usable ? '3px 3px 0 #483820' : 'none',
                                      transition: 'all 0.1s',
                                    }}
                                    onMouseDown={e => { if (usable) (e.target as HTMLElement).style.transform = 'translate(2px,2px)' }}
                                    onMouseUp={e => { (e.target as HTMLElement).style.transform = '' }}
                                    onMouseLeave={e => { (e.target as HTMLElement).style.transform = '' }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 12, color: usable ? '#2a1a0a' : '#909080', marginBottom: 3 }}>
                                {slot.move.name.toUpperCase()}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{
                            background: tc, color: '#fff',
                            fontSize: 9, fontWeight: 700,
                            padding: '1px 5px', borderRadius: 3,
                          }}>
                            {slot.move.type.toUpperCase()}
                          </span>
                                <span style={{ fontSize: 10, color: '#888' }}>
                            {slot.pp}/{slot.max_pp}
                          </span>
                              </div>
                            </button>
                        )
                      })}
                    </div>
                    <button onClick={() => setView('main')}
                            style={{
                              width: '100%', padding: '6px', borderRadius: 6,
                              border: '2px solid #483820', background: '#e8e0c8',
                              cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#483820',
                            }}>
                      ← 뒤로
                    </button>
                  </div>
              )}

              {/* ── 파티 선택 ── */}
              {view === 'party' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 8 }}>
                      {p1.team.map(p => {
                        const r = p.hp / p.max_hp
                        const selectable = !p.fainted && p.id !== p1Active.id
                        return (
                            <button key={p.id}
                                    disabled={!selectable}
                                    onClick={() => selectable ? handleSwitch(p.id) : undefined}
                                    style={{
                                      background: p.id === p1Active.id ? '#fff8e0'
                                          : p.fainted ? '#d8d0c0' : '#f8f0d8',
                                      border: `2px solid ${selectable ? '#483820' : '#b0a888'}`,
                                      borderRadius: 6, padding: '6px 4px',
                                      cursor: selectable ? 'pointer' : 'default',
                                      boxShadow: selectable ? '2px 2px 0 #483820' : 'none',
                                    }}>
                              <img src={getSpriteFront(p.species)} alt={p.nickname}
                                   style={{
                                     width: 40, height: 40, imageRendering: 'pixelated', display: 'block', margin: '0 auto',
                                     filter: p.fainted ? 'grayscale(100%)' : 'none',
                                   }} />
                              <div style={{ fontSize: 9, fontWeight: 700, color: p.fainted ? '#999' : '#333', textAlign: 'center' }}>
                                {p.nickname.substring(0, 8).toUpperCase()}
                              </div>
                              <div style={{
                                height: 3, background: '#ccc', borderRadius: 2, margin: '3px 2px 0', overflow: 'hidden',
                              }}>
                                <div style={{ width: `${Math.max(0, r*100)}%`, height: '100%', background: hpColor(r) }} />
                              </div>
                            </button>
                        )
                      })}
                    </div>
                    {phase !== 'switching' && (
                        <button onClick={() => setView('main')}
                                style={{
                                  width: '100%', padding: '5px', borderRadius: 6,
                                  border: '2px solid #483820', background: '#e8e0c8',
                                  cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#483820',
                                }}>
                          ← 뒤로
                        </button>
                    )}
                  </div>
              )}

              {/* ── 배틀 종료 ── */}
              {phase === 'ended' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', flexDirection: 'column', gap: 12,
                  }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: battleState.winner === 'p1' ? '#f8a030' : '#f85040' }}>
                      {battleState.winner === 'p1' ? '🏆 승리!' : '💀 패배...'}
                    </div>
                    <button onClick={() => window.location.reload()}
                            style={{
                              padding: '8px 20px', borderRadius: 6,
                              border: '3px solid #483820', background: '#f8f0d8',
                              cursor: 'pointer', fontWeight: 700, fontSize: 13,
                              boxShadow: '3px 3px 0 #483820',
                            }}>
                      다시 하기
                    </button>
                  </div>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}