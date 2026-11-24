// ─── 저장한 리플레이 HTML 안에서 도는 오프라인 재생기 ───────────────────────
// 빌드할 때 이 파일을 한 덩어리 스크립트로 묶어(vite.config 의 offline-player) HTML 에 그대로 넣는다.
// 엔진·네트워크 없이: 장면 상태는 저장할 때 다 풀어 두었고, 스프라이트는 data: URI, 기술 연출은 5세대풍 캔버스 연출.
import { playGen5MoveAnim, playRecipe } from '../../gen5fx/play'
import { shinyRecipe } from '../../gen5fx/recipes'
import type { OfflineReplay, OMon, Side } from './types'

const STATUS_COLOR: Record<string, string> = {
  burn: '#e8743b', paralysis: '#d8b628', poison: '#a35bc8', toxic: '#7d3aa0', sleep: '#8a8f99', freeze: '#5fb8e0',
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function mount(root: HTMLElement, d: OfflineReplay) {
  const L = d.labels
  const steps = d.steps
  const total = steps.length
  if (!total) return

  const wrap = el('div', 'op')
  const scene = el('div', 'op-scene')
  const bg = el('div', 'op-bg')
  const fx = el('div', 'op-fx')
  const result = el('div', 'op-result')
  result.hidden = true

  interface Spot { side: Side; box: HTMLElement; name: HTMLElement; lv: HTMLElement; st: HTMLElement; bar: HTMLElement; hpText: HTMLElement; mon: HTMLElement; flip: HTMLElement; img: HTMLImageElement; alt: HTMLElement; key: string | null }
  const mkSpot = (side: Side): Spot => {
    const ours = side === d.me
    const spot = el('div', `op-spot ${ours ? 'is-ours' : 'is-foe'}`)
    const mon = el('div', 'op-mon')
    // 반전은 감싼 칸에 (기술 연출이 img 의 transform 을 직접 바꾼다)
    const flip = el('div', 'op-flip')
    const img = el('img', 'op-sprite')
    img.alt = ''
    img.draggable = false
    const alt = el('div', 'op-alt')
    flip.append(img)
    mon.append(flip, alt)
    spot.append(mon)
    const box = el('div', `op-box ${ours ? 'is-ours' : 'is-foe'}`)
    const head = el('div', 'op-box-head')
    const name = el('b', 'op-name')
    const st = el('span', 'op-st')
    const lv = el('span', 'op-lv')
    head.append(name, st, lv)
    const track = el('div', 'op-track')
    const bar = el('div', 'op-bar')
    track.append(bar)
    const hpText = el('div', 'op-hp')
    box.append(head, track, hpText)
    scene.append(spot, box)
    return { side, box, name, lv, st, bar, hpText, mon, flip, img, alt, key: null }
  }
  scene.append(bg)
  const spots: Record<Side, Spot> = { p1: mkSpot('p1'), p2: mkSpot('p2') }
  scene.append(fx, result)

  const msg = el('div', 'op-msg')
  msg.setAttribute('aria-live', 'polite')

  const ctrl = el('div', 'op-ctrl')
  const btn = (label: string, cls = 'btn') => { const b = el('button', cls, label); b.type = 'button'; return b }
  const bRestart = btn(L.restart)
  const bPrev = btn(L.prevTurn)
  const bPlay = btn(L.play, 'btn primary')
  const bNext = btn(L.nextTurn)
  const speedSel = el('select', 'op-speed')
  speedSel.setAttribute('aria-label', L.speed)
  for (const [v, t] of [['0.5', '0.5x'], ['1', '1x'], ['2', '2x'], ['4', '4x']] as const) {
    const o = el('option', undefined, t)
    o.value = v
    if (v === '1') o.selected = true
    speedSel.append(o)
  }
  const turnLabel = el('span', 'op-turn')
  const range = el('input', 'op-range')
  range.type = 'range'
  range.min = '0'
  range.max = String(total - 1)
  range.value = '0'
  range.setAttribute('aria-label', L.progress)
  ctrl.append(bRestart, bPrev, bPlay, bNext, speedSel, turnLabel)
  wrap.append(scene, msg, range, ctrl)
  root.replaceChildren(wrap)

  let cursor = 0
  let playing = false
  let timer = 0
  let stopFx: (() => void) | null = null
  let lastText = ''

  const setMon = (sp: Spot, m: OMon) => {
    sp.name.textContent = m.n
    sp.lv.textContent = `Lv.${m.lv}`
    const pct = m.mx > 0 ? Math.max(0, Math.min(100, (m.hp / m.mx) * 100)) : 0
    sp.bar.style.width = `${pct}%`
    sp.bar.style.background = pct > 50 ? '#4cd06a' : pct > 20 ? '#f2c230' : '#ef5350'
    sp.hpText.textContent = sp.side === d.me ? `${m.hp} / ${m.mx}` : `${Math.round(pct)}%`
    if (m.st) {
      sp.st.textContent = m.st[0]
      sp.st.style.background = STATUS_COLOR[m.st[1]] ?? '#666'
      sp.st.hidden = false
    } else sp.st.hidden = true
    if (sp.key !== m.s) {
      sp.key = m.s
      const s = d.sprites[m.s]
      if (s) {
        sp.img.src = s.src
        sp.img.hidden = false
        sp.img.classList.toggle('is-px', s.px)
        sp.flip.classList.toggle('is-flip', s.flip)
        sp.alt.hidden = true
      } else {
        sp.img.removeAttribute('src')
        sp.img.hidden = true
        sp.alt.textContent = m.n
        sp.alt.hidden = false
      }
    }
    sp.mon.classList.toggle('is-down', m.f)
    sp.box.classList.toggle('is-down', m.f)
  }

  const ANIMS = ['is-hit', 'is-crit', 'is-faint', 'is-enter', 'is-heal', 'is-status', 'is-shimmer']
  const pulse = (e: HTMLElement, cls: string) => {
    e.classList.remove(...ANIMS)
    void e.offsetWidth
    e.classList.add(cls)
  }
  for (const sp of [spots.p1, spots.p2]) sp.mon.addEventListener('animationend', () => sp.mon.classList.remove(...ANIMS))

  const animate = (i: number, wait: number) => {
    const ev = steps[i]!.ev
    if (!ev || reduced()) return
    if (ev.k === 'move') {
      stopFx?.()
      const attackerFront = ev.by !== d.me
      const front = (spots[d.me === 'p1' ? 'p2' : 'p1']).img
      const back = spots[d.me].img
      stopFx = playGen5MoveAnim(ev.mv, attackerFront, ev.self, { fx, bg, front, back, ground: [bg] }, { budget: Math.max(300, wait * 0.95) })
      return
    }
    const sp = spots[ev.on]
    if (ev.k === 'enter') {
      pulse(sp.mon, 'is-enter')
      if (ev.shiny) { stopFx?.(); stopFx = playRecipe(shinyRecipe(), ev.on !== d.me, true, { fx, bg, front: null, back: null, ground: [] }, { budget: 1400 }) }
    } else if (ev.k === 'faint') pulse(sp.mon, 'is-faint')
    else pulse(sp.mon, `is-${ev.k}`)
  }

  const render = (i: number, anim: boolean) => {
    const s = steps[i]!
    setMon(spots.p1, d.mons[s.m[0]]!)
    setMon(spots.p2, d.mons[s.m[1]]!)
    // 메시지: 이 장면에 없으면 앞 장면의 것
    let text = s.t
    for (let k = i; text === null && k >= 0; k--) text = steps[k]!.t
    if (text !== lastText) { msg.textContent = text ?? ''; lastText = text ?? '' }
    turnLabel.textContent = s.turn > 0 ? L.turn.replace('{n}', String(s.turn)) : L.start
    range.value = String(i)
    const end = i === total - 1
    result.hidden = !(end && d.result && !playing)
    result.textContent = d.result ?? ''
    if (anim) animate(i, s.w / speed())
  }

  const speed = () => Number(speedSel.value) || 1
  const stopTimer = () => { clearTimeout(timer); timer = 0 }
  const setPlaying = (p: boolean) => {
    playing = p
    bPlay.textContent = p ? L.pause : L.play
    bPlay.setAttribute('aria-pressed', String(p))
    if (!p) stopTimer()
    result.hidden = !(cursor === total - 1 && d.result && !playing)
  }
  const tick = () => {
    if (!playing) return
    if (cursor >= total - 1) { setPlaying(false); return }
    cursor++
    render(cursor, true)
    timer = window.setTimeout(tick, Math.max(0, steps[cursor]!.w / speed()))
  }
  const play = () => {
    if (cursor >= total - 1) { cursor = 0; render(0, false) }
    setPlaying(true)
    stopTimer()
    timer = window.setTimeout(tick, Math.max(200, steps[cursor]!.w / speed()))
  }
  const go = (i: number) => {
    setPlaying(false)
    stopFx?.()
    stopFx = null
    for (const sp of [spots.p1, spots.p2]) sp.mon.classList.remove(...ANIMS)
    cursor = Math.max(0, Math.min(total - 1, i))
    render(cursor, false)
  }
  const turnStart = (turn: number) => { const k = steps.findIndex(s => s.turn >= turn); return k < 0 ? total - 1 : k }
  const turnEnd = (turn: number) => { let k = -1; steps.forEach((s, j) => { if (s.turn <= turn) k = j }); return k < 0 ? 0 : k }

  bPlay.addEventListener('click', () => (playing ? setPlaying(false) : play()))
  bRestart.addEventListener('click', () => { go(0); play() })
  bPrev.addEventListener('click', () => { const t = steps[cursor]!.turn; go(cursor > turnStart(t) ? turnStart(t) : turnStart(Math.max(0, t - 1))) })
  bNext.addEventListener('click', () => { const t = steps[cursor]!.turn; const e = turnEnd(t); go(cursor < e ? e : turnEnd(t + 1)) })
  range.addEventListener('input', () => go(Number(range.value)))
  wrap.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
    if (e.key === 'ArrowLeft') { e.preventDefault(); bPrev.click() } else if (e.key === 'ArrowRight') { e.preventDefault(); bNext.click() }
  })

  render(0, false)
  setPlaying(false)
}

const data = document.getElementById('offline-replay')
const host = document.getElementById('offline-player')
if (data && host) {
  try {
    mount(host, JSON.parse(data.textContent || '{}') as OfflineReplay)
  } catch (err) {
    host.textContent = String(err)
  }
}
