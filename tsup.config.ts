import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs', 'iife'],
    tsconfig: './tsconfig.build.json',
    globalName: 'PokeBattleEngine',
    dts: true,
    sourcemap: true,
    clean: true,
})