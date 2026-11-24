import { beforeAll, expect, test } from 'vitest'
import { ready } from '../battle/lib/setup.test-util'
import { proveReplay } from './replay-proof'

beforeAll(ready)

test.each([1, 77, 4242])('replay link re-simulates to the same protocol log (seed %i)', async seed => {
  const r = await proveReplay(seed)
  expect(r.identical).toBe(true)
  expect(r.replayed.applied).toBe(r.actions)
  expect(r.original.hash).toMatch(/^[0-9a-f]{64}$/)
  expect(r.winner).not.toBeNull()
})
