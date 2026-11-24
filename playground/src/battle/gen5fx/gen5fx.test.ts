import { beforeAll, expect, test } from 'vitest'
import { listMoves, preloadData } from '../lib/engine'
import { TEX, TYPE_PALETTE } from './art'
import { recipeFor, type MoveInfo } from './recipes'
import { FxSim, type FxLayout } from './sim'

const LAYOUT: FxLayout = { w: 256, h: 144, att: [69, 98], def: [184, 58] }

let moves: MoveInfo[] = []
beforeAll(async () => {
  await preloadData()
  moves = listMoves() as MoveInfo[]
})

test('모든 기술에 레시피가 있고, 연출이 끝까지 돌고 끝난다', () => {
  expect(moves.length).toBeGreaterThan(800)
  const templates = new Map<string, number>()
  for (const m of moves) {
    const r = recipeFor(m)
    templates.set(r.template, (templates.get(r.template) ?? 0) + 1)
    expect(r.frames, m.name).toBeGreaterThan(0)
    expect(r.frames, m.name).toBeLessThanOrEqual(48)
    for (const s of r.steps) if ('tex' in s) expect(TEX[s.tex], `${m.name} ${s.tex}`).toBeDefined()
    const sim = new FxSim(r, LAYOUT, 7)
    let drew = 0
    while (!sim.done && sim.frame < sim.maxFrames) {
      sim.step()
      drew += sim.draws().length
      sim.screen()
      sim.sprite('att', false)
      sim.sprite('def', false)
    }
    expect(sim.done, `${m.name} 이 ${sim.maxFrames} 프레임 안에 끝나야 한다`).toBe(true)
    expect(drew, `${m.name} 이 아무것도 그리지 않는다`).toBeGreaterThan(0)
  }
  // 한 템플릿에 몰리지 않는다 (여러 연출이 고루 쓰인다)
  expect(templates.size).toBeGreaterThanOrEqual(20)
  expect(Math.max(...templates.values()) / moves.length).toBeLessThan(0.35)
})

test('기술 성격에 맞는 템플릿', () => {
  const t = (name: string) => recipeFor(moves.find(m => m.name === name)!).template
  expect(t('thunderbolt')).toBe('bolt')
  expect(t('flamethrower')).toBe('flames')
  expect(t('fire-punch')).toBe('punch')
  expect(t('crunch')).toBe('bite')
  expect(t('leaf-blade')).toBe('slash')
  expect(t('hyper-beam')).toBe('beam')
  expect(t('ice-beam')).toBe('beam')
  expect(t('shadow-ball')).toBe('ball')
  expect(t('dark-pulse')).toBe('pulse')
  expect(t('boomburst')).toBe('sound')
  expect(t('earthquake')).toBe('quake')
  expect(t('surf')).toBe('wave')
  expect(t('swords-dance')).toBe('boost')
  expect(t('recover')).toBe('heal')
  expect(t('protect')).toBe('protect')
  expect(t('sleep-powder')).toBe('powder')
  expect(t('rain-dance')).toBe('field')
  expect(t('toxic')).toBe('hex')
  expect(t('hurricane')).toBe('wind')
})

test('같은 시드 → 같은 연출', () => {
  const m = moves.find(x => x.name === 'flamethrower')!
  const run = () => {
    const sim = new FxSim(recipeFor(m), LAYOUT, 42)
    const out: string[] = []
    while (!sim.done) { sim.step(); out.push(JSON.stringify(sim.draws())) }
    return out
  }
  expect(run()).toEqual(run())
})

test('공격자 → 대상 방향으로 날아간다', () => {
  const m = moves.find(x => x.name === 'flamethrower')!
  const sim = new FxSim(recipeFor(m), LAYOUT, 3)
  for (let i = 0; i < 10; i++) sim.step()
  const xs = sim.draws().filter(d => d.t === 'tex').map(d => (d as { x: number }).x)
  expect(Math.max(...xs)).toBeGreaterThan(LAYOUT.att[0] + 40)
})

test('도트 텍스처와 팔레트', () => {
  for (const [name, t] of Object.entries(TEX)) {
    expect(t.px.length, name).toBe(t.w * t.h)
    expect([...t.px].every(v => v <= 3), name).toBe(true)
    expect([...t.px].some(v => v > 0), name).toBe(true)
  }
  for (const pal of Object.values(TYPE_PALETTE)) for (const c of pal) expect(c.every(v => v >= 0 && v <= 255)).toBe(true)
})
