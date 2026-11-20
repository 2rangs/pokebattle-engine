import { expect, test } from 'vitest'
import { atlasFrames } from './atlas'

const fr = (filename: string, x: number) => ({ filename, frame: { x, y: 0, w: 4, h: 4 }, spriteSourceSize: { x: 0, y: 1, w: 4, h: 4 }, sourceSize: { w: 4, h: 5 } })

test('아틀라스 프레임: Phaser textures[] · 배열 · 해시 모두 파일 이름 순', () => {
  expect(atlasFrames({ textures: [{ frames: [fr('0002.png', 4), fr('0001.png', 0)] }] }).map(f => f.frame.x)).toEqual([0, 4])
  expect(atlasFrames({ frames: [fr('0002.png', 4), fr('0001.png', 0)] }).map(f => f.filename)).toEqual(['0001.png', '0002.png'])
  const bare = (x: number) => ({ frame: { x, y: 0, w: 4, h: 4 }, spriteSourceSize: { x: 0, y: 1, w: 4, h: 4 }, sourceSize: { w: 4, h: 5 } })
  expect(atlasFrames({ frames: { '0002.png': bare(4), '0001.png': bare(0) } }).map(f => f.filename)).toEqual(['0001.png', '0002.png'])
})
